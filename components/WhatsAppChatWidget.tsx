"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  AlertCircle,
  CheckCheck,
  Clock3,
  MessageCircleMore,
  RefreshCw,
  Send,
  X,
} from "lucide-react";
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

export function WhatsAppChatWidget({
  initialClients,
}: {
  initialClients: WhatsAppChatClient[];
}) {
  const [open, setOpen] = useState(false);
  const [clients, setClients] = useState(initialClients);
  const [selectedId, setSelectedId] = useState(initialClients[0]?.clientId ?? "");
  const [messages, setMessages] = useState<WhatsAppChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const messageViewportRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const notificationBaseline = useRef<Record<string, Set<string>>>({});

  const selected = useMemo(
    () => clients.find((client) => client.clientId === selectedId) ?? null,
    [clients, selectedId],
  );

  function scrollToBottom(behavior: ScrollBehavior = "auto") {
    const viewport = messageViewportRef.current;
    if (!viewport) return;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior });
  }

  async function loadClients() {
    try {
      const response = await fetch("/api/client-chat/clients", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as { clients?: WhatsAppChatClient[] };
      if (!Array.isArray(data.clients)) return;

      setClients(data.clients);
      if (!selectedId && data.clients[0]) setSelectedId(data.clients[0].clientId);
      if (selectedId && !data.clients.some((client) => client.clientId === selectedId)) {
        setSelectedId(data.clients[0]?.clientId ?? "");
      }
    } catch {
      // Keep the last known list.
    }
  }

  async function loadMessages(clientId = selectedId) {
    if (!clientId) {
      setMessages([]);
      return;
    }

    try {
      const response = await fetch(
        "/api/client-chat/" + encodeURIComponent(clientId) + "/messages",
        { cache: "no-store" },
      );
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Could not load messages.");
        return;
      }

      const nextMessages = Array.isArray(data.messages)
        ? (data.messages as WhatsAppChatMessage[])
        : [];

      const inboundIds = new Set<string>(
        nextMessages
          .filter((message) => message.direction === "inbound")
          .map((message) => message.id),
      );
      const previous = notificationBaseline.current[clientId];

      if (!previous) {
        notificationBaseline.current[clientId] = inboundIds;
      } else {
        for (const item of nextMessages) {
          if (item.direction !== "inbound" || previous.has(item.id)) continue;
          previous.add(item.id);
          const client = clients.find((entry) => entry.clientId === clientId);
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification(client?.clientName || "New WhatsApp message", {
              body: item.body,
              tag: "widget-whatsapp-" + item.id,
            });
          }
        }
      }

      setMessages(nextMessages);
      setError("");
    } catch {
      setError("Could not refresh messages.");
    }
  }

  useEffect(() => {
    if (!open) return;

    void loadClients();
    if (selectedId) void loadMessages(selectedId);

    const clientTimer = window.setInterval(() => void loadClients(), 5000);
    const messageTimer = selectedId
      ? window.setInterval(() => void loadMessages(selectedId), 1000)
      : null;

    return () => {
      window.clearInterval(clientTimer);
      if (messageTimer) window.clearInterval(messageTimer);
    };
  }, [open, selectedId]);

  useEffect(() => {
    if (!open) return;
    stickToBottomRef.current = true;
    window.requestAnimationFrame(() => scrollToBottom("auto"));
  }, [open, selectedId]);

  useEffect(() => {
    if (!open || !stickToBottomRef.current) return;
    window.requestAnimationFrame(() => scrollToBottom("smooth"));
  }, [messages.length, open]);

  function selectClient(client: WhatsAppChatClient) {
    setSelectedId(client.clientId);
    setError("");
    setMessages([]);
    stickToBottomRef.current = true;

    void fetch("/api/client-chat/" + encodeURIComponent(client.clientId) + "/open", {
      method: "POST",
    })
      .then(async (response) => {
        if (response.ok) return;
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Could not open this chat in WhatsApp Web.");
      })
      .catch((openError) => {
        setError(
          openError instanceof Error
            ? openError.message
            : "Could not open this chat in WhatsApp Web.",
        );
      });
  }

  function sendMessage() {
    if (!selected || !draft.trim() || !selected.canSend) return;

    const body = draft.trim();
    setDraft("");
    setError("");
    stickToBottomRef.current = true;

    startTransition(async () => {
      try {
        const response = await fetch(
          "/api/client-chat/" + encodeURIComponent(selected.clientId) + "/send",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ body }),
          },
        );
        const data = await response.json();

        if (!response.ok) {
          setDraft(body);
          setError(data.error || "Could not queue message.");
          return;
        }

        await loadMessages(selected.clientId);
        window.requestAnimationFrame(() => scrollToBottom("smooth"));
      } catch {
        setDraft(body);
        setError("Could not queue message.");
      }
    });
  }

  const unreadCount = clients.reduce((total, client) => total + (client.unreadCount || 0), 0);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="fixed bottom-6 right-5 z-50 grid h-14 w-14 place-items-center rounded-full bg-accent-500 text-base-950 shadow-glow transition hover:bg-accent-400"
        aria-label="Open client chat"
        title="Client Chat"
      >
        <MessageCircleMore size={22} />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-rose-500 px-1.5 py-0.5 text-center text-[10px] font-semibold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close chat"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-black/20 md:bg-black/10"
          />

          <section
            className={cn(
              "fixed z-50 overflow-hidden border border-base-700/70 bg-base-900 shadow-2xl",
              "inset-x-2 bottom-20 top-16 rounded-2xl",
              "md:inset-auto md:bottom-24 md:right-6 md:h-[720px] md:max-h-[calc(100vh-7rem)] md:w-[900px] md:max-w-[calc(100vw-3rem)] md:rounded-xl2",
            )}
          >
            <div className="flex h-full min-h-0 flex-col">
              <header className="flex shrink-0 items-center justify-between border-b border-base-700/60 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-500/10 text-emerald-300">
                    <MessageCircleMore size={17} />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-neutral-100">Client Chat</h2>
                    <p className="truncate text-[10px] text-neutral-600">
                      WhatsApp conversations available to your account
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {typeof window !== "undefined" &&
                    "Notification" in window &&
                    Notification.permission !== "granted" && (
                      <button
                        type="button"
                        onClick={() => void Notification.requestPermission()}
                        className="hidden rounded-lg px-2 py-1 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/10 sm:block"
                      >
                        Enable alerts
                      </button>
                    )}
                  <button
                    type="button"
                    onClick={() => void loadClients()}
                    className="rounded-lg p-2 text-neutral-500 hover:bg-base-800 hover:text-neutral-200"
                    aria-label="Refresh clients"
                  >
                    <RefreshCw size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-lg p-2 text-neutral-500 hover:bg-base-800 hover:text-neutral-200"
                    aria-label="Close client chat"
                  >
                    <X size={17} />
                  </button>
                </div>
              </header>

              <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)]">
                <aside className="hidden min-h-0 border-r border-base-700/60 bg-base-900/45 md:flex md:flex-col">
                  <div className="shrink-0 border-b border-base-700/50 px-4 py-3">
                    <p className="text-xs font-semibold text-neutral-200">Clients</p>
                    <p className="mt-0.5 text-[10px] text-neutral-600">
                      Only approved WhatsApp chats appear here
                    </p>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto">
                    {clients.map((client) => (
                      <button
                        key={client.clientId}
                        type="button"
                        onClick={() => selectClient(client)}
                        className={cn(
                          "flex w-full items-start gap-3 border-b border-base-700/30 px-4 py-3 text-left transition-colors",
                          selectedId === client.clientId
                            ? "bg-accent-500/10"
                            : "hover:bg-base-800/70",
                        )}
                      >
                        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-500/10 text-emerald-300">
                          <MessageCircleMore size={15} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-semibold text-neutral-200">
                            {client.clientName}
                          </span>
                          <span className="mt-0.5 block truncate text-[10px] text-neutral-600">
                            {client.company || client.phone || client.chatLabel}
                          </span>
                          <span className="mt-1 block truncate text-[10px] text-neutral-500">
                            {client.lastMessagePreview || "No messages yet"}
                          </span>
                        </span>
                      </button>
                    ))}

                    {clients.length === 0 && (
                      <div className="p-6 text-center text-xs text-neutral-600">
                        No client chat access has been assigned yet.
                      </div>
                    )}
                  </div>
                </aside>

                <div className="flex min-h-0 min-w-0 flex-col">
                  <div className="shrink-0 border-b border-base-700/50 bg-base-900/80 md:hidden">
                    <select
                      value={selectedId}
                      onChange={(event) => {
                        const client = clients.find((item) => item.clientId === event.target.value);
                        if (client) selectClient(client);
                      }}
                      className="m-3 w-[calc(100%-1.5rem)] rounded-lg border border-base-700 bg-base-950 px-3 py-2 text-sm text-neutral-200 outline-none"
                    >
                      <option value="">Select a client</option>
                      {clients.map((client) => (
                        <option key={client.clientId} value={client.clientId}>
                          {client.clientName}
                        </option>
                      ))}
                    </select>
                  </div>

                  {selected ? (
                    <>
                      <div className="shrink-0 border-b border-base-700/50 px-4 py-3">
                        <p className="truncate text-sm font-semibold text-neutral-100">
                          {selected.clientName}
                        </p>
                        <p className="mt-0.5 truncate text-[10px] text-neutral-600">
                          WhatsApp · {selected.chatLabel || selected.phone || selected.chatKey}
                        </p>
                      </div>

                      <div
                        ref={messageViewportRef}
                        onScroll={(event) => {
                          const target = event.currentTarget;
                          const distanceFromBottom =
                            target.scrollHeight - target.scrollTop - target.clientHeight;
                          stickToBottomRef.current = distanceFromBottom < 100;
                        }}
                        className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-base-950/25 p-4"
                      >
                        {messages.map((message) => {
                          const outbound = message.direction === "outbound";
                          return (
                            <div
                              key={message.id}
                              className={cn("flex", outbound ? "justify-end" : "justify-start")}
                            >
                              <div
                                className={cn(
                                  "max-w-[82%] rounded-2xl px-3 py-2.5 shadow-sm",
                                  outbound
                                    ? "rounded-br-md bg-accent-500/15 text-neutral-100"
                                    : "rounded-bl-md bg-base-800 text-neutral-200",
                                )}
                              >
                                <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>
                                <div className="mt-1.5 flex items-center justify-end gap-1.5 text-[9px] text-neutral-600">
                                  {outbound && message.senderName && (
                                    <span className="mr-auto">{message.senderName}</span>
                                  )}
                                  <span>
                                    {messageTime(
                                      message.sentAt || message.receivedAt || message.createdAt,
                                    )}
                                  </span>
                                  {outbound &&
                                    (message.status === "failed" ? (
                                      <AlertCircle size={10} className="text-rose-400" />
                                    ) : message.status === "sent" ? (
                                      <CheckCheck size={10} className="text-sky-300" />
                                    ) : (
                                      <Clock3 size={10} />
                                    ))}
                                </div>
                                {message.status === "failed" && message.errorText && (
                                  <p className="mt-1 text-[9px] text-rose-300">{message.errorText}</p>
                                )}
                              </div>
                            </div>
                          );
                        })}

                        {messages.length === 0 && (
                          <div className="grid min-h-full place-items-center py-12 text-center">
                            <div>
                              <MessageCircleMore
                                size={26}
                                className="mx-auto text-neutral-700"
                              />
                              <p className="mt-3 text-xs text-neutral-600">No messages yet.</p>
                            </div>
                          </div>
                        )}
                      </div>

                      <footer className="shrink-0 border-t border-base-700/50 bg-base-900 p-3">
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
                            placeholder={
                              selected.canSend
                                ? "Write a message to " + selected.clientName + "…"
                                : "You have read-only access"
                            }
                            className="min-h-[48px] flex-1 resize-none rounded-xl border border-base-700 bg-base-950 px-3 py-2 text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-accent-500 disabled:opacity-60"
                          />
                          <button
                            type="button"
                            onClick={sendMessage}
                            disabled={isPending || !draft.trim() || !selected.canSend}
                            className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-accent-500 text-base-950 transition hover:bg-accent-400 disabled:opacity-40"
                            aria-label="Send message"
                          >
                            <Send size={17} />
                          </button>
                        </div>
                      </footer>
                    </>
                  ) : (
                    <div className="grid flex-1 place-items-center p-8 text-center">
                      <div>
                        <MessageCircleMore size={28} className="mx-auto text-neutral-700" />
                        <p className="mt-3 text-sm font-medium text-neutral-400">
                          Select a client chat
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        </>
      )}
    </>
  );
}
