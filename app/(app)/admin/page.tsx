import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Clock3 } from "lucide-react";
import { getCurrentProfile } from "@/lib/auth";
import { getAssignedProjectIds, getProjects, listTeamMembers } from "@/lib/store";
import { AdminTeamPanel } from "@/components/AdminTeamPanel";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const currentProfile = await getCurrentProfile();
  if (currentProfile?.role !== "admin") notFound();

  const [members, projects] = await Promise.all([listTeamMembers(), getProjects()]);
  const assignmentsByMember = new Map<string, string[]>();
  for (const member of members) {
    if (member.role === "admin") continue;
    assignmentsByMember.set(member.id, await getAssignedProjectIds(member.id));
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-50">Admin</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Invite team members and control which projects each of them can see and work on.
        </p>
      </div>

      <Link
        href="/admin/time-tracking"
        className="group flex items-center gap-4 rounded-xl2 border border-base-700/60 bg-base-850 p-4 shadow-card hover:border-accent-500/40"
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-sky-500/10 text-sky-300">
          <Clock3 size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-neutral-100">Task Time Tracking</span>
          <span className="mt-1 block text-xs text-neutral-500">Review time spent by project, task, and team member.</span>
        </span>
        <ArrowRight size={16} className="text-neutral-600 transition-transform group-hover:translate-x-0.5 group-hover:text-accent-300" />
      </Link>

      <AdminTeamPanel
        currentUserId={currentProfile.id}
        members={members}
        projects={projects}
        assignmentsByMember={Object.fromEntries(assignmentsByMember)}
      />
    </div>
  );
}
