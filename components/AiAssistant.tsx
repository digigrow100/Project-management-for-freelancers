"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Sparkles, Send, X, Loader2 } from "lucide-react";
import type { AiMessage, Project } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

const EXAMPLE_PROMPTS = [
  "What did I complete today?",
  "Which invoices are overdue?",
  "Which clients have pending work?",
];

export function AiAssistant({ projects }: { projects: Pick<Project, "id" | "name" | "type" | "archived">[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const projectMatch = pathname?.match(/^\/projects\/([^/]+)/);
  const currentProject =
    projectMatch && projectMatch[1] !== "new" && projectMatch[1] !== "closed"
      ? projects.find((p) => p.id === projectMatch[1])
      : undefined;

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
          context: currentProject
            ? { projectId: currentProject.id, projectName: currentProject.name, projectType: currentProject.type }
            : undefined,
        }),
      });
      const data: { conversationId?: string; message?: AiMessage; error?: string } = await res.json();
      if (!res.ok || !data.message) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.error || "Something went wrong." }]);
        return;
      }
      setConversationId(data.conversationId ?? null);
      setMessages((prev) => [...prev, { role: "assistant", content: data.message!.content }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Couldn't reach the assistant. Try again." }]);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-20 right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-accent-500 text-base-950 shadow-glow hover:bg-accent-400 md:bottom-6"
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

            {currentProject && (
              <p className="border-b border-base-700/60 bg-base-850/60 px-4 py-2 text-[11px] text-neutral-500">
                Context: <span className="text-accent-300">{currentProject.name}</span>
              </p>
            )}

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3">
              {messages.length === 0 && (
                <div className="flex flex-col gap-2">
                  <p className="rounded-lg border border-dashed border-base-700 p-4 text-center text-xs text-neutral-500">
                    Ask about tasks, clients, SEO, or invoices.
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
                  <div
                    key={i}
                    className={cn(
                      "max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm",
                      m.role === "user" ? "ml-auto bg-accent-500 text-base-950" : "bg-base-850 text-neutral-200",
                    )}
                  >
                    {m.content}
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
