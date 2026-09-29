import { getCurrentProfile } from "@/lib/auth";
import {
  getMyTasks,
  getProjectsByIds,
  getProjectsForProfile,
  getTaskFocusStates,
  getTaskTimeTotals,
  listTeamMembers,
  markSectionSeen,
} from "@/lib/store";
import { MemberFocusDashboard } from "@/components/MemberFocusDashboard";
import { MyTasksList } from "@/components/MyTasksList";

export const dynamic = "force-dynamic";

export default async function MyTasksPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold text-neutral-50">My Tasks</h1>
        <p className="text-sm text-neutral-500">Sign in to see your tasks.</p>
      </div>
    );
  }

  if (profile.role === "admin") {
    const [tasks, projects, assignableMembers] = await Promise.all([
      getMyTasks(profile.id),
      getProjectsForProfile(profile),
      listTeamMembers(),
    ]);
    await markSectionSeen(profile.id, "tasks");

    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-50">My Tasks</h1>
          <p className="mt-1 text-sm text-neutral-500">Everything assigned to you, across every project.</p>
        </div>

        <MyTasksList tasks={tasks} projects={projects} assignableMembers={assignableMembers} />
      </div>
    );
  }

  const [tasks, focusStates] = await Promise.all([
    getMyTasks(profile.id),
    getTaskFocusStates(profile.id),
  ]);
  const [projects, timeTotals] = await Promise.all([
    getProjectsByIds(tasks.map((task) => task.projectId)),
    getTaskTimeTotals(profile.id, tasks.map((task) => task.id)),
  ]);
  await markSectionSeen(profile.id, "tasks");

  return <MemberFocusDashboard tasks={tasks} projects={projects} focusStates={focusStates} timeTotals={timeTotals} />;
}
