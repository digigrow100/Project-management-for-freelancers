import type {
  BusinessProfile,
  Client,
  Invoice,
  InvoiceItem,
  InvoiceStatus,
  InvoiceTemplateKey,
} from "./types";
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
const MARGIN = 42;
const RIGHT = PAGE_WIDTH - MARGIN;
const CONTENT = RIGHT - MARGIN;

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "DRAFT",
  sent: "UNPAID",
  paid: "PAID",
  partially_paid: "PARTIALLY PAID",
  overdue: "OVERDUE",
  cancelled: "CANCELLED",
};

function money(amount: number, currency: string) {
  return `${currencySymbol(currency)}${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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

type PdfDoc = any;

function setText(doc: PdfDoc, rgb: readonly [number, number, number]) {
  doc.setTextColor(rgb[0], rgb[1], rgb[2]);
}

function setFill(doc: PdfDoc, rgb: readonly [number, number, number]) {
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
}

function setDraw(doc: PdfDoc, rgb: readonly [number, number, number]) {
  doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
}

function clientLines(client: Client) {
  return [
    client.company || client.name,
    client.name && client.company ? client.name : "",
    client.address,
    client.email,
    client.phone,
    client.website,
  ].filter(Boolean);
}

function subtotal(items: InvoiceItem[]) {
  return items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
}

function drawLogoOrName(
  doc: PdfDoc,
  logo: string | null,
  company: string,
  x: number,
  y: number,
  maxW: number,
  maxH: number,
  textColor: readonly [number, number, number],
) {
  if (logo) {
    try {
      const props = doc.getImageProperties(logo);
      const size = fitBox(props.width, props.height, maxW, maxH);
      doc.addImage(logo, dataUrlFormat(logo), x, y, size.w, size.h);
      return;
    } catch {}
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  setText(doc, textColor);
  doc.text(company, x, y + 18);
}

function drawStatusPill(doc: PdfDoc, invoice: Invoice, x: number, y: number, fill: readonly [number, number, number]) {
  setFill(doc, fill);
  doc.roundedRect(x, y, 92, 22, 5, 5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text(STATUS_LABEL[invoice.status], x + 46, y + 14, { align: "center" });
}

function drawStandardItemsTable(
  doc: PdfDoc,
  input: InvoicePdfInput,
  yStart: number,
  opts: {
    headerFill: readonly [number, number, number];
    headerText: readonly [number, number, number];
    bodyText: readonly [number, number, number];
    border: readonly [number, number, number];
    softFill?: readonly [number, number, number];
    headerRounded?: boolean;
  },
) {
  let y = yStart;
  const colDesc = MARGIN + 10;
  const colQty = RIGHT - 188;
  const colRate = RIGHT - 104;
  const colAmount = RIGHT - 8;

  if (opts.softFill) {
    setFill(doc, opts.softFill);
    doc.rect(MARGIN, y, CONTENT, 24, "F");
  }
  setFill(doc, opts.headerFill);
  if (opts.headerRounded) doc.roundedRect(MARGIN, y, CONTENT, 24, 4, 4, "F");
  else doc.rect(MARGIN, y, CONTENT, 24, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  setText(doc, opts.headerText);
  doc.text("DESCRIPTION", colDesc, y + 15);
  doc.text("QTY", colQty, y + 15, { align: "right" });
  doc.text("RATE", colRate, y + 15, { align: "right" });
  doc.text("AMOUNT", colAmount, y + 15, { align: "right" });
  y += 34;

  for (const item of input.items) {
    const amount = item.quantity * item.unitPrice;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    setText(doc, opts.bodyText);
    const desc = doc.splitTextToSize(item.description, colQty - colDesc - 22) as string[];
    doc.text(desc, colDesc, y);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.2);
    doc.text(String(item.quantity), colQty, y, { align: "right" });
    doc.text(money(item.unitPrice, input.invoice.currency), colRate, y, { align: "right" });
    doc.text(money(amount, input.invoice.currency), colAmount, y, { align: "right" });

    y += Math.max(19, desc.length * 12 + 8);
    setDraw(doc, opts.border);
    doc.line(MARGIN, y - 5, RIGHT, y - 5);
  }

  if (input.items.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    setText(doc, [120, 120, 120]);
    doc.text("No line items.", colDesc, y);
    y += 20;
  }

  return y + 4;
}

function drawTotals(
  doc: PdfDoc,
  input: InvoicePdfInput,
  y: number,
  opts: {
    accent: readonly [number, number, number];
    text: readonly [number, number, number];
    muted: readonly [number, number, number];
    boxFill?: readonly [number, number, number];
    label?: string;
  },
) {
  const total = subtotal(input.items);
  const balance = Math.max(0, total - input.totalPaid);
  const x = RIGHT - 206;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  setText(doc, opts.muted);
  doc.text("Subtotal", x, y);
  doc.text(money(total, input.invoice.currency), RIGHT, y, { align: "right" });
  y += 16;
  doc.text("Paid", x, y);
  doc.text(money(input.totalPaid, input.invoice.currency), RIGHT, y, { align: "right" });
  y += 13;

  setFill(doc, opts.boxFill ?? opts.accent);
  doc.roundedRect(x - 10, y, 216, 34, 4, 4, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  if (opts.boxFill) setText(doc, opts.text);
  else doc.setTextColor(255, 255, 255);
  doc.text(opts.label ?? "Balance Due", x, y + 22);
  doc.setFontSize(14);
  doc.text(money(balance, input.invoice.currency), RIGHT - 5, y + 22, { align: "right" });
  return y + 48;
}

function drawNotes(doc: PdfDoc, input: InvoicePdfInput, y: number, accent: readonly [number, number, number]) {
  if (!input.invoice.notes.trim()) return y;
  setDraw(doc, [225, 225, 225]);
  doc.line(MARGIN, y, RIGHT, y);
  y += 18;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  setText(doc, accent);
  doc.text("NOTES", MARGIN, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  setText(doc, [85, 85, 85]);
  const lines = doc.splitTextToSize(input.invoice.notes.trim(), CONTENT * 0.62) as string[];
  doc.text(lines, MARGIN, y);
  return y + lines.length * 11;
}

function drawFooter(doc: PdfDoc, company: string, accent: readonly [number, number, number]) {
  setDraw(doc, [220, 225, 225]);
  doc.line(MARGIN, PAGE_HEIGHT - 50, RIGHT, PAGE_HEIGHT - 50);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  setText(doc, accent);
  doc.text(company, MARGIN, PAGE_HEIGHT - 34);
  setText(doc, [125, 125, 125]);
  doc.text("Thank you for your business.", RIGHT, PAGE_HEIGHT - 34, { align: "right" });
}

async function buildModernBlue(doc: PdfDoc, input: InvoicePdfInput, logo: string | null) {
  const navy = [13, 39, 78] as const;
  const blue = [37, 128, 235] as const;
  const pale = [239, 247, 255] as const;
  const line = [222, 231, 240] as const;
  const company = input.businessProfile.companyName || "Your Business Name";

  drawLogoOrName(doc, logo, company, MARGIN, 38, 120, 45, navy);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  setText(doc, navy);
  doc.text("INVOICE", RIGHT, 64, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  setText(doc, [105, 125, 150]);
  doc.text("IT'S A PLEASURE TO WORK WITH YOU", RIGHT, 82, { align: "right" });

  let y = 116;
  setFill(doc, pale);
  doc.roundedRect(MARGIN, y, CONTENT / 2 - 7, 112, 5, 5, "F");
  doc.roundedRect(MARGIN + CONTENT / 2 + 7, y, CONTENT / 2 - 7, 112, 5, 5, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  setText(doc, [90, 110, 135]);
  doc.text("BILL TO", MARGIN + 16, y + 22);
  doc.text("INVOICE DETAILS", MARGIN + CONTENT / 2 + 23, y + 22);

  const lines = clientLines(input.client);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  setText(doc, navy);
  doc.text(lines[0] || "Client", MARGIN + 16, y + 42);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  setText(doc, [80, 100, 125]);
  let ly = y + 58;
  for (const lineText of lines.slice(1, 5)) {
    doc.text(lineText, MARGIN + 16, ly);
    ly += 13;
  }

  const metaX = MARGIN + CONTENT / 2 + 23;
  doc.setFontSize(9);
  setText(doc, navy);
  doc.text(`Invoice #   ${input.invoice.invoiceNumber}`, metaX, y + 44);
  doc.text(`Issue date   ${input.invoice.issueDate}`, metaX, y + 61);
  doc.text(`Due date     ${input.invoice.dueDate}`, metaX, y + 78);
  drawStatusPill(doc, input.invoice, metaX, y + 85, blue);

  y += 132;
  y = drawStandardItemsTable(doc, input, y, {
    headerFill: [227, 241, 255],
    headerText: navy,
    bodyText: navy,
    border: line,
    headerRounded: true,
  });
  y = drawTotals(doc, input, y + 10, { accent: blue, text: navy, muted: [90, 110, 130], boxFill: [229, 242, 255] });
  drawNotes(doc, input, y + 8, blue);
  drawFooter(doc, company, blue);
}

async function buildCorporateNavy(doc: PdfDoc, input: InvoicePdfInput, logo: string | null) {
  const navy = [13, 42, 73] as const;
  const blue = [70, 155, 245] as const;
  const pale = [246, 249, 252] as const;
  const company = input.businessProfile.companyName || "Your Business Name";

  setFill(doc, navy);
  doc.rect(0, 0, PAGE_WIDTH, 96, "F");
  drawLogoOrName(doc, logo, company, MARGIN, 27, 140, 42, [255, 255, 255]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(29);
  doc.setTextColor(255, 255, 255);
  doc.text("INVOICE", RIGHT, 54, { align: "right" });
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text("PROFESSIONAL  •  RELIABLE  •  RESULT DRIVEN", RIGHT, 72, { align: "right" });

  let y = 112;
  const colW = (CONTENT - 16) / 3;
  for (let i = 0; i < 3; i++) {
    setFill(doc, pale);
    doc.roundedRect(MARGIN + i * (colW + 8), y, colW, 122, 4, 4, "F");
  }

  const leftX = MARGIN + 12;
  const midX = MARGIN + colW + 20;
  const rightX = MARGIN + (colW + 8) * 2 + 12;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  setText(doc, navy);
  doc.text("FROM", leftX, y + 20);
  doc.text("BILL TO", midX, y + 20);
  doc.text("INVOICE DETAILS", rightX, y + 20);

  doc.setFontSize(10);
  doc.text(company, leftX, y + 40);
  const lines = clientLines(input.client);
  doc.text(lines[0] || "Client", midX, y + 40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  setText(doc, [70, 85, 100]);
  let cy = y + 56;
  for (const lineText of lines.slice(1, 5)) {
    doc.text(doc.splitTextToSize(lineText, colW - 20), midX, cy);
    cy += 12;
  }
  doc.text(`No.  ${input.invoice.invoiceNumber}`, rightX, y + 42);
  doc.text(`Issue  ${input.invoice.issueDate}`, rightX, y + 59);
  doc.text(`Due  ${input.invoice.dueDate}`, rightX, y + 76);
  doc.text(`Currency  ${input.invoice.currency}`, rightX, y + 93);
  drawStatusPill(doc, input.invoice, rightX, y + 96, blue);

  y += 142;
  y = drawStandardItemsTable(doc, input, y, {
    headerFill: navy,
    headerText: [255, 255, 255],
    bodyText: [25, 38, 55],
    border: [224, 229, 235],
  });
  y = drawTotals(doc, input, y + 8, { accent: navy, text: navy, muted: [90, 100, 112] });
  drawNotes(doc, input, y + 10, navy);
  drawFooter(doc, company, navy);
}

async function buildMinimalClean(doc: PdfDoc, input: InvoicePdfInput, logo: string | null) {
  const black = [20, 22, 24] as const;
  const grey = [105, 108, 112] as const;
  const light = [245, 245, 245] as const;
  const company = input.businessProfile.companyName || "Your Business Name";

  drawLogoOrName(doc, logo, company, MARGIN, 35, 120, 38, black);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(34);
  setText(doc, black);
  doc.text("Invoice", MARGIN, 118);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  setText(doc, grey);
  doc.text("THANK YOU FOR YOUR BUSINESS", MARGIN, 136);

  setDraw(doc, [215, 215, 215]);
  doc.line(MARGIN, 160, RIGHT, 160);

  let y = 184;
  const x2 = MARGIN + 205;
  const x3 = RIGHT - 125;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  setText(doc, grey);
  doc.text("FROM", MARGIN, y);
  doc.text("BILL TO", x2, y);
  doc.text("INVOICE NUMBER", x3, y);
  y += 18;

  doc.setFontSize(10.5);
  setText(doc, black);
  doc.text(company, MARGIN, y);
  const lines = clientLines(input.client);
  doc.text(lines[0] || "Client", x2, y);
  doc.setFontSize(9.5);
  doc.text(input.invoice.invoiceNumber, x3, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.8);
  setText(doc, grey);
  let ly = y + 16;
  for (const lineText of lines.slice(1, 5)) {
    doc.text(doc.splitTextToSize(lineText, 160), x2, ly);
    ly += 12;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("ISSUE DATE", x3, y + 36);
  doc.text("DUE DATE", x3, y + 73);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  setText(doc, black);
  doc.text(input.invoice.issueDate, x3, y + 52);
  doc.text(input.invoice.dueDate, x3, y + 89);

  y = Math.max(ly, y + 104) + 26;
  y = drawStandardItemsTable(doc, input, y, {
    headerFill: light,
    headerText: [50, 50, 50],
    bodyText: black,
    border: [225, 225, 225],
  });
  y = drawTotals(doc, input, y + 10, { accent: [40, 40, 40], text: black, muted: grey, boxFill: [243, 243, 243], label: "Total Due" });
  drawNotes(doc, input, y + 14, grey);
  drawFooter(doc, company, grey);
}

async function buildPremiumTeal(doc: PdfDoc, input: InvoicePdfInput, logo: string | null) {
  const teal = [0, 91, 86] as const;
  const deep = [0, 55, 54] as const;
  const gold = [205, 166, 89] as const;
  const pale = [244, 250, 249] as const;
  const company = input.businessProfile.companyName || "Your Business Name";

  setFill(doc, deep);
  doc.ellipse(PAGE_WIDTH - 35, -12, 150, 65, "F");
  setDraw(doc, gold);
  doc.setLineWidth(1.2);
  doc.line(PAGE_WIDTH - 160, 0, RIGHT, 55);

  drawLogoOrName(doc, logo, company, MARGIN, 30, 145, 42, deep);
  doc.setFont("times", "bold");
  doc.setFontSize(35);
  setText(doc, deep);
  doc.text("INVOICE", MARGIN, 118);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  setText(doc, [90, 100, 100]);
  doc.text("Thank you for your business. We appreciate your trust and partnership.", MARGIN, 137);
  drawStatusPill(doc, input.invoice, RIGHT - 100, 100, input.invoice.status === "paid" ? teal : [200, 75, 70]);

  let y = 164;
  const colW = (CONTENT - 18) / 3;
  for (let i = 0; i < 3; i++) {
    setFill(doc, pale);
    doc.roundedRect(MARGIN + i * (colW + 9), y, colW, 116, 5, 5, "F");
  }
  const left = MARGIN + 12;
  const mid = MARGIN + colW + 21;
  const right = MARGIN + (colW + 9) * 2 + 12;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  setText(doc, deep);
  doc.text("FROM", left, y + 20);
  doc.text("BILL TO", mid, y + 20);
  doc.text("INVOICE DETAILS", right, y + 20);
  doc.setFontSize(10);
  doc.text(company, left, y + 40);
  const lines = clientLines(input.client);
  doc.text(lines[0] || "Client", mid, y + 40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.4);
  setText(doc, [70, 85, 83]);
  let ly = y + 56;
  for (const lineText of lines.slice(1, 5)) {
    doc.text(doc.splitTextToSize(lineText, colW - 18), mid, ly);
    ly += 12;
  }
  doc.text(`No.  ${input.invoice.invoiceNumber}`, right, y + 42);
  doc.text(`Issue  ${input.invoice.issueDate}`, right, y + 59);
  doc.text(`Due  ${input.invoice.dueDate}`, right, y + 76);
  doc.text(`Currency  ${input.invoice.currency}`, right, y + 93);

  y += 136;
  const balance = Math.max(0, subtotal(input.items) - input.totalPaid);
  setFill(doc, teal);
  doc.roundedRect(RIGHT - 174, y - 8, 174, 52, 7, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text("AMOUNT DUE", RIGHT - 160, y + 9);
  doc.setFont("times", "bold");
  doc.setFontSize(20);
  doc.text(money(balance, input.invoice.currency), RIGHT - 12, y + 32, { align: "right" });
  y += 62;

  y = drawStandardItemsTable(doc, input, y, {
    headerFill: deep,
    headerText: [255, 255, 255],
    bodyText: [24, 45, 44],
    border: [220, 230, 228],
    headerRounded: true,
  });
  y = drawTotals(doc, input, y + 8, { accent: teal, text: deep, muted: [85, 100, 98], boxFill: [224, 244, 241], label: "Balance Due" });
  drawNotes(doc, input, y + 10, teal);

  setFill(doc, deep);
  doc.rect(0, PAGE_HEIGHT - 22, PAGE_WIDTH, 22, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(255, 255, 255);
  doc.text("GREAT BUSINESSES BUILD BRIGHTER TOMORROWS", PAGE_WIDTH / 2, PAGE_HEIGHT - 8, { align: "center" });
}

async function buildInvoicePdf(input: InvoicePdfInput) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const logo = await loadImageAsDataUrl(input.businessProfile.logoUrl);
  const template: InvoiceTemplateKey = input.invoice.templateKey ?? "modern_blue";

  if (template === "corporate_navy") await buildCorporateNavy(doc, input, logo);
  else if (template === "minimal_clean") await buildMinimalClean(doc, input, logo);
  else if (template === "premium_teal") await buildPremiumTeal(doc, input, logo);
  else await buildModernBlue(doc, input, logo);

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
