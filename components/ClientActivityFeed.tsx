import { Activity, FileText, Package, Wallet } from "lucide-react";
import type { ClientService, Invoice, Payment } from "@/lib/types";
import { formatMoney } from "@/lib/utils";

interface ActivityEvent {
  id: string;
  at: string;
  icon: typeof FileText;
  label: string;
  detail: string;
}

/**
 * Derives a reverse-chronological activity feed from existing records
 * (invoices, payments, client_services) rather than a dedicated log table.
 * Kept as one pure function so a future dedicated activity-log table (for
 * AI queries) can slot in later by swapping this function's implementation
 * without touching the component that renders it.
 */
export function buildClientActivity(invoices: Invoice[], payments: Payment[], clientServices: ClientService[]): ActivityEvent[] {
  const events: ActivityEvent[] = [];

  for (const invoice of invoices) {
    events.push({
      id: `invoice-${invoice.id}`,
      at: invoice.createdAt,
      icon: FileText,
      label: `Invoice ${invoice.invoiceNumber} created`,
      detail: `${invoice.currency} · ${invoice.status.replace("_", " ")}`,
    });
  }

  for (const payment of payments) {
    events.push({
      id: `payment-${payment.id}`,
      at: payment.createdAt,
      icon: Wallet,
      label: `Payment received`,
      detail: formatMoney(payment.amount, payment.currency),
    });
  }

  for (const cs of clientServices) {
    events.push({
      id: `service-${cs.id}`,
      at: cs.createdAt,
      icon: Package,
      label: `Subscribed to ${cs.serviceName}`,
      detail: cs.billingFrequency.replace("_", " "),
    });
  }

  return events.sort((a, b) => (a.at < b.at ? 1 : -1));
}

export function ClientActivityFeed({
  invoices,
  payments,
  clientServices,
}: {
  invoices: Invoice[];
  payments: Payment[];
  clientServices: ClientService[];
}) {
  const events = buildClientActivity(invoices, payments, clientServices).slice(0, 20);

  return (
    <div className="rounded-xl2 border border-base-700/60 bg-base-850 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Activity size={16} className="text-accent-400" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Activity</h2>
      </div>
      {events.length === 0 ? (
        <p className="rounded-lg border border-dashed border-base-700 p-4 text-center text-xs text-neutral-500">
          Nothing yet.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {events.map((event) => (
            <div key={event.id} className="flex items-center gap-2.5 rounded-md border border-base-700/50 bg-base-900 px-2.5 py-1.5">
              <event.icon size={13} className="shrink-0 text-neutral-500" />
              <span className="flex-1 truncate text-xs text-neutral-300">{event.label}</span>
              <span className="shrink-0 text-xs text-neutral-500">{event.detail}</span>
              <span className="shrink-0 text-[11px] text-neutral-600">{new Date(event.at).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
