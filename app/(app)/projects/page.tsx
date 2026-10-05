import Link from "next/link";
import { Plus } from "lucide-react";
import { getCurrentProfile } from "@/lib/auth";
import {
  getProjectProgressMap,
  getProjectsForProfile,
  listAllPayments,
  listPaymentPlans,
  markSectionSeen,
} from "@/lib/store";
import { ProjectTypeTabs } from "@/components/ProjectTypeTabs";
import type { ProjectPaymentSummary } from "@/components/ProjectCardClient";
import { currentMonthKey } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const profile = await getCurrentProfile();
  const isAdmin = profile?.role === "admin";
  const [projects, progress, plans, payments] = await Promise.all([
    profile ? getProjectsForProfile(profile) : Promise.resolve([]),
    getProjectProgressMap(),
    isAdmin ? listPaymentPlans() : Promise.resolve([]),
    isAdmin ? listAllPayments() : Promise.resolve([]),
  ]);
  if (profile) await markSectionSeen(profile.id, "projects");
  const active = projects.filter((p) => !p.archived);

  // Financial summaries are admin-only. Team members never receive price/payment
  // data in their Projects page payload.
  const paymentByProject: Record<string, ProjectPaymentSummary[]> = {};
  if (isAdmin) {
    const paymentsByProject = new Map<string, typeof payments>();
    for (const payment of payments) {
      if (!payment.projectId) continue;
      const list = paymentsByProject.get(payment.projectId) ?? [];
      list.push(payment);
      paymentsByProject.set(payment.projectId, list);
    }

    const thisMonth = currentMonthKey();
    for (const plan of plans) {
      const projectPayments = (paymentsByProject.get(plan.projectId) ?? []).filter(
        (payment) => payment.currency === plan.currency,
      );
      const received =
        plan.planType === "monthly_fixed"
          ? projectPayments
              .filter((payment) => payment.kind === "monthly" && payment.period === thisMonth)
              .reduce((sum, payment) => sum + payment.amount, 0)
          : projectPayments.reduce((sum, payment) => sum + payment.amount, 0);

      const list = paymentByProject[plan.projectId] ?? [];
      list.push({
        currency: plan.currency,
        received,
        pending: Math.max(0, plan.amount - received),
      });
      paymentByProject[plan.projectId] = list;
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
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

      <ProjectTypeTabs
        projects={active}
        progress={progress}
        paymentByProject={isAdmin ? paymentByProject : undefined}
      />
    </div>
  );
}
