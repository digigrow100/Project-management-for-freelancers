import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Clock3, PanelsTopLeft, Users } from "lucide-react";
import { getCurrentProfile } from "@/lib/auth";
import {
  getAllTaskFocusStates,
  getAssignedProjectIds,
  getOpenTasks,
  getProjects,
  getRecentCompletedTasks,
  listTeamMembers,
} from "@/lib/store";
import { AdminTeamPanel } from "@/components/AdminTeamPanel";
import { AdminTaskCommandCenter } from "@/components/AdminTaskCommandCenter";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const currentProfile = await getCurrentProfile();
  if (currentProfile?.role !== "admin") notFound();

  const [members, projects, openTasks, completedTasks, focusStates] = await Promise.all([
    listTeamMembers(),
    getProjects(),
    getOpenTasks(),
    getRecentCompletedTasks(50),
    getAllTaskFocusStates(),
  ]);

  const activeProjects = projects.filter((project) => !project.archived);
  const activeProjectIds = new Set(activeProjects.map((project) => project.id));

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
          See live team work, completed tasks, SEO pages, reports, time tracking, and team access from one place.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/seo/pages"
          className="group flex items-center gap-4 rounded-xl2 border border-base-700/60 bg-base-850 p-4 shadow-card hover:border-accent-500/40"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-500/10 text-accent-300">
            <PanelsTopLeft size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-neutral-100">SEO Website Pages</span>
            <span className="mt-1 block text-xs text-neutral-500">
              Open monthly page checklists and reports for every SEO project.
            </span>
          </span>
          <ArrowRight size={16} className="text-neutral-600 transition-transform group-hover:translate-x-0.5 group-hover:text-accent-300" />
        </Link>

        <Link
          href="/admin/time-tracking"
          className="group flex items-center gap-4 rounded-xl2 border border-base-700/60 bg-base-850 p-4 shadow-card hover:border-accent-500/40"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-sky-500/10 text-sky-300">
            <Clock3 size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-neutral-100">Task Time Tracking</span>
            <span className="mt-1 block text-xs text-neutral-500">
              Review time spent by project, task, and team member.
            </span>
          </span>
          <ArrowRight size={16} className="text-neutral-600 transition-transform group-hover:translate-x-0.5 group-hover:text-accent-300" />
        </Link>
      </div>

      <AdminTaskCommandCenter
        projects={activeProjects}
        initialOpenTasks={openTasks.filter((task) => activeProjectIds.has(task.projectId))}
        initialCompletedTasks={completedTasks.filter((task) => activeProjectIds.has(task.projectId))}
        initialFocusStates={focusStates}
      />

      <section>
        <div className="mb-3 flex items-center gap-2">
          <Users size={15} className="text-neutral-500" />
          <div>
            <h2 className="text-sm font-semibold text-neutral-200">Team & Project Access</h2>
            <p className="mt-0.5 text-xs text-neutral-600">
              Invite members and control which projects each person can access.
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
