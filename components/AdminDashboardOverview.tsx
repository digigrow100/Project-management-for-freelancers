"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Banknote,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Download,
  FilePenLine,
  FolderKanban,
  Globe2,
  ReceiptText,
  CreditCard,
  Users,
  WalletCards,
} from "lucide-react";
import type { AdminWorkItem, Domain, DomainClient, Invoice, InvoiceItem, Payment, PaymentPlan, Profile, Project, ProjectType, Renewal, Task, TaskTimeEntry, TaskTimeSummary, Website } from "@/lib/types";
import { businessMonthKey } from "@/lib/date";
import { DomainsPanel } from "@/components/DomainsPanel";

type ProgressMap = Record<string, { done: number; total: number; openCount: number; percent?: number }>;

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${currency} ${Math.round(value).toLocaleString("en-GB")}`;
  }
}

function daysUntil(date: string | null) {
  if (!date) return null;
  const today = new Date();
  const target = new Date(`${date}T00:00:00`);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function duration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

function jobRoleLabel(role: Profile["jobRole"]) {
  if (role === "seo_expert") return "SEO Expert";
  if (role === "web_developer") return "Web Developer";
  return "General";
}

function priorityClass(priority: Task["priority"]) {
  if (priority === "high") return "bg-rose-500/15 text-rose-300";
  if (priority === "medium") return "bg-amber-500/15 text-amber-300";
  return "bg-base-700 text-neutral-400";
}

function invoiceStatusClass(status: Invoice["status"]) {
  if (status === "paid") return "bg-emerald-500/15 text-emerald-300";
  if (status === "overdue") return "bg-rose-500/15 text-rose-300";
  if (status === "partially_paid") return "bg-amber-500/15 text-amber-300";
  if (status === "sent") return "bg-sky-500/15 text-sky-300";
  return "bg-base-700 text-neutral-400";
}


const PROJECT_TABS: Array<{ key: ProjectType; label: string }> = [
  { key: "seo", label: "SEO" },
  { key: "web_dev", label: "Web Development" },
  { key: "web_app", label: "Web Apps" },
  { key: "digital_marketing", label: "Digital Marketing" },
  { key: "other", label: "Other" },
];

function formatProjectDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function projectAgeDays(value: string) {
  const created = new Date(value);
  if (Number.isNaN(created.getTime())) return 0;
  const diff = Date.now() - created.getTime();
  return Math.max(0, Math.floor(diff / 86400000));
}


function businessDayKey(value: string | number | Date) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function timeLabel(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function liveEntrySeconds(entry: TaskTimeEntry, nowMs: number) {
  if (entry.endedAt) return Math.max(0, entry.durationSeconds ?? 0);
  return Math.max(0, Math.floor((nowMs - new Date(entry.startedAt).getTime()) / 1000));
}

export function AdminDashboardOverview({
  projects,
  progressMap,
  openTasks,
  completedTasks,
  members,
  timeSummaries,
  timeEntries,
  memberProjectIds,
  invoices,
  invoiceItems,
  payments,
  paymentPlans,
  domains,
  domainClients,
  renewals,
  personalTasks,
  assigneesByProject,
  websitesByDomainId,
  hasDynadotApiKey,
}: {
  projects: Project[];
  progressMap: ProgressMap;
  openTasks: Task[];
  completedTasks: Task[];
  members: Profile[];
  timeSummaries: TaskTimeSummary[];
  timeEntries: TaskTimeEntry[];
  memberProjectIds: Record<string, string[]>;
  invoices: Invoice[];
  invoiceItems: Record<string, InvoiceItem[]>;
  payments: Payment[];
  paymentPlans: PaymentPlan[];
  domains: Domain[];
  domainClients: DomainClient[];
  renewals: Renewal[];
  personalTasks: AdminWorkItem[];
  assigneesByProject: Record<string, string[]>;
  websitesByDomainId: Record<string, Website>;
  hasDynadotApiKey: boolean;
}) {
  const [dashboardTab, setDashboardTab] = useState<"overview" | "reports" | "accounts" | "domains">("overview");
  const activeProjects = projects.filter((project) => !project.archived);
  const availableProjectTypes = PROJECT_TABS.filter((tab) =>
    activeProjects.some((project) => project.type === tab.key),
  );
  const [activeProjectType, setActiveProjectType] = useState<ProjectType>(
    availableProjectTypes[0]?.key ?? "seo",
  );
  const visibleProjects = useMemo(
    () => activeProjects.filter((project) => project.type === activeProjectType),
    [activeProjects, activeProjectType],
  );
  const currentMonth = businessMonthKey();
  const invoicesByProject = new Map<string, Invoice[]>();
  for (const invoice of invoices) {
    if (!invoice.projectId) continue;
    if (invoice.billingPeriod !== currentMonth && !invoice.issueDate.startsWith(currentMonth)) continue;
    const list = invoicesByProject.get(invoice.projectId) ?? [];
    list.push(invoice);
    invoicesByProject.set(invoice.projectId, list);
  }
  for (const list of invoicesByProject.values()) {
    list.sort((a, b) => a.currency.localeCompare(b.currency));
  }

  const currentMonthPayments = payments.filter((payment) => payment.paidOn.startsWith(currentMonth));

  const paidByProject = new Map<string, Map<string, number>>();
  for (const payment of currentMonthPayments) {
    if (!payment.projectId) continue;
    const byCurrency = paidByProject.get(payment.projectId) ?? new Map<string, number>();
    byCurrency.set(payment.currency, (byCurrency.get(payment.currency) ?? 0) + payment.amount);
    paidByProject.set(payment.projectId, byCurrency);
  }

  const paidByInvoice = new Map<string, number>();
  for (const payment of payments) {
    if (payment.invoiceId) paidByInvoice.set(payment.invoiceId, (paidByInvoice.get(payment.invoiceId) ?? 0) + payment.amount);
  }

  const invoiceTotal = (invoice: Invoice) =>
    (invoiceItems[invoice.id] ?? []).reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  const primaryCurrency =
    currentMonthPayments.find((payment) => payment.currency)?.currency ??
    invoices.find((invoice) => invoice.currency)?.currency ??
    payments[0]?.currency ??
    "PKR";
  const totalReceived = currentMonthPayments
    .filter((payment) => payment.currency === primaryCurrency)
    .reduce((sum, payment) => sum + payment.amount, 0);
  const outstanding = invoices
    .filter((invoice) => invoice.currency === primaryCurrency && invoice.status !== "paid" && invoice.status !== "cancelled")
    .reduce((sum, invoice) => sum + Math.max(0, invoiceTotal(invoice) - (paidByInvoice.get(invoice.id) ?? 0)), 0);
  const openInvoices = invoices.filter((invoice) => !["paid", "cancelled"].includes(invoice.status)).length;

  const taskCountByMember = new Map<string, number>();
  for (const task of openTasks) {
    if (task.assignedTo) taskCountByMember.set(task.assignedTo, (taskCountByMember.get(task.assignedTo) ?? 0) + 1);
  }
  const timeByMember = new Map<string, number>();
  for (const row of timeSummaries) timeByMember.set(row.userId, (timeByMember.get(row.userId) ?? 0) + row.totalSeconds);
  const maxTaskCount = Math.max(1, ...Array.from(taskCountByMember.values()));

  const nowMs = Date.now();
  const todayKey = businessDayKey(nowMs);
  const memberPerformance = members
    .filter((member) => member.role !== "admin")
    .map((member) => {
      const assignedProjectIds = memberProjectIds[member.id] ?? [];
      const assignedProjects = activeProjects.filter((project) => assignedProjectIds.includes(project.id));
      const projectProgress = assignedProjects.map((project) => {
        const progress = progressMap[project.id] ?? { done: 0, total: 0, openCount: 0, percent: 0 };
        return {
          project,
          percent: progress.percent ?? (progress.total ? Math.round((progress.done / progress.total) * 100) : 0),
        };
      });
      const overallPercent =
        projectProgress.length > 0
          ? Math.round(projectProgress.reduce((sum, item) => sum + item.percent, 0) / projectProgress.length)
          : 0;

      const entries = timeEntries.filter((entry) => entry.userId === member.id);
      const todayEntries = entries.filter((entry) => businessDayKey(entry.startedAt) === todayKey);
      const allTimeSeconds = entries.reduce((sum, entry) => sum + liveEntrySeconds(entry, nowMs), 0);
      const todaySeconds = todayEntries.reduce((sum, entry) => sum + liveEntrySeconds(entry, nowMs), 0);

      const firstStartedAt =
        todayEntries.length > 0
          ? [...todayEntries].sort((a, b) => a.startedAt.localeCompare(b.startedAt))[0]?.startedAt ?? null
          : null;
      const latestActivityAt =
        todayEntries.length > 0
          ? todayEntries
              .map((entry) => entry.endedAt ?? entry.startedAt)
              .sort((a, b) => b.localeCompare(a))[0] ?? null
          : null;

      const activeEntry = todayEntries.find((entry) => !entry.endedAt);
      const spanEndMs = activeEntry
        ? nowMs
        : latestActivityAt
          ? new Date(latestActivityAt).getTime()
          : 0;
      const firstStartMs = firstStartedAt ? new Date(firstStartedAt).getTime() : 0;
      const idleSeconds =
        firstStartMs > 0 && spanEndMs >= firstStartMs
          ? Math.max(0, Math.floor((spanEndMs - firstStartMs) / 1000) - todaySeconds)
          : 0;

      const todayByProject = new Map<string, number>();
      const allTimeByProject = new Map<string, number>();
      for (const entry of entries) {
        const seconds = liveEntrySeconds(entry, nowMs);
        allTimeByProject.set(entry.projectId, (allTimeByProject.get(entry.projectId) ?? 0) + seconds);
        if (businessDayKey(entry.startedAt) === todayKey) {
          todayByProject.set(entry.projectId, (todayByProject.get(entry.projectId) ?? 0) + seconds);
        }
      }

      return {
        member,
        projectProgress,
        overallPercent,
        allTimeSeconds,
        todaySeconds,
        firstStartedAt,
        latestActivityAt,
        idleSeconds,
        isActive: entries.some((entry) => !entry.endedAt),
        todayByProject,
        allTimeByProject,
      };
    });

  const domainClientById = new Map(domainClients.map((client) => [client.id, client]));
  const expiringDomains = domains
    .map((domain) => ({ domain, days: daysUntil(domain.expiryDate) }))
    .filter((entry) => entry.days !== null && entry.days >= 0 && entry.days <= 90)
    .sort((a, b) => (a.days ?? 999) - (b.days ?? 999))
    .slice(0, 7);

  const financeReminders = [
    ...invoices
      .filter((invoice) => !["paid", "cancelled"].includes(invoice.status))
      .map((invoice) => ({
        id: `invoice-${invoice.id}`,
        type: "Invoice",
        label: invoice.projectName || invoice.clientName || invoice.invoiceNumber,
        amount: invoiceTotal(invoice) - (paidByInvoice.get(invoice.id) ?? 0),
        currency: invoice.currency,
        dueDate: invoice.dueDate,
        status: invoice.status === "overdue" ? "Overdue" : "Pending",
        href: `/invoices/${invoice.id}`,
      })),
    ...renewals
      .filter((renewal) => renewal.status === "pending")
      .map((renewal) => ({
        id: `renewal-${renewal.id}`,
        type: renewal.serviceTypes.includes("domain") ? "Domain Renewal" : "Renewal",
        label: renewal.clientName || renewal.itemName,
        amount: Math.max(0, (renewal.amountCharged ?? 0) - (renewal.amountPaid ?? 0)),
        currency: renewal.currency,
        dueDate: renewal.dueDate ?? "",
        status: "Upcoming",
        href: "/domains",
      })),
  ]
    .sort((a, b) => (a.dueDate || "9999-12-31").localeCompare(b.dueDate || "9999-12-31"))
    .slice(0, 7);

  const recentDone = completedTasks.slice(0, 6);

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Banknote} label="Total Received" value={money(totalReceived, primaryCurrency)} sub="Current month payments" />
        <StatCard icon={ReceiptText} label="Outstanding Invoices" value={money(outstanding, primaryCurrency)} sub={`${openInvoices} invoices open`} warning />
        <StatCard icon={Users} label="Active Clients" value={String(new Set(activeProjects.map((project) => project.clientId).filter(Boolean)).size)} sub={`${activeProjects.length} active projects`} />
        <StatCard icon={WalletCards} label="Open Tasks" value={String(openTasks.length)} sub="Across all active projects" />
      </section>

      <nav className="grid grid-cols-4 overflow-hidden rounded-xl border border-base-700/70 bg-base-850">
        {([
          ["overview", "Overview"],
          ["reports", "Reports"],
          ["accounts", "Accounts"],
          ["domains", "Domain / Hosting"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setDashboardTab(key)}
            className={`flex items-center justify-center border-r border-base-700/50 px-2 py-3 text-xs font-medium transition-colors last:border-r-0 ${
              dashboardTab === key
                ? "bg-accent-500/10 text-accent-300 shadow-[inset_0_-2px_0_rgba(52,211,153,.9)]"
                : "text-neutral-400 hover:bg-base-800 hover:text-neutral-200"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className={dashboardTab === "overview" ? "space-y-4" : "hidden"}>
          <section className="overflow-hidden rounded-xl2 border border-base-700/60 bg-base-850 shadow-card">
            <SectionHead
              icon={FolderKanban}
              title="Active Projects"
              subtitle="Progress, assignment, payments and project age"
              href="/projects"
              action="View all projects"
            />

            {activeProjects.length > 0 ? (
              <>
                <div className="border-b border-base-700/50 px-4 py-3">
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {availableProjectTypes.map((tab) => {
                      const count = activeProjects.filter((project) => project.type === tab.key).length;
                      return (
                        <button
                          key={tab.key}
                          type="button"
                          onClick={() => setActiveProjectType(tab.key)}
                          className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                            activeProjectType === tab.key
                              ? "border-accent-500/40 bg-accent-500/10 text-accent-300"
                              : "border-base-700 bg-base-900/50 text-neutral-500 hover:border-base-600 hover:text-neutral-300"
                          }`}
                        >
                          {tab.label}
                          <span className="ml-2 rounded-full bg-base-950/70 px-1.5 py-0.5 text-[9px] text-neutral-500">
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="overflow-x-auto p-4">
                  <div className="grid auto-cols-[minmax(290px,340px)] grid-flow-col gap-3">
                    {visibleProjects.map((project) => {
                      const progress = progressMap[project.id] ?? { done: 0, total: 0, openCount: 0 };
                      const percent = progress.percent ?? (progress.total ? Math.round((progress.done / progress.total) * 100) : 0);
                      const remainingTasks = Math.max(0, progress.total - progress.done);
                      const assignees = assigneesByProject[project.id] ?? [];
                      const projectInvoices = invoicesByProject.get(project.id) ?? [];
                      const invoice = projectInvoices[0];
                      const projectPlans = paymentPlans.filter((plan) => plan.projectId === project.id);
                      const projectPaymentsAll = payments.filter((payment) => payment.projectId === project.id);
                      const ageDays = projectAgeDays(project.createdAt);

                      const paymentRows = projectPlans.map((plan) => {
                        const relevantPayments =
                          plan.planType === "monthly_fixed"
                            ? projectPaymentsAll.filter(
                                (payment) =>
                                  payment.currency === plan.currency &&
                                  payment.kind !== "additional" &&
                                  (payment.period === currentMonth || payment.paidOn.startsWith(currentMonth)),
                              )
                            : projectPaymentsAll.filter(
                                (payment) => payment.currency === plan.currency && payment.kind !== "additional",
                              );
                        const paid = relevantPayments.reduce((sum, payment) => sum + payment.amount, 0);
                        return {
                          currency: plan.currency,
                          paid,
                          due: Math.max(0, plan.amount - paid),
                          label: plan.planType === "monthly_fixed" ? "This month" : "Project",
                        };
                      });

                      if (paymentRows.length === 0 && invoice) {
                        const invoiceAmount = invoiceTotal(invoice);
                        const invoicePaid = paidByInvoice.get(invoice.id) ?? 0;
                        paymentRows.push({
                          currency: invoice.currency,
                          paid: invoicePaid,
                          due: Math.max(0, invoiceAmount - invoicePaid),
                          label: "Invoice",
                        });
                      }

                      return (
                        <article
                          key={project.id}
                          className="flex min-h-[285px] flex-col rounded-xl border border-base-700/60 bg-base-900/55 p-4 transition-colors hover:border-accent-500/35"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <Link
                                href={`/projects/${project.id}`}
                                className="block truncate text-base font-semibold text-neutral-100 hover:text-accent-300"
                              >
                                {project.name}
                              </Link>
                              <p className="mt-1 truncate text-xs text-neutral-600">
                                {project.client || project.clientDetails.company || project.clientDetails.name || "No client"}
                              </p>
                            </div>
                            <span className="shrink-0 rounded-full bg-base-800 px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-neutral-500">
                              {PROJECT_TABS.find((tab) => tab.key === project.type)?.label ?? "Project"}
                            </span>
                          </div>

                          <div className="mt-4 rounded-lg border border-base-700/50 bg-base-950/45 p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-[10px] uppercase tracking-wide text-neutral-600">Assigned to</p>
                                <p className="mt-1 text-xs font-medium text-neutral-300">
                                  {assignees.length > 0 ? assignees.join(", ") : "Unassigned"}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-2xl font-semibold text-accent-300">{percent}%</p>
                                <p className="text-[9px] text-neutral-600">complete</p>
                              </div>
                            </div>

                            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-base-700">
                              <div
                                className="h-full rounded-full bg-emerald-400"
                                style={{ width: `${Math.min(100, percent)}%` }}
                              />
                            </div>
                            <div className="mt-2 flex items-center justify-between text-[10px] text-neutral-600">
                              <span>{progress.done} done</span>
                              <span>{remainingTasks} remaining</span>
                              <span>{progress.total} total</span>
                            </div>
                          </div>

                          <div className="mt-3">
                            <p className="text-[10px] uppercase tracking-wide text-neutral-600">Payment</p>
                            {paymentRows.length > 0 ? (
                              <div className="mt-2 space-y-2">
                                {paymentRows.slice(0, 2).map((row) => (
                                  <div
                                    key={`${project.id}-${row.currency}`}
                                    className="flex items-center justify-between rounded-lg border border-base-700/40 bg-base-950/35 px-3 py-2"
                                  >
                                    <div>
                                      <p className="text-[10px] text-neutral-600">{row.label} · {row.currency}</p>
                                      <p className="mt-0.5 text-xs font-semibold text-emerald-300">
                                        Paid {money(row.paid, row.currency)}
                                      </p>
                                    </div>
                                    <div className="text-right">
                                      <p className="text-[10px] text-neutral-600">Due</p>
                                      <p className={`mt-0.5 text-xs font-semibold ${row.due > 0 ? "text-amber-300" : "text-emerald-300"}`}>
                                        {row.due > 0 ? money(row.due, row.currency) : "Paid"}
                                      </p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="mt-2 text-xs text-neutral-600">No payment plan or invoice yet</p>
                            )}
                          </div>

                          <div className="mt-3 border-t border-base-700/40 pt-3">
                            {projectInvoices.length > 0 ? (
                              <div className="space-y-2">
                                <p className="text-[9px] uppercase tracking-wide text-neutral-700">This month invoices</p>
                                {projectInvoices.map((currentInvoice) => (
                                  <div key={currentInvoice.id} className="rounded-lg border border-base-700/50 bg-base-950/35 p-2.5">
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="min-w-0">
                                        <p className="truncate text-[11px] font-medium text-neutral-300">
                                          {currentInvoice.invoiceNumber} · {currentInvoice.currency}
                                        </p>
                                        <p className="mt-0.5 text-[9px] text-neutral-700">
                                          Due {formatProjectDate(currentInvoice.dueDate)}
                                        </p>
                                      </div>
                                      <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-semibold capitalize ${invoiceStatusClass(currentInvoice.status)}`}>
                                        {currentInvoice.status.replaceAll("_", " ")}
                                      </span>
                                    </div>

                                    <div className="mt-2 grid grid-cols-3 gap-1.5">
                                      <Link
                                        href={`/invoices/${currentInvoice.id}?download=1`}
                                        className="inline-flex items-center justify-center gap-1 rounded-md border border-base-600 bg-base-900/60 px-2 py-2 text-[10px] font-medium text-neutral-300 hover:border-accent-500/50 hover:text-accent-300"
                                        title="Download invoice PDF"
                                      >
                                        <Download size={12} />
                                        Download
                                      </Link>
                                      <Link
                                        href={`/invoices/${currentInvoice.id}`}
                                        className="inline-flex items-center justify-center gap-1 rounded-md border border-base-600 bg-base-900/60 px-2 py-2 text-[10px] font-medium text-neutral-300 hover:border-sky-500/50 hover:text-sky-300"
                                        title="Edit invoice and add extra items"
                                      >
                                        <FilePenLine size={12} />
                                        Edit
                                      </Link>
                                      <Link
                                        href={`/invoices/${currentInvoice.id}#payments`}
                                        className="inline-flex items-center justify-center gap-1 rounded-md border border-base-600 bg-base-900/60 px-2 py-2 text-[10px] font-medium text-neutral-300 hover:border-amber-500/50 hover:text-amber-300"
                                        title="Manage invoice payments"
                                      >
                                        <CreditCard size={12} />
                                        Payment
                                      </Link>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="rounded-lg border border-dashed border-base-700 bg-base-950/25 px-3 py-2.5">
                                <p className="text-[10px] font-medium text-neutral-400">Invoice is generated automatically</p>
                                <p className="mt-0.5 text-[9px] text-neutral-700">
                                  {project.clientId || project.clientDetails.name || project.clientDetails.company
                                    ? "Current month invoice is being prepared from the monthly billing plan."
                                    : "Add/link client details so the automatic invoice can be issued."}
                                </p>
                              </div>
                            )}
                          </div>

                          <div className="mt-3 flex items-end justify-between gap-3 border-t border-base-700/40 pt-3">
                            <div>
                              <p className="text-[9px] uppercase tracking-wide text-neutral-700">Added</p>
                              <p className="mt-1 text-[11px] text-neutral-400">{formatProjectDate(project.createdAt)}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-[9px] uppercase tracking-wide text-neutral-700">Project age</p>
                              <p className="mt-1 text-[11px] font-medium text-neutral-300">
                                {ageDays === 0 ? "Added today" : `${ageDays} day${ageDays === 1 ? "" : "s"}`}
                              </p>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              <Empty text="No active projects." />
            )}
          </section>

        <section className="overflow-hidden rounded-xl2 border border-base-700/60 bg-base-850 shadow-card">
          <SectionHead icon={Activity} title="Team Performance" subtitle="Daily activity, time and assigned-project progress" />
          <div className="grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-3">
            {memberPerformance.map((row) => (
              <section key={row.member.id} className="rounded-xl border border-base-700/60 bg-base-900/55 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${row.isActive ? "animate-pulse bg-emerald-400" : "bg-neutral-600"}`} />
                      <p className="truncate text-sm font-semibold text-neutral-100">{row.member.name || row.member.email}</p>
                    </div>
                    <p className="mt-1 text-[10px] text-neutral-600">{jobRoleLabel(row.member.jobRole)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-semibold text-accent-300">{row.overallPercent}%</p>
                    <p className="text-[9px] uppercase tracking-wide text-neutral-600">overall</p>
                  </div>
                </div>

                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-base-700">
                  <div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.min(100, row.overallPercent)}%` }} />
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-base-700/40 bg-base-950/40 p-2">
                    <p className="text-[9px] uppercase tracking-wide text-neutral-600">Today</p>
                    <p className="mt-1 text-xs font-semibold text-neutral-200">{duration(row.todaySeconds)}</p>
                  </div>
                  <div className="rounded-lg border border-base-700/40 bg-base-950/40 p-2">
                    <p className="text-[9px] uppercase tracking-wide text-neutral-600">All time</p>
                    <p className="mt-1 text-xs font-semibold text-neutral-200">{duration(row.allTimeSeconds)}</p>
                  </div>
                  <div className="rounded-lg border border-base-700/40 bg-base-950/40 p-2">
                    <p className="text-[9px] uppercase tracking-wide text-neutral-600">Started today</p>
                    <p className="mt-1 text-xs font-medium text-neutral-300">{timeLabel(row.firstStartedAt)}</p>
                  </div>
                  <div className="rounded-lg border border-base-700/40 bg-base-950/40 p-2">
                    <p className="text-[9px] uppercase tracking-wide text-neutral-600">Last activity</p>
                    <p className="mt-1 text-xs font-medium text-neutral-300">{timeLabel(row.latestActivityAt)}</p>
                  </div>
                </div>

                <div className="mt-2 flex items-center justify-between rounded-lg border border-amber-500/15 bg-amber-500/5 px-2.5 py-2">
                  <span className="text-[10px] text-neutral-500">Idle / paused today</span>
                  <span className="text-[11px] font-semibold text-amber-300">{duration(row.idleSeconds)}</span>
                </div>

                <div className="mt-3 border-t border-base-700/40 pt-3">
                  <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-neutral-600">Assigned projects</p>
                  <div className="space-y-2.5">
                    {row.projectProgress.map(({ project, percent }) => (
                      <div key={project.id}>
                        <div className="flex items-center justify-between gap-2">
                          <Link href={`/projects/${project.id}`} className="min-w-0 truncate text-[11px] font-medium text-neutral-300 hover:text-accent-300">
                            {project.name}
                          </Link>
                          <span className="shrink-0 text-[10px] font-semibold text-neutral-400">{percent}%</span>
                        </div>
                        <div className="mt-1 h-1 overflow-hidden rounded-full bg-base-700">
                          <div className="h-full rounded-full bg-sky-400" style={{ width: `${Math.min(100, percent)}%` }} />
                        </div>
                        <div className="mt-1 flex justify-between text-[9px] text-neutral-700">
                          <span>Today {duration(row.todayByProject.get(project.id) ?? 0)}</span>
                          <span>Total {duration(row.allTimeByProject.get(project.id) ?? 0)}</span>
                        </div>
                      </div>
                    ))}
                    {row.projectProgress.length === 0 && (
                      <p className="text-[10px] text-neutral-600">No active project assigned.</p>
                    )}
                  </div>
                </div>
              </section>
            ))}
            {memberPerformance.length === 0 && <Empty text="No team members." />}
          </div>
        </section>

          <div className="grid gap-4 lg:grid-cols-3">
            <section className="rounded-xl2 border border-base-700/60 bg-base-850 shadow-card">
              <SectionHead title="Task Queue" subtitle="Important work needing attention" href="/" action="View all tasks" />
              <div className="divide-y divide-base-700/50">
                {openTasks.slice(0, 6).map((task) => (
                  <div key={task.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-neutral-600" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-neutral-200">{task.title}</p>
                      <p className="mt-0.5 truncate text-[10px] text-neutral-600">{projects.find((project) => project.id === task.projectId)?.name ?? "Project"}</p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold capitalize ${priorityClass(task.priority)}`}>{task.priority}</span>
                    <span className="whitespace-nowrap text-[10px] text-neutral-500">{task.dueDate || "No date"}</span>
                  </div>
                ))}
                {openTasks.length === 0 && <Empty text="No open tasks." />}
              </div>
            </section>

            <section className="rounded-xl2 border border-base-700/60 bg-base-850 shadow-card">
              <SectionHead icon={Users} title="Team Workload" subtitle="Tasks and tracked work time" href="/admin/time-tracking" action="View time" />
              <div className="divide-y divide-base-700/50">
                {members.filter((member) => member.role !== "admin").slice(0, 6).map((member) => {
                  const tasks = taskCountByMember.get(member.id) ?? 0;
                  const pct = Math.round((tasks / maxTaskCount) * 100);
                  return (
                    <div key={member.id} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-neutral-200">{member.name || member.email}</p>
                          <p className="mt-0.5 text-[10px] text-neutral-600">{jobRoleLabel(member.jobRole)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[11px] text-neutral-300">{tasks} tasks</p>
                          <p className="text-[10px] text-neutral-600">{duration(timeByMember.get(member.id) ?? 0)} tracked</p>
                        </div>
                      </div>
                      <div className="mt-2 h-1.5 rounded-full bg-base-700">
                        <div className="h-1.5 rounded-full bg-emerald-400" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-xl2 border border-base-700/60 bg-base-850 shadow-card">
              <SectionHead icon={CheckCircle2} title="My Tasks" subtitle="Personal work, team requests, invoices and renewals" href="/admin/my-tasks" action="Open My Tasks" />
              <div className="divide-y divide-base-700/50">
                {personalTasks.slice(0, 7).map((task) => (
                  <Link key={task.id} href="/admin/my-tasks" className="flex items-center gap-3 px-4 py-3 hover:bg-base-800/50">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                      task.source === "team_request"
                        ? "bg-rose-400"
                        : task.source === "invoice_reminder"
                          ? "bg-sky-400"
                          : task.source === "domain_expiry"
                            ? "bg-amber-400"
                            : task.priority === "high"
                            ? "bg-amber-400"
                            : "bg-neutral-600"
                    }`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="truncate text-xs text-neutral-200">{task.title}</p>
                        {task.source === "team_request" && (
                          <span className="shrink-0 rounded-full bg-rose-500/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase text-rose-300">
                            Team
                          </span>
                        )}
                        {task.source === "invoice_reminder" && (
                          <span className="shrink-0 rounded-full bg-sky-500/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase text-sky-300">
                            Invoice
                          </span>
                        )}
                        {task.source === "domain_expiry" && (
                          <span className="shrink-0 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase text-amber-300">
                            Domain
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-[10px] text-neutral-600">
                        {task.source === "team_request"
                          ? `High Priority · ${task.sentByName ?? "Team member"}`
                          : task.source === "invoice_reminder"
                            ? `Billing reminder · ${task.dueDate ?? "this month"}`
                            : task.source === "domain_expiry"
                              ? `High Priority · Expires ${task.dueDate ?? "soon"}`
                              : task.dueDate || "No due date"}
                      </p>
                    </div>
                  </Link>
                ))}
                {personalTasks.length === 0 && <Empty text="No admin tasks waiting." />}
              </div>
            </section>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl2 border border-base-700/60 bg-base-850 shadow-card">
              <SectionHead icon={Globe2} title="Domains Expiring Soon" subtitle="Renewal deadlines with client names" href="/domains" action="View domains" />
              <div className="divide-y divide-base-700/50">
                {expiringDomains.map(({ domain, days }) => (
                  <div key={domain.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,.8fr)_auto] items-center gap-3 px-4 py-3 text-xs">
                    <Link href={`/domains/${domain.id}`} className="truncate font-medium text-neutral-200 hover:text-accent-300">{domain.name}</Link>
                    <span className="truncate text-neutral-500">{domain.domainClientId ? domainClientById.get(domain.domainClientId)?.name ?? "Client" : "No client"}</span>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${(days ?? 99) <= 14 ? "bg-rose-500/15 text-rose-300" : (days ?? 99) <= 30 ? "bg-amber-500/15 text-amber-300" : "bg-emerald-500/15 text-emerald-300"}`}>
                      {days === 0 ? "Today" : `${days} days`}
                    </span>
                  </div>
                ))}
                {expiringDomains.length === 0 && <Empty text="No domains expiring in the next 90 days." />}
              </div>
            </section>

            <section className="rounded-xl2 border border-base-700/60 bg-base-850 shadow-card">
              <SectionHead icon={CalendarClock} title="Finance Reminders" subtitle="Upcoming invoices and renewals" href="/invoices" action="View finance" />
              <div className="divide-y divide-base-700/50">
                {financeReminders.map((item) => (
                  <Link key={item.id} href={item.href} className="grid grid-cols-[90px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 hover:bg-base-800/40">
                    <span className="text-[10px] uppercase tracking-wide text-neutral-600">{item.type}</span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-neutral-200">{item.label}</p>
                      <p className="mt-0.5 text-[10px] text-neutral-600">Due {item.dueDate || "not set"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold text-neutral-200">{money(item.amount, item.currency)}</p>
                      <p className={`mt-0.5 text-[10px] ${item.status === "Overdue" ? "text-rose-300" : "text-amber-300"}`}>{item.status}</p>
                    </div>
                  </Link>
                ))}
                {financeReminders.length === 0 && <Empty text="No finance reminders." />}
              </div>
            </section>
          </div>

      </div>

      {dashboardTab === "reports" && (
        <section className="rounded-xl2 border border-base-700/60 bg-base-850 shadow-card">
          <SectionHead icon={ReceiptText} title="Reports" subtitle="Project reporting shortcuts in one place" />
          <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
            {activeProjects.filter((project) => project.type === "seo").map((project) => {
              const progress = progressMap[project.id] ?? { done: 0, total: 0, openCount: 0, percent: 0 };
              const percent = progress.percent ?? (progress.total ? Math.round((progress.done / progress.total) * 100) : 0);
              return (
                <div key={project.id} className="rounded-xl border border-base-700/60 bg-base-900/55 p-4">
                  <p className="truncate text-sm font-semibold text-neutral-100">{project.name}</p>
                  <p className="mt-1 text-xs text-neutral-600">{percent}% project progress</p>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-base-700">
                    <div className="h-full rounded-full bg-violet-400" style={{ width: `${Math.min(100, percent)}%` }} />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <Link href={`/projects/${project.id}?seoTab=reporting`} className="rounded-lg bg-accent-500 px-3 py-2 text-center text-xs font-semibold text-base-950 hover:bg-accent-400">
                      Reporting
                    </Link>
                    <Link href={`/projects/${project.id}?seoTab=pages`} className="rounded-lg border border-base-600 bg-base-950/40 px-3 py-2 text-center text-xs font-medium text-neutral-300 hover:text-sky-300">
                      Website Pages
                    </Link>
                  </div>
                </div>
              );
            })}
            {activeProjects.filter((project) => project.type === "seo").length === 0 && <Empty text="No active SEO projects." />}
          </div>
        </section>
      )}

      {dashboardTab === "accounts" && (
        <div className="space-y-4">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard icon={Banknote} label="Received this month" value={money(totalReceived, primaryCurrency)} sub="Current month payments" />
            <StatCard icon={ReceiptText} label="Outstanding" value={money(outstanding, primaryCurrency)} sub={`${openInvoices} invoices open`} warning />
            <StatCard icon={WalletCards} label="Invoices" value={String(invoices.length)} sub="All invoice records" />
            <StatCard icon={CreditCard} label="Payments" value={String(payments.length)} sub="Recorded payment entries" />
          </section>

          <section className="rounded-xl2 border border-base-700/60 bg-base-850 shadow-card">
            <SectionHead icon={ReceiptText} title="Invoices & Accounts" subtitle="Download invoices, edit billing and manage payments" href="/invoices" action="Open full invoices" />
            <div className="divide-y divide-base-700/50">
              {invoices.slice(0, 12).map((invoice) => {
                const total = invoiceTotal(invoice);
                const paid = paidByInvoice.get(invoice.id) ?? 0;
                const due = Math.max(0, total - paid);
                return (
                  <div key={invoice.id} className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center">
                    <div className="min-w-0">
                      <Link href={`/invoices/${invoice.id}`} className="truncate text-sm font-semibold text-neutral-100 hover:text-accent-300">
                        {invoice.invoiceNumber} · {invoice.projectName || invoice.clientName}
                      </Link>
                      <p className="mt-1 text-[10px] text-neutral-600">Due {invoice.dueDate} · {invoice.currency}</p>
                    </div>
                    <div className="text-xs">
                      <p className="text-emerald-300">Paid {money(paid, invoice.currency)}</p>
                      <p className={due > 0 ? "mt-1 text-amber-300" : "mt-1 text-neutral-600"}>{due > 0 ? `Due ${money(due, invoice.currency)}` : "Fully paid"}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5 md:justify-end">
                      <Link href={`/invoices/${invoice.id}?download=1`} className="inline-flex items-center gap-1 rounded-md border border-base-600 px-2.5 py-1.5 text-[10px] text-neutral-300 hover:text-accent-300"><Download size={11}/> Download</Link>
                      <Link href={`/invoices/${invoice.id}`} className="inline-flex items-center gap-1 rounded-md border border-base-600 px-2.5 py-1.5 text-[10px] text-neutral-300 hover:text-sky-300"><FilePenLine size={11}/> Edit</Link>
                      <Link href={`/invoices/${invoice.id}#payments`} className="inline-flex items-center gap-1 rounded-md border border-base-600 px-2.5 py-1.5 text-[10px] text-neutral-300 hover:text-amber-300"><CreditCard size={11}/> Payment</Link>
                    </div>
                  </div>
                );
              })}
              {invoices.length === 0 && <Empty text="No invoices yet." />}
            </div>
          </section>
        </div>
      )}

      {dashboardTab === "domains" && (
        <section className="rounded-xl2 border border-base-700/60 bg-base-850 p-4 shadow-card">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-neutral-100">Domain / Hosting</h2>
            <p className="mt-1 text-xs text-neutral-500">
              Domains, renewals and client ownership. This workspace can expand into HouseMySite hosting accounts and server operations.
            </p>
          </div>
          <DomainsPanel
            renewals={renewals}
            domainClients={domainClients}
            domains={domains}
            websitesByDomainId={websitesByDomainId}
            hasDynadotApiKey={hasDynadotApiKey}
            isAdmin
          />
        </section>
      )}

    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  warning = false,
}: {
  icon: typeof Banknote;
  label: string;
  value: string;
  sub: string;
  warning?: boolean;
}) {
  return (
    <div className="rounded-xl2 border border-base-700/60 bg-base-850 p-4 shadow-card">
      <div className="flex items-start gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${warning ? "bg-amber-500/10 text-amber-300" : "bg-accent-500/10 text-accent-300"}`}>
          <Icon size={18} />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] text-neutral-500">{label}</p>
          <p className="mt-1 truncate text-2xl font-semibold text-neutral-50">{value}</p>
          <p className="mt-1 text-[10px] text-neutral-600">{sub}</p>
        </div>
      </div>
    </div>
  );
}

function SectionHead({
  icon: Icon,
  title,
  subtitle,
  href,
  action,
}: {
  icon?: typeof Clock3;
  title: string;
  subtitle: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-base-700/50 px-4 py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        {Icon && <Icon size={16} className="shrink-0 text-accent-300" />}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-neutral-100">{title}</h2>
          <p className="mt-0.5 truncate text-[10px] text-neutral-600">{subtitle}</p>
        </div>
      </div>
      {href && action && (
        <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-[10px] text-neutral-500 hover:text-accent-300">
          {action} <ArrowRight size={11} />
        </Link>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-4 py-6 text-center text-xs text-neutral-600">{text}</p>;
}
