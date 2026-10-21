import { requireHostingSession } from "@/lib/security/mfa";
import "server-only";
import { cookies } from "next/headers";
import { HOSTING_CLIENT_VIEW_COOKIE,readClientView } from "./clientView";
import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { getSupabase } from "@/lib/supabaseClient";
import { createAuthClient } from "@/lib/supabase/server";
import { hostingIdentity } from "./identity";
export async function requireHostingAdmin() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin") throw new Error("Hosting admin access required.");
  // Do not inherit the older app's missing-profile-table fallback.
  const row = await getSupabase().from("freelance_hq_profiles").select("id,role").eq("id",profile.id).eq("role","admin").maybeSingle();
  if (row.error || !row.data) throw new Error("Hosting admin access required.");
  await requireHostingSession(true);
  return profile;
}
export async function requireHostingClient() {
  const { data: { user }, error } = await createAuthClient().auth.getUser();
  if (error || !user) redirect("/login");
  await requireHostingSession();
  const viewCookie=cookies().get(HOSTING_CLIENT_VIEW_COOKIE)?.value;
  if(viewCookie){
    const clientId=readClientView(viewCookie,user.id);
    if(clientId){
      // A signed cookie never replaces live authentication or effective-admin checks.
      try { const actor=await requireHostingAdmin();if(actor.id!==user.id)notFound(); } catch { notFound(); }
      const client=await getSupabase().from("freelance_hq_hosting_clients").select("id,name,email,status").eq("id",clientId).maybeSingle();
      if(client.error||!client.data||client.data.status==="closed")notFound();
      return {userId:user.id,clientId,client:client.data as {id:string;name:string;email:string;status:string},adminView:true};
    }
    // Real clients ignore a foreign/expired cookie and still use their own enrollment.
    const identity=await hostingIdentity(user.id,user.email);
    if(!identity)redirect("/hosting/clients");
  }
  const access = await hostingIdentity(user.id,user.email);
  if (!access?.enabled || (access.auth_user_id && access.auth_user_id !== user.id) || !user.email_confirmed_at) notFound();
  const client = await getSupabase().from("freelance_hq_hosting_clients").select("id,name,email,status").eq("id",access.client_id).maybeSingle();
  if (client.error || !client.data || client.data.status === "closed") notFound();
  return { adminView:false, userId: user.id, clientId: access.client_id, client: client.data as {id:string;name:string;email:string;status:string} };
}
