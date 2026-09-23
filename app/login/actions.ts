"use server";

import { redirect } from "next/navigation";
import { createAuthClient } from "@/lib/supabase/server";
import { getSiteOrigin } from "@/lib/site";

const AUTH_NOT_CONFIGURED_MESSAGE =
  "Sign-in isn't configured yet. Check that SUPABASE_URL and SUPABASE_ANON_KEY are set.";

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect(`/login?error=${encodeURIComponent("Email and password are required.")}`);
  }

  let supabase;
  try {
    supabase = createAuthClient();
  } catch {
    redirect(`/login?error=${encodeURIComponent(AUTH_NOT_CONFIGURED_MESSAGE)}`);
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/");
}

export async function logoutAction() {
  try {
    const supabase = createAuthClient();
    await supabase.auth.signOut();
  } catch {
    // Auth not configured — nothing to sign out of.
  }
  redirect("/login");
}

export async function requestPasswordResetAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();

  if (!email) {
    redirect(`/login/forgot-password?error=${encodeURIComponent("Email is required.")}`);
  }

  let supabase;
  try {
    supabase = createAuthClient();
  } catch {
    redirect(`/login/forgot-password?error=${encodeURIComponent(AUTH_NOT_CONFIGURED_MESSAGE)}`);
  }

  const redirectTo = `${getSiteOrigin()}/auth/confirm?next=${encodeURIComponent("/login/reset-password")}`;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

  // Supabase doesn't error for an unknown email (to avoid leaking which
  // addresses have accounts), so a generic "check your inbox" message here is
  // accurate for both the real and the no-such-account case. Only a genuine
  // failure (bad email format, rate limit, misconfiguration) surfaces below.
  if (error) {
    redirect(`/login/forgot-password?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/login/forgot-password?sent=1");
}

export async function updatePasswordAction(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!password || password.length < 6) {
    redirect(
      `/login/reset-password?error=${encodeURIComponent("Password must be at least 6 characters.")}`,
    );
  }
  if (password !== confirmPassword) {
    redirect(`/login/reset-password?error=${encodeURIComponent("Passwords don't match.")}`);
  }

  let supabase;
  try {
    supabase = createAuthClient();
  } catch {
    redirect(`/login/reset-password?error=${encodeURIComponent(AUTH_NOT_CONFIGURED_MESSAGE)}`);
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    // Most commonly: the recovery link expired before the user finished
    // this form, so there's no session to update. Send them back to request
    // a fresh link rather than showing a dead-end error here.
    redirect(`/login/forgot-password?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/login?error=${encodeURIComponent("Password updated. Sign in with your new password.")}`);
}
