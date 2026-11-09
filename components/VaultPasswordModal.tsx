"use client";

import { useState, useTransition } from "react";
import { KeyRound, X } from "lucide-react";
import { setVaultPasswordAction } from "@/lib/actions";

export function VaultPasswordModal({
  hasPassword,
  onClose,
  onSuccess,
}: {
  hasPassword: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    const current = String(formData.get("current") ?? "");
    const next = String(formData.get("next") ?? "");
    const confirm = String(formData.get("confirm") ?? "");

    if (next.length < 12) {
      setError("New password must be at least 12 characters.");
      return;
    }
    if (next !== confirm) {
      setError("New password and confirmation don't match.");
      return;
    }

    startTransition(async () => {
      const result = await setVaultPasswordAction(next, hasPassword ? current : null);
      if (result.ok) {
        onSuccess();
        return;
      }
      if (result.reason === "wrong_current_password") setError("Current security password is incorrect.");
      else if (result.reason === "too_short") setError("New password must be at least 12 characters.");
      else setError("Something went wrong. Please try again.");
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-10 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl2 border border-base-700/60 bg-base-850 p-5 shadow-card"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <KeyRound size={16} className="text-accent-400" />
            <p className="text-sm font-medium text-neutral-100">
              {hasPassword ? "Change security password" : "Set your security password"}
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-neutral-500 hover:bg-base-700/60 hover:text-neutral-300">
            <X size={16} />
          </button>
        </div>

        <p className="mb-4 text-xs text-neutral-500">
          This is separate from your login password. You&rsquo;ll be asked for it whenever you reveal a saved
          backlink credential, on this device or any other.
        </p>

        <form action={handleSubmit} className="flex flex-col gap-3">
          {hasPassword && (
            <div>
              <label className="mb-1 block text-[11px] text-neutral-500">Current security password</label>
              <input
                name="current"
                type="password"
                required
                className="w-full rounded-md border border-base-600 bg-base-950 px-2.5 py-1.5 text-sm text-neutral-100 focus:border-accent-500 focus:outline-none"
              />
            </div>
          )}
          <div>
            <label className="mb-1 block text-[11px] text-neutral-500">New security password</label>
            <input
              name="next"
              type="password"
              required
              minLength={12}
              maxLength={128}
              className="w-full rounded-md border border-base-600 bg-base-950 px-2.5 py-1.5 text-sm text-neutral-100 focus:border-accent-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-neutral-500">Confirm new password</label>
            <input
              name="confirm"
              type="password"
              required
              minLength={12}
              maxLength={128}
              className="w-full rounded-md border border-base-600 bg-base-950 px-2.5 py-1.5 text-sm text-neutral-100 focus:border-accent-500 focus:outline-none"
            />
          </div>

          {error && <p className="text-xs text-rose-400">{error}</p>}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="w-fit rounded-md bg-accent-500 px-3 py-1.5 text-xs font-medium text-base-950 hover:bg-accent-400 disabled:opacity-60"
            >
              {isPending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-fit rounded-md border border-base-600 px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-200"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
