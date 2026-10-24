import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { MemberFocusDashboard } from "@/components/MemberFocusDashboard";
import { getEmployeeActivitySummary } from "@/lib/employeeActivity";
import { ensureIdleSeoTaskForMember, getMyTasks, listMemberSeoModuleAssignments, getProjectsForProfile, getTaskFocusStates, getTaskTimeTotals } from "@/lib/store";

export const dynamic = "force-dynamic";
export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/client");
  if (profile.role === "admin") redirect("/admin");
  await ensureIdleSeoTaskForMember(profile.id);
  const [tasks, focusStates, extensionWork, moduleAssignments] = await Promise.all([
    getMyTasks(profile.id),
    getTaskFocusStates(profile.id),
    getEmployeeActivitySummary(profile.id),
    listMemberSeoModuleAssignments(profile.id),
  ]);
  const taskProjectIds = new Set(tasks.map((task) => task.projectId));
  const [memberProjects, timeTotals] = await Promise.all([
    getProjectsForProfile(profile).then((items) => items.filter((project) => taskProjectIds.has(project.id))),
    getTaskTimeTotals(profile.id, tasks.map((task) => task.id)),
  ]);
  return (
    <MemberFocusDashboard
      tasks={tasks}
      projects={memberProjects}
      focusStates={focusStates}
      timeTotals={timeTotals}
      initialExtensionWork={extensionWork}
      moduleAssignments={moduleAssignments}
    />
  );
}
