import { getCurrentProfile } from "@/lib/auth";
import { getMyTasks, getProjectsForProfile, listTeamMembers, markSectionSeen } from "@/lib/store";
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
