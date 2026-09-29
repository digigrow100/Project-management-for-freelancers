import { getCurrentProfile } from "@/lib/auth";
import { getMyTasks, getProjectsByIds, getTaskFocusStates, markSectionSeen } from "@/lib/store";
import { MemberFocusDashboard } from "@/components/MemberFocusDashboard";

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

  const [tasks, focusStates] = await Promise.all([
    getMyTasks(profile.id),
    getTaskFocusStates(profile.id),
  ]);
  const projects = await getProjectsByIds(tasks.map((task) => task.projectId));
  await markSectionSeen(profile.id, "tasks");

  return <MemberFocusDashboard tasks={tasks} projects={projects} focusStates={focusStates} />;
}
