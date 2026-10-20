import "server-only";
import { getSupabase } from "@/lib/supabaseClient";
import type { HostingAccess } from "./types";
/** Service-role lookup only. Never let user-editable metadata grant access. */
export async function hostingIdentity(userId: string, email?: string): Promise<HostingAccess | null> {
  const db = getSupabase();
  const byId = await db.from("freelance_hq_hosting_client_access").select("id,client_id,auth_user_id,email,enabled,invited_at").eq("auth_user_id",userId).maybeSingle();
  if (byId.error?.code === "42P01" || byId.error?.code === "PGRST205") return null; // compatible before this additive migration
  if (byId.error) throw new Error("Could not verify hosting access.");
  if (byId.data) return byId.data as HostingAccess;
  if (!email) return null;
  const pending = await db.from("freelance_hq_hosting_client_access").select("id,client_id,auth_user_id,email,enabled,invited_at").eq("email",email.toLowerCase()).maybeSingle();
  if (pending.error) throw new Error("Could not verify hosting access.");
  // Pending/disabled enrollments also prevent auto-provisioning a team account.
  return pending.data as HostingAccess | null;
}
