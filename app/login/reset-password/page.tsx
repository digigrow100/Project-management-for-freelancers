import { Leaf } from "lucide-react";
import { updatePasswordAction } from "../actions";

export default function ResetPasswordPage({ searchParams }: { searchParams: { error?: string } }) {
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

        <form action={updatePasswordAction} className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">New password</label>
            <input
              name="password"
              type="password"
              required
              minLength={6}
              autoFocus
              placeholder="••••••••"
              className="w-full rounded-md border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">Confirm password</label>
            <input
              name="confirmPassword"
              type="password"
              required
              minLength={6}
              placeholder="••••••••"
              className="w-full rounded-md border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
            />
          </div>

          {searchParams.error && (
            <p className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {searchParams.error}
            </p>
          )}

          <button
            type="submit"
            className="mt-2 rounded-lg bg-accent-500 py-2.5 text-sm font-semibold text-base-950 hover:bg-accent-400 shadow-glow"
          >
            Update password
          </button>
        </form>
      </div>
    </div>
  );
}
