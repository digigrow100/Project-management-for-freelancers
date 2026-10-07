"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Download, ExternalLink, MessageCircleMore } from "lucide-react";
import type { WhatsAppBridgeHealth } from "@/lib/types";

function statusLabel(health: WhatsAppBridgeHealth) {
  if (health.state === "online") return "Online";
  if (health.state === "problem") return "Problem";
  if (health.state === "not_linked") return "Not linked";
  return "Offline";
}

export function WhatsAppBridgeAdminCard({ initialHealth }: { initialHealth: WhatsAppBridgeHealth }) {
  const [health, setHealth] = useState(initialHealth);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const response = await fetch("/api/admin/whatsapp-bridge/status", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as WhatsAppBridgeHealth;
        if (!cancelled) setHealth(data);
      } catch {
        // Keep last known state.
      }
    }
    const id = window.setInterval(refresh, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const online = health.state === "online";
  return (
    <section className="rounded-xl2 border border-base-700/60 bg-base-850 p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/10 text-emerald-300">
            <MessageCircleMore size={18} />
          </span>
          <div>
            <p className="text-sm font-semibold text-neutral-100">WhatsApp Client Bridge</p>
            <p className="mt-0.5 text-xs text-neutral-600">Relay approved client chats through your WhatsApp Web.</p>
          </div>
        </div>
        <span className={online ? "rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-300" : health.state === "problem" ? "rounded-full bg-rose-500/10 px-2.5 py-1 text-[10px] font-semibold text-rose-300" : "rounded-full bg-base-700 px-2.5 py-1 text-[10px] font-semibold text-neutral-400"}>
          {statusLabel(health)}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <a href="/downloads/freelance-hq-whatsapp-bridge.zip" className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-base-950 hover:bg-emerald-400">
          <Download size={13} /> Download WhatsApp Extension
        </a>
        <Link href="/admin/whatsapp-bridge" className="inline-flex items-center gap-1.5 rounded-lg border border-base-700 bg-base-900 px-3 py-2 text-xs font-semibold text-neutral-300 hover:border-base-600">
          Manage Bridge <ExternalLink size={12} />
        </Link>
      </div>
      {health.lastError && <p className="mt-2 text-[10px] text-rose-300">{health.lastError}</p>}
    </section>
  );
}
