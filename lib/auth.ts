import { createAuthClient } from "./supabase/server";
import * as store from "./store";
import { isMissingTableError } from "./store";
import type { Profile } from "./types";

/**
 * Resolves the signed-in user's team profile, auto-provisioning one on first
 * sight: the very first person to ever sign in becomes 'admin', everyone after
 * defaults to 'member' (an admin can promote them later from the Admin panel).
 *
 * If migration 006 hasn't been run yet, this fails open as an admin so the app
 * keeps behaving exactly as it did before team accounts existed.
 */
export async function getCurrentProfile(): Promise<Profile | null> {
  let user: { id: string; email?: string } | null = null;
  try {
    const supabase = createAuthClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    user = authUser;
  } catch {
    // Auth client couldn't be created/reached (e.g. SUPABASE_URL or
    // SUPABASE_ANON_KEY missing) — treat the same as signed out
    // instead of crashing every page under the (app) layout.
    return null;
  }
  if (!user) return null;

  try {
    const existing = await store.getProfile(user.id);
    if (existing) return existing;

    const count = await store.getProfileCount();
    const role = count === 0 ? "admin" : "member";
    const name = user.email?.split("@")[0] ?? "";
    return await store.createProfile({ id: user.id, email: user.email ?? "", name, role });
  } catch (error) {
    if (isMissingTableError(error)) {
      return {
        id: user.id,
        email: user.email ?? "",
        name: user.email?.split("@")[0] ?? "",
        role: "admin",
        canAccessRenewals: true,
        createdAt: new Date().toISOString(),
      };
    }
    throw error;
  }
}

export async function requireProfile(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not signed in.");
  return profile;
}

export async function requireAdmin(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== "admin") throw new Error("Admin access required.");
  return profile;
}

export async function requireRenewalsAccess(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== "admin" && !profile.canAccessRenewals) throw new Error("You don't have access to Renewals.");
  return profile;
}

export async function requireProjectAccess(projectId: string): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role === "admin") return profile;

  const allowed = await store.isProjectAssignedToUser(projectId, profile.id);
  if (!allowed) throw new Error("You don't have access to this project.");
  return profile;
}
