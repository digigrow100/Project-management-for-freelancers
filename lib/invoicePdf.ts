import type {
  BusinessProfile,
  Client,
  Invoice,
  InvoiceItem,
  InvoiceStatus,
  InvoiceTemplateKey,
  InvoiceBankDetails,
} from "./types";
import { currencySymbol } from "./utils";
import { businessDateKey } from "./date";

export interface InvoicePdfInput {
  invoice: Invoice;
  items: InvoiceItem[];
  client: Client;
  businessProfile: BusinessProfile;
  totalPaid: number;
  bankDetails?: InvoiceBankDetails | null;
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
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  }).format(Number.isFinite(amount) ? amount : 0);

  if (currency === "PKR") return `PKR ${formatted}`;
  if (currency === "GBP") return `£${formatted}`;
  if (currency === "USD") return `${formatted}`;
  const symbol = currencySymbol(currency);
  return symbol ? `${symbol}${formatted}` : `${currency} ${formatted}`;
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
  let labelX = x;
  if (logo) {
    try {
      const props = doc.getImageProperties(logo);
      const size = fitBox(props.width, props.height, maxW, maxH);
      doc.addImage(logo, dataUrlFormat(logo), x, y, size.w, size.h);
      labelX = x + size.w + 12;
    } catch {}
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13.5);
  doc.setCharSpace(0);
  setText(doc, textColor);
  doc.text(company, labelX, y + 18);
}

function drawStatusPill(
  doc: PdfDoc,
  invoice: Invoice,
  x: number,
  y: number,
  fill: readonly [number, number, number],
  width = 92,
  textColor: readonly [number, number, number] = [255, 255, 255],
  height = 24,
) {
  setFill(doc, fill);
  doc.roundedRect(x, y, width, height, 5, 5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(height <= 18 ? 7.6 : 8.5);
  doc.setCharSpace(0);
  setText(doc, textColor);
  doc.text(STATUS_LABEL[invoice.status], x + width / 2, y + height / 2 + 3, { align: "center" });
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
  const tableLeft = MARGIN;
  const tableRight = RIGHT;
  const padX = 14;
  const descX = tableLeft + padX;
  const qtyX = tableRight - 212;
  const rateX = tableRight - 116;
  const amountX = tableRight - padX;
  const descMaxW = qtyX - descX - 28;
  const headerH = 28;

  let y = yStart;

  setFill(doc, opts.headerFill);
  if (opts.headerRounded) doc.roundedRect(tableLeft, y, CONTENT, headerH, 4, 4, "F");
  else doc.rect(tableLeft, y, CONTENT, headerH, "F");

  const headerBaseline = y + 18;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setCharSpace(0);
  setText(doc, opts.headerText);
  doc.text("DESCRIPTION", descX, headerBaseline);
  doc.text("QTY", qtyX, headerBaseline, { align: "right" });
  doc.text("RATE", rateX, headerBaseline, { align: "right" });
  doc.text("AMOUNT", amountX, headerBaseline, { align: "right" });

  y += headerH;

  for (const item of input.items) {
    const amount = item.quantity * item.unitPrice;
    const desc = doc.splitTextToSize(item.description, descMaxW) as string[];
    const rowH = Math.max(30, desc.length * 11 + 14);
    const baseline = y + 19;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setCharSpace(0);
    setText(doc, opts.bodyText);
    doc.text(desc, descX, baseline, { lineHeightFactor: 1.12 });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.2);
    doc.setCharSpace(0);
    doc.text(String(item.quantity), qtyX, baseline, { align: "right" });
    doc.text(money(item.unitPrice, input.invoice.currency), rateX, baseline, { align: "right" });
    doc.text(money(amount, input.invoice.currency), amountX, baseline, { align: "right" });

    setDraw(doc, opts.border);
    doc.setLineWidth(0.55);
    doc.line(tableLeft, y + rowH, tableRight, y + rowH);
    y += rowH;
  }

  if (input.items.length === 0) {
    const rowH = 34;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setCharSpace(0);
    setText(doc, [120, 120, 120]);
    doc.text("No line items.", descX, y + 20);
    setDraw(doc, opts.border);
    doc.line(tableLeft, y + rowH, tableRight, y + rowH);
    y += rowH;
  }

  return y;
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
  const panelW = 250;
  const panelX = RIGHT - panelW;
  const labelX = panelX + 16;
  const valueX = RIGHT - 14;
  const amountText = money(balance, input.invoice.currency);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.4);
  doc.setCharSpace(0);
  setText(doc, opts.muted);
  doc.text("Subtotal", labelX, y + 8);
  doc.text(money(total, input.invoice.currency), valueX, y + 8, { align: "right" });

  doc.text("Paid", labelX, y + 28);
  doc.text(money(input.totalPaid, input.invoice.currency), valueX, y + 28, { align: "right" });

  // Divider belongs below Subtotal/Paid, not above the totals block.
  const dividerY = y + 40;
  setDraw(doc, [226, 232, 239]);
  doc.setLineWidth(0.6);
  doc.line(panelX, dividerY, RIGHT, dividerY);

  const balanceY = dividerY + 10;
  setFill(doc, opts.boxFill ?? opts.accent);
  doc.roundedRect(panelX, balanceY, panelW, 44, 6, 6, "F");

  doc.setFont("helvetica", "bold");
  doc.setCharSpace(0);
  doc.setFontSize(11.2);
  if (opts.boxFill) setText(doc, opts.text);
  else doc.setTextColor(255, 255, 255);
  doc.text(opts.label ?? "Balance Due", labelX, balanceY + 27);

  doc.setFontSize(amountText.length > 18 ? 11.5 : 13.5);
  doc.text(amountText, valueX, balanceY + 27, { align: "right" });

  return balanceY + 58;
}

function drawPaymentDetails(
  doc: PdfDoc,
  input: InvoicePdfInput,
  y: number,
  accent: readonly [number, number, number],
) {
  const bank = input.bankDetails;
  if (!bank || !bank.beneficiary || !bank.bank) return y;

  const lines = [
    bank.beneficiary ? `Beneficiary: ${bank.beneficiary}` : "",
    bank.bank ? `Bank: ${bank.bank}` : "",
    bank.sortCode ? `Sort code: ${bank.sortCode}` : "",
    bank.account ? `Account: ${bank.account}` : "",
    bank.iban ? `IBAN: ${bank.iban}` : "",
    bank.address ? `Address: ${bank.address}` : "",
  ].filter(Boolean);

  const estimated = 34 + lines.length * 11;
  if (y + estimated > PAGE_HEIGHT - 66) {
    doc.addPage();
    y = MARGIN;
  }

  setDraw(doc, [225, 225, 225]);
  doc.line(MARGIN, y, RIGHT, y);
  y += 16;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  setText(doc, accent);
  doc.text("PAYMENT DETAILS", MARGIN, y);
  y += 15;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  setText(doc, [70, 70, 70]);
  for (const line of lines) {
    const wrapped = doc.splitTextToSize(line, CONTENT * 0.72) as string[];
    doc.text(wrapped, MARGIN, y);
    y += wrapped.length * 10.5;
  }

  doc.setFontSize(7.5);
  setText(doc, [115, 115, 115]);
  doc.text("Please use the invoice number as your payment reference.", MARGIN, y + 3);
  return y + 15;
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
  const navy = [12, 39, 76] as const;
  const blue = [39, 128, 230] as const;
  const pale = [247, 250, 254] as const;
  const paleBlue = [233, 243, 253] as const;
  const line = [220, 228, 238] as const;
  const muted = [91, 106, 126] as const;
  const company = input.businessProfile.companyName || "Your Business Name";
  doc.setCharSpace(0);

  // Header: both sides share the same top/bottom baselines.
  drawLogoOrName(doc, logo, company, MARGIN, 27, 52, 36, navy);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(27);
  setText(doc, navy);
  doc.text("INVOICE", RIGHT, 50, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  setText(doc, muted);
  doc.text(input.invoice.invoiceNumber, RIGHT, 67, { align: "right" });

  const headerStatusFill =
    input.invoice.status === "paid"
      ? ([220, 247, 230] as const)
      : input.invoice.status === "overdue"
        ? ([254, 226, 226] as const)
        : ([254, 240, 138] as const);
  const headerStatusText =
    input.invoice.status === "paid"
      ? ([22, 101, 52] as const)
      : input.invoice.status === "overdue"
        ? ([153, 27, 27] as const)
        : ([133, 77, 14] as const);
  const headerStatusWidth = input.invoice.status === "partially_paid" ? 82 : 58;
  drawStatusPill(
    doc,
    input.invoice,
    RIGHT - headerStatusWidth,
    74,
    headerStatusFill,
    headerStatusWidth,
    headerStatusText,
    18,
  );

  setDraw(doc, line);
  doc.setLineWidth(0.8);
  doc.line(MARGIN, 101, RIGHT, 101);

  // Equal-width cards with identical internal padding and baselines.
  const cardY = 119;
  const gap = 10;
  const cardW = (CONTENT - gap * 2) / 3;
  const cardH = 108;
  const x1 = MARGIN;
  const x2 = MARGIN + cardW + gap;
  const x3 = MARGIN + (cardW + gap) * 2;
  const pad = 14;

  for (const x of [x1, x2, x3]) {
    setFill(doc, pale);
    setDraw(doc, line);
    doc.roundedRect(x, cardY, cardW, cardH, 6, 6, "FD");
  }

  const drawCardTitle = (title: string, x: number) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    setText(doc, blue);
    doc.text(title, x + pad, cardY + 20);
  };
  drawCardTitle("FROM", x1);
  drawCardTitle("BILL TO", x2);
  drawCardTitle("INVOICE DETAILS", x3);

  const bodyTop = cardY + 43;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  setText(doc, navy);
  doc.text(company, x1 + pad, bodyTop, { maxWidth: cardW - pad * 2 });

  const lines = clientLines(input.client);
  doc.text(lines[0] || "Client", x2 + pad, bodyTop, { maxWidth: cardW - pad * 2 });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.2);
  setText(doc, muted);
  let billY = bodyTop + 16;
  for (const lineText of lines.slice(1, 4)) {
    const wrapped = doc.splitTextToSize(lineText, cardW - pad * 2) as string[];
    doc.text(wrapped, x2 + pad, billY);
    billY += wrapped.length * 10.5;
  }

  const detailLabelX = x3 + pad;
  const detailValueX = x3 + cardW - pad;
  const row1 = cardY + 39;
  const row2 = cardY + 55;
  const row3 = cardY + 71;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.2);
  setText(doc, muted);
  doc.text("Invoice #", detailLabelX, row1);
  doc.text("Issue date", detailLabelX, row2);
  doc.text("Due date", detailLabelX, row3);

  doc.setFont("helvetica", "bold");
  setText(doc, navy);
  doc.text(input.invoice.invoiceNumber, detailValueX, row1, { align: "right" });
  doc.text(input.invoice.issueDate, detailValueX, row2, { align: "right" });
  doc.text(input.invoice.dueDate, detailValueX, row3, { align: "right" });

  // Status is shown as a compact badge in the invoice header.

  // Table starts on a fixed baseline after cards.
  let y = cardY + cardH + 28;
  y = drawStandardItemsTable(doc, input, y, {
    headerFill: paleBlue,
    headerText: navy,
    bodyText: navy,
    border: line,
    headerRounded: true,
  });

  y = drawTotals(doc, input, y + 14, {
    accent: blue,
    text: navy,
    muted,
    boxFill: paleBlue,
  });

  y = drawNotes(doc, input, y + 8, blue);
  y = drawPaymentDetails(doc, input, y + 8, blue);
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
  y = drawNotes(doc, input, y + 10, navy);
  y = drawPaymentDetails(doc, input, y + 8, navy);
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
  y = drawNotes(doc, input, y + 14, grey);
  y = drawPaymentDetails(doc, input, y + 8, grey);
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
  y = drawNotes(doc, input, y + 10, teal);
  y = drawPaymentDetails(doc, input, y + 8, teal);

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
  doc.setCharSpace(0);
  const logo = await loadImageAsDataUrl(input.businessProfile.logoUrl);
  const template: InvoiceTemplateKey = input.invoice.templateKey ?? "modern_blue";

  if (template === "corporate_navy") await buildCorporateNavy(doc, input, logo);
  else if (template === "minimal_clean") await buildMinimalClean(doc, input, logo);
  else if (template === "premium_teal") await buildPremiumTeal(doc, input, logo);
  else await buildModernBlue(doc, input, logo);

  return doc;
}

function fileName(invoice: Invoice): string {
  const safe = (value: string) =>
    value
      .trim()
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();

  const projectName = safe(invoice.projectName || "project");
  const invoiceNumber = safe(invoice.invoiceNumber || "invoice");
  const currentDate = businessDateKey();

  return `${projectName}-${invoiceNumber}-${currentDate}.pdf`;
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
