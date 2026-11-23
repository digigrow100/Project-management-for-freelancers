import Link from "next/link";
import { Leaf } from "lucide-react";
import { NewPasswordForm } from "../auth-forms";
import { createAuthClient } from "@/lib/supabase/server";
import { requireAdminNetworkForUser } from "@/lib/security/adminNetwork";
import { redirect } from "next/navigation";

export default async function ResetPasswordPage({ searchParams: queryParams }: { searchParams: Promise<{ error?: string }> }) {
  const searchParams = await queryParams;
  const auth = await createAuthClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) redirect("/login/forgot-password?error=" + encodeURIComponent("Open the reset link from your email, or request a new one."));
  await requireAdminNetworkForUser(user.id);
  if (user.factors?.some(factor => factor.status === "verified")) {
    const level = await auth.auth.mfa.getAuthenticatorAssuranceLevel();
    if (level.error) throw new Error("Security verification is temporarily unavailable. Try again later.");
    if (level.data?.currentLevel !== "aal2") redirect("/login/security?next=%2Flogin%2Freset-password");
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-base-950 px-4">
      <div className="w-full max-w-sm rounded-xl2 border border-base-700/60 bg-base-850 p-6 shadow-card">
        <div className="mb-6 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-500/15 text-accent-400">
            <Leaf size={18} />
          </span>
          <span className="text-lg font-semibold text-neutral-100">Freelance HQ</span>
        </div>

        <h1 className="mb-1 text-sm font-semibold text-neutral-100">Choose a new password</h1>
        <p className="mb-4 text-xs text-neutral-400">
          You followed a password reset link. Set a new password below to finish.
        </p>

        <NewPasswordForm serverError={searchParams.error} />

        <Link
          href="/login/forgot-password"
          className="mt-4 block text-center text-xs text-neutral-400 hover:text-neutral-200"
        >
          Link expired? Request a new one
        </Link>
      </div>
    </div>
  );
}
