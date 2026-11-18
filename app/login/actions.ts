"use server";
import {assertAdminNetworkForUser,AdminNetworkDenied,requireAdminNetworkForUser} from "@/lib/security/adminNetwork";
import { limitSignIn, rateLimit, SecurityCheckUnavailable } from "@/lib/security/rateLimit";
import {cookies} from "next/headers";
import {MEMBER_VIEW_COOKIE} from "@/lib/memberView";

import { redirect, unstable_rethrow } from "next/navigation";
import { createAuthClient } from "@/lib/supabase/server";
import { getSiteOrigin } from "@/lib/site";

const AUTH_NOT_CONFIGURED_MESSAGE =
  "Sign-in isn't configured yet. Check that SUPABASE_URL and SUPABASE_ANON_KEY are set.";

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || email.length>254 || !password || password.length>1024) {
    redirect(`/login?error=${encodeURIComponent("Email and password are required.")}`);
  }

  try {
    await limitSignIn("login", email);
  } catch (error) {
    const message = error instanceof SecurityCheckUnavailable
      ? "Sign-in is temporarily unavailable. Please try again later."
      : "Too many sign-in attempts. Please wait before trying again.";
    redirect("/login?error=" + encodeURIComponent(message));
  }

  let supabase;
  try {
    supabase = await createAuthClient();
  } catch {
    redirect(`/login?error=${encodeURIComponent(AUTH_NOT_CONFIGURED_MESSAGE)}`);
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent("Sign-in failed. Check your details and try again.")}`);
  }

  try {
    if(!data.user)throw new Error("Missing authenticated user.");
    await assertAdminNetworkForUser(data.user.id);
  } catch(error) {
    await supabase.auth.signOut();
    if(error instanceof AdminNetworkDenied)redirect("/login/network-restricted");
    redirect("/login?error="+encodeURIComponent("Sign-in is temporarily unavailable. Please try again later."));
  }
  redirect("/");
}

export async function logoutAction() {
  (await cookies()).delete(MEMBER_VIEW_COOKIE);
  (await cookies()).delete("fhq_hosting_client_view");
  try {
    const supabase = await createAuthClient();
    await supabase.auth.signOut();
  } catch {
    // Auth not configured — nothing to sign out of.
  }
  redirect("/login");
}

export async function requestPasswordResetAction(formData: FormData) {
  try {
    const email = String(formData.get("email") ?? "").trim();

    if (!email || email.length>254) {
      redirect(`/login/forgot-password?error=${encodeURIComponent("Email is required.")}`);
    }

    try {
      await limitSignIn("reset", email);
    } catch (error) {
      const message = error instanceof SecurityCheckUnavailable
        ? "Password reset is temporarily unavailable. Please try again later."
        : "Please wait before requesting another reset link.";
      redirect("/login/forgot-password?error=" + encodeURIComponent(message));
    }

    let supabase;
    try {
      supabase = await createAuthClient();
    } catch {
      redirect(`/login/forgot-password?error=${encodeURIComponent(AUTH_NOT_CONFIGURED_MESSAGE)}`);
    }

    const redirectTo = `${await getSiteOrigin()}/auth/confirm?next=${encodeURIComponent("/login/reset-password")}`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

    // Supabase doesn't error for an unknown email (to avoid leaking which
    // addresses have accounts), so a generic "check your inbox" message here is
    // accurate for both the real and the no-such-account case. Only a genuine
    // failure (bad email format, rate limit, misconfiguration) surfaces below.
    if (error) {
      redirect(`/login/forgot-password?error=${encodeURIComponent("Could not complete this request. Please try again later.")}`);
    }

    redirect("/login/forgot-password?sent=1");
  } catch (error) {
    unstable_rethrow(error);
    redirect(`/login/forgot-password?error=${encodeURIComponent("Could not complete this request. Please try again later.")}`);
  }
}

export async function updatePasswordAction(formData: FormData) {
  try {
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    if (!password || password.length < 12 || password.length > 128) {
      redirect(
        `/login/reset-password?error=${encodeURIComponent("Password must be between 12 and 128 characters.")}`,
      );
    }
    if (password !== confirmPassword) {
      redirect(`/login/reset-password?error=${encodeURIComponent("Passwords don't match.")}`);
    }

    let supabase;
    try {
      supabase = await createAuthClient();
    } catch {
      redirect(`/login/reset-password?error=${encodeURIComponent(AUTH_NOT_CONFIGURED_MESSAGE)}`);
    }

    const {data:{user}}=await supabase.auth.getUser();
    if(!user)redirect(`/login/reset-password?error=${encodeURIComponent("Open the reset link from your email, then choose a new password.")}`);
    await requireAdminNetworkForUser(user.id);
    try {await rateLimit("password",user.id,5,900);} catch {redirect("/login/reset-password?error="+encodeURIComponent("Please wait before changing your password again."));}

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      // Keep them on this form — the recovery session is usually still valid
      // (this is often just a password-policy rejection), so bouncing to
      // "request a new link" would throw away a perfectly good session along
      // with whatever they'd already typed.
      redirect(`/login/reset-password?error=${encodeURIComponent("Could not complete this request. Please try again later.")}`);
    }

    // The recovery link signs the user in at the first assurance level. Save
    // the password before asking for an authenticator, then send them to
    // verify it. The authenticator itself is left in place.
    if(user.factors?.some(factor=>factor.status==="verified")){
      const level=await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if(level.error||level.data?.currentLevel!=="aal2")redirect("/login/security");
    }

    // verifyOtp already signed them in via the recovery link, so they're
    // authenticated now — middleware would bounce a plain "/login" redirect
    // straight to "/" anyway, silently dropping any message set here.
    redirect("/");
  } catch (error) {
    unstable_rethrow(error);
    redirect(`/login/reset-password?error=${encodeURIComponent("Could not complete this request. Please try again later.")}`);
  }
}
