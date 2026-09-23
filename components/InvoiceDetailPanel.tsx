"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, Eye, Plus, Trash2, X } from "lucide-react";
import type { BusinessProfile, Client, Invoice, InvoiceItem, InvoiceStatus, Payment, Project } from "@/lib/types";
import {
  addInvoicePaymentAction,
  deleteInvoiceAction,
  deleteInvoicePaymentAction,
  setInvoiceStatusAction,
  updateInvoiceAction,
} from "@/lib/actions";
import { downloadInvoicePdf, previewInvoicePdf } from "@/lib/invoicePdf";
import { cn, formatMoney } from "@/lib/utils";

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  partially_paid: "Partially Paid",
  overdue: "Overdue",
  cancelled: "Cancelled",
};

const STATUS_STYLE: Record<InvoiceStatus, string> = {
  draft: "bg-base-700/60 text-neutral-400",
  sent: "bg-sky-500/15 text-sky-400",
  paid: "bg-accent-500/15 text-accent-400",
  partially_paid: "bg-amber-500/15 text-amber-400",
  overdue: "bg-rose-500/15 text-rose-400",
  cancelled: "bg-neutral-700/40 text-neutral-500",
};

interface DraftItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

export function InvoiceDetailPanel({
  invoice,
  items,
  client,
  businessProfile,
  payments,
  projects,
}: {
  invoice: Invoice;
  items: InvoiceItem[];
  client: Client;
  businessProfile: BusinessProfile;
  payments: Payment[];
  projects: Project[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [draftItems, setDraftItems] = useState<DraftItem[]>(
    items.length > 0 ? items.map((i) => ({ description: i.description, quantity: i.quantity, unitPrice: i.unitPrice })) : [{ description: "", quantity: 1, unitPrice: 0 }],
  );
  const [pdfBusy, setPdfBusy] = useState<"preview" | "download" | null>(null);

  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const subtotal = draftItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  function updateItem(index: number, patch: Partial<DraftItem>) {
    setDraftItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }
  function removeItem(index: number) {
    setDraftItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function runPdf(action: "preview" | "download") {
    setPdfBusy(action);
    try {
      const savedItems: InvoiceItem[] = draftItems
        .filter((i) => i.description.trim())
        .map((i, idx) => ({ id: String(idx), invoiceId: invoice.id, description: i.description, quantity: i.quantity, unitPrice: i.unitPrice, order: idx }));
      const input = { invoice, items: savedItems, client, businessProfile, totalPaid };
      if (action === "preview") await previewInvoicePdf(input);
      else await downloadInvoicePdf(input);
    } finally {
      setPdfBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Link href="/invoices" className="flex w-fit items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-300">
        <ArrowLeft size={13} />
        All invoices
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold text-neutral-50">{invoice.invoiceNumber}</h1>
            <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", STATUS_STYLE[invoice.status])}>
              {STATUS_LABEL[invoice.status]}
            </span>
          </div>
          <p className="mt-1 text-sm text-neutral-400">
            <Link href={`/clients/${client.id}`} className="hover:text-accent-300">
              {client.name || client.company}
            </Link>
            {invoice.projectName && ` · ${invoice.projectName}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={invoice.status}
            disabled={isPending}
            onChange={(e) =>
              startTransition(async () => {
                await setInvoiceStatusAction(invoice.id, client.id, e.target.value as InvoiceStatus);
                router.refresh();
              })
            }
            className="rounded-md border border-base-600 bg-base-900 px-2.5 py-2 text-sm text-neutral-300 focus:border-accent-500 focus:outline-none"
          >
            {(Object.keys(STATUS_LABEL) as InvoiceStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={pdfBusy !== null}
            onClick={() => runPdf("preview")}
            className="flex items-center gap-1.5 rounded-lg border border-base-600 px-3 py-2 text-sm text-neutral-300 hover:border-accent-500/60 hover:text-accent-300 disabled:opacity-50"
          >
            <Eye size={15} />
            {pdfBusy === "preview" ? "Opening…" : "Preview"}
          </button>
          <button
            type="button"
            disabled={pdfBusy !== null}
            onClick={() => runPdf("download")}
            className="flex items-center gap-1.5 rounded-lg bg-accent-500 px-3 py-2 text-sm font-medium text-base-950 hover:bg-accent-400 disabled:opacity-50"
          >
            <Download size={15} />
            {pdfBusy === "download" ? "Preparing…" : "Download"}
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              if (confirm(`Delete invoice ${invoice.invoiceNumber}? This cannot be undone.`)) {
                startTransition(async () => {
                  await deleteInvoiceAction(invoice.id, client.id);
                  router.push("/invoices");
                });
              }
            }}
            className="rounded-md p-2 text-neutral-500 hover:bg-rose-500/10 hover:text-rose-400 disabled:opacity-50"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <form
        action={(formData) => {
          formData.set("items", JSON.stringify(draftItems.filter((i) => i.description.trim())));
          startTransition(async () => {
            await updateInvoiceAction(invoice.id, client.id, formData);
            router.refresh();
          });
        }}
        className="flex flex-col gap-4 rounded-xl2 border border-base-700/60 bg-base-850 p-4"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <select
            name="projectId"
            defaultValue={invoice.projectId ?? ""}
            className="w-full rounded-md border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100 focus:border-accent-500 focus:outline-none sm:col-span-2"
          >
            <option value="">No linked project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            name="currency"
            defaultValue={invoice.currency}
            className="w-full rounded-md border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100 focus:border-accent-500 focus:outline-none"
          >
            {["PKR", "USD", "GBP"].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <div />
          <div>
            <label className="mb-1 block text-[11px] text-neutral-500">Issue date</label>
            <input
              name="issueDate"
              type="date"
              defaultValue={invoice.issueDate}
              className="w-full rounded-md border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100 focus:border-accent-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-neutral-500">Due date</label>
            <input
              name="dueDate"
              type="date"
              defaultValue={invoice.dueDate}
              className="w-full rounded-md border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100 focus:border-accent-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-neutral-400">Line items</p>
          {draftItems.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={item.description}
                onChange={(e) => updateItem(i, { description: e.target.value })}
                placeholder="Description"
                className="min-w-0 flex-1 rounded-md border border-base-600 bg-base-900 px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
              />
              <input
                type="number"
                min="0"
                step="1"
                value={item.quantity}
                onChange={(e) => updateItem(i, { quantity: Number(e.target.value) || 0 })}
                className="w-20 rounded-md border border-base-600 bg-base-900 px-2.5 py-1.5 text-sm text-neutral-100 focus:border-accent-500 focus:outline-none"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={item.unitPrice}
                onChange={(e) => updateItem(i, { unitPrice: Number(e.target.value) || 0 })}
                className="w-28 rounded-md border border-base-600 bg-base-900 px-2.5 py-1.5 text-sm text-neutral-100 focus:border-accent-500 focus:outline-none"
              />
              <span className="w-24 shrink-0 text-right text-xs text-neutral-400">
                {formatMoney(item.quantity * item.unitPrice, invoice.currency)}
              </span>
              <button
                type="button"
                onClick={() => removeItem(i)}
                className="shrink-0 rounded-md p-1.5 text-neutral-500 hover:text-rose-400"
              >
                <X size={13} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setDraftItems((prev) => [...prev, { description: "", quantity: 1, unitPrice: 0 }])}
            className="flex w-fit items-center gap-1 text-xs text-accent-400 hover:text-accent-300"
          >
            <Plus size={12} />
            Add item
          </button>
          <p className="text-right text-sm text-neutral-300">
            Subtotal: <span className="font-medium text-neutral-100">{formatMoney(subtotal, invoice.currency)}</span>
          </p>
        </div>

        <textarea
          name="notes"
          rows={2}
          defaultValue={invoice.notes}
          placeholder="Notes (optional, shown on the PDF)"
          className="w-full rounded-md border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
        />

        <button
          type="submit"
          disabled={isPending}
          className="w-fit rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-base-950 hover:bg-accent-400 disabled:opacity-60"
        >
          {isPending ? "Saving…" : "Save invoice"}
        </button>
      </form>

      <PaymentsSection invoice={invoice} clientId={client.id} payments={payments} totalDue={subtotal} />
    </div>
  );
}

function PaymentsSection({
  invoice,
  clientId,
  payments,
  totalDue,
}: {
  invoice: Invoice;
  clientId: string;
  payments: Payment[];
  totalDue: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="rounded-xl2 border border-base-700/60 bg-base-850 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Payments</h2>
        <p className="text-xs text-neutral-500">
          Paid {formatMoney(totalPaid, invoice.currency)} of {formatMoney(totalDue, invoice.currency)}
        </p>
      </div>

      <form
        action={(formData) => {
          formData.set("invoiceId", invoice.id);
          formData.set("clientId", clientId);
          formData.set("currency", invoice.currency);
          startTransition(async () => {
            await addInvoicePaymentAction(formData);
            router.refresh();
          });
        }}
        className="mb-3 flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-base-600 p-3"
      >
        <div>
          <label className="mb-1 block text-[11px] text-neutral-500">Amount</label>
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0"
            required
            className="w-28 rounded-md border border-base-600 bg-base-900 px-2 py-1.5 text-xs text-neutral-300 focus:border-accent-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-neutral-500">Date</label>
          <input
            name="paidOn"
            type="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="rounded-md border border-base-600 bg-base-900 px-2 py-1.5 text-xs text-neutral-300 focus:border-accent-500 focus:outline-none"
          />
        </div>
        <div className="min-w-[10rem] flex-1">
          <label className="mb-1 block text-[11px] text-neutral-500">Note (optional)</label>
          <input
            name="note"
            placeholder="e.g. Bank transfer"
            className="w-full rounded-md border border-base-600 bg-base-900 px-2 py-1.5 text-xs text-neutral-300 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-accent-500 px-3 py-1.5 text-xs font-medium text-base-950 hover:bg-accent-400 disabled:opacity-60"
        >
          {isPending ? "Saving…" : "Record payment"}
        </button>
      </form>

      <div className="flex flex-col gap-1.5">
        {payments.length === 0 && (
          <p className="rounded-lg border border-dashed border-base-700 p-4 text-center text-xs text-neutral-500">
            No payments recorded yet.
          </p>
        )}
        {payments.map((payment) => (
          <div key={payment.id} className="flex items-center gap-2 rounded-md border border-base-700/50 bg-base-900 px-2.5 py-1.5">
            <span className="text-xs text-neutral-500">{payment.paidOn}</span>
            <span className="flex-1 truncate text-xs text-neutral-400">{payment.note}</span>
            <span className="shrink-0 text-sm font-medium text-neutral-100">{formatMoney(payment.amount, payment.currency)}</span>
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  await deleteInvoicePaymentAction(payment.id, invoice.id, clientId);
                  router.refresh();
                })
              }
              className="shrink-0 rounded-md p-1 text-neutral-500 hover:text-rose-400 disabled:opacity-50"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
