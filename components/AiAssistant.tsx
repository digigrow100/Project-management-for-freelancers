"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sparkles, Send, X, Loader2, Check, ThumbsDown } from "lucide-react";
import type { AiMessage, Client, Project } from "@/lib/types";
import { cn, formatMoney } from "@/lib/utils";

interface ProposalPreview {
  pendingActionId: string;
  actionType: "create_tasks" | "create_invoice" | "create_project" | "create_seo_report";
  summary: string;
  preview: unknown;
}

interface DisplayMessage {
  role: "user" | "assistant";
  content: string;
  proposals?: ProposalPreview[];
}

type ProposalStatus = "pending" | "confirmed" | "rejected";

const EXAMPLE_PROMPTS = [
  "What did I complete today?",
  "Which invoices are overdue?",
  "Which clients have pending work?",
];

function extractProposals(message: AiMessage): ProposalPreview[] {
  return message.toolCalls
    .map((call) => call.result as Record<string, unknown>)
    .filter((result): result is ProposalPreview & Record<string, unknown> => typeof result?.pendingActionId === "string")
    .map((result) => ({
      pendingActionId: result.pendingActionId as string,
      actionType: result.actionType as ProposalPreview["actionType"],
      summary: String(result.summary ?? ""),
      preview: result.preview,
    }));
}

export function AiAssistant({
  projects,
  clients = [],
  hasTicker = false,
}: {
  projects: Pick<Project, "id" | "name" | "type" | "archived">[];
  clients?: Pick<Client, "id" | "name" | "company">[];
  /** True when the domain-expiry ticker is also rendered — it sits fixed at the bottom on mobile/tablet, so the launcher button needs extra clearance to stay above it. */
  hasTicker?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [proposalStatus, setProposalStatus] = useState<Record<string, ProposalStatus>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  const projectMatch = pathname?.match(/^\/projects\/([^/]+)/);
  const currentProject =
    projectMatch && projectMatch[1] !== "new" && projectMatch[1] !== "closed"
      ? projects.find((p) => p.id === projectMatch[1])
      : undefined;

  const clientMatch = pathname?.match(/^\/clients\/([^/]+)/);
  const currentClient =
    clientMatch && clientMatch[1] !== "new" ? clients.find((c) => c.id === clientMatch[1]) : undefined;
  const currentContextLabel = currentProject?.name ?? (currentClient ? currentClient.name || currentClient.company : undefined);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isPending]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isPending) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setIsPending(true);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          conversationId,
          context:
            currentProject || currentClient
              ? {
                  ...(currentProject
                    ? { projectId: currentProject.id, projectName: currentProject.name, projectType: currentProject.type }
                    : {}),
                  ...(currentClient
                    ? { clientId: currentClient.id, clientName: currentClient.name || currentClient.company }
                    : {}),
                }
              : undefined,
        }),
      });
      const data: { conversationId?: string; message?: AiMessage; error?: string } = await res.json();
      if (!res.ok || !data.message) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.error || "Something went wrong." }]);
        return;
      }
      setConversationId(data.conversationId ?? null);
      const proposals = extractProposals(data.message);
      setMessages((prev) => [...prev, { role: "assistant", content: data.message!.content, proposals }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Couldn't reach the assistant. Try again." }]);
    } finally {
      setIsPending(false);
    }
  }

  async function resolveProposal(pendingActionId: string, decision: "confirm" | "reject") {
    setProposalStatus((prev) => ({ ...prev, [pendingActionId]: decision === "confirm" ? "confirmed" : "rejected" }));
    try {
      const res = await fetch("/api/ai/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingActionId, decision }),
      });
      const data: { status?: string; error?: string } = await res.json();
      if (!res.ok) {
        setProposalStatus((prev) => ({ ...prev, [pendingActionId]: "pending" }));
        setMessages((prev) => [...prev, { role: "assistant", content: data.error || "Couldn't complete that." }]);
        return;
      }
      if (decision === "confirm") {
        setMessages((prev) => [...prev, { role: "assistant", content: "Done — that's been created." }]);
        router.refresh();
      }
    } catch {
      setProposalStatus((prev) => ({ ...prev, [pendingActionId]: "pending" }));
      setMessages((prev) => [...prev, { role: "assistant", content: "Couldn't reach the server. Try again." }]);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "fixed right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-accent-500 text-base-950 shadow-glow hover:bg-accent-400",
          hasTicker
            ? "bottom-[calc(8rem+env(safe-area-inset-bottom))] md:bottom-16"
            : "bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-6",
        )}
        title="AI Assistant"
      >
        <Sparkles size={20} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-end bg-black/30 md:items-stretch md:p-6"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex h-[80vh] w-full flex-col rounded-t-2xl border border-base-700/60 bg-base-900 shadow-2xl md:h-full md:w-[420px] md:rounded-xl2"
          >
            <div className="flex items-center justify-between border-b border-base-700/60 px-4 py-3">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-accent-400" />
                <h2 className="text-sm font-semibold text-neutral-100">AI Assistant</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="text-neutral-500 hover:text-neutral-300">
                <X size={18} />
              </button>
            </div>

            {currentContextLabel && (
              <p className="border-b border-base-700/60 bg-base-850/60 px-4 py-2 text-[11px] text-neutral-500">
                Context: <span className="text-accent-300">{currentContextLabel}</span>
              </p>
            )}

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3">
              {messages.length === 0 && (
                <div className="flex flex-col gap-2">
                  <p className="rounded-lg border border-dashed border-base-700 p-4 text-center text-xs text-neutral-500">
                    Ask about tasks, clients, SEO, or invoices — or ask me to draft tasks, an invoice, a project, or a
                    report.
                  </p>
                  {EXAMPLE_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => send(prompt)}
                      className="rounded-md border border-base-700/60 bg-base-850 px-3 py-2 text-left text-xs text-neutral-400 hover:border-accent-500/50 hover:text-accent-300"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex flex-col gap-3">
                {messages.map((m, i) => (
                  <div key={i} className={cn("flex flex-col gap-2", m.role === "user" ? "items-end" : "items-start")}>
                    <div
                      className={cn(
                        "max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm",
                        m.role === "user" ? "bg-accent-500 text-base-950" : "bg-base-850 text-neutral-200",
                      )}
                    >
                      {m.content}
                    </div>
                    {m.proposals?.map((p) => (
                      <ProposalCard
                        key={p.pendingActionId}
                        proposal={p}
                        status={proposalStatus[p.pendingActionId] ?? "pending"}
                        onConfirm={() => resolveProposal(p.pendingActionId, "confirm")}
                        onReject={() => resolveProposal(p.pendingActionId, "reject")}
                      />
                    ))}
                  </div>
                ))}
                {isPending && (
                  <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                    <Loader2 size={12} className="animate-spin" />
                    Thinking…
                  </div>
                )}
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="flex items-center gap-2 border-t border-base-700/60 p-3"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask the assistant…"
                className="flex-1 rounded-md border border-base-600 bg-base-850 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={isPending || !input.trim()}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-500 text-base-950 hover:bg-accent-400 disabled:opacity-50"
              >
                <Send size={15} />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function ProposalCard({
  proposal,
  status,
  onConfirm,
  onReject,
}: {
  proposal: ProposalPreview;
  status: ProposalStatus;
  onConfirm: () => void;
  onReject: () => void;
}) {
  return (
    <div className="w-full max-w-[90%] rounded-xl border border-accent-500/30 bg-base-850 p-3">
      <p className="text-xs font-medium text-neutral-200">{proposal.summary}</p>
      <div className="mt-2">
        <ProposalPreviewContent proposal={proposal} />
      </div>
      {status === "pending" ? (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={onConfirm}
            className="flex items-center gap-1.5 rounded-md bg-accent-500 px-3 py-1.5 text-xs font-medium text-base-950 hover:bg-accent-400"
          >
            <Check size={13} />
            Confirm
          </button>
          <button
            type="button"
            onClick={onReject}
            className="flex items-center gap-1.5 rounded-md border border-base-600 px-3 py-1.5 text-xs text-neutral-400 hover:text-rose-300"
          >
            <ThumbsDown size={13} />
            Reject
          </button>
        </div>
      ) : (
        <p
          className={cn(
            "mt-3 text-[11px] font-medium",
            status === "confirmed" ? "text-accent-400" : "text-neutral-500",
          )}
        >
          {status === "confirmed" ? "Confirmed" : "Rejected"}
        </p>
      )}
    </div>
  );
}

function ProposalPreviewContent({ proposal }: { proposal: ProposalPreview }) {
  if (proposal.actionType === "create_tasks") {
    const p = proposal.preview as { assignee?: string | null; tasks: { title: string; scheduledFor: string }[] };
    const tasks = p?.tasks ?? [];
    return (
      <div className="text-xs text-neutral-400">
        {p?.assignee && <p className="mb-1 text-neutral-300">Assigned to {p.assignee}</p>}
        <ul className="flex flex-col gap-1">
          {tasks.slice(0, 12).map((t, i) => (
            <li key={i} className="flex justify-between gap-2">
              <span className="truncate">{t.title}</span>
              <span className="shrink-0 text-neutral-500">{t.scheduledFor}</span>
            </li>
          ))}
          {tasks.length > 12 && <li className="text-neutral-500">…and {tasks.length - 12} more</li>}
        </ul>
      </div>
    );
  }

  if (proposal.actionType === "create_invoice") {
    const p = proposal.preview as {
      client: string;
      items: { description: string; quantity: number; unitPrice: number }[];
      currency: string;
      total: number;
      dueDate: string;
    };
    return (
      <div className="text-xs text-neutral-400">
        <ul className="flex flex-col gap-1">
          {p.items.map((item, i) => (
            <li key={i} className="flex justify-between gap-2">
              <span className="truncate">
                {item.description} × {item.quantity}
              </span>
              <span className="shrink-0">{formatMoney(item.unitPrice * item.quantity, p.currency)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-1.5 font-medium text-neutral-300">
          Total {formatMoney(p.total, p.currency)} · due {p.dueDate}
        </p>
      </div>
    );
  }

  if (proposal.actionType === "create_project") {
    const p = proposal.preview as { client: string; name: string; type: string; description: string };
    return (
      <p className="text-xs text-neutral-400">
        {p.name} ({p.type}) for {p.client}
        {p.description && <span className="block text-neutral-500">{p.description}</span>}
      </p>
    );
  }

  const p = proposal.preview as {
    project: string;
    period: string;
    completedTaskTitles?: string[];
    metrics?: Record<string, number>;
  };
  return (
    <div className="text-xs text-neutral-400">
      <p>
        {p.completedTaskTitles?.length ?? 0} completed task(s) this period.
      </p>
      {p.metrics && (
        <p className="mt-1 text-neutral-500">
          Keywords improved {p.metrics.keywordsImproved ?? 0}, backlinks live {p.metrics.backlinksLive ?? 0}, content
          published {p.metrics.contentPublished ?? 0}.
        </p>
      )}
    </div>
  );
}
