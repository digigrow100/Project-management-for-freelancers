import { getCurrentProfile } from "@/lib/auth";
import { getOpenTasks, getProjectsForProfile, listTeamMembers } from "@/lib/store";
import { TodayTaskList } from "@/components/TodayTaskList";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const profile = await getCurrentProfile();
  const [allTasks, projects, assignableMembers] = await Promise.all([
    getOpenTasks(),
    profile ? getProjectsForProfile(profile) : Promise.resolve([]),
    listTeamMembers(),
  ]);
  const visibleIds = new Set(projects.map((p) => p.id));
  const tasks = allTasks.filter((t) => visibleIds.has(t.projectId));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-50">Today</h1>
        <p className="mt-1 text-sm text-neutral-500">
          What you&apos;re doing today, pulled from every project. Star any task from a project to add it here.
        </p>
      </div>

      <TodayTaskList tasks={tasks} projects={projects} assignableMembers={assignableMembers} />
    </div>
  );
}
