import { notFound } from "next/navigation";
import Link from "next/link";
import { Wallet, TrendingUp, AlertCircle, Receipt, FileWarning } from "lucide-react";
import { getCurrentProfile } from "@/lib/auth";
import {
  listAllPayments,
  listInvoiceItemsForInvoices,
  listInvoices,
  listPaymentPlans,
  getProjects,
  invoiceTotal,
} from "@/lib/store";
import { StatCard } from "@/components/StatCard";
import { PROJECT_THEME } from "@/lib/projectTheme";
import { cn, formatMoney, resolveSelectedCurrency, sortCurrencies } from "@/lib/utils";
import { INVOICE_STATUS_LABEL, INVOICE_STATUS_STYLE } from "@/components/InvoicesPanel";
import type { PaymentPlan, Project } from "@/lib/types";

export const dynamic = "force-dynamic";

type RangeKey = "month" | "6m" | "year";

const RANGE_LABEL: Record<RangeKey, string> = {
  month: "This month",
  "6m": "Last 6 months",
  year: "This year",
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function rangeStart(range: RangeKey): string {
  const now = new Date();
  if (range === "month") return dateKey(new Date(now.getFullYear(), now.getMonth(), 1));
  if (range === "6m") return dateKey(new Date(now.getFullYear(), now.getMonth() - 5, 1));
  return dateKey(new Date(now.getFullYear(), 0, 1));
}

export default async function FinancePage({ searchParams }: { searchParams: { range?: string; currency?: string } }) {
  const profile = await getCurrentProfile();
  if (profile?.role !== "admin") notFound();

  const range = (["month", "6m", "year"].includes(searchParams.range ?? "") ? searchParams.range : "month") as RangeKey;
  const start = rangeStart(range);
  const today = dateKey(new Date());

  const [allPayments, allPlans, projects, allInvoices] = await Promise.all([
    listAllPayments(),
    listPaymentPlans(),
    getProjects(),
    listInvoices(),
  ]);
  const invoiceItemsByInvoice = await listInvoiceItemsForInvoices(allInvoices.map((i) => i.id));

  const currencies = sortCurrencies(Array.from(new Set(allPlans.map((p) => p.currency))));
  const currency = resolveSelectedCurrency(currencies, searchParams.currency);
  if (currencies.length === 0) currencies.push(currency);

  const projectById = new Map<string, Project>(projects.map((p) => [p.id, p]));
  const plans = allPlans.filter((p) => p.currency === currency);
  const planByProject = new Map<string, PaymentPlan>(plans.map((p) => [p.projectId, p]));
  const payments = allPayments.filter((p) => p.currency === currency);
  const paymentsInRange = payments.filter((p) => p.paidOn >= start && p.paidOn <= today);

  const collected = paymentsInRange.reduce((sum, p) => sum + p.amount, 0);
  const additional = paymentsInRange.filter((p) => p.kind === "additional").reduce((sum, p) => sum + p.amount, 0);
  const monthlyRecurring = plans.filter((p) => p.planType === "monthly_fixed").reduce((sum, p) => sum + p.amount, 0);

  const totalPaidByProject = new Map<string, number>();
  for (const payment of payments) {
    if (!payment.projectId) continue;
    totalPaidByProject.set(payment.projectId, (totalPaidByProject.get(payment.projectId) ?? 0) + payment.amount);
  }
  const outstanding = plans
    .filter((p) => p.planType === "one_time")
    .reduce((sum, p) => sum + Math.max(0, p.amount - (totalPaidByProject.get(p.projectId) ?? 0)), 0);

  const totalPaidByInvoice = new Map<string, number>();
  for (const payment of allPayments) {
    if (!payment.invoiceId) continue;
    totalPaidByInvoice.set(payment.invoiceId, (totalPaidByInvoice.get(payment.invoiceId) ?? 0) + payment.amount);
  }
  const invoicesInCurrency = allInvoices.filter((i) => i.currency === currency && i.status !== "cancelled");
  const invoiceOutstanding = invoicesInCurrency.reduce((sum, inv) => {
    const total = invoiceTotal(invoiceItemsByInvoice[inv.id] ?? []);
    const paid = totalPaidByInvoice.get(inv.id) ?? 0;
    return sum + Math.max(0, total - paid);
  }, 0);
  const overdueInvoices = invoicesInCurrency.filter((i) => i.status === "overdue");

  const collectedByType = new Map<string, number>();
  for (const payment of paymentsInRange) {
    const project = payment.projectId ? projectById.get(payment.projectId) : undefined;
    if (!project) continue;
    collectedByType.set(project.type, (collectedByType.get(project.type) ?? 0) + payment.amount);
  }

  const projectRows = projects
    .map((project) => {
      const plan = planByProject.get(project.id);
      if (!plan) return null;
      const projectPayments = paymentsInRange.filter((p) => p.projectId === project.id);
      const collectedInRange = projectPayments.reduce((sum, p) => sum + p.amount, 0);
      const allPaid = totalPaidByProject.get(project.id) ?? 0;
      const remaining = plan.planType === "one_time" ? Math.max(0, plan.amount - allPaid) : null;
      const lastPayment = payments
        .filter((p) => p.projectId === project.id)
        .sort((a, b) => (a.paidOn < b.paidOn ? 1 : -1))[0];
      return { project, plan, collectedInRange, remaining, lastPayment };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-50">Finance</h1>
          <p className="mt-1 text-sm text-neutral-500">Payments collected across every project, at a glance.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {currencies.length > 1 && (
            <div className="flex gap-1.5 rounded-lg border border-base-700/60 bg-base-850 p-1">
              {currencies.map((c) => (
                <Link
                  key={c}
                  href={`/finance?range=${range}&currency=${c}`}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    currency === c ? "bg-accent-500 text-base-950" : "text-neutral-400 hover:text-neutral-200"
                  }`}
                >
                  {c}
                </Link>
              ))}
            </div>
          )}
          <div className="flex gap-1.5 rounded-lg border border-base-700/60 bg-base-850 p-1">
            {(Object.keys(RANGE_LABEL) as RangeKey[]).map((key) => (
              <Link
                key={key}
                href={`/finance?range=${key}&currency=${currency}`}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  range === key ? "bg-accent-500 text-base-950" : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                {RANGE_LABEL[key]}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={`Collected · ${RANGE_LABEL[range]}`} value={formatMoney(collected, currency)} icon={Wallet} tone="accent" />
        <StatCard label="Additional charges" value={formatMoney(additional, currency)} icon={Receipt} tone="sky" />
        <StatCard label="Monthly recurring (current)" value={formatMoney(monthlyRecurring, currency)} icon={TrendingUp} tone="amber" />
        <StatCard label="Outstanding (one-time)" value={formatMoney(outstanding, currency)} icon={AlertCircle} tone="rose" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatCard label="Outstanding (invoices)" value={formatMoney(invoiceOutstanding, currency)} icon={FileWarning} tone="rose" />
        <StatCard label="Overdue invoices" value={String(overdueInvoices.length)} icon={AlertCircle} tone="amber" />
      </div>

      {overdueInvoices.length > 0 && (
        <section className="rounded-xl2 border border-base-700/60 bg-base-850 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">
            Overdue invoices · {currency}
          </h2>
          <div className="flex flex-col gap-2">
            {overdueInvoices.map((invoice) => (
              <Link
                key={invoice.id}
                href={`/invoices/${invoice.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-base-700/50 bg-base-900 px-3 py-2 hover:border-accent-500/40"
              >
                <div>
                  <p className="text-sm font-medium text-neutral-100">{invoice.invoiceNumber}</p>
                  <p className="text-xs text-neutral-500">{invoice.clientName}</p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-neutral-400">Due {invoice.dueDate}</span>
                  <span className={cn("rounded-full px-2 py-0.5 font-medium", INVOICE_STATUS_STYLE[invoice.status])}>
                    {INVOICE_STATUS_LABEL[invoice.status]}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {collectedByType.size > 0 && (
        <section className="rounded-xl2 border border-base-700/60 bg-base-850 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">
            Collected by project type · {RANGE_LABEL[range]} · {currency}
          </h2>
          <div className="flex flex-col gap-2">
            {Array.from(collectedByType.entries()).map(([type, total]) => {
              const theme = PROJECT_THEME[type as Project["type"]];
              return (
                <div key={type} className="flex items-center justify-between rounded-lg border border-base-700/50 bg-base-900 px-3 py-2">
                  <span className={`text-sm font-medium ${theme.iconText}`}>{theme.label}</span>
                  <span className="text-sm text-neutral-200">{formatMoney(total, currency)}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">
          Per-project payments · {currency}
        </h2>
        <div className="flex flex-col gap-2">
          {projectRows.length === 0 && (
            <p className="rounded-lg border border-dashed border-base-700 p-6 text-center text-sm text-neutral-500">
              No {currency} payment plans set yet. Add one from a project&apos;s Client Details tab.
            </p>
          )}
          {projectRows.map(({ project, plan, collectedInRange, remaining, lastPayment }) => {
            const theme = PROJECT_THEME[project.type];
            return (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-base-700/50 bg-base-850/60 px-4 py-3 hover:border-accent-500/40"
              >
                <div>
                  <p className="text-sm font-medium text-neutral-100">{project.name}</p>
                  <p className={`text-xs ${theme.iconText}`}>
                    {theme.label} · {plan.planType === "monthly_fixed" ? "Fixed monthly" : "One-time"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-right text-xs">
                  <div>
                    <p className="text-neutral-500">Plan</p>
                    <p className="text-neutral-200">{formatMoney(plan.amount, plan.currency)}</p>
                  </div>
                  <div>
                    <p className="text-neutral-500">Collected ({RANGE_LABEL[range]})</p>
                    <p className="text-accent-300">{formatMoney(collectedInRange, plan.currency)}</p>
                  </div>
                  {remaining !== null ? (
                    <div>
                      <p className="text-neutral-500">Remaining</p>
                      <p className={remaining > 0 ? "text-amber-400" : "text-accent-300"}>
                        {formatMoney(remaining, plan.currency)}
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-neutral-500">Last payment</p>
                      <p className="text-neutral-200">{lastPayment ? lastPayment.paidOn : "None yet"}</p>
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
