"use client";

import extensionManifest from "@/chrome-extension/manifest.json";

import { useState } from "react";
import { Check, Chrome, Copy, Link2, Plus } from "lucide-react";

type PairingCode = {
  pairingCode: string;
  expiresAt: string;
};

export function ExtensionConnectCard() {
  const [codes, setCodes] = useState<PairingCode[]>([]);
  const [busy, setBusy] = useState(false);
  const [copiedCode, setCopiedCode] = useState("");
  const [error, setError] = useState("");

  async function createCode() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/extension/pairing/create", { method: "POST" });
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error("Pairing service returned an unexpected page. Refresh this app and try again.");
      }

      const data = (await response.json()) as { pairingCode?: string; expiresAt?: string; error?: string };
      if (!response.ok || !data.pairingCode) throw new Error(data.error || "Could not create pairing code.");

      setCodes((current) => [
        ...current,
        {
          pairingCode: data.pairingCode as string,
          expiresAt: data.expiresAt || "",
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create pairing code.");
    } finally {
      setBusy(false);
    }
  }

  async function copyCode(code: string) {
    await navigator.clipboard.writeText(code);
    setCopiedCode(code);
    window.setTimeout(() => {
      setCopiedCode((current) => (current === code ? "" : current));
    }, 2000);
  }

  return (
    <section className="rounded-xl2 border border-sky-500/20 bg-base-850 p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-500/10 text-sky-300">
            <Chrome size={20} />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-neutral-100">Chrome Extension <span className="text-xs font-normal text-sky-300">v{extensionManifest.version}</span></h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-neutral-500">
              Pair each Chrome profile separately with this signed-in account. Use a different one-time code for every profile; all paired profiles still report work under the same user.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={createCode}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-400 disabled:opacity-60"
        >
          {codes.length > 0 ? <Plus size={14} /> : <Link2 size={14} />}
          {busy ? "Creating…" : codes.length > 0 ? "Add another Chrome profile" : "Connect Chrome Extension"}
        </button>
      </div>

      {error && <p className="mt-3 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</p>}

      {codes.length > 0 && (
        <div className="mt-4 space-y-3">
          {codes.map((item, index) => {
            const copied = copiedCode === item.pairingCode;
            return (
              <div key={item.pairingCode} className="rounded-xl border border-base-700/60 bg-base-900/60 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-600">
                    Chrome profile {index + 1} · one-time pairing code
                  </p>
                  <span className="text-[10px] text-neutral-600">Use once</span>
                </div>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <code className="min-w-0 flex-1 break-all rounded-lg border border-base-700 bg-base-950/60 px-3 py-2 text-[11px] text-neutral-300">
                    {item.pairingCode}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyCode(item.pairingCode)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-base-600 px-3 py-2 text-xs font-medium text-neutral-300 hover:text-neutral-100"
                  >
                    {copied ? <Check size={13} /> : <Copy size={13} />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <p className="mt-2 text-[10px] text-neutral-600">
                  Paste this code into one Chrome profile only. It expires in about 10 minutes.
                  {item.expiresAt ? " Expires " + new Date(item.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + "." : ""}
                </p>
              </div>
            );
          })}
          <p className="text-[10px] leading-4 text-neutral-600">
            Creating another code does not invalidate the unused codes above. Each profile gets its own device identity, while work totals remain attached to the same signed-in user.
          </p>
        </div>
      )}
    </section>
  );
}
