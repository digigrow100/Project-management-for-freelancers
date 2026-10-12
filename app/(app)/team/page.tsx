import Link from "next/link";
import {requireAdmin} from "@/lib/auth";
import {listTeamMembers,getProjects,getAssignedProjectIds} from "@/lib/store";
import {AdminTeamPanel} from "@/components/AdminTeamPanel";
import {startMemberViewAction} from "@/lib/memberViewActions";
export const dynamic="force-dynamic";
export default async function TeamPage() {
  const actor=await requireAdmin();
  const [members,projects]=await Promise.all([listTeamMembers(),getProjects()]);
  const entries=await Promise.all(members.map(async m=>[m.id,await getAssignedProjectIds(m.id)] as const));
  return <div className="space-y-6">
    <header><h1 className="text-2xl font-semibold text-neutral-100">Team</h1><p className="mt-1 text-sm text-neutral-400">Manage members, project assignments and access settings.</p></header>
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {members.filter(m=>m.role==="member").map(m=><div key={m.id} className="rounded-xl border border-base-700 bg-base-850 p-4">
        <h2 className="font-semibold text-neutral-100">{m.name||m.email}</h2><p className="mt-1 text-xs text-neutral-400">{m.jobRole.replaceAll("_"," ")}</p>
        <form action={startMemberViewAction} className="mt-3"><input type="hidden" name="memberId" value={m.id}/><button className="rounded-lg bg-accent-500 px-3 py-2 text-sm font-semibold text-base-950">Open as member</button></form>
        <Link href={`/team/view/${m.id}`} prefetch={false} className="mt-2 inline-block text-xs text-accent-300 underline">Member access link</Link>
      </div>)}
    </section>
    <AdminTeamPanel currentUserId={actor.id} members={members} projects={projects} assignmentsByMember={Object.fromEntries(entries)}/>
  </div>;
}
