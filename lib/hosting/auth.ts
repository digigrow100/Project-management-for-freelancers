import "server-only";
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
  return profile;
}
export async function requireHostingClient() {
  const { data: { user }, error } = await createAuthClient().auth.getUser();
  if (error || !user) redirect("/login");
  const access = await hostingIdentity(user.id,user.email);
  if (!access?.enabled || (access.auth_user_id && access.auth_user_id !== user.id) || !user.email_confirmed_at) notFound();
  const client = await getSupabase().from("freelance_hq_hosting_clients").select("id,name,email,status").eq("id",access.client_id).maybeSingle();
  if (client.error || !client.data || client.data.status === "closed") notFound();
  return { userId: user.id, clientId: access.client_id, client: client.data as {id:string;name:string;email:string;status:string} };
}
