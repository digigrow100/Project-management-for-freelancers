import Link from "next/link";
import { Leaf } from "lucide-react";
import { PasswordResetRequestForm, PasswordResetSent } from "../auth-forms";

export default async function ForgotPasswordPage({
  searchParams: queryParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const searchParams = await queryParams;
  return (
    <div className="flex min-h-screen items-center justify-center bg-base-950 px-4">
      <div className="w-full max-w-sm rounded-xl2 border border-base-700/60 bg-base-850 p-6 shadow-card">
        <div className="mb-6 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-500/15 text-accent-400">
            <Leaf size={18} />
          </span>
          <span className="text-lg font-semibold text-neutral-100">Freelance HQ</span>
        </div>

        <h1 className="mb-1 text-sm font-semibold text-neutral-100">Reset your password</h1>
        <p className="mb-4 text-xs text-neutral-400">
          Enter your email and we&apos;ll send you a link to set a new password.
        </p>

        {searchParams.sent ? (
          <PasswordResetSent />
        ) : (
          <PasswordResetRequestForm serverError={searchParams.error} />
        )}

        <Link
          href="/login"
          className="mt-4 block text-center text-xs text-neutral-400 hover:text-neutral-200"
        >
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
