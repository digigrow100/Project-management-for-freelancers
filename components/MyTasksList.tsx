"use client";

import type { Profile, Project, Task } from "@/lib/types";
import { TaskRow } from "./TaskRow";

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const RECENT_COMPLETION_WINDOW_DAYS = 7;

function isChecklistComplete(task: Task): boolean {
  return task.checklist.length > 0 && task.checklist.every((item) => item.done);
}

function sortByDateThenPriority(a: Task, b: Task): number {
  const aDate = a.dueDate ?? a.scheduledFor ?? "";
  const bDate = b.dueDate ?? b.scheduledFor ?? "";
  if (aDate !== bDate) {
    if (!aDate) return 1;
    if (!bDate) return -1;
    return aDate < bDate ? -1 : 1;
  }
  const pr = { high: 0, medium: 1, low: 2 } as const;
  return pr[a.priority] - pr[b.priority];
}

interface Bucket {
  key: string;
  label: string;
  hint: string;
  tasks: Task[];
}

/**
 * Buckets a member's own tasks into what needs attention now vs. later.
 * Priority when a task could fit more than one bucket: Waiting Review is
 * checked first — a task that's substantively finished and just needs
 * confirmation is more useful to see as "waiting" than as "overdue," even if
 * its due date has technically passed.
 */
function bucketTasks(tasks: Task[]): Bucket[] {
  const today = todayKey();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RECENT_COMPLETION_WINDOW_DAYS);

  const overdue: Task[] = [];
  const dueToday: Task[] = [];
  const upcoming: Task[] = [];
  const waitingReview: Task[] = [];
  const completedRecently: Task[] = [];

  for (const task of tasks) {
    if (task.status === "done") {
      if (task.completedAt && new Date(task.completedAt) >= cutoff) completedRecently.push(task);
      continue;
    }
    if (task.status === "in_progress" && isChecklistComplete(task)) {
      waitingReview.push(task);
      continue;
    }
    const effectiveDate = task.dueDate ?? task.scheduledFor;
    if (effectiveDate && effectiveDate < today) overdue.push(task);
    else if (effectiveDate === today) dueToday.push(task);
    else upcoming.push(task);
  }

  return [
    { key: "overdue", label: "Overdue", hint: "Past due — do these first.", tasks: overdue.sort(sortByDateThenPriority) },
    { key: "due_today", label: "Due Today", hint: "Due today.", tasks: dueToday.sort(sortByDateThenPriority) },
    { key: "upcoming", label: "Upcoming", hint: "Due later, or no date yet.", tasks: upcoming.sort(sortByDateThenPriority) },
    {
      key: "waiting_review",
      label: "Waiting Review",
      hint: "Checklist done, not yet marked complete.",
      tasks: waitingReview.sort(sortByDateThenPriority),
    },
    {
      key: "completed_recently",
      label: "Completed Recently",
      hint: `Marked done in the last ${RECENT_COMPLETION_WINDOW_DAYS} days.`,
      tasks: completedRecently.sort((a, b) => ((a.completedAt ?? "") < (b.completedAt ?? "") ? 1 : -1)),
    },
  ];
}

export function MyTasksList({
  tasks,
  projects,
  assignableMembers = [],
}: {
  tasks: Task[];
  projects: Project[];
  assignableMembers?: Profile[];
}) {
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const buckets = bucketTasks(tasks);

  if (tasks.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-base-700 p-8 text-center text-sm text-neutral-500">
        Nothing assigned to you yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {buckets.map((bucket) => (
        <section key={bucket.key}>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
              {bucket.label} <span className="text-neutral-600">({bucket.tasks.length})</span>
            </h2>
            <p className="text-[11px] text-neutral-500">{bucket.hint}</p>
          </div>
          {bucket.tasks.length === 0 ? (
            <p className="rounded-lg border border-dashed border-base-700/60 p-4 text-center text-xs text-neutral-600">
              Nothing here.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {bucket.tasks.map((task) => {
                const project = projectById.get(task.projectId);
                const stageName = project?.stages.find((s) => s.id === task.stageId)?.name ?? null;
                return (
                  <TaskRow
                    key={task.id}
                    task={task}
                    stageName={stageName}
                    stages={project?.stages ?? []}
                    showProject
                    projectName={project?.name}
                    assignableMembers={assignableMembers}
                  />
                );
              })}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
