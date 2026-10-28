import Link from "next/link";
import { Leaf } from "lucide-react";
import { loginAction } from "./actions";
import { headers } from "next/headers";
import { isHostingPortalHost } from "@/lib/hosting/portalHost";

export default function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  const hosting = isHostingPortalHost(headers().get("host"));
  return (
    <div className="flex min-h-screen items-center justify-center bg-base-950 px-4">
      <div className="w-full max-w-sm rounded-xl2 border border-base-700/60 bg-base-850 p-6 shadow-card">
        <div className="mb-6 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-500/15 text-accent-400">
            <Leaf size={18} />
          </span>
          <span className="text-lg font-semibold text-neutral-100">{hosting ? "HouseMySite" : "Freelance HQ"}</span>
        </div>

        <form action={loginAction} className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">Email</label>
            <input
              name="email"
              type="email"
              required
              autoFocus
              placeholder="you@example.com"
              className="w-full rounded-md border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
            />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-xs font-medium text-neutral-400">Password</label>
              <Link href="/login/forgot-password" className="text-xs text-accent-400 hover:text-accent-300">
                Forgot password?
              </Link>
            </div>
            <input
              name="password"
              type="password"
              required
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
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
