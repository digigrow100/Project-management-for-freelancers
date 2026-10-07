"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AlertCircle, CheckCheck, Clock3, MessageCircle, RefreshCw, Send } from "lucide-react";
import type { WhatsAppChatClient, WhatsAppChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

function messageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function ClientChatPanel({ initialClients }: { initialClients: WhatsAppChatClient[] }) {
  const [clients, setClients] = useState(initialClients);
  const [selectedId, setSelectedId] = useState(initialClients[0]?.clientId ?? "");
  const [messages, setMessages] = useState<WhatsAppChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(() => clients.find((client) => client.clientId === selectedId) ?? null, [clients, selectedId]);

  async function loadClients() {
    try {
      const response = await fetch("/api/client-chat/clients", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as { clients?: WhatsAppChatClient[] };
      if (Array.isArray(data.clients)) {
        setClients(data.clients);
        if (!selectedId && data.clients[0]) setSelectedId(data.clients[0].clientId);
      }
    } catch {
      // Keep last known client list.
    }
  }

  async function loadMessages(clientId = selectedId) {
    if (!clientId) {
      setMessages([]);
      return;
    }
    try {
      const response = await fetch("/api/client-chat/" + encodeURIComponent(clientId) + "/messages", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Could not load messages.");
        return;
      }
      setMessages(Array.isArray(data.messages) ? data.messages : []);
      setError("");
    } catch {
      setError("Could not refresh messages.");
    }
  }

  useEffect(() => {
    void loadMessages(selectedId);
    if (!selectedId) return;
    const messageTimer = window.setInterval(() => void loadMessages(selectedId), 4000);
    const clientTimer = window.setInterval(() => void loadClients(), 15000);
    return () => {
      window.clearInterval(messageTimer);
      window.clearInterval(clientTimer);
    };
  }, [selectedId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, selectedId]);

  function sendMessage() {
    if (!selected || !draft.trim() || !selected.canSend) return;
    const body = draft.trim();
    setDraft("");
    setError("");
    startTransition(async () => {
      try {
        const response = await fetch("/api/client-chat/" + encodeURIComponent(selected.clientId) + "/send", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ body }),
        });
        const data = await response.json();
        if (!response.ok) {
          setDraft(body);
          setError(data.error || "Could not queue message.");
          return;
        }
        await loadMessages(selected.clientId);
      } catch {
        setDraft(body);
        setError("Could not queue message.");
      }
    });
  }

  return (
    <div className="grid min-h-[70vh] overflow-hidden rounded-xl2 border border-base-700/60 bg-base-850 shadow-card md:grid-cols-[280px_1fr]">
      <aside className="border-b border-base-700/60 bg-base-900/45 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between border-b border-base-700/50 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-neutral-100">Client Chats</h2>
            <p className="mt-0.5 text-[10px] text-neutral-600">Only chats you are allowed to access</p>
          </div>
          <button type="button" onClick={() => void loadClients()} className="rounded-lg p-2 text-neutral-500 hover:bg-base-800 hover:text-neutral-200" aria-label="Refresh clients">
            <RefreshCw size={14} />
          </button>
        </div>
        <div className="max-h-[260px] overflow-y-auto md:max-h-[70vh]">
          {clients.map((client) => (
            <button
              key={client.clientId}
              type="button"
              onClick={() => setSelectedId(client.clientId)}
              className={cn(
                "flex w-full items-start gap-3 border-b border-base-700/30 px-4 py-3 text-left transition-colors",
                selectedId === client.clientId ? "bg-accent-500/10" : "hover:bg-base-800/70",
              )}
            >
              <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-500/10 text-emerald-300">
                <MessageCircle size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-neutral-200">{client.clientName}</span>
                <span className="mt-0.5 block truncate text-[10px] text-neutral-600">{client.company || client.phone || client.chatLabel}</span>
                <span className="mt-1 block truncate text-[10px] text-neutral-500">{client.lastMessagePreview || "No messages yet"}</span>
              </span>
            </button>
          ))}
          {clients.length === 0 && (
            <div className="p-6 text-center text-xs text-neutral-600">No client chat access has been assigned yet.</div>
          )}
        </div>
      </aside>

      <section className="flex min-h-[520px] flex-col">
        {selected ? (
          <>
            <header className="border-b border-base-700/50 px-4 py-3">
              <p className="text-sm font-semibold text-neutral-100">{selected.clientName}</p>
              <p className="mt-0.5 text-[10px] text-neutral-600">
                WhatsApp · {selected.chatLabel || selected.phone || selected.chatKey}
              </p>
            </header>

            <div className="flex-1 space-y-3 overflow-y-auto bg-base-950/25 p-4">
              {messages.map((message) => {
                const outbound = message.direction === "outbound";
                return (
                  <div key={message.id} className={cn("flex", outbound ? "justify-end" : "justify-start")}>
                    <div className={cn(
                      "max-w-[82%] rounded-2xl px-3 py-2.5 shadow-sm",
                      outbound ? "rounded-br-md bg-accent-500/15 text-neutral-100" : "rounded-bl-md bg-base-800 text-neutral-200",
                    )}>
                      <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>
                      <div className="mt-1.5 flex items-center justify-end gap-1.5 text-[9px] text-neutral-600">
                        {outbound && message.senderName && <span className="mr-auto">{message.senderName}</span>}
                        <span>{messageTime(message.sentAt || message.receivedAt || message.createdAt)}</span>
                        {outbound && (
                          message.status === "failed"
                            ? <AlertCircle size={10} className="text-rose-400" />
                            : message.status === "sent"
                              ? <CheckCheck size={10} className="text-sky-300" />
                              : <Clock3 size={10} />
                        )}
                      </div>
                      {message.status === "failed" && message.errorText && (
                        <p className="mt-1 text-[9px] text-rose-300">{message.errorText}</p>
                      )}
                    </div>
                  </div>
                );
              })}
              {messages.length === 0 && <p className="py-12 text-center text-xs text-neutral-600">No messages yet.</p>}
              <div ref={bottomRef} />
            </div>

            <footer className="border-t border-base-700/50 p-3">
              {error && <p className="mb-2 text-xs text-rose-300">{error}</p>}
              <div className="flex items-end gap-2">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      sendMessage();
                    }
                  }}
                  rows={2}
                  disabled={!selected.canSend}
                  placeholder={selected.canSend ? "Write a message to " + selected.clientName + "…" : "You have read-only access"}
                  className="min-h-[48px] flex-1 resize-none rounded-xl border border-base-700 bg-base-900 px-3 py-2 text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-accent-500 disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={sendMessage}
                  disabled={isPending || !draft.trim() || !selected.canSend}
                  className="grid h-12 w-12 place-items-center rounded-xl bg-accent-500 text-base-950 transition hover:bg-accent-400 disabled:opacity-40"
                  aria-label="Send message"
                >
                  <Send size={17} />
                </button>
              </div>
              <p className="mt-2 text-[9px] text-neutral-600">Messages are relayed through the admin&apos;s WhatsApp Web bridge.</p>
            </footer>
          </>
        ) : (
          <div className="grid flex-1 place-items-center p-8 text-center">
            <div>
              <MessageCircle size={28} className="mx-auto text-neutral-700" />
              <p className="mt-3 text-sm font-medium text-neutral-400">Select a client chat</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
