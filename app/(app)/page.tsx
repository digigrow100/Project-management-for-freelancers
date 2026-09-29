import Link from "next/link";
import { AlertCircle, ArrowRight, Hourglass, PiggyBank, Plus, TrendingUp, Wallet } from "lucide-react";
import { getCurrentProfile } from "@/lib/auth";
import { MemberFocusDashboard } from "@/components/MemberFocusDashboard";
import { AdminTaskCommandCenter } from "@/components/AdminTaskCommandCenter";
import {
  ensureIdleSeoTaskForMember,
  getAllTaskFocusStates,
  getRecentCompletedTasks,
  getMyTasks,
  getOpenTasks,
  getProjectProgressMap,
  getProjectsByIds,
  getProjectsForProfile,
  getTaskFocusStates,
  getTaskTimeTotals,
  listAllPayments,
  listPaymentPlans,
} from "@/lib/store";
import { StatCard } from "@/components/StatCard";
import { ProjectTypeTabs } from "@/components/ProjectTypeTabs";
import type { ProjectPaymentSummary } from "@/components/ProjectCardClient";
import { currentMonthKey, formatMoney, resolveSelectedCurrency, sortCurrencies } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: { currency?: string } }) {
  const profile = await getCurrentProfile();
  const isAdmin = profile?.role === "admin";

  if (profile && profile.role === "member") {
    await ensureIdleSeoTaskForMember(profile.id);
    const [tasks, focusStates] = await Promise.all([
      getMyTasks(profile.id),
      getTaskFocusStates(profile.id),
    ]);
    const [memberProjects, timeTotals] = await Promise.all([
      getProjectsByIds(tasks.map((task) => task.projectId)),
      getTaskTimeTotals(profile.id, tasks.map((task) => task.id)),
    ]);
    return <MemberFocusDashboard tasks={tasks} projects={memberProjects} focusStates={focusStates} timeTotals={timeTotals} />;
  }

  const [allOpenTasks, projects, allCompletedTasks, progress, plans, payments, focusStates] = await Promise.all([
    getOpenTasks(),
    profile ? getProjectsForProfile(profile) : Promise.resolve([]),
    getRecentCompletedTasks(50),
    getProjectProgressMap(),
    isAdmin ? listPaymentPlans() : Promise.resolve([]),
    isAdmin ? listAllPayments() : Promise.resolve([]),
    isAdmin ? getAllTaskFocusStates() : Promise.resolve([]),
  ]);

  const visibleIds = new Set(projects.map((project) => project.id));
  const openTasks = allOpenTasks.filter((task) => visibleIds.has(task.projectId));
  const completedTasks = allCompletedTasks.filter((task) => visibleIds.has(task.projectId));
  const activeProjects = projects.filter((project) => !project.archived);

  const paymentsByProject = new Map<string, typeof payments>();
  for (const payment of payments) {
    if (!payment.projectId) continue;
    const list = paymentsByProject.get(payment.projectId) ?? [];
    list.push(payment);
    paymentsByProject.set(payment.projectId, list);
  }

  const thisMonth = currentMonthKey();
  const summaryForPlan = (plan: (typeof plans)[number]): ProjectPaymentSummary => {
    const projectPayments = (paymentsByProject.get(plan.projectId) ?? []).filter(
      (payment) => payment.currency === plan.currency,
    );
    const received =
      plan.planType === "monthly_fixed"
        ? projectPayments
            .filter((payment) => payment.kind === "monthly" && payment.period === thisMonth)
            .reduce((sum, payment) => sum + payment.amount, 0)
        : projectPayments.reduce((sum, payment) => sum + payment.amount, 0);

    return {
      currency: plan.currency,
      received,
      pending: Math.max(0, plan.amount - received),
    };
  };

  const paymentByProject: Record<string, ProjectPaymentSummary[]> = {};
  for (const plan of plans) {
    const list = paymentByProject[plan.projectId] ?? [];
    list.push(summaryForPlan(plan));
    paymentByProject[plan.projectId] = list;
  }

  const currencies = sortCurrencies(Array.from(new Set(plans.map((plan) => plan.currency))));
  const summaryCurrency = resolveSelectedCurrency(currencies, searchParams.currency);

  const collectedThisMonth = payments
    .filter((payment) => payment.kind === "monthly" && payment.period === thisMonth && payment.currency === summaryCurrency)
    .reduce((sum, payment) => sum + payment.amount, 0);

  const monthlyRecurring = plans
    .filter((plan) => plan.planType === "monthly_fixed" && plan.currency === summaryCurrency)
    .reduce((sum, plan) => sum + plan.amount, 0);

  const outstanding = plans
    .filter((plan) => plan.planType === "one_time" && plan.currency === summaryCurrency)
    .map(summaryForPlan)
    .reduce((sum, summary) => sum + summary.pending, 0);

  const summariesForCurrency = plans.filter((plan) => plan.currency === summaryCurrency).map(summaryForPlan);
  const totalReceived = summariesForCurrency.reduce((sum, summary) => sum + summary.received, 0);
  const totalPending = summariesForCurrency.reduce((sum, summary) => sum + summary.pending, 0);

  return (
    <div className="flex flex-col gap-8">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-50">Projects</h1>
            <p className="mt-1 text-sm text-neutral-500">
              Open a project, or use the live task controls below to see what the team is doing.
            </p>
          </div>
          {isAdmin && (
            <Link
              href="/projects/new"
              className="flex items-center gap-2 rounded-lg bg-accent-500 px-3 py-2 text-sm font-medium text-base-950 shadow-glow hover:bg-accent-400"
            >
              <Plus size={16} />
              New Project
            </Link>
          )}
        </div>
        <ProjectTypeTabs projects={activeProjects} progress={progress} paymentByProject={paymentByProject} />
      </section>

      {isAdmin && (
        <AdminTaskCommandCenter
          projects={activeProjects}
          initialOpenTasks={openTasks}
          initialCompletedTasks={completedTasks}
          initialFocusStates={focusStates}
        />
      )}

      {isAdmin && plans.length > 0 && (
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
              Account Summary {currencies.length > 1 && `· ${summaryCurrency}`}
            </h2>
            <div className="flex flex-wrap items-center gap-3">
              {currencies.length > 1 && (
                <div className="flex gap-1 rounded-lg border border-base-700/60 bg-base-850 p-1">
                  {currencies.map((currency) => (
                    <Link
                      key={currency}
                      href={`/?currency=${currency}`}
                      className={
                        "rounded-md px-2.5 py-1 text-xs font-medium transition-colors " +
                        (summaryCurrency === currency
                          ? "bg-accent-500 text-base-950"
                          : "text-neutral-400 hover:text-neutral-200")
                      }
                    >
                      {currency}
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
    </div>
  );
}
