"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Plus, X, Zap } from "lucide-react";
import type { Client, Invoice, InvoiceStatus } from "@/lib/types";
import { createInvoiceAction, generateDueInvoiceDraftsAction } from "@/lib/actions";
import { cn, formatMoney } from "@/lib/utils";

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  partially_paid: "Partially Paid",
  overdue: "Overdue",
  cancelled: "Cancelled",
};
const STATUS_LABEL = INVOICE_STATUS_LABEL;

export const INVOICE_STATUS_STYLE: Record<InvoiceStatus, string> = {
  draft: "bg-base-700/60 text-neutral-400",
  sent: "bg-sky-500/15 text-sky-400",
  paid: "bg-accent-500/15 text-accent-400",
  partially_paid: "bg-amber-500/15 text-amber-400",
  overdue: "bg-rose-500/15 text-rose-400",
  cancelled: "bg-neutral-700/40 text-neutral-500",
};
const STATUS_STYLE = INVOICE_STATUS_STYLE;

export function InvoicesPanel({
  invoices,
  clients,
  totals,
}: {
  invoices: Invoice[];
  clients: Client[];
  totals: Record<string, number>;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "all">("all");
  const [isPending, startTransition] = useTransition();
  const [generatedMsg, setGeneratedMsg] = useState<string | null>(null);

  const filtered = useMemo(
    () => (statusFilter === "all" ? invoices : invoices.filter((i) => i.status === statusFilter)),
    [invoices, statusFilter],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-50">Invoices</h1>
          <p className="mt-1 text-sm text-neutral-500">Every invoice across every client.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const count = await generateDueInvoiceDraftsAction();
                setGeneratedMsg(count > 0 ? `Generated ${count} draft invoice${count === 1 ? "" : "s"}.` : "Nothing due yet.");
                router.refresh();
              })
            }
            className="flex items-center gap-1.5 rounded-lg border border-base-600 px-3 py-2 text-sm text-neutral-300 hover:border-accent-500/60 hover:text-accent-300 disabled:opacity-50"
          >
            <Zap size={15} />
            Generate due drafts
          </button>
          {!adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex items-center gap-2 rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-base-950 hover:bg-accent-400 shadow-glow"
            >
              <Plus size={16} />
              New invoice
            </button>
          )}
        </div>
      </div>

      {generatedMsg && <p className="text-xs text-neutral-500">{generatedMsg}</p>}

      {adding && <NewInvoiceForm clients={clients} onDone={() => setAdding(false)} />}

      <div className="flex flex-wrap gap-1.5 rounded-lg border border-base-700/60 bg-base-850 p-1 w-fit">
        {(["all", "draft", "sent", "partially_paid", "paid", "overdue", "cancelled"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              statusFilter === s ? "bg-accent-500 text-base-950" : "text-neutral-400 hover:text-neutral-200",
            )}
          >
            {s === "all" ? "All" : STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl2 border border-dashed border-base-700/60 p-10 text-center">
          <FileText size={22} className="text-neutral-500" />
          <p className="text-sm text-neutral-400">No invoices here yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((invoice) => (
            <Link
              key={invoice.id}
              href={`/invoices/${invoice.id}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-base-700/50 bg-base-850/60 px-4 py-3 hover:border-accent-500/40"
            >
              <div>
                <p className="text-sm font-medium text-neutral-100">{invoice.invoiceNumber}</p>
                <p className="text-xs text-neutral-500">
                  {invoice.clientName} {invoice.projectName ? `· ${invoice.projectName}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-right text-xs">
                <div>
                  <p className="text-neutral-500">Due</p>
                  <p className="text-neutral-200">{invoice.dueDate}</p>
                </div>
                <div>
                  <p className="text-neutral-500">Total</p>
                  <p className="text-neutral-200">{formatMoney(totals[invoice.id] ?? 0, invoice.currency)}</p>
                </div>
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_STYLE[invoice.status])}>
                  {STATUS_LABEL[invoice.status]}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

interface DraftItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

function NewInvoiceForm({ clients, onDone }: { clients: Client[]; onDone: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [items, setItems] = useState<DraftItem[]>([{ description: "", quantity: 1, unitPrice: 0 }]);

  function updateItem(index: number, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }
  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  return (
    <form
      action={(formData) => {
        formData.set("items", JSON.stringify(items.filter((i) => i.description.trim())));
        startTransition(async () => {
          const id = await createInvoiceAction(formData);
          onDone();
          if (id) router.push(`/invoices/${id}`);
        });
      }}
      className="flex flex-col gap-3 rounded-xl2 border border-accent-500/30 bg-base-850 p-4"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-neutral-200">New invoice</p>
        <button type="button" onClick={onDone} className="text-neutral-500 hover:text-neutral-300">
          <X size={15} />
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <select
          name="clientId"
          required
          className="w-full rounded-md border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100 focus:border-accent-500 focus:outline-none sm:col-span-2"
        >
          <option value="">Select client…</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name || c.company}
            </option>
          ))}
        </select>
        <select
          name="currency"
          defaultValue="PKR"
          className="w-full rounded-md border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100 focus:border-accent-500 focus:outline-none"
        >
          {["PKR", "USD", "GBP"].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue="draft"
          className="w-full rounded-md border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100 focus:border-accent-500 focus:outline-none"
        >
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
        </select>
        <div>
          <label className="mb-1 block text-[11px] text-neutral-500">Issue date</label>
          <input
            name="issueDate"
            type="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="w-full rounded-md border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100 focus:border-accent-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-neutral-500">Due date</label>
          <input
            name="dueDate"
            type="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="w-full rounded-md border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100 focus:border-accent-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-neutral-400">Line items</p>
        {items.map((item, i) => (
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
          onClick={() => setItems((prev) => [...prev, { description: "", quantity: 1, unitPrice: 0 }])}
          className="flex w-fit items-center gap-1 text-xs text-accent-400 hover:text-accent-300"
        >
          <Plus size={12} />
          Add item
        </button>
        <p className="text-right text-sm text-neutral-300">Total: {total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
      </div>

      <textarea
        name="notes"
        rows={2}
        placeholder="Notes (optional)"
        className="w-full rounded-md border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
      />

      <button
        type="submit"
        disabled={isPending}
        className="w-fit rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-base-950 hover:bg-accent-400 disabled:opacity-60"
      >
        {isPending ? "Creating…" : "Create invoice"}
      </button>
    </form>
  );
}
