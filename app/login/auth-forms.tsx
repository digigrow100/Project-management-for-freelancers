"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { requestPasswordResetAction, updatePasswordAction } from "./actions";

function PendingButton({ idle, busy, locked = false }: { idle: string; busy: string; locked?: boolean }) {
  const { pending } = useFormStatus();
  const waiting = pending || locked;
  return (
    <button
      type="submit"
      disabled={waiting}
      aria-busy={waiting}
      // Keep the click on the button when a focused field blurs and the
      // on-screen keyboard closes. Without this, the first tap can land
      // nowhere and the control looks dead.
      onMouseDown={(event) => event.preventDefault()}
      className="mt-2 cursor-pointer rounded-lg bg-accent-500 py-2.5 text-sm font-semibold text-base-950 shadow-glow hover:bg-accent-400 disabled:cursor-wait disabled:opacity-70"
    >
      {waiting ? busy : idle}
    </button>
  );
}

function FormMessage({ message, tone }: { message?: string | null; tone: "error" | "status" }) {
  if (!message) return null;
  const error = tone === "error";
  return (
    <p
      role={error ? "alert" : "status"}
      className={
        error
          ? "rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300"
          : "rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300"
      }
    >
      {message}
    </p>
  );
}

function emailProblem(value: string): string | null {
  const email = value.trim();
  if (!email) return "Enter your email address.";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "Enter a valid email address.";
  }
  return null;
}

export function PasswordResetRequestForm({ serverError }: { serverError?: string }) {
  const [localError, setLocalError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const held = useRef(false);
  return (
    <form
      action={requestPasswordResetAction}
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        if (held.current) {
          event.preventDefault();
          return;
        }
        const input = event.currentTarget.elements.namedItem("email");
        const email = input instanceof HTMLInputElement ? input.value.trim() : "";
        if (input instanceof HTMLInputElement) input.value = email;
        const problem = emailProblem(email);
        if (problem) {
          event.preventDefault();
          setLocalError(problem);
          return;
        }
        setLocalError(null);
        // Disable before the server action's pending flag flips, so a second
        // click or Enter cannot send another reset and spend a rate-limit slot.
        held.current = true;
        setLocked(true);
        const button = event.currentTarget.querySelector("button[type=submit]");
        if (button instanceof HTMLButtonElement) {
          button.disabled = true;
          button.setAttribute("aria-busy", "true");
          button.textContent = "Sending reset link…";
        }
      }}
    >
      <div>
        <label htmlFor="reset-email" className="mb-1 block text-xs font-medium text-neutral-400">
          Email
        </label>
        <input
          id="reset-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          autoFocus
          placeholder="you@example.com"
          onFocus={(event) => {
            event.currentTarget.form?.querySelector<HTMLButtonElement>("button[type=submit]")?.scrollIntoView({ block: "nearest" });
          }}
          className="w-full rounded-md border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
        />
      </div>
      <FormMessage message={localError || serverError} tone="error" />
      <PendingButton idle="Send reset link" busy="Sending reset link…" locked={locked} />
    </form>
  );
}

export function PasswordResetSent() {
  return (
    <FormMessage
      tone="status"
      message="If that email has an account, a reset link is on its way. Check your inbox."
    />
  );
}

export function NewPasswordForm({ serverError }: { serverError?: string }) {
  const [localError, setLocalError] = useState<string | null>(null);
  return (
    <form
      action={updatePasswordAction}
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        const data = new FormData(event.currentTarget);
        const password = String(data.get("password") ?? "");
        const confirmPassword = String(data.get("confirmPassword") ?? "");
        if (password.length < 12 || password.length > 128) {
          event.preventDefault();
          setLocalError("Password must be between 12 and 128 characters.");
          return;
        }
        if (password !== confirmPassword) {
          event.preventDefault();
          setLocalError("Passwords don't match.");
          return;
        }
        setLocalError(null);
      }}
    >
      <div>
        <label htmlFor="new-password" className="mb-1 block text-xs font-medium text-neutral-400">
          New password
        </label>
        <input
          id="new-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={128}
          autoFocus
          placeholder="••••••••"
          className="w-full rounded-md border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
        />
      </div>
      <div>
        <label htmlFor="confirm-password" className="mb-1 block text-xs font-medium text-neutral-400">
          Confirm password
        </label>
        <input
          id="confirm-password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={128}
          placeholder="••••••••"
          className="w-full rounded-md border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
        />
      </div>
      <FormMessage message={localError || serverError} tone="error" />
      <PendingButton idle="Update password" busy="Updating password…" />
    </form>
  );
}
