"use server";
import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import {requireAuthenticatedAdmin} from "./auth";
import {getProfile} from "./store";
import {MEMBER_VIEW_COOKIE,MEMBER_VIEW_SECONDS} from "./memberView";
export async function startMemberViewAction(data:FormData) {
  const actor=await requireAuthenticatedAdmin();
  const id=String(data.get("memberId")??"");
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error("Invalid team member.");
  const member=await getProfile(id);
  if(!member || member.role!=="member") throw new Error("Choose a team member account.");
  cookies().set(MEMBER_VIEW_COOKIE,`${actor.id}:${member.id}:${Date.now()+MEMBER_VIEW_SECONDS*1000}`,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:"/",maxAge:MEMBER_VIEW_SECONDS});
  redirect("/");
}
export async function stopMemberViewAction() {
  await requireAuthenticatedAdmin();
  cookies().delete(MEMBER_VIEW_COOKIE);
  redirect("/team");
}
