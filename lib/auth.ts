import {requireAdminNetworkForRole} from "./security/adminNetwork";
import { requireEnrolledMfa, requireHostingSession } from "./security/mfa";
import { createAuthClient } from "./supabase/server";
import * as store from "./store";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { resolveMemberView, MEMBER_VIEW_COOKIE } from "./memberView";
import type { Profile } from "./types";
import { hostingIdentity } from "./hosting/identity";

/** Team access requires an explicitly provisioned profile. */
export async function getAuthenticatedProfile(): Promise<Profile | null> {
  const { data: { user }, error } = await (await createAuthClient()).auth.getUser();
  if (error || !user || !user.email_confirmed_at) return null;
  if (await hostingIdentity(user.id, user.email)) redirect("/client");

  const profile = await store.getProfile(user.id);
  if (!profile) return null;
  await requireAdminNetworkForRole(profile.role);
  if (profile.role === "admin") {
    await requireHostingSession(true);
  } else {
    await requireEnrolledMfa();
  }
  return profile;
}

/** The real signed-in admin remains the actor; only app-level member access changes. */
export async function getCurrentProfile(): Promise<Profile | null> {
  const actor = await getAuthenticatedProfile();
  return resolveMemberView(actor, (await cookies()).get(MEMBER_VIEW_COOKIE)?.value, store.getProfile);
}

export async function requireAuthenticatedAdmin(): Promise<Profile> {
  const actor = await getAuthenticatedProfile();
  if (!actor || actor.role !== "admin") throw new Error("Admin access required.");
  return actor;
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

export async function requireFinanceAccess(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== "admin" && !profile.canAccessFinance) throw new Error("You don't have access to Finance.");
  return profile;
}

export async function requireProjectAccess(projectId: string): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role === "admin") return profile;

  const allowed = await store.isProjectAssignedToUser(projectId, profile.id);
  if (!allowed) throw new Error("You don't have access to this project.");
  return profile;
}

/**
 * Reveal-time gate for backlink credentials. Being assigned to the project
 * is necessary but never sufficient — a member also needs the explicit
 * canAccessBacklinkCredentials grant (admins always pass).
 */
export async function requireBacklinkCredentialAccess(projectId: string): Promise<Profile> {
  const profile = await requireProjectAccess(projectId);
  if (profile.role !== "admin" && !profile.canAccessBacklinkCredentials) {
    throw new Error("You don't have permission to reveal backlink credentials.");
  }
  return profile;
}
