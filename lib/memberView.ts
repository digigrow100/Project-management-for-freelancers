import type {Profile} from "./types";
export const MEMBER_VIEW_COOKIE = "fhq_member_view";
export const MEMBER_VIEW_SECONDS = 3600;
export async function resolveMemberView(actor:Profile|null,value:string|undefined,lookup:(id:string)=>Promise<Profile|null>,now=Date.now()):Promise<Profile|null> {
  if (!actor || actor.role !== "admin" || !value) return actor;
  const [actorId,targetId,expires,...extra]=value.split(":");
  if(extra.length || actorId!==actor.id || !targetId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId) || !expires || !Number.isFinite(Number(expires)) || Number(expires)<=now || Number(expires)>now+MEMBER_VIEW_SECONDS*1000) return actor;
  const target=await lookup(targetId);
  return target?.role === "member" ? target : actor;
}
