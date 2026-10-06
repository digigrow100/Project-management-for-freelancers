"use client";

import { useState } from "react";
import { Check, Chrome, Copy, Link2 } from "lucide-react";

export function ExtensionConnectCard() {
  const [code, setCode] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  async function createCode() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/extension/pairing/create", { method: "POST" });
      const data = (await response.json()) as { pairingCode?: string; expiresAt?: string; error?: string };
      if (!response.ok || !data.pairingCode) throw new Error(data.error || "Could not create pairing code.");
      setCode(data.pairingCode);
      setExpiresAt(data.expiresAt || "");
      setCopied(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create pairing code.");
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="rounded-xl2 border border-sky-500/20 bg-base-850 p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-500/10 text-sky-300">
            <Chrome size={20} />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-neutral-100">Chrome Extension</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-neutral-500">
              Pair this browser with your signed-in employee account. The extension never asks you to select your name.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={createCode}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-400 disabled:opacity-60"
        >
          <Link2 size={14} />
          {busy ? "Creating…" : "Connect Chrome Extension"}
        </button>
      </div>

      {error && <p className="mt-3 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</p>}

      {code && (
        <div className="mt-4 rounded-xl border border-base-700/60 bg-base-900/60 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-600">One-time pairing code</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <code className="min-w-0 flex-1 break-all rounded-lg border border-base-700 bg-base-950/60 px-3 py-2 text-[11px] text-neutral-300">
              {code}
            </code>
            <button
              type="button"
              onClick={copyCode}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-base-600 px-3 py-2 text-xs font-medium text-neutral-300 hover:text-neutral-100"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="mt-2 text-[10px] text-neutral-600">
            Paste this code into the extension popup. It expires in about 10 minutes and works once only.
            {expiresAt ? " Expires " + new Date(expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + "." : ""}
          </p>
        </div>
      )}
    </section>
  );
}
