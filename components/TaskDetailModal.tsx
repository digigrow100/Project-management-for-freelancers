"use client";

import { useRef, useState, useTransition } from "react";
import { X, Trash2, Clock, CalendarDays, ListChecks, FileText } from "lucide-react";
import type { ChecklistItem, Profile, Stage, Task, TaskStatus } from "@/lib/types";
import { deleteTaskAction, updateTaskDetailsAction } from "@/lib/actions";
import { formatRelativeDate } from "@/lib/utils";
import { TaskFiles } from "./TaskFiles";
import { TaskNotesEditor } from "./TaskNotesEditor";
import { cn } from "@/lib/utils";

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function TaskDetailModal({
  task,
  stages,
  projectName,
  assignableMembers = [],
  onClose,
}: {
  task: Task;
  stages: Stage[];
  projectName?: string;
  assignableMembers?: Profile[];
  onClose: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [checklist, setChecklist] = useState<ChecklistItem[]>(task.checklist);
  const [tab, setTab] = useState<"details" | "notes">("details");

  function addChecklistItem() {
    setChecklist((items) => [...items, { id: crypto.randomUUID(), text: "", done: false }]);
  }
  function updateChecklistItem(id: string, text: string) {
    setChecklist((items) => items.map((it) => (it.id === id ? { ...it, text } : it)));
  }
  function toggleChecklistItem(id: string) {
    setChecklist((items) => {
      const next = items.map((it) => (it.id === id ? { ...it, done: !it.done } : it));
      if (next.some((it) => !it.done)) setStatus((s) => (s === "done" ? "in_progress" : s));
      return next;
    });
  }
  function removeChecklistItem(id: string) {
    setChecklist((items) => items.filter((it) => it.id !== id));
  }

  const checklistComplete = checklist.every((item) => item.done);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-10 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "w-full rounded-xl2 border border-base-700/60 bg-base-850 p-5 shadow-card",
          tab === "notes" ? "max-w-2xl" : "max-w-lg",
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-neutral-500">Task details</p>
            {projectName && <p className="mt-0.5 truncate text-sm text-neutral-400">{projectName}</p>}
          </div>
          <button onClick={onClose} className="shrink-0 rounded-md p-1 text-neutral-500 hover:bg-base-700/60 hover:text-neutral-300">
            <X size={18} />
          </button>
        </div>

        <div className="mb-3 flex items-center gap-1 rounded-lg border border-base-700/60 bg-base-900 p-1">
          <button
            type="button"
            onClick={() => setTab("details")}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-xs font-medium",
              tab === "details" ? "bg-accent-500/15 text-accent-300" : "text-neutral-400 hover:text-neutral-200",
            )}
          >
            Details
          </button>
          <button
            type="button"
            onClick={() => setTab("notes")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium",
              tab === "notes" ? "bg-accent-500/15 text-accent-300" : "text-neutral-400 hover:text-neutral-200",
            )}
          >
            <FileText size={13} />
            Notes
          </button>
        </div>

        {tab === "notes" && <TaskNotesEditor taskId={task.id} projectId={task.projectId} />}

        <form
          ref={formRef}
          action={(formData) => {
            formData.set("checklistJson", JSON.stringify(checklist));
            startTransition(async () => {
              await updateTaskDetailsAction(formData);
              onClose();
            });
          }}
          className={cn("flex flex-col gap-3", tab === "notes" && "hidden")}
        >
          <input type="hidden" name="taskId" value={task.id} />
          <input type="hidden" name="projectId" value={task.projectId} />

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">Title</label>
            <input
              name="title"
              required
              defaultValue={task.title}
              className="w-full rounded-md border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100 focus:border-accent-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">Assigned to</label>
            <select
              name="assignedTo"
              defaultValue={task.assignedTo ?? ""}
              className="w-full rounded-md border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100 focus:border-accent-500 focus:outline-none"
            >
              <option value="">Unassigned</option>
              {assignableMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name || member.email}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">Why this matters</label>
            <textarea
              name="why"
              defaultValue={task.why}
              rows={2}
              placeholder="Why does this task matter?"
              className="w-full rounded-md border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">Done when</label>
            <textarea
              name="expectedOutcome"
              defaultValue={task.expectedOutcome}
              rows={2}
              placeholder="What does finishing this task look like?"
              className="w-full rounded-md border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">Notes</label>
            <textarea
              name="notes"
              defaultValue={task.notes}
              rows={3}
              placeholder="Add any extra detail about this task…"
              className="w-full rounded-md border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-medium text-neutral-400">
                <ListChecks size={13} />
                Checklist
              </span>
              <button type="button" onClick={addChecklistItem} className="text-xs text-accent-400 hover:text-accent-300">
                + Add item
              </button>
            </div>
            {checklist.map((item) => (
              <div key={item.id} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={() => toggleChecklistItem(item.id)}
                  className="accent-accent-500"
                />
                <input
                  value={item.text}
                  onChange={(e) => updateChecklistItem(item.id, e.target.value)}
                  placeholder="Checklist item"
                  className="w-full rounded-md border border-base-600 bg-base-900 px-2.5 py-1.5 text-xs text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => removeChecklistItem(item.id)}
                  className="shrink-0 text-neutral-500 hover:text-rose-400"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
            {checklist.length > 0 && !checklistComplete && (
              <p className="text-[11px] text-amber-400">Check off every item to be able to mark this task Done.</p>
            )}
          </div>

          <TaskFiles taskId={task.id} projectId={task.projectId} files={task.files} />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-400">Status</label>
              <select
                name="status"
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="w-full rounded-md border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100 focus:border-accent-500 focus:outline-none"
              >
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="done" disabled={!checklistComplete}>
                  Done{!checklistComplete ? " (finish checklist first)" : ""}
                </option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-400">Priority</label>
              <select
                name="priority"
                defaultValue={task.priority}
                className="w-full rounded-md border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100 focus:border-accent-500 focus:outline-none"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-400">Stage</label>
              <select
                name="stageId"
                defaultValue={task.stageId ?? ""}
                className="w-full rounded-md border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100 focus:border-accent-500 focus:outline-none"
              >
                <option value="">No stage</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-400">Due date</label>
              <input
                type="date"
                name="dueDate"
                defaultValue={task.dueDate ?? ""}
                className="w-full rounded-md border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100 focus:border-accent-500 focus:outline-none"
              />
            </div>
          </div>

          {status === "done" ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-400">Completed on</label>
              <input
                type="date"
                name="completedDate"
                defaultValue={(task.completedAt ?? "").slice(0, 10) || todayKey()}
                max={todayKey()}
                className="w-full rounded-md border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100 focus:border-accent-500 focus:outline-none"
              />
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-400">Schedule for</label>
              <input
                type="date"
                name="scheduledFor"
                defaultValue={task.scheduledFor ?? ""}
                className="w-full rounded-md border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100 focus:border-accent-500 focus:outline-none"
              />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 rounded-lg bg-base-900/50 px-3 py-2 text-[11px] text-neutral-500">
            <span className="flex items-center gap-1">
              <Clock size={12} />
              Updated {formatRelativeDate(task.updatedAt)}
            </span>
            <span className="flex items-center gap-1">
              <CalendarDays size={12} />
              Created {formatRelativeDate(task.createdAt)}
            </span>
            {task.completedAt && (
              <span className="flex items-center gap-1 text-accent-400">Completed {formatRelativeDate(task.completedAt)}</span>
            )}
          </div>

          <div className="mt-1 flex items-center justify-between gap-3">
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  await deleteTaskAction(task.id, task.projectId);
                  onClose();
                })
              }
              className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-rose-400 hover:bg-rose-500/10 disabled:opacity-50"
            >
              <Trash2 size={14} />
              Delete task
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-base-950 hover:bg-accent-400 disabled:opacity-60"
            >
              {isPending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
