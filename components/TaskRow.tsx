"use client";

import { useState, useTransition } from "react";
import { Check, Circle, Star, Trash2, Timer, ListChecks, Paperclip, CalendarDays, User } from "lucide-react";
import type { Profile, Stage, Task } from "@/lib/types";
import { PriorityBadge } from "./Badges";
import { cn, formatDateKey, formatRelativeDate } from "@/lib/utils";
import {
  deleteTaskAction,
  toggleChecklistItemAction,
  toggleTodayAction,
  updateTaskStatusAction,
} from "@/lib/actions";
import { TaskDetailModal } from "./TaskDetailModal";

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function TaskRow({
  task,
  stageName,
  stages = [],
  showProject,
  projectName,
  assignableMembers = [],
}: {
  task: Task;
  stageName?: string | null;
  stages?: Stage[];
  showProject?: boolean;
  projectName?: string;
  assignableMembers?: Profile[];
}) {
  const [isPending, startTransition] = useTransition();
  const [detailOpen, setDetailOpen] = useState(false);
  const isScheduledToday = task.scheduledFor === todayKey();
  const checklistDone = task.checklist.filter((c) => c.done).length;
  const effectiveDate = task.dueDate ?? task.scheduledFor;
  const isOverdue = task.status !== "done" && !!effectiveDate && effectiveDate < todayKey();

  function cycleStatus() {
    const next = task.status === "done" ? "todo" : "done";
    if (next === "done" && task.checklist.some((c) => !c.done)) {
      setDetailOpen(true);
      return;
    }
    startTransition(() => updateTaskStatusAction(task.id, task.projectId, next));
  }

  return (
    <div
      className={cn(
        "group flex items-start gap-3 rounded-lg border border-base-700/50 bg-base-850/60 px-3 py-2.5 transition-opacity",
        isPending && "opacity-50",
      )}
    >
      <button
        onClick={cycleStatus}
        title={task.status === "done" ? "Mark as not done" : "Mark as done"}
        className="-ml-1.5 -mt-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
      >
        <span
          className={cn(
            "flex h-5 w-5 items-center justify-center rounded-full border transition-colors",
            task.status === "done"
              ? "border-accent-500 bg-accent-500 text-base-950"
              : task.status === "in_progress"
                ? "border-sky-400 text-sky-400"
                : "border-neutral-600 text-transparent hover:border-accent-400",
          )}
        >
          {task.status === "done" ? (
            <Check size={12} strokeWidth={3} />
          ) : task.status === "in_progress" ? (
            <Timer size={11} />
          ) : (
            <Circle size={6} />
          )}
        </span>
      </button>

      <div className="min-w-0 flex-1">
        <button onClick={() => setDetailOpen(true)} title="View task details" className="w-full cursor-pointer text-left">
          <p
            className={cn(
              "text-sm text-neutral-100 hover:text-accent-300",
              task.status === "done" && "text-neutral-500 line-through hover:text-neutral-400",
            )}
          >
            {task.title}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <PriorityBadge priority={task.priority} />
            {effectiveDate && (
              <span
                className={cn(
                  "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
                  isOverdue ? "border-rose-500/50 text-rose-400" : "border-base-600 text-neutral-400",
                )}
              >
                <CalendarDays size={11} />
                {task.dueDate ? "Due" : "Plan"} {formatDateKey(effectiveDate)}
              </span>
            )}
            {stageName && (
              <span className="rounded-full border border-base-600 px-2 py-0.5 text-[11px] text-neutral-400">
                {stageName}
              </span>
            )}
            {showProject && projectName && (
              <span className="rounded-full bg-base-700/60 px-2 py-0.5 text-[11px] text-neutral-300">
                {projectName}
              </span>
            )}
            {task.assignedToName && (
              <span
                title={task.assignedToName}
                className="flex items-center gap-1 rounded-full border border-base-600 px-2 py-0.5 text-[11px] text-neutral-400"
              >
                <User size={11} />
                {task.assignedToName}
              </span>
            )}
            {task.checklist.length > 0 && (
              <span className="flex items-center gap-1 rounded-full border border-base-600 px-2 py-0.5 text-[11px] text-neutral-400">
                <ListChecks size={11} />
                {checklistDone}/{task.checklist.length}
              </span>
            )}
            {task.files.length > 0 && (
              <span className="flex items-center gap-1 rounded-full border border-base-600 px-2 py-0.5 text-[11px] text-neutral-400">
                <Paperclip size={11} />
                {task.files.length}
              </span>
            )}
            <span className="text-[11px] text-neutral-500">{formatRelativeDate(task.updatedAt)}</span>
          </div>
        </button>

        {task.checklist.length > 0 && (
          <div className="mt-2 flex flex-col gap-1 border-l border-base-700/60 pl-2.5">
            {task.checklist.map((item) => (
              <label key={item.id} className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={() =>
                    startTransition(() => toggleChecklistItemAction(task.id, task.projectId, item.id))
                  }
                  className="accent-accent-500"
                />
                <span className={cn(item.done ? "text-neutral-500 line-through" : "text-neutral-300")}>
                  {item.text}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
        <button
          title={isScheduledToday ? "Remove from Today" : "Schedule for today"}
          onClick={() => startTransition(() => toggleTodayAction(task.id, task.projectId, todayKey()))}
          className={cn(
            "rounded-md p-2 hover:bg-base-700/60",
            isScheduledToday ? "text-amber-400" : "text-neutral-500",
          )}
        >
          <Star size={15} fill={isScheduledToday ? "currentColor" : "none"} />
        </button>
        <button
          title="Delete task"
          onClick={() => startTransition(() => deleteTaskAction(task.id, task.projectId))}
          className="rounded-md p-2 text-neutral-500 hover:bg-rose-500/10 hover:text-rose-400"
        >
          <Trash2 size={15} />
        </button>
      </div>

      {detailOpen && (
        <TaskDetailModal
          task={task}
          stages={stages}
          projectName={projectName}
          assignableMembers={assignableMembers}
          onClose={() => setDetailOpen(false)}
        />
      )}
    </div>
  );
}
