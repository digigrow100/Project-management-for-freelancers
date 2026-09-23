import Link from "next/link";
import { ListTodo, FolderKanban, CheckCircle2, ArrowRight, Plus, Wallet, TrendingUp, AlertCircle, PiggyBank, Hourglass, Pin, FileText } from "lucide-react";
import { getCurrentProfile } from "@/lib/auth";
import {
  getCompletedTasks,
  getOpenTasks,
  getProjectProgressMap,
  getProjectsForProfile,
  listAllPayments,
  listPaymentPlans,
  listPinnedNotes,
  listTeamMembers,
} from "@/lib/store";
import { StatCard } from "@/components/StatCard";
import { ScheduledTodayStat } from "@/components/ScheduledTodayStat";
import { TaskRow } from "@/components/TaskRow";
import { ProjectTypeTabs } from "@/components/ProjectTypeTabs";
import type { ProjectPaymentSummary } from "@/components/ProjectCardClient";
import { currentMonthKey, formatMoney, formatRelativeDate, resolveSelectedCurrency, sortCurrencies } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: { currency?: string } }) {
  const profile = await getCurrentProfile();
  const isAdmin = profile?.role === "admin";
  const [allOpenTasks, projects, allCompletedTasks, progress, plans, payments, pinnedNotes, assignableMembers] =
    await Promise.all([
      getOpenTasks(),
      profile ? getProjectsForProfile(profile) : Promise.resolve([]),
      getCompletedTasks(),
      getProjectProgressMap(),
      isAdmin ? listPaymentPlans() : Promise.resolve([]),
      isAdmin ? listAllPayments() : Promise.resolve([]),
      profile ? listPinnedNotes(profile.id, isAdmin) : Promise.resolve([]),
      listTeamMembers(),
    ]);

  const visibleIds = new Set(projects.map((p) => p.id));
  const openTasks = allOpenTasks.filter((t) => visibleIds.has(t.projectId));
  const completedTasks = allCompletedTasks.filter((t) => visibleIds.has(t.projectId));

  const activeProjects = projects.filter((p) => !p.archived);
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const stageNameById = (projectId: string, stageId: string | null) => {
    if (!stageId) return null;
    return projectById.get(projectId)?.stages.find((s) => s.id === stageId)?.name ?? null;
  };

  const paymentsByProject = new Map<string, typeof payments>();
  for (const payment of payments) {
    if (!payment.projectId) continue;
    const list = paymentsByProject.get(payment.projectId) ?? [];
    list.push(payment);
    paymentsByProject.set(payment.projectId, list);
  }

  const thisMonth = currentMonthKey();
  const summaryForPlan = (plan: (typeof plans)[number]): ProjectPaymentSummary => {
    const projectPayments = (paymentsByProject.get(plan.projectId) ?? []).filter((p) => p.currency === plan.currency);
    const received =
      plan.planType === "monthly_fixed"
        ? projectPayments.filter((p) => p.kind === "monthly" && p.period === thisMonth).reduce((sum, p) => sum + p.amount, 0)
        : projectPayments.reduce((sum, p) => sum + p.amount, 0);
    return { currency: plan.currency, received, pending: Math.max(0, plan.amount - received) };
  };

  const paymentByProject: Record<string, ProjectPaymentSummary[]> = {};
  for (const plan of plans) {
    const list = paymentByProject[plan.projectId] ?? [];
    list.push(summaryForPlan(plan));
    paymentByProject[plan.projectId] = list;
  }

  const currencies = sortCurrencies(Array.from(new Set(plans.map((p) => p.currency))));
  const summaryCurrency = resolveSelectedCurrency(currencies, searchParams.currency);

  const collectedThisMonth = payments
    .filter((p) => p.kind === "monthly" && p.period === thisMonth && p.currency === summaryCurrency)
    .reduce((sum, p) => sum + p.amount, 0);
  const monthlyRecurring = plans
    .filter((p) => p.planType === "monthly_fixed" && p.currency === summaryCurrency)
    .reduce((sum, p) => sum + p.amount, 0);
  const outstanding = plans
    .filter((p) => p.planType === "one_time" && p.currency === summaryCurrency)
    .map(summaryForPlan)
    .reduce((sum, summary) => sum + summary.pending, 0);

  const summariesForCurrency = plans.filter((p) => p.currency === summaryCurrency).map(summaryForPlan);
  const totalReceived = summariesForCurrency.reduce((sum, summary) => sum + summary.received, 0);
  const totalPending = summariesForCurrency.reduce((sum, summary) => sum + summary.pending, 0);

  return (
    <div className="flex flex-col gap-8">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-50">Projects</h1>
            <p className="mt-1 text-sm text-neutral-500">SEO and web development, kept in their own lanes.</p>
          </div>
          {profile?.role === "admin" && (
            <Link
              href="/projects/new"
              className="flex items-center gap-2 rounded-lg bg-accent-500 px-3 py-2 text-sm font-medium text-base-950 hover:bg-accent-400 shadow-glow"
            >
              <Plus size={16} />
              New Project
            </Link>
          )}
        </div>
        <ProjectTypeTabs projects={activeProjects} progress={progress} paymentByProject={paymentByProject} />
      </section>

      {pinnedNotes.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-neutral-400">
            <Pin size={13} className="text-accent-400" />
            Pinned Notes
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pinnedNotes.map((note) => (
              <Link
                key={note.id}
                href={`/notes/${note.id}`}
                className="flex flex-col gap-1.5 rounded-xl2 border border-base-700/60 bg-base-850 p-4 hover:border-accent-500/50"
              >
                <div className="flex items-center gap-1.5 text-neutral-100">
                  <FileText size={14} className="shrink-0 text-neutral-500" />
                  <p className="truncate text-sm font-medium">{note.title || "Untitled"}</p>
                </div>
                <p className="text-[11px] text-neutral-500">Updated {formatRelativeDate(note.updatedAt)}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Open tasks" value={openTasks.length} icon={ListTodo} tone="accent" />
        <ScheduledTodayStat tasks={openTasks} />
        <StatCard label="Active projects" value={activeProjects.length} icon={FolderKanban} tone="sky" />
        <StatCard label="Completed" value={completedTasks.length} icon={CheckCircle2} tone="accent" />
      </div>

      {isAdmin && plans.length > 0 && (
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
              Account Summary {currencies.length > 1 && `· ${summaryCurrency}`}
            </h2>
            <div className="flex flex-wrap items-center gap-3">
              {currencies.length > 1 && (
                <div className="flex gap-1 rounded-lg border border-base-700/60 bg-base-850 p-1">
                  {currencies.map((c) => (
                    <Link
                      key={c}
                      href={`/?currency=${c}`}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                        summaryCurrency === c ? "bg-accent-500 text-base-950" : "text-neutral-400 hover:text-neutral-200"
                      }`}
                    >
                      {c}
                    </Link>
                  ))}
                </div>
              )}
              <Link href="/finance" className="flex items-center gap-1 text-xs text-accent-400 hover:text-accent-300">
                Full finance view <ArrowRight size={12} />
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard label="Total received" value={formatMoney(totalReceived, summaryCurrency)} icon={PiggyBank} tone="accent" />
            <StatCard label="Total pending" value={formatMoney(totalPending, summaryCurrency)} icon={Hourglass} tone="rose" />
            <StatCard label="Collected this month" value={formatMoney(collectedThisMonth, summaryCurrency)} icon={Wallet} tone="accent" />
            <StatCard label="Monthly recurring" value={formatMoney(monthlyRecurring, summaryCurrency)} icon={TrendingUp} tone="amber" />
            <StatCard label="Outstanding (one-time)" value={formatMoney(outstanding, summaryCurrency)} icon={AlertCircle} tone="rose" />
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
            Open Tasks
          </h2>
          <Link href="/today" className="flex items-center gap-1 text-xs text-accent-400 hover:text-accent-300">
            Plan today <ArrowRight size={12} />
          </Link>
        </div>
        <div className="flex flex-col gap-2 rounded-xl2 border border-base-700/60 bg-base-850 p-2 md:border-0 md:bg-transparent md:p-0">
          {openTasks.length === 0 && (
            <p className="rounded-lg border border-dashed border-base-700 p-6 text-center text-sm text-neutral-500">
              Nothing open. You&apos;re fully caught up.
            </p>
          )}
          {openTasks.slice(0, 8).map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              stageName={stageNameById(task.projectId, task.stageId)}
              stages={projectById.get(task.projectId)?.stages ?? []}
              showProject
              projectName={projectById.get(task.projectId)?.name}
              assignableMembers={assignableMembers}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
