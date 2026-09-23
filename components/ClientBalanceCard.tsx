import { AlertCircle, CheckCircle2, Receipt } from "lucide-react";
import type { ClientBalance } from "@/lib/types";
import { formatMoney } from "@/lib/utils";

export function ClientBalanceCard({ balance }: { balance: ClientBalance }) {
  return (
    <div className="rounded-xl2 border border-base-700/60 bg-base-850 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Receipt size={16} className="text-accent-400" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Balance</h2>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-base-900/60 p-3">
          <p className="text-[11px] uppercase tracking-wide text-neutral-500">Total invoiced</p>
          <p className="mt-1 text-lg font-semibold text-neutral-100">
            {formatMoney(balance.totalInvoiced, balance.currency)}
          </p>
        </div>
        <div className="rounded-lg bg-base-900/60 p-3">
          <p className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-neutral-500">
            <CheckCircle2 size={11} />
            Total paid
          </p>
          <p className="mt-1 text-lg font-semibold text-accent-300">{formatMoney(balance.totalPaid, balance.currency)}</p>
        </div>
        <div className="rounded-lg bg-base-900/60 p-3">
          <p className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-neutral-500">
            <AlertCircle size={11} />
            Outstanding
          </p>
          <p className={`mt-1 text-lg font-semibold ${balance.outstanding > 0 ? "text-amber-400" : "text-accent-300"}`}>
            {formatMoney(balance.outstanding, balance.currency)}
          </p>
        </div>
      </div>
    </div>
  );
}
