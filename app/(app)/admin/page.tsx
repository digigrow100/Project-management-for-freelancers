import { notFound } from "next/navigation";
import { Users } from "lucide-react";
import { getCurrentProfile } from "@/lib/auth";
import {
  getAdminTaskTimeSummaries,
  getAssignedProjectIds,
  getDomainSettings,
  getOpenTasks,
  getAdminProjectProgressMap,
  getProjects,
  getRecentCompletedTasks,
  listAllPayments,
  listTaskTimeEntries,
  listDomainClients,
  listDomains,
  listInvoiceItemsForInvoices,
  listInvoices,
  listPaymentPlans,
  listMemberPresence,
  listRenewals,
  listTeamMembers,
  listWebsitesByDomainIds,
  listAdminWorkItems,
} from "@/lib/store";
import { getEmployeeActivitySummaries } from "@/lib/employeeActivity";
import { AdminDashboardOverview } from "@/components/AdminDashboardOverview";
import { AdminTeamPanel } from "@/components/AdminTeamPanel";
import { EmployeeActivityOverview } from "@/components/EmployeeActivityOverview";

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
    timeEntries,
    invoices,
    payments,
    paymentPlans,
    domains,
    domainClients,
    renewals,
    adminWorkItems,
    memberPresence,
    employeeActivity,
  ] = await Promise.all([
    listTeamMembers(),
    getProjects(),
    getOpenTasks(),
    getRecentCompletedTasks(50),
    getAdminProjectProgressMap(),
    getAdminTaskTimeSummaries(),
    listTaskTimeEntries(),
    listInvoices(),
    listAllPayments(),
    listPaymentPlans(),
    listDomains(),
    listDomainClients(),
    listRenewals(),
    listAdminWorkItems(currentProfile.id),
    listMemberPresence(),
    getEmployeeActivitySummaries(),
  ]);

  const [invoiceItems, domainSettings, websitesByDomainId] = await Promise.all([
    listInvoiceItemsForInvoices(invoices.map((invoice) => invoice.id)),
    getDomainSettings(),
    listWebsitesByDomainIds(domains.map((domain) => domain.id)),
  ]);

  const assignmentsByMember = new Map<string, string[]>();
  for (const member of members) {
    if (member.role === "admin") continue;
    assignmentsByMember.set(member.id, await getAssignedProjectIds(member.id));
  }

  const assigneesByProject: Record<string, string[]> = {};
  for (const member of members) {
    if (member.role === "admin") continue;
    for (const projectId of assignmentsByMember.get(member.id) ?? []) {
      (assigneesByProject[projectId] ??= []).push(member.name || member.email);
    }
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
        initialPresence={memberPresence}
        initialEmployeeActivity={employeeActivity}
        timeSummaries={timeSummaries}
        timeEntries={timeEntries}
        memberProjectIds={Object.fromEntries(assignmentsByMember)}
        invoices={invoices}
        invoiceItems={invoiceItems}
        payments={payments}
        paymentPlans={paymentPlans}
        domains={domains}
        domainClients={domainClients}
        renewals={renewals}
        websitesByDomainId={websitesByDomainId}
        hasDynadotApiKey={Boolean(domainSettings.dynadotApiKeyEncrypted)}
        personalTasks={adminWorkItems.filter((task) => task.status !== "done")}
        assigneesByProject={assigneesByProject}
      />

      <EmployeeActivityOverview initialRows={employeeActivity} />

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
