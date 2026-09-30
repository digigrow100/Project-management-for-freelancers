"use client";

import { useTransition } from "react";
import { CheckCircle2, Circle, ExternalLink } from "lucide-react";
import type { SeoWorkflowItem, SeoWorkflowModule } from "@/lib/types";
import { updateSeoWorkflowItemStatusAction } from "@/lib/actions";
import { cn } from "@/lib/utils";

const DESCRIPTIONS: Record<SeoWorkflowModule, string> = {
  social_media: "Complete one social platform at a time for this project.",
  local_listing: "Build and verify local business listings one platform at a time.",
  blog_onsite: "Prepare the next onsite blog through the writing workflow.",
  web_2_0: "Build Web 2.0 properties one platform at a time.",
  guest_blogging: "Research, qualify, negotiate and approve guest blogging opportunities.",
};

export function SeoWorkflowPanel({
  projectId,
  module,
  title,
  items,
}: {
  projectId: string;
  module: SeoWorkflowModule;
  title: string;
  items: SeoWorkflowItem[];
}) {
  const [isPending, startTransition] = useTransition();
  const done = items.filter((item) => item.status === "done").length;

  return (
    <section className={cn("rounded-xl2 border border-base-700/60 bg-base-850 p-4 shadow-card", isPending && "opacity-80")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-neutral-100">{title}</h2>
          <p className="mt-1 text-xs text-neutral-500">{DESCRIPTIONS[module]}</p>
        </div>
        <span className="rounded-full bg-base-900 px-3 py-1 text-xs text-neutral-400">
          {done}/{items.length} done
        </span>
      </div>

      <div className="mt-4 grid gap-2">
        {items.map((item, index) => {
          const isDone = item.status === "done";
          const steps = item.details.steps ?? [];
          return (
            <div key={item.id} className="rounded-xl border border-base-700/60 bg-base-900/45 p-3">
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() =>
                    startTransition(() =>
                      updateSeoWorkflowItemStatusAction({
                        projectId,
                        itemId: item.id,
                        status: isDone ? "pending" : "done",
                      }),
                    )
                  }
                  className={cn("mt-0.5 shrink-0", isDone ? "text-emerald-400" : "text-neutral-600")}
                  aria-label={isDone ? "Mark pending" : "Mark done"}
                >
                  {isDone ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-semibold text-neutral-600">{index + 1}</span>
                    <h3 className={cn("text-sm font-medium", isDone ? "text-neutral-500 line-through" : "text-neutral-100")}>
                      {item.title}
                    </h3>
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase",
                      isDone ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300",
                    )}>
                      {isDone ? "Done" : "Pending"}
                    </span>
                  </div>

                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-accent-300"
                    >
                      {item.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                      <ExternalLink size={11} />
                    </a>
                  )}

                  {steps.length > 0 && (
                    <div className="mt-3 rounded-lg border border-base-700/50 bg-base-950/45 p-3">
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Workflow</p>
                      <ol className="space-y-1.5">
                        {steps.map((step, stepIndex) => (
                          <li key={step} className="flex gap-2 text-xs text-neutral-300">
                            <span className="text-neutral-600">{stepIndex + 1}.</span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {items.length === 0 && (
          <div className="rounded-xl border border-dashed border-base-700 p-8 text-center text-sm text-neutral-500">
            No workflow items added yet.
          </div>
        )}
      </div>
    </section>
  );
}
