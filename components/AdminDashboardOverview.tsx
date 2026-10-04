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
  FolderKanban,
  Globe2,
  ReceiptText,
  Users,
  WalletCards,
} from "lucide-react";
import type { AdminWorkItem, Domain, DomainClient, Invoice, InvoiceItem, Payment, PaymentPlan, Profile, Project, ProjectType, Renewal, Task, TaskTimeSummary } from "@/lib/types";
import { businessMonthKey } from "@/lib/date";

type ProgressMap = Record<string, { done: number; total: number; openCount: number }>;

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

export function AdminDashboardOverview({
  projects,
  progressMap,
  openTasks,
  completedTasks,
  members,
  timeSummaries,
  invoices,
  invoiceItems,
  payments,
  paymentPlans,
  domains,
  domainClients,
  renewals,
  personalTasks,
  assigneesByProject,
}: {
  projects: Project[];
  progressMap: ProgressMap;
  openTasks: Task[];
  completedTasks: Task[];
  members: Profile[];
  timeSummaries: TaskTimeSummary[];
  invoices: Invoice[];
  invoiceItems: Record<string, InvoiceItem[]>;
  payments: Payment[];
  paymentPlans: PaymentPlan[];
  domains: Domain[];
  domainClients: DomainClient[];
  renewals: Renewal[];
  personalTasks: AdminWorkItem[];
  assigneesByProject: Record<string, string[]>;
}) {
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
  const invoiceByProject = new Map<string, Invoice>();
  for (const invoice of invoices) {
    if (invoice.projectId && !invoiceByProject.has(invoice.projectId)) invoiceByProject.set(invoice.projectId, invoice);
  }

  const currentMonth = businessMonthKey();
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

      <nav className="grid grid-cols-5 overflow-hidden rounded-xl border border-base-700/70 bg-base-850">
        {([
          ["Overview", "/admin"],
          ["Projects", "/projects"],
          ["Team", "#team-access"],
          ["Reports", "/seo/pages"],
          ["Accounts", "/invoices"],
        ] as const).map(([label, href], index) => (
          <Link
            key={label}
            href={href}
            className={`flex items-center justify-center border-r border-base-700/50 px-2 py-3 text-xs font-medium last:border-r-0 ${index === 0 ? "bg-accent-500/10 text-accent-300 shadow-[inset_0_-2px_0_rgba(52,211,153,.9)]" : "text-neutral-400 hover:bg-base-800 hover:text-neutral-200"}`}
          >
            {label}
          </Link>
        ))}
      </nav>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
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
                      const percent = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
                      const remainingTasks = Math.max(0, progress.total - progress.done);
                      const assignees = assigneesByProject[project.id] ?? [];
                      const invoice = invoiceByProject.get(project.id);
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

                          <div className="mt-auto flex items-end justify-between gap-3 border-t border-base-700/40 pt-3">
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

        <aside className="self-start rounded-xl2 border border-base-700/60 bg-base-850 shadow-card xl:sticky xl:top-4">
          <SectionHead icon={Activity} title="Recent Activity" subtitle="Latest completed work and alerts" />
          <div className="divide-y divide-base-700/50">
            {recentDone.map((task) => (
              <div key={task.id} className="flex gap-3 px-4 py-3">
                <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-500/10 text-emerald-300"><CheckCircle2 size={14} /></span>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-neutral-200">Task completed</p>
                  <p className="mt-0.5 truncate text-[11px] text-neutral-500">{task.title}</p>
                  <p className="mt-1 text-[10px] text-neutral-700">{task.assignedToName ?? "Team member"}</p>
                </div>
              </div>
            ))}
            {expiringDomains[0] && (
              <div className="flex gap-3 px-4 py-3">
                <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-amber-500/10 text-amber-300"><AlertTriangle size={14} /></span>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-neutral-200">Domain renewal reminder</p>
                  <p className="mt-0.5 text-[11px] text-neutral-500">{expiringDomains[0].domain.name}</p>
                  <p className="mt-1 text-[10px] text-neutral-700">Expires in {expiringDomains[0].days} days</p>
                </div>
              </div>
            )}
            {recentDone.length === 0 && !expiringDomains[0] && <Empty text="No recent activity." />}
          </div>
        </aside>
      </div>
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
