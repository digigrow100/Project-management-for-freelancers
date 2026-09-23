import type { BusinessProfile, Client, Invoice, InvoiceItem, InvoiceStatus } from "./types";
import { currencySymbol } from "./utils";

export interface InvoicePdfInput {
  invoice: Invoice;
  items: InvoiceItem[];
  client: Client;
  businessProfile: BusinessProfile;
  totalPaid: number;
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 48;
const RIGHT_EDGE = PAGE_WIDTH - MARGIN_X;
const CONTENT_WIDTH = RIGHT_EDGE - MARGIN_X;

const COLORS = {
  headerBand: [18, 116, 74] as const,
  headerBandDark: [10, 74, 48] as const,
  sectionTint: [232, 248, 240] as const,
  sectionText: [15, 90, 58] as const,
  cardBorder: [225, 230, 227] as const,
  cardBg: [250, 252, 251] as const,
  textDark: [30, 35, 33] as const,
  textMuted: [110, 118, 114] as const,
  statusPaid: [18, 116, 74] as const,
  statusPartial: [190, 120, 20] as const,
  statusOverdue: [200, 50, 60] as const,
  statusDefault: [110, 118, 114] as const,
};

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  partially_paid: "Partially Paid",
  overdue: "Overdue",
  cancelled: "Cancelled",
};

function statusColor(status: InvoiceStatus): readonly [number, number, number] {
  if (status === "paid") return COLORS.statusPaid;
  if (status === "partially_paid") return COLORS.statusPartial;
  if (status === "overdue") return COLORS.statusOverdue;
  return COLORS.statusDefault;
}

async function loadImageAsDataUrl(url: string): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function dataUrlFormat(dataUrl: string): "PNG" | "JPEG" | "WEBP" {
  if (dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg")) return "JPEG";
  if (dataUrl.startsWith("data:image/webp")) return "WEBP";
  return "PNG";
}

function fitBox(naturalW: number, naturalH: number, maxW: number, maxH: number) {
  const ratio = Math.min(maxW / naturalW, maxH / naturalH, 1);
  return { w: naturalW * ratio, h: naturalH * ratio };
}

function money(amount: number, currency: string): string {
  return `${currencySymbol(currency)}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function buildInvoicePdf(input: InvoicePdfInput) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  function fillColor(c: readonly [number, number, number]) {
    doc.setFillColor(c[0], c[1], c[2]);
  }
  function drawColor(c: readonly [number, number, number]) {
    doc.setDrawColor(c[0], c[1], c[2]);
  }
  function textColor(c: readonly [number, number, number]) {
    doc.setTextColor(c[0], c[1], c[2]);
  }

  const companyLogoDataUrl = await loadImageAsDataUrl(input.businessProfile.logoUrl);
  const companyLabel = input.businessProfile.companyName || "Your Company";
  const clientLabel = input.client.company || input.client.name || "Client";

  fillColor(COLORS.headerBand);
  doc.rect(0, 0, PAGE_WIDTH, 96, "F");
  fillColor(COLORS.headerBandDark);
  doc.rect(0, 92, PAGE_WIDTH, 4, "F");

  const logoBoxSize = 46;
  const logoY = 25;
  if (companyLogoDataUrl) {
    try {
      const props = doc.getImageProperties(companyLogoDataUrl);
      const { w, h } = fitBox(props.width, props.height, logoBoxSize, logoBoxSize);
      doc.addImage(companyLogoDataUrl, dataUrlFormat(companyLogoDataUrl), MARGIN_X, logoY, w, h);
    } catch {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(255, 255, 255);
      doc.text(companyLabel, MARGIN_X, 40);
    }
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(255, 255, 255);
    doc.text(companyLabel, MARGIN_X, 40);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(255, 255, 255);
  doc.text("INVOICE", RIGHT_EDGE, 45, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(input.invoice.invoiceNumber, RIGHT_EDGE, 64, { align: "right" });

  let y = 128;

  // Bill To / meta columns
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  textColor(COLORS.textMuted);
  doc.text("BILL TO", MARGIN_X, y);
  doc.text("INVOICE DETAILS", MARGIN_X + CONTENT_WIDTH / 2 + 10, y);
  y += 16;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.5);
  textColor(COLORS.textDark);
  doc.text(clientLabel, MARGIN_X, y);

  const metaX = MARGIN_X + CONTENT_WIDTH / 2 + 10;
  const metaLabelWidth = 70;
  function metaRow(label: string, value: string, rowY: number) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    textColor(COLORS.textMuted);
    doc.text(label, metaX, rowY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    textColor(COLORS.textDark);
    doc.text(value || "—", metaX + metaLabelWidth, rowY);
  }
  metaRow("Issue date", input.invoice.issueDate, y);
  metaRow("Due date", input.invoice.dueDate, y + 15);

  fillColor(statusColor(input.invoice.status));
  doc.roundedRect(metaX, y + 22, 110, 16, 4, 4, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text(STATUS_LABEL[input.invoice.status], metaX + 55, y + 32, { align: "center" });

  y += 18;
  if (input.client.name && input.client.company) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    textColor(COLORS.textMuted);
    doc.text(input.client.name, MARGIN_X, y);
    y += 13;
  }
  const contactLines = [input.client.address, input.client.email, input.client.phone, input.client.website].filter(
    Boolean,
  );
  for (const line of contactLines) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    textColor(COLORS.textMuted);
    const wrapped = doc.splitTextToSize(line, CONTENT_WIDTH / 2 - 10) as string[];
    doc.text(wrapped, MARGIN_X, y);
    y += wrapped.length * 12;
  }

  y = Math.max(y, 128 + 16 + 18 + 22 + 16) + 20;

  // Items table
  fillColor(COLORS.sectionTint);
  doc.roundedRect(MARGIN_X, y, CONTENT_WIDTH, 24, 4, 4, "F");
  const colDesc = MARGIN_X + 10;
  const colQty = MARGIN_X + CONTENT_WIDTH - 190;
  const colPrice = MARGIN_X + CONTENT_WIDTH - 120;
  const colTotal = RIGHT_EDGE - 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  textColor(COLORS.sectionText);
  doc.text("DESCRIPTION", colDesc, y + 16);
  doc.text("QTY", colQty, y + 16, { align: "right" });
  doc.text("PRICE", colPrice, y + 16, { align: "right" });
  doc.text("TOTAL", colTotal, y + 16, { align: "right" });
  y += 24 + 8;

  let subtotal = 0;
  for (const item of input.items) {
    const lineTotal = item.quantity * item.unitPrice;
    subtotal += lineTotal;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const descLines = doc.splitTextToSize(item.description, colQty - colDesc - 20) as string[];
    textColor(COLORS.textDark);
    doc.text(descLines, colDesc, y);
    doc.text(String(item.quantity), colQty, y, { align: "right" });
    doc.text(money(item.unitPrice, input.invoice.currency), colPrice, y, { align: "right" });
    doc.text(money(lineTotal, input.invoice.currency), colTotal, y, { align: "right" });

    y += Math.max(descLines.length * 13, 16) + 6;
    drawColor(COLORS.cardBorder);
    doc.line(MARGIN_X, y - 3, RIGHT_EDGE, y - 3);
  }

  if (input.items.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    textColor(COLORS.textMuted);
    doc.text("No line items.", colDesc, y);
    y += 20;
  }

  y += 10;

  // Totals box
  const balanceDue = Math.max(0, subtotal - input.totalPaid);
  const totalsX = RIGHT_EDGE - 220;
  function totalsRow(label: string, value: string, bold: boolean) {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(bold ? 11 : 10);
    textColor(bold ? COLORS.textDark : COLORS.textMuted);
    doc.text(label, totalsX, y);
    doc.text(value, RIGHT_EDGE, y, { align: "right" });
    y += bold ? 18 : 15;
  }
  totalsRow("Subtotal", money(subtotal, input.invoice.currency), false);
  totalsRow("Paid", money(input.totalPaid, input.invoice.currency), false);
  drawColor(COLORS.cardBorder);
  doc.line(totalsX, y - 6, RIGHT_EDGE, y - 6);
  totalsRow("Balance due", money(balanceDue, input.invoice.currency), true);

  y += 20;

  if (input.invoice.notes.trim()) {
    drawColor(COLORS.cardBorder);
    doc.setFillColor(255, 253, 240);
    const noteLines = doc.splitTextToSize(input.invoice.notes.trim(), CONTENT_WIDTH - 24) as string[];
    const boxHeight = 26 + noteLines.length * 13;
    doc.roundedRect(MARGIN_X, y, CONTENT_WIDTH, boxHeight, 5, 5, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    textColor(COLORS.textDark);
    doc.text("Notes", MARGIN_X + 12, y + 17);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(60, 60, 60);
    doc.text(noteLines, MARGIN_X + 12, y + 32);
    y += boxHeight;
  }

  drawColor(COLORS.cardBorder);
  doc.line(MARGIN_X, PAGE_HEIGHT - 48, RIGHT_EDGE, PAGE_HEIGHT - 48);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  textColor(COLORS.textMuted);
  doc.text(`${companyLabel} · Generated ${new Date().toLocaleString()}`, MARGIN_X, PAGE_HEIGHT - 34);

  return doc;
}

function fileName(invoice: Invoice): string {
  return `${invoice.invoiceNumber.replace(/[^a-z0-9-]+/gi, "-").toLowerCase()}.pdf`;
}

export async function downloadInvoicePdf(input: InvoicePdfInput): Promise<void> {
  const doc = await buildInvoicePdf(input);
  doc.save(fileName(input.invoice));
}

export async function previewInvoicePdf(input: InvoicePdfInput): Promise<void> {
  const doc = await buildInvoicePdf(input);
  const url = doc.output("bloburl");
  window.open(String(url), "_blank", "noopener,noreferrer");
}
