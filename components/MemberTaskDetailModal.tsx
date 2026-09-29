"use client";

import { useEffect, useState, useTransition } from "react";
import { CalendarDays, Check, ClipboardList, FileText, Flag, Play, Sparkles, X } from "lucide-react";
import type { Task, TaskPriority } from "@/lib/types";
import { startFocusTaskAction, updateMemberTaskBasicsAction } from "@/lib/actions";
import { cn } from "@/lib/utils";

export function MemberTaskDetailModal({
  task,
  projectName,
  onClose,
}: {
  task: Task;
  projectName?: string;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [dueDate, setDueDate] = useState(task.dueDate ?? "");
  const [notes, setNotes] = useState(task.notes ?? "");
  const [requirements, setRequirements] = useState(task.why ?? "");
  const [promptSteps, setPromptSteps] = useState(task.expectedOutcome ?? "");

  useEffect(() => {
    if (task.status === "done") return;
    startTransition(async () => {
      await startFocusTaskAction(task.id);
    });
  }, [task.id, task.status]);

  function save() {
    startTransition(async () => {
      await updateMemberTaskBasicsAction({
        taskId: task.id,
        priority,
        dueDate: dueDate || null,
        notes,
        requirements,
        promptSteps,
      });
      onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3 backdrop-blur-sm sm:p-5"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-base-700 bg-base-850 shadow-2xl"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-base-700/70 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-[0.16em] text-neutral-500">Task</span>
              {task.status !== "done" && (
                <span className="flex items-center gap-1 rounded-full bg-accent-500/10 px-2 py-0.5 text-[11px] font-medium text-accent-300">
                  <Play size={10} fill="currentColor" />
                  In progress
                </span>
              )}
            </div>
            <h2 className="text-xl font-semibold leading-snug text-neutral-50 sm:text-2xl">{task.title}</h2>
            {projectName && <p className="mt-1 text-sm text-neutral-500">{projectName}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-neutral-500 hover:bg-base-700 hover:text-neutral-200"
            aria-label="Close"
          >
            <X size={19} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
            <main className="min-w-0 space-y-5">
              <section>
                <div className="mb-2 flex items-center gap-2">
                  <FileText size={16} className="text-accent-400" />
                  <h3 className="text-sm font-semibold text-neutral-200">Task details</h3>
                </div>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={5}
                  placeholder="Add the task details here..."
                  className="w-full resize-y rounded-xl border border-base-700 bg-base-900/70 px-4 py-3 text-sm leading-6 text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-accent-500/70"
                />
              </section>

              {(requirements.trim() || promptSteps.trim()) && (
                <div className="grid gap-4 md:grid-cols-2">
                  {requirements.trim() && (
                    <section className="rounded-xl border border-base-700/70 bg-base-900/45 p-4">
                      <div className="mb-2 flex items-center gap-2">
                        <ClipboardList size={15} className="text-sky-400" />
                        <h3 className="text-sm font-semibold text-neutral-200">Requirements</h3>
                      </div>
                      <textarea
                        value={requirements}
                        onChange={(e) => setRequirements(e.target.value)}
                        rows={6}
                        className="w-full resize-y border-0 bg-transparent p-0 text-sm leading-6 text-neutral-300 outline-none"
                      />
                    </section>
                  )}

                  {promptSteps.trim() && (
                    <section className="rounded-xl border border-base-700/70 bg-base-900/45 p-4">
                      <div className="mb-2 flex items-center gap-2">
                        <Sparkles size={15} className="text-amber-400" />
                        <h3 className="text-sm font-semibold text-neutral-200">Prompt / Steps</h3>
                      </div>
                      <textarea
                        value={promptSteps}
                        onChange={(e) => setPromptSteps(e.target.value)}
                        rows={6}
                        className="w-full resize-y border-0 bg-transparent p-0 text-sm leading-6 text-neutral-300 outline-none"
                      />
                    </section>
                  )}
                </div>
              )}

            </main>

            <aside className="space-y-4 lg:border-l lg:border-base-700/70 lg:pl-5">
              <div>
                <label className="mb-1.5 flex items-center gap-2 text-xs font-medium text-neutral-400">
                  <Flag size={13} />
                  Priority
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TaskPriority)}
                  className="w-full rounded-lg border border-base-700 bg-base-900 px-3 py-2.5 text-sm text-neutral-100 outline-none focus:border-accent-500/70"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              <div>
                <label className="mb-1.5 flex items-center gap-2 text-xs font-medium text-neutral-400">
                  <CalendarDays size={13} />
                  Complete by
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full rounded-lg border border-base-700 bg-base-900 px-3 py-2.5 text-sm text-neutral-100 outline-none focus:border-accent-500/70"
                />
              </div>

              <div className="rounded-xl border border-base-700/60 bg-base-900/40 p-3">
                <p className="text-[11px] uppercase tracking-wide text-neutral-600">Status</p>
                <p className={cn("mt-1 text-sm font-medium", task.status === "done" ? "text-accent-300" : "text-neutral-200")}>
                  {task.status === "done" ? "Completed" : "In progress"}
                </p>
              </div>
            </aside>
          </div>
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-base-700/70 px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-base-700 px-4 py-2 text-sm text-neutral-300 hover:bg-base-700/60"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={save}
            className="flex items-center gap-2 rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-base-950 hover:bg-accent-400 disabled:opacity-60"
          >
            <Check size={15} />
            {isPending ? "Saving..." : "Save"}
          </button>
        </footer>
      </div>
    </div>
  );
}
