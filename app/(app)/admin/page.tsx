import { notFound } from "next/navigation";
import { Users } from "lucide-react";
import { getCurrentProfile } from "@/lib/auth";
import {
  getAdminTaskTimeSummaries,
  getAssignedProjectIds,
  getMyTasks,
  getOpenTasks,
  getProjectProgressMap,
  getProjects,
  getRecentCompletedTasks,
  listAllPayments,
  listDomainClients,
  listDomains,
  listInvoiceItemsForInvoices,
  listInvoices,
  listRenewals,
  listTeamMembers,
} from "@/lib/store";
import { AdminDashboardOverview } from "@/components/AdminDashboardOverview";
import { AdminTeamPanel } from "@/components/AdminTeamPanel";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const currentProfile = await getCurrentProfile();
  if (currentProfile?.role !== "admin") notFound();

  const [
    members,
    projects,
    openTasks,
    completedTasks,
    progressMap,
    timeSummaries,
    invoices,
    payments,
    domains,
    domainClients,
    renewals,
    personalTasks,
  ] = await Promise.all([
    listTeamMembers(),
    getProjects(),
    getOpenTasks(),
    getRecentCompletedTasks(50),
    getProjectProgressMap(),
    getAdminTaskTimeSummaries(),
    listInvoices(),
    listAllPayments(),
    listDomains(),
    listDomainClients(),
    listRenewals(),
    getMyTasks(currentProfile.id),
  ]);

  const invoiceItems = await listInvoiceItemsForInvoices(invoices.map((invoice) => invoice.id));

  const assignmentsByMember = new Map<string, string[]>();
  for (const member of members) {
    if (member.role === "admin") continue;
    assignmentsByMember.set(member.id, await getAssignedProjectIds(member.id));
  }

  return (
    <div className="flex flex-col gap-7">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-50">Admin Dashboard</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Projects, payments, team workload, personal tasks, renewals and recent activity in one place.
        </p>
      </div>

      <AdminDashboardOverview
        projects={projects}
        progressMap={progressMap}
        openTasks={openTasks}
        completedTasks={completedTasks}
        members={members}
        timeSummaries={timeSummaries}
        invoices={invoices}
        invoiceItems={invoiceItems}
        payments={payments}
        domains={domains}
        domainClients={domainClients}
        renewals={renewals}
        personalTasks={personalTasks.filter((task) => task.status !== "done")}
      />

      <section id="team-access" className="scroll-mt-6">
        <div className="mb-3 flex items-center gap-2">
          <Users size={15} className="text-neutral-500" />
          <div>
            <h2 className="text-sm font-semibold text-neutral-200">Team & Project Access</h2>
            <p className="mt-0.5 text-xs text-neutral-600">
              Invite members, set job roles and control project access.
            </p>
          </div>
        </div>

        <AdminTeamPanel
          currentUserId={currentProfile.id}
          members={members}
          projects={projects}
          assignmentsByMember={Object.fromEntries(assignmentsByMember)}
        />
      </section>
    </div>
  );
}
