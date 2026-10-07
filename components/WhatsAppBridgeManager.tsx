"use client";

import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, Copy, Download, Link2, MessageCircleMore, RefreshCw, ShieldCheck, Unplug } from "lucide-react";
import type { Client, Profile, WhatsAppBridgeHealth, WhatsAppClientLink } from "@/lib/types";
import { cn } from "@/lib/utils";

type Draft = {
  chatKey: string;
  chatLabel: string;
  phone: string;
  isEnabled: boolean;
  accessUserIds: string[];
};

function healthText(health: WhatsAppBridgeHealth) {
  if (health.state === "online") return "Online · WhatsApp Web connected";
  if (health.state === "problem") return health.lastError || "Bridge needs attention";
  if (health.state === "not_linked") return "Extension not linked";
  return "Extension linked but currently offline";
}

export function WhatsAppBridgeManager({
  clients,
  members,
  initialLinks,
  initialHealth,
}: {
  clients: Client[];
  members: Profile[];
  initialLinks: WhatsAppClientLink[];
  initialHealth: WhatsAppBridgeHealth;
}) {
  const linksByClient = useMemo(() => new Map(initialLinks.map((link) => [link.clientId, link])), [initialLinks]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(clients.map((client) => {
      const link = linksByClient.get(client.id);
      return [client.id, {
        chatKey: link?.chatKey || "",
        chatLabel: link?.chatLabel || client.name || client.company || "",
        phone: link?.phone || client.phone || "",
        isEnabled: link?.isEnabled ?? true,
        accessUserIds: link?.accessUserIds || [],
      }];
    })),
  );
  const [health, setHealth] = useState(initialHealth);
  const [pairingCode, setPairingCode] = useState("");
  const [pairExpiresAt, setPairExpiresAt] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  async function refreshHealth() {
    const response = await fetch("/api/admin/whatsapp-bridge/status", { cache: "no-store" });
    if (!response.ok) return;
    setHealth(await response.json());
  }

  function draftFor(clientId: string): Draft {
    return drafts[clientId] ?? {
      chatKey: "",
      chatLabel: "",
      phone: "",
      isEnabled: true,
      accessUserIds: [],
    };
  }

  function updateDraft(clientId: string, patch: Partial<Draft>) {
    setDrafts((current) => {
      const base = current[clientId] ?? {
        chatKey: "",
        chatLabel: "",
        phone: "",
        isEnabled: true,
        accessUserIds: [],
      };
      return {
        ...current,
        [clientId]: { ...base, ...patch },
      };
    });
  }

  function toggleAccess(clientId: string, userId: string) {
    const draft = draftFor(clientId);
    const next = draft.accessUserIds.includes(userId)
      ? draft.accessUserIds.filter((id) => id !== userId)
      : [...draft.accessUserIds, userId];
    updateDraft(clientId, { accessUserIds: next });
  }

  function generatePairingCode() {
    setMessage("");
    startTransition(async () => {
      const response = await fetch("/api/admin/whatsapp-bridge/pairing", { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error || "Could not create pairing code.");
        return;
      }
      setPairingCode(data.pairingCode || "");
      setPairExpiresAt(data.expiresAt || "");
    });
  }

  function saveClient(clientId: string) {
    setMessage("");
    const draft = draftFor(clientId);
    startTransition(async () => {
      const response = await fetch("/api/admin/whatsapp-bridge/configure", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, ...draft }),
      });
      const data = await response.json();
      setMessage(response.ok ? "Client WhatsApp mapping saved." : (data.error || "Could not save mapping."));
    });
  }

  function revokeBridge() {
    if (!window.confirm("Disconnect all currently paired WhatsApp Bridge extensions?")) return;
    startTransition(async () => {
      const response = await fetch("/api/admin/whatsapp-bridge/revoke", { method: "POST" });
      if (response.ok) {
        setPairingCode("");
        await refreshHealth();
      }
    });
  }

  return (
    <div className="space-y-5">
      <section className="rounded-xl2 border border-base-700/60 bg-base-850 p-4 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-500/10 text-emerald-300"><MessageCircleMore size={20} /></span>
            <div>
              <h2 className="text-sm font-semibold text-neutral-100">Bridge Extension</h2>
              <p className="mt-1 text-xs text-neutral-600">{healthText(health)}</p>
              {health.deviceLabel && <p className="mt-0.5 text-[10px] text-neutral-600">{health.deviceLabel}</p>}
            </div>
          </div>
          <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-semibold", health.state === "online" ? "bg-emerald-500/10 text-emerald-300" : health.state === "problem" ? "bg-rose-500/10 text-rose-300" : "bg-base-700 text-neutral-400")}>
            {health.state.replace("_", " ")}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <a href="/downloads/freelance-hq-whatsapp-bridge.zip" className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-base-950 hover:bg-emerald-400">
            <Download size={13} /> Download Extension
          </a>
          <button type="button" onClick={generatePairingCode} disabled={isPending} className="inline-flex items-center gap-1.5 rounded-lg border border-base-700 bg-base-900 px-3 py-2 text-xs font-semibold text-neutral-200 hover:border-base-600">
            <Link2 size={13} /> Generate Pairing Code
          </button>
          <button type="button" onClick={() => void refreshHealth()} className="inline-flex items-center gap-1.5 rounded-lg border border-base-700 bg-base-900 px-3 py-2 text-xs font-semibold text-neutral-400">
            <RefreshCw size={13} /> Refresh
          </button>
          {health.state !== "not_linked" && (
            <button type="button" onClick={revokeBridge} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/25 bg-rose-500/5 px-3 py-2 text-xs font-semibold text-rose-300">
              <Unplug size={13} /> Revoke Bridge
            </button>
          )}
        </div>

        {pairingCode && (
          <div className="mt-4 rounded-xl border border-base-700/60 bg-base-950/45 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-600">One-time pairing code</p>
              <button type="button" onClick={() => navigator.clipboard.writeText(pairingCode)} className="inline-flex items-center gap-1 text-[10px] font-semibold text-accent-300"><Copy size={11} /> Copy</button>
            </div>
            <textarea readOnly value={pairingCode} rows={3} className="mt-2 w-full resize-none rounded-lg border border-base-700 bg-base-900 p-2 font-mono text-[10px] text-neutral-300 outline-none" />
            <p className="mt-1 text-[9px] text-neutral-600">Expires {pairExpiresAt ? new Date(pairExpiresAt).toLocaleTimeString() : "soon"}. Paste the full code into the WhatsApp Bridge extension.</p>
          </div>
        )}
        {message && <p className="mt-3 text-xs text-neutral-400">{message}</p>}
      </section>

      <section className="rounded-xl2 border border-base-700/60 bg-base-850 shadow-card">
        <div className="border-b border-base-700/50 px-4 py-3">
          <div className="flex items-center gap-2"><ShieldCheck size={15} className="text-accent-400" /><h2 className="text-sm font-semibold text-neutral-100">Client Mapping & Team Access</h2></div>
          <p className="mt-1 text-xs text-neutral-600">Only clients enabled here can be read/sent by the bridge. Grant access only to team members who should chat with that client.</p>
        </div>
        <div className="divide-y divide-base-700/40">
          {clients.map((client) => {
            const draft = draftFor(client.id);
            return (
              <div key={client.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-neutral-200">{client.name || client.company}</p>
                    <p className="mt-0.5 text-[10px] text-neutral-600">{client.company || client.phone || "Client"}</p>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-neutral-400">
                    <input type="checkbox" checked={draft.isEnabled} onChange={(event) => updateDraft(client.id, { isEnabled: event.target.checked })} />
                    Enabled
                  </label>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  <input value={draft.chatLabel} onChange={(event) => updateDraft(client.id, { chatLabel: event.target.value })} placeholder="WhatsApp chat name, e.g. James" className="rounded-lg border border-base-700 bg-base-900 px-3 py-2 text-xs text-neutral-200 outline-none focus:border-accent-500" />
                  <input value={draft.phone} onChange={(event) => updateDraft(client.id, { phone: event.target.value })} placeholder="Phone, e.g. +44…" className="rounded-lg border border-base-700 bg-base-900 px-3 py-2 text-xs text-neutral-200 outline-none focus:border-accent-500" />
                  <input value={draft.chatKey} onChange={(event) => updateDraft(client.id, { chatKey: event.target.value })} placeholder="Optional exact search key" className="rounded-lg border border-base-700 bg-base-900 px-3 py-2 text-xs text-neutral-200 outline-none focus:border-accent-500" />
                </div>
                <div className="mt-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-600">Team members allowed to chat</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {members.filter((member) => member.role !== "admin").map((member) => {
                      const active = draft.accessUserIds.includes(member.id);
                      return (
                        <button key={member.id} type="button" onClick={() => toggleAccess(client.id, member.id)} className={cn("rounded-full border px-2.5 py-1 text-[10px] font-semibold", active ? "border-accent-500/40 bg-accent-500/10 text-accent-300" : "border-base-700 bg-base-900 text-neutral-500")}>
                          {active && <CheckCircle2 size={10} className="mr-1 inline" />}{member.name || member.email}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <button type="button" onClick={() => saveClient(client.id)} disabled={isPending} className="mt-3 rounded-lg bg-accent-500 px-3 py-2 text-xs font-semibold text-base-950 disabled:opacity-50">
                  Save {client.name || client.company}
                </button>
              </div>
            );
          })}
          {clients.length === 0 && <p className="p-8 text-center text-sm text-neutral-600">Add clients first, then map their WhatsApp chats here.</p>}
        </div>
      </section>
    </div>
  );
}
