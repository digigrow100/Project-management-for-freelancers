import Link from "next/link";
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
import type { Domain, DomainClient, Invoice, InvoiceItem, Payment, Profile, Project, Renewal, Task, TaskTimeSummary } from "@/lib/types";

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
  domains,
  domainClients,
  renewals,
  personalTasks,
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
  domains: Domain[];
  domainClients: DomainClient[];
  renewals: Renewal[];
  personalTasks: Task[];
}) {
  const activeProjects = projects.filter((project) => !project.archived);
  const invoiceByProject = new Map<string, Invoice>();
  for (const invoice of invoices) {
    if (invoice.projectId && !invoiceByProject.has(invoice.projectId)) invoiceByProject.set(invoice.projectId, invoice);
  }

  const paidByInvoice = new Map<string, number>();
  for (const payment of payments) {
    if (payment.invoiceId) paidByInvoice.set(payment.invoiceId, (paidByInvoice.get(payment.invoiceId) ?? 0) + payment.amount);
  }

  const invoiceTotal = (invoice: Invoice) =>
    (invoiceItems[invoice.id] ?? []).reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  const primaryCurrency = invoices.find((invoice) => invoice.currency)?.currency ?? payments[0]?.currency ?? "GBP";
  const totalReceived = payments
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
        <StatCard icon={Banknote} label="Total Received" value={money(totalReceived, primaryCurrency)} sub="Recorded payments" />
        <StatCard icon={ReceiptText} label="Outstanding Invoices" value={money(outstanding, primaryCurrency)} sub={`${openInvoices} invoices open`} warning />
        <StatCard icon={Users} label="Active Clients" value={String(new Set(activeProjects.map((project) => project.clientId).filter(Boolean)).size)} sub={`${activeProjects.length} active projects`} />
        <StatCard icon={WalletCards} label="Open Tasks" value={String(openTasks.length)} sub="Across all active projects" />
      </section>

      <nav className="grid grid-cols-5 overflow-hidden rounded-xl border border-base-700/70 bg-base-850">
        {[
          ["Overview", "/admin"],
          ["Projects", "/projects"],
          ["Team", "#team-access"],
          ["Reports", "/seo/pages"],
          ["Accounts", "/invoices"],
        ].map(([label, href], index) => (
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
          <section className="rounded-xl2 border border-base-700/60 bg-base-850 shadow-card">
            <SectionHead icon={FolderKanban} title="Active Projects" subtitle="Project progress, client identity and payment status" href="/projects" action="View all projects" />
            <div className="divide-y divide-base-700/50">
              {activeProjects.slice(0, 8).map((project) => {
                const progress = progressMap[project.id] ?? { done: 0, total: 0, openCount: 0 };
                const percent = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
                const invoice = invoiceByProject.get(project.id);
                return (
                  <div key={project.id} className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_170px_210px] md:items-center">
                    <div className="min-w-0">
                      <Link href={`/projects/${project.id}`} className="block truncate text-sm font-semibold text-neutral-100 hover:text-accent-300">
                        {project.name}
                      </Link>
                      <p className="mt-0.5 truncate text-xs text-neutral-500">{project.client || project.clientDetails.company || project.clientDetails.name || "No client"}</p>
                    </div>
                    <div>
                      <div className="mb-1 flex items-center justify-between text-[11px] text-neutral-500">
                        <span>{percent}%</span>
                        <span>{progress.done}/{progress.total || 0}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-base-700">
                        <div className="h-1.5 rounded-full bg-emerald-400" style={{ width: `${percent}%` }} />
                      </div>
                    </div>
                    <div>
                      {invoice ? (
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold capitalize ${invoiceStatusClass(invoice.status)}`}>
                          {invoice.status.replaceAll("_", " ")}
                        </span>
                      ) : (
                        <span className="text-[11px] text-neutral-600">No invoice</span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 md:justify-end">
                      {invoice && (
                        <>
                          <Link href={`/invoices/${invoice.id}?download=1`} className="inline-flex items-center gap-1.5 rounded-md border border-base-600 px-2.5 py-1.5 text-[11px] text-neutral-300 hover:border-accent-500/50 hover:text-accent-300">
                            <Download size={12} /> Download
                          </Link>
                          <Link href={`/invoices/${invoice.id}`} className="rounded-md border border-base-600 px-2.5 py-1.5 text-[11px] text-neutral-400 hover:text-neutral-200">
                            Edit
                          </Link>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
              {activeProjects.length === 0 && <Empty text="No active projects." />}
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
              <SectionHead icon={CheckCircle2} title="My Personal Tasks" subtitle="Your own small admin jobs" href="/" action="Open tasks" />
              <div className="divide-y divide-base-700/50">
                {personalTasks.slice(0, 7).map((task) => (
                  <Link key={task.id} href={`/projects/${task.projectId}`} className="flex items-center gap-3 px-4 py-3 hover:bg-base-800/50">
                    <span className="h-4 w-4 rounded-full border border-base-500" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-neutral-200">{task.title}</p>
                      <p className="mt-0.5 text-[10px] text-neutral-600">{task.dueDate || "No due date"}</p>
                    </div>
                  </Link>
                ))}
                {personalTasks.length === 0 && <Empty text="No personal tasks assigned to you." />}
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
