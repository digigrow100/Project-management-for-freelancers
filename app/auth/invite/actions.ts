"use server";
import { z } from "zod";
import { createAuthClient } from "@/lib/supabase/server";
import { hostingIdentity } from "@/lib/hosting/identity";
export async function acceptHostingInvite(accessToken: string, refreshToken: string) {
 const schema=z.string().min(20).max(10000);
 try {
  schema.parse(accessToken);schema.parse(refreshToken);
  const auth=createAuthClient();
  const {data:{user},error}=await auth.auth.getUser(accessToken);
  if(error||!user||!user.email_confirmed_at) return false;
  const identity=await hostingIdentity(user.id,user.email);
  if(!identity?.enabled||(identity.auth_user_id&&identity.auth_user_id!==user.id))return false;
  const result=await auth.auth.setSession({access_token:accessToken,refresh_token:refreshToken});
  return !result.error;
 }catch{return false;}
}
