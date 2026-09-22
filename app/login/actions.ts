"use server";

import { redirect } from "next/navigation";
import { createAuthClient } from "@/lib/supabase/server";

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
