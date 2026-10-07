"use client";

import { useMemo, useState, useTransition } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Copy,
  Download,
  Link2,
  MessageCircleMore,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  Unplug,
} from "lucide-react";
import type { Client, Profile, WhatsAppBridgeHealth, WhatsAppClientLink } from "@/lib/types";
import { cn } from "@/lib/utils";

type Draft = {
  chatKey: string;
  chatLabel: string;
  phone: string;
  isEnabled: boolean;
  accessUserIds: string[];
};

type ScannedChat = {
  chatKey: string;
  chatLabel: string;
  phone: string;
  secondary?: string;
  safeToMap?: boolean;
  warning?: string;
};

type HistoryMessage = {
  direction: "inbound" | "outbound";
  body: string;
  remoteMessageKey: string;
  remoteTimestamp: string | null;
};

type RequestState = {
  id: string;
  status: string;
  result?: { chats?: ScannedChat[]; messages?: HistoryMessage[]; sent?: boolean } | null;
  error?: string;
};

function healthText(health: WhatsAppBridgeHealth) {
  if (health.state === "online") return "Online · WhatsApp Web connected";
  if (health.state === "problem") return health.lastError || "Bridge needs attention";
  if (health.state === "not_linked") return "Extension not linked";
  return "Extension linked but currently offline";
}

function localDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dayRange(value: string) {
  const start = new Date(value + "T00:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

function chatIdentity(chat: { chatKey?: string; chatLabel?: string; phone?: string }) {
  const stableKey = String(chat.chatKey || "").trim();
  if (stableKey) return "key:" + stableKey;
  const phone = String(chat.phone || "").replace(/\D/g, "");
  if (phone) return "phone:" + phone;
  return "label:" + String(chat.chatLabel || "").trim().toLowerCase();
}

function historyTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
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
  const [activeTab, setActiveTab] = useState<"mapping" | "chats">("mapping");
  const [links, setLinks] = useState(initialLinks);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(initialLinks.map((link) => [link.clientId, {
      chatKey: link.chatKey,
      chatLabel: link.chatLabel,
      phone: link.phone,
      isEnabled: link.isEnabled,
      accessUserIds: link.accessUserIds,
    }])),
  );
  const [health, setHealth] = useState(initialHealth);
  const [pairingCode, setPairingCode] = useState("");
  const [pairExpiresAt, setPairExpiresAt] = useState("");
  const [message, setMessage] = useState("");
  const [scanQuery, setScanQuery] = useState("");
  const [scanResults, setScanResults] = useState<ScannedChat[]>([]);
  const [mappingChoice, setMappingChoice] = useState<Record<string, string>>({});
  const [directChats, setDirectChats] = useState<ScannedChat[]>([]);
  const [selectedChat, setSelectedChat] = useState<ScannedChat | null>(null);
  const [selectedDate, setSelectedDate] = useState(localDateValue());
  const [history, setHistory] = useState<HistoryMessage[]>([]);
  const [selectedHistoryKeys, setSelectedHistoryKeys] = useState<string[]>([]);
  const [shareUserId, setShareUserId] = useState("");
  const [directDraft, setDirectDraft] = useState("");
  const [isPending, startTransition] = useTransition();

  const memberOptions = useMemo(() => members.filter((member) => member.role !== "admin"), [members]);

  const mappedByIdentity = useMemo(() => {
    const map = new Map<string, WhatsAppClientLink>();
    for (const link of links) map.set(chatIdentity(link), link);
    return map;
  }, [links]);

  async function refreshHealth() {
    const response = await fetch("/api/admin/whatsapp-bridge/status", { cache: "no-store" });
    if (!response.ok) return;
    setHealth(await response.json());
  }

  function draftFor(link: WhatsAppClientLink): Draft {
    return drafts[link.clientId] ?? {
      chatKey: link.chatKey,
      chatLabel: link.chatLabel,
      phone: link.phone,
      isEnabled: link.isEnabled,
      accessUserIds: link.accessUserIds,
    };
  }

  function updateDraft(clientId: string, patch: Partial<Draft>) {
    setDrafts((current) => ({
      ...current,
      [clientId]: { ...(current[clientId] ?? {
        chatKey: "",
        chatLabel: "",
        phone: "",
        isEnabled: true,
        accessUserIds: [],
      }), ...patch },
    }));
  }

  function toggleAccess(link: WhatsAppClientLink, userId: string) {
    const draft = draftFor(link);
    const next = draft.accessUserIds.includes(userId)
      ? draft.accessUserIds.filter((id) => id !== userId)
      : [...draft.accessUserIds, userId];
    updateDraft(link.clientId, { accessUserIds: next });
  }

  async function createRequest(payload: Record<string, unknown>) {
    const response = await fetch("/api/admin/whatsapp-bridge/requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not send request to extension.");
    return String(data.id || "");
  }

  async function waitForRequest(id: string): Promise<RequestState> {
    for (let attempt = 0; attempt < 140; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 750));
      const response = await fetch("/api/admin/whatsapp-bridge/requests?id=" + encodeURIComponent(id), { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not read extension response.");
      if (data.status === "done" || data.status === "failed") return data as RequestState;
    }
    throw new Error("Extension did not respond in time. Keep WhatsApp Web open and try again.");
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

  function saveClient(link: WhatsAppClientLink) {
    setMessage("");
    const draft = draftFor(link);
    startTransition(async () => {
      const response = await fetch("/api/admin/whatsapp-bridge/configure", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId: link.clientId, ...draft }),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error || "Could not save mapping.");
        return;
      }
      setLinks((current) => current.map((item) => item.clientId === link.clientId
        ? { ...item, ...draft, accessUserIds: draft.accessUserIds }
        : item));
      setMessage("Mapping and team access saved. Old chat history is still hidden by default.");
    });
  }

  function removeMapping(link: WhatsAppClientLink) {
    if (!window.confirm("Remove this WhatsApp mapping? Team access will also be removed.")) return;
    startTransition(async () => {
      const response = await fetch("/api/admin/whatsapp-bridge/remove-mapping", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId: link.clientId }),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error || "Could not remove mapping.");
        return;
      }
      setLinks((current) => current.filter((item) => item.clientId !== link.clientId));
      setDrafts((current) => {
        const next = { ...current };
        delete next[link.clientId];
        return next;
      });
      setMessage("WhatsApp mapping removed.");
    });
  }

  function scanWhatsApp() {
    if (!scanQuery.trim()) return;
    setMessage("");
    startTransition(async () => {
      try {
        const id = await createRequest({ requestType: "scan", query: scanQuery.trim() });
        const request = await waitForRequest(id);
        if (request.status !== "done") throw new Error(request.error || "WhatsApp scan failed.");
        setScanResults(Array.isArray(request.result?.chats) ? request.result!.chats! : []);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "WhatsApp scan failed.");
      }
    });
  }

  function addScannedChat(chat: ScannedChat, index: number) {
    if (chat.safeToMap === false || !chat.chatKey) {
      setMessage(chat.warning || "This duplicate WhatsApp chat cannot be safely identified yet.");
      return;
    }
    const choiceKey = chat.chatLabel + "|" + chat.chatKey + "|" + index;
    const clientId = mappingChoice[choiceKey];
    if (!clientId) {
      setMessage("Choose which app client this WhatsApp chat belongs to.");
      return;
    }
    const client = clients.find((item) => item.id === clientId);
    if (!client) {
      setMessage("Choose which app client this WhatsApp chat belongs to.");
      return;
    }
    startTransition(async () => {
      const response = await fetch("/api/admin/whatsapp-bridge/configure", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          chatKey: chat.chatKey,
          chatLabel: chat.chatLabel,
          phone: chat.phone,
          isEnabled: true,
          accessUserIds: [],
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error || "Could not add mapping.");
        return;
      }
      const link: WhatsAppClientLink = {
        clientId,
        clientName: client.name || client.company || chat.chatLabel,
        company: client.company || "",
        clientPhone: client.phone || "",
        chatKey: chat.chatKey,
        chatLabel: chat.chatLabel,
        phone: chat.phone,
        isEnabled: true,
        accessUserIds: [],
      };
      setLinks((current) => [link, ...current.filter((item) => item.clientId !== clientId)]);
      setDrafts((current) => ({
        ...current,
        [clientId]: {
          chatKey: chat.chatKey,
          chatLabel: chat.chatLabel,
          phone: chat.phone,
          isEnabled: true,
          accessUserIds: [],
        },
      }));
      setScanResults((current) => current.filter((_, itemIndex) => itemIndex !== index));
      setMessage(chat.chatLabel + " mapped. No team member can see old chat history unless you share it.");
    });
  }

  function loadDirectChats(useSearch = false) {
    setMessage("");
    startTransition(async () => {
      try {
        const id = await createRequest(useSearch && scanQuery.trim()
          ? { requestType: "scan", query: scanQuery.trim() }
          : { requestType: "list_chats" });
        const request = await waitForRequest(id);
        if (request.status !== "done") throw new Error(request.error || "Could not load WhatsApp chats.");
        const chats = Array.isArray(request.result?.chats) ? request.result!.chats! : [];
        setDirectChats(chats);
        if (selectedChat) {
          const stillThere = chats.find((chat) => chat.chatLabel === selectedChat.chatLabel && chat.chatKey === selectedChat.chatKey);
          if (!stillThere) setSelectedChat(null);
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not load WhatsApp chats.");
      }
    });
  }

  function loadHistory() {
    if (!selectedChat) return;
    if (selectedChat.safeToMap === false || !selectedChat.chatKey) {
      setMessage(selectedChat.warning || "This WhatsApp chat cannot be safely identified for history loading.");
      return;
    }
    setMessage("");
    startTransition(async () => {
      try {
        const range = dayRange(selectedDate);
        const mapped = mappedByIdentity.get(chatIdentity(selectedChat));
        const id = await createRequest({
          requestType: "history",
          chatKey: selectedChat.chatKey,
          chatLabel: selectedChat.chatLabel,
          phone: selectedChat.phone,
          clientId: mapped?.clientId || null,
          dateFrom: range.from,
          dateTo: range.to,
        });
        const request = await waitForRequest(id);
        if (request.status !== "done") throw new Error(request.error || "Could not load chat history.");
        setHistory(Array.isArray(request.result?.messages) ? request.result!.messages! : []);
        setSelectedHistoryKeys([]);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not load chat history.");
      }
    });
  }

  function toggleHistory(key: string) {
    setSelectedHistoryKeys((current) => current.includes(key)
      ? current.filter((item) => item !== key)
      : [...current, key]);
  }

  function shareHistory(mode: "selected" | "day") {
    if (!selectedChat || !shareUserId) {
      setMessage("Choose a team member first.");
      return;
    }
    const mapped = mappedByIdentity.get(chatIdentity(selectedChat));
    if (!mapped) {
      setMessage("Map this WhatsApp chat to an app client before sharing it with the team.");
      return;
    }
    const range = dayRange(selectedDate);
    startTransition(async () => {
      const response = await fetch("/api/admin/whatsapp-bridge/share", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(mode === "selected"
          ? { clientId: mapped.clientId, userId: shareUserId, remoteMessageKeys: selectedHistoryKeys }
          : { clientId: mapped.clientId, userId: shareUserId, dateFrom: range.from, dateTo: range.to }),
      });
      const data = await response.json();
      setMessage(response.ok
        ? String(data.shared || 0) + " old message(s) shared. Other old messages stay hidden."
        : (data.error || "Could not share history."));
    });
  }

  function sendDirect() {
    if (!selectedChat || !directDraft.trim()) return;
    if (selectedChat.safeToMap === false || !selectedChat.chatKey) {
      setMessage(selectedChat.warning || "This WhatsApp chat cannot be safely identified for sending.");
      return;
    }
    const body = directDraft.trim();
    setDirectDraft("");
    startTransition(async () => {
      try {
        const id = await createRequest({
          requestType: "direct_send",
          chatKey: selectedChat.chatKey,
          chatLabel: selectedChat.chatLabel,
          phone: selectedChat.phone,
          payload: { body },
        });
        const request = await waitForRequest(id);
        if (request.status !== "done") throw new Error(request.error || "Message was not sent.");
        setMessage("Message sent through WhatsApp Web.");
      } catch (error) {
        setDirectDraft(body);
        setMessage(error instanceof Error ? error.message : "Message was not sent.");
      }
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
          <a href="https://github.com/digigrow100/Project-management-for-freelancers/archive/refs/heads/main.zip" className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-base-950 hover:bg-emerald-400">
            <Download size={13} /> Download Updated Source
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
            <p className="mt-1 text-[9px] text-neutral-600">Expires {pairExpiresAt ? new Date(pairExpiresAt).toLocaleTimeString() : "soon"}.</p>
          </div>
        )}
        {message && <p className="mt-3 text-xs text-neutral-400">{message}</p>}
      </section>

      <div className="flex gap-2 rounded-xl border border-base-700/60 bg-base-850 p-1.5">
        <button type="button" onClick={() => setActiveTab("mapping")} className={cn("rounded-lg px-3 py-2 text-xs font-semibold", activeTab === "mapping" ? "bg-accent-500 text-base-950" : "text-neutral-400 hover:bg-base-800")}>
          Client Mapping
        </button>
        <button type="button" onClick={() => setActiveTab("chats")} className={cn("rounded-lg px-3 py-2 text-xs font-semibold", activeTab === "chats" ? "bg-accent-500 text-base-950" : "text-neutral-400 hover:bg-base-800")}>
          My WhatsApp Chats
        </button>
      </div>

      {activeTab === "mapping" ? (
        <div className="space-y-5">
          <section className="rounded-xl2 border border-base-700/60 bg-base-850 p-4 shadow-card">
            <div className="flex items-center gap-2">
              <Search size={15} className="text-accent-400" />
              <div>
                <h2 className="text-sm font-semibold text-neutral-100">Scan WhatsApp by name</h2>
                <p className="mt-0.5 text-xs text-neutral-600">Nothing is added automatically. Search a name, then choose exactly which result to map.</p>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <input value={scanQuery} onChange={(event) => setScanQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && scanWhatsApp()} placeholder="Example: Mohsin" className="min-w-0 flex-1 rounded-lg border border-base-700 bg-base-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-accent-500" />
              <button type="button" onClick={scanWhatsApp} disabled={isPending || !scanQuery.trim()} className="rounded-lg bg-accent-500 px-4 py-2 text-xs font-semibold text-base-950 disabled:opacity-50">Scan</button>
            </div>

            {scanResults.length > 0 && (
              <div className="mt-4 divide-y divide-base-700/40 rounded-xl border border-base-700/60">
                {scanResults.map((chat, index) => {
                  const choiceKey = chat.chatLabel + "|" + chat.chatKey + "|" + index;
                  return (
                    <div key={choiceKey} className="grid gap-3 p-3 md:grid-cols-[1fr_240px_auto] md:items-center">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-neutral-200">{chat.chatLabel}</p>
                        <p className="mt-0.5 truncate text-[10px] text-neutral-600">{chat.phone || chat.secondary || "WhatsApp result"}</p>
                      </div>
                      <select value={mappingChoice[choiceKey] || ""} onChange={(event) => setMappingChoice((current) => ({ ...current, [choiceKey]: event.target.value }))} className="rounded-lg border border-base-700 bg-base-900 px-2 py-2 text-xs text-neutral-200 outline-none">
                        <option value="">Choose app client…</option>
                        {clients.map((client) => <option key={client.id} value={client.id}>{client.name || client.company || client.phone}</option>)}
                      </select>
                      <button type="button" onClick={() => addScannedChat(chat, index)} disabled={isPending || chat.safeToMap === false || !chat.chatKey} className="rounded-lg border border-accent-500/40 bg-accent-500/10 px-3 py-2 text-xs font-semibold text-accent-300 disabled:opacity-40">Add / Map</button>
                      {chat.warning && <p className="md:col-span-3 text-[10px] text-amber-300">{chat.warning}</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="rounded-xl2 border border-base-700/60 bg-base-850 shadow-card">
            <div className="border-b border-base-700/50 px-4 py-3">
              <div className="flex items-center gap-2"><ShieldCheck size={15} className="text-accent-400" /><h2 className="text-sm font-semibold text-neutral-100">Mapped Clients & Team Access</h2></div>
              <p className="mt-1 text-xs text-neutral-600">Only chats you manually mapped appear here. Giving access does not reveal old messages.</p>
            </div>
            <div className="divide-y divide-base-700/40">
              {links.map((link) => {
                const draft = draftFor(link);
                return (
                  <div key={link.clientId} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-neutral-200">{link.chatLabel || link.clientName}</p>
                        <p className="mt-0.5 text-[10px] text-neutral-600">App client: {link.clientName}{link.phone ? " · " + link.phone : ""}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 text-xs text-neutral-400">
                          <input type="checkbox" checked={draft.isEnabled} onChange={(event) => updateDraft(link.clientId, { isEnabled: event.target.checked })} />
                          Enabled
                        </label>
                        <button type="button" onClick={() => removeMapping(link)} className="rounded-lg p-2 text-rose-300 hover:bg-rose-500/10" aria-label="Remove mapping"><Trash2 size={14} /></button>
                      </div>
                    </div>

                    <div className="mt-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-600">Team members allowed to continue this chat</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {memberOptions.map((member) => {
                          const active = draft.accessUserIds.includes(member.id);
                          return (
                            <button key={member.id} type="button" onClick={() => toggleAccess(link, member.id)} className={cn("rounded-full border px-2.5 py-1 text-[10px] font-semibold", active ? "border-accent-500/40 bg-accent-500/10 text-accent-300" : "border-base-700 bg-base-900 text-neutral-500")}>
                              {active && <CheckCircle2 size={10} className="mr-1 inline" />}{member.name || member.email}
                            </button>
                          );
                        })}
                      </div>
                      <p className="mt-2 text-[10px] text-neutral-600">Default history: None. Share old messages from the My WhatsApp Chats tab only when needed.</p>
                    </div>

                    <button type="button" onClick={() => saveClient(link)} disabled={isPending} className="mt-3 rounded-lg bg-accent-500 px-3 py-2 text-xs font-semibold text-base-950 disabled:opacity-50">
                      Save Access
                    </button>
                  </div>
                );
              })}
              {links.length === 0 && <p className="p-8 text-center text-sm text-neutral-600">No WhatsApp client is mapped yet. Use Scan above to add only the chats you want.</p>}
            </div>
          </section>
        </div>
      ) : (
        <section className="overflow-hidden rounded-xl2 border border-base-700/60 bg-base-850 shadow-card">
          <div className="border-b border-base-700/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-neutral-100">My WhatsApp Chats</h2>
                <p className="mt-1 text-xs text-neutral-600">Admin view. Read or message WhatsApp chats without mapping them to the team.</p>
              </div>
              <button type="button" onClick={() => loadDirectChats(false)} disabled={isPending} className="inline-flex items-center gap-1.5 rounded-lg border border-base-700 bg-base-900 px-3 py-2 text-xs font-semibold text-neutral-300"><RefreshCw size={13} /> Refresh chats</button>
            </div>
            <div className="mt-3 flex gap-2">
              <input value={scanQuery} onChange={(event) => setScanQuery(event.target.value)} placeholder="Search WhatsApp name…" className="min-w-0 flex-1 rounded-lg border border-base-700 bg-base-900 px-3 py-2 text-xs text-neutral-100 outline-none" />
              <button type="button" onClick={() => loadDirectChats(true)} disabled={isPending || !scanQuery.trim()} className="rounded-lg border border-base-700 bg-base-900 px-3 py-2 text-xs font-semibold text-neutral-300">Search</button>
            </div>
          </div>

          <div className="grid min-h-[620px] md:grid-cols-[280px_1fr]">
            <aside className="border-b border-base-700/50 md:border-b-0 md:border-r">
              <div className="max-h-[620px] overflow-y-auto">
                {directChats.map((chat, index) => (
                  <button key={chat.chatLabel + chat.chatKey + index} type="button" onClick={() => { setSelectedChat(chat); setHistory([]); setSelectedHistoryKeys([]); }} className={cn("block w-full border-b border-base-700/30 px-4 py-3 text-left", selectedChat?.chatLabel === chat.chatLabel && selectedChat?.chatKey === chat.chatKey ? "bg-accent-500/10" : "hover:bg-base-800/60")}>
                    <p className="truncate text-xs font-semibold text-neutral-200">{chat.chatLabel}</p>
                    <p className="mt-1 truncate text-[10px] text-neutral-600">{chat.phone || chat.secondary || "WhatsApp chat"}</p>
                    {chat.warning && <p className="mt-1 text-[9px] text-amber-300">{chat.warning}</p>}
                  </button>
                ))}
                {directChats.length === 0 && <p className="p-6 text-center text-xs text-neutral-600">Click Refresh chats, or search a WhatsApp name.</p>}
              </div>
            </aside>

            <div className="flex min-w-0 flex-col">
              {selectedChat ? (
                <>
                  <div className="border-b border-base-700/50 p-4">
                    <p className="text-sm font-semibold text-neutral-100">{selectedChat.chatLabel}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <label className="flex items-center gap-2 rounded-lg border border-base-700 bg-base-900 px-3 py-2 text-xs text-neutral-400">
                        <CalendarDays size={13} />
                        <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="bg-transparent text-neutral-200 outline-none" />
                      </label>
                      <button type="button" onClick={loadHistory} disabled={isPending || !selectedDate || selectedChat.safeToMap === false || !selectedChat.chatKey} className="rounded-lg bg-accent-500 px-3 py-2 text-xs font-semibold text-base-950 disabled:opacity-40">Load this day</button>
                    </div>
                  </div>

                  <div className="flex-1 space-y-2 overflow-y-auto bg-base-950/20 p-4">
                    {history.map((item) => {
                      const selected = selectedHistoryKeys.includes(item.remoteMessageKey);
                      return (
                        <div key={item.remoteMessageKey} className={cn("flex items-start gap-2", item.direction === "outbound" ? "justify-end" : "justify-start")}>
                          <label className={cn("flex max-w-[86%] cursor-pointer items-start gap-2 rounded-2xl px-3 py-2", item.direction === "outbound" ? "bg-accent-500/15" : "bg-base-800", selected && "ring-1 ring-accent-500")}>
                            <input type="checkbox" checked={selected} onChange={() => toggleHistory(item.remoteMessageKey)} className="mt-1" />
                            <span>
                              <span className="block whitespace-pre-wrap break-words text-sm text-neutral-200">{item.body}</span>
                              <span className="mt-1 block text-[9px] text-neutral-600">{historyTime(item.remoteTimestamp)}</span>
                            </span>
                          </label>
                        </div>
                      );
                    })}
                    {history.length === 0 && <p className="py-12 text-center text-xs text-neutral-600">Choose a date and load that day. No old history is shown to team members automatically.</p>}
                  </div>

                  <div className="border-t border-base-700/50 p-3">
                    {mappedByIdentity.has(chatIdentity(selectedChat)) && (
                      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-base-700/60 bg-base-900/50 p-3">
                        <select value={shareUserId} onChange={(event) => setShareUserId(event.target.value)} className="rounded-lg border border-base-700 bg-base-950 px-2 py-2 text-xs text-neutral-200 outline-none">
                          <option value="">Share with team member…</option>
                          {memberOptions.map((member) => <option key={member.id} value={member.id}>{member.name || member.email}</option>)}
                        </select>
                        <button type="button" onClick={() => shareHistory("selected")} disabled={isPending || !shareUserId || selectedHistoryKeys.length === 0} className="rounded-lg border border-accent-500/40 bg-accent-500/10 px-3 py-2 text-xs font-semibold text-accent-300 disabled:opacity-40">Share selected</button>
                        <button type="button" onClick={() => shareHistory("day")} disabled={isPending || !shareUserId || history.length === 0} className="rounded-lg border border-base-700 bg-base-950 px-3 py-2 text-xs font-semibold text-neutral-300 disabled:opacity-40">Share full day</button>
                      </div>
                    )}

                    <div className="flex items-end gap-2">
                      <textarea value={directDraft} onChange={(event) => setDirectDraft(event.target.value)} rows={2} placeholder={"Message " + selectedChat.chatLabel + "…"} className="min-h-[48px] flex-1 resize-none rounded-xl border border-base-700 bg-base-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-accent-500" />
                      <button type="button" onClick={sendDirect} disabled={isPending || !directDraft.trim() || selectedChat.safeToMap === false || !selectedChat.chatKey} className="grid h-12 w-12 place-items-center rounded-xl bg-accent-500 text-base-950 disabled:opacity-40" aria-label="Send direct WhatsApp message"><Send size={17} /></button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="grid flex-1 place-items-center p-8 text-center text-sm text-neutral-500">Select a WhatsApp chat.</div>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
