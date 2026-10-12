import {notFound} from "next/navigation";
import {requireAdmin} from "@/lib/auth";
import {getProfile} from "@/lib/store";
import {startMemberViewAction} from "@/lib/memberViewActions";
export const dynamic="force-dynamic";
export default async function MemberAccessPage({params}:{params:{id:string}}) {
  await requireAdmin();
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.id)) notFound();
  const member=await getProfile(params.id);
  if(!member||member.role!=="member") notFound();
  return <section className="rounded-xl border border-base-700 bg-base-850 p-5"><h1 className="text-xl font-semibold">Open {member.name||member.email}’s account</h1><p className="mt-2 text-sm text-neutral-400">You will use this member’s permissions. Actions change their real tasks. You can return to your admin account at any time.</p><form action={startMemberViewAction} className="mt-4"><input type="hidden" name="memberId" value={member.id}/><button className="rounded-lg bg-accent-500 px-4 py-2 font-semibold text-base-950">Open as member</button></form></section>;
}
