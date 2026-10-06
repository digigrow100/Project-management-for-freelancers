"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Chrome, Download, Link2, X } from "lucide-react";
import type { ExtensionHealth } from "@/lib/types";

export function ExtensionHealthBanner() {
  const [health, setHealth] = useState<ExtensionHealth | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);

  async function refresh() {
    try {
      const response = await fetch("/api/extension/status", { cache: "no-store" });
      if (!response.ok) return;
      setHealth((await response.json()) as ExtensionHealth);
    } catch {
      // Keep previous state.
    }
  }

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 30000);
    return () => window.clearInterval(id);
  }, []);

  if (!health || health.state === "online" || hidden) return null;

  async function createPairingCode() {
    setBusy(true);
    try {
      const response = await fetch("/api/extension/pairing/create", { method: "POST" });
      const data = (await response.json()) as { pairingCode?: string };
      if (data.pairingCode) {
        setCode(data.pairingCode);
        await navigator.clipboard.writeText(data.pairingCode).catch(() => undefined);
      }
    } finally {
      setBusy(false);
    }
  }

  const missing = health.state === "not_linked";

  return (
    <div className={missing ? "mb-4 rounded-xl border border-sky-500/25 bg-sky-500/5 p-3" : "mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3"}>
      <div className="flex flex-wrap items-center gap-3">
        <span className={missing ? "grid h-9 w-9 place-items-center rounded-lg bg-sky-500/10 text-sky-300" : "grid h-9 w-9 place-items-center rounded-lg bg-amber-500/10 text-amber-300"}>
          {missing ? <Chrome size={17} /> : <AlertTriangle size={17} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-neutral-100">{missing ? "Chrome Extension Not Linked" : "Chrome Extension Problem Detected"}</p>
          <p className="mt-0.5 text-xs text-neutral-500">
            {missing ? "Install the employee extension, then connect it to this account." : health.problem}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {missing && (
            <a href="/downloads/freelance-hq-chrome-extension.zip" download className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-400">
              <Download size={13} />
              Download Chrome Extension
            </a>
          )}
          <button type="button" onClick={createPairingCode} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-base-600 bg-base-900 px-3 py-2 text-xs font-semibold text-neutral-300">
            <Link2 size={13} />
            {busy ? "Creating…" : missing ? "Connect" : "Reconnect"}
          </button>
          <button type="button" onClick={() => setHidden(true)} className="rounded-lg p-2 text-neutral-600 hover:text-neutral-300" aria-label="Dismiss extension notice">
            <X size={14} />
          </button>
        </div>
      </div>
      {code && (
        <div className="mt-3 rounded-lg border border-base-700 bg-base-900/70 p-2.5">
          <div className="flex items-center gap-2 text-[10px] font-semibold text-emerald-300">
            <CheckCircle2 size={12} /> Pairing code copied to clipboard
          </div>
          <code className="mt-1 block break-all text-[10px] text-neutral-500">{code}</code>
        </div>
      )}
    </div>
  );
}
