"use client";

import { useMemo, useState, useTransition } from "react";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  FileText,
  Flag,
  ListChecks,
  Pause,
  Play,
  Target,
  Zap,
} from "lucide-react";
import type { Project, Task, TaskFocusState } from "@/lib/types";
import {
  bulkCompleteFocusTasksAction,
  completeFocusTaskAction,
  pauseFocusTaskAction,
  startFocusTaskAction,
} from "@/lib/actions";
import { TaskDetailModal } from "./TaskDetailModal";
import { cn, formatDateKey } from "@/lib/utils";

function localDateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const priorityRank = { high: 0, medium: 1, low: 2 } as const;

function sortQueue(a: Task, b: Task): number {
  const ad = a.dueDate ?? a.scheduledFor ?? "9999-12-31";
  const bd = b.dueDate ?? b.scheduledFor ?? "9999-12-31";
  if (ad !== bd) return ad < bd ? -1 : 1;
  if (priorityRank[a.priority] !== priorityRank[b.priority]) {
    return priorityRank[a.priority] - priorityRank[b.priority];
  }
  return a.order - b.order;
}

function checklistProgress(task: Task): { done: number; total: number; percent: number; remaining: number } {
  const total = task.checklist.length;
  const done = task.checklist.filter((item) => item.done).length;
  const percent = total === 0 ? (task.status === "done" ? 100 : 0) : Math.round((done / total) * 100);
  return { done, total, percent, remaining: 100 - percent };
}

function priorityLabel(priority: Task["priority"]): string {
  if (priority === "high") return "High";
  if (priority === "low") return "Low";
  return "Medium";
}

function priorityTone(priority: Task["priority"]): string {
  if (priority === "high") return "text-rose-400";
  if (priority === "low") return "text-sky-400";
  return "text-amber-400";
}

function isCompletedToday(task: Task, today: string): boolean {
  if (!task.completedAt) return false;
  const date = new Date(task.completedAt);
  return localDateKey(date) === today;
}

function isPlannedForToday(task: Task, today: string, focusByTask: Map<string, TaskFocusState>): boolean {
  if (isCompletedToday(task, today)) return true;
  if (focusByTask.has(task.id) && task.status !== "done") return true;
  if (task.scheduledFor && task.scheduledFor <= today) return true;
  if (task.dueDate && task.dueDate <= today) return true;
  return false;
}

export function MemberFocusDashboard({
  tasks,
  projects,
  focusStates,
}: {
  tasks: Task[];
  projects: Project[];
  focusStates: TaskFocusState[];
}) {
  const [isPending, startTransition] = useTransition();
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<string[]>([]);
  const [browseOffset, setBrowseOffset] = useState(0);

  const today = localDateKey();
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const focusByTask = useMemo(() => new Map(focusStates.map((state) => [state.taskId, state])), [focusStates]);
  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);

  const openTasks = useMemo(() => tasks.filter((task) => task.status !== "done"), [tasks]);
  const completedToday = useMemo(
    () =>
      tasks
        .filter((task) => task.status === "done" && isCompletedToday(task, today))
        .sort((a, b) => (a.completedAt ?? "") < (b.completedAt ?? "") ? 1 : -1),
    [tasks, today],
  );

  const activeTask = focusStates
    .filter((state) => state.state === "active")
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .map((state) => taskById.get(state.taskId))
    .find((task): task is Task => !!task && task.status !== "done");

  const readyPaused = focusStates
    .filter((state) => state.state === "paused" && state.resumeAfterCompletions === 0)
    .map((state) => ({ state, task: taskById.get(state.taskId) }))
    .filter((item): item is { state: TaskFocusState; task: Task } => !!item.task && item.task.status !== "done")
    .sort((a, b) => sortQueue(a.task, b.task));

  const pausedIds = new Set(focusStates.filter((state) => state.state === "paused").map((state) => state.taskId));
  const queuedTasks = openTasks
    .filter((task) => task.id !== activeTask?.id && !pausedIds.has(task.id))
    .sort(sortQueue);

  const fallbackPaused = focusStates
    .filter((state) => state.state === "paused")
    .map((state) => taskById.get(state.taskId))
    .filter((task): task is Task => !!task && task.status !== "done")
    .sort(sortQueue);

  const naturalCurrent = activeTask ?? readyPaused[0]?.task ?? queuedTasks[0] ?? fallbackPaused[0] ?? null;
  const browsePool = [
    ...(naturalCurrent ? [naturalCurrent] : []),
    ...readyPaused.map((item) => item.task).filter((task) => task.id !== naturalCurrent?.id),
    ...queuedTasks.filter((task) => task.id !== naturalCurrent?.id),
    ...fallbackPaused.filter(
      (task) =>
        task.id !== naturalCurrent?.id &&
        !readyPaused.some((item) => item.task.id === task.id),
    ),
  ];
  const safeOffset = browsePool.length === 0 ? 0 : Math.min(browseOffset, browsePool.length - 1);
  const currentTask = browsePool[safeOffset] ?? null;
  const currentFocus = currentTask ? focusByTask.get(currentTask.id) : undefined;
  const nextTask = browsePool[safeOffset + 1] ?? queuedTasks.find((task) => task.id !== currentTask?.id) ?? null;

  const dailyCandidates = tasks.filter((task) => isPlannedForToday(task, today, focusByTask));
  const dailyTasks = dailyCandidates.length > 0 ? dailyCandidates : tasks.filter((task) => task.status !== "done" || isCompletedToday(task, today));
  const todayCompletedCount = dailyTasks.filter((task) => task.status === "done" && isCompletedToday(task, today)).length;
  const todayOpenCount = dailyTasks.filter((task) => task.status !== "done").length;
  const todayTotal = todayCompletedCount + todayOpenCount;
  const todayPercent = todayTotal === 0 ? 100 : Math.round((todayCompletedCount / todayTotal) * 100);

  const quickBatchTasks = openTasks
    .filter((task) => task.id !== currentTask?.id)
    .sort(sortQueue)
    .slice(0, 4);

  function toggleBatch(taskId: string) {
    setSelectedBatch((ids) => (ids.includes(taskId) ? ids.filter((id) => id !== taskId) : [...ids, taskId]));
  }

  function startTask(task: Task) {
    startTransition(async () => {
      await startFocusTaskAction(task.id);
      setBrowseOffset(0);
    });
  }

  function pauseTask(task: Task) {
    startTransition(async () => {
      await pauseFocusTaskAction(task.id);
      setBrowseOffset(0);
    });
  }

  function completeTask(task: Task) {
    startTransition(async () => {
      await completeFocusTaskAction(task.id);
      setBrowseOffset(0);
    });
  }

  function completeBatch() {
    if (selectedBatch.length === 0) return;
    const ids = [...selectedBatch];
    startTransition(async () => {
      await bulkCompleteFocusTasksAction(ids);
      setSelectedBatch([]);
      setBrowseOffset(0);
    });
  }

  const progress = currentTask ? checklistProgress(currentTask) : null;
  const currentProject = currentTask ? projectById.get(currentTask.projectId) : undefined;
  const currentIsActive = currentFocus?.state === "active";
  const currentIsPaused = currentFocus?.state === "paused";

  return (
    <div className={cn("grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]", isPending && "opacity-80")}>
      <main className="min-w-0 space-y-5">
        <section className="rounded-xl2 border border-base-700/60 bg-base-850 p-5 shadow-card">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div
              className="grid h-28 w-28 shrink-0 place-items-center rounded-full p-2"
              style={{ background: `conic-gradient(rgb(52 211 153) ${todayPercent}%, rgb(38 47 58) 0)` }}
            >
              <div className="grid h-full w-full place-items-center rounded-full bg-base-900">
                <span className="text-2xl font-semibold text-accent-300">{todayPercent}%</span>
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-500">Today&apos;s progress</p>
                <span className="flex items-center gap-1.5 text-xs text-neutral-500">
                  <CalendarDays size={13} />
                  {new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(new Date())}
                </span>
              </div>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-50">
                <span className="text-accent-300">{todayOpenCount}</span> {todayOpenCount === 1 ? "task" : "tasks"} left today
              </h1>
              <p className="mt-2 text-sm text-neutral-400">
                {todayCompletedCount} of {todayTotal} completed
                {todayTotal > 0 && todayOpenCount > 0 ? " · Keep it going." : ""}
              </p>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-base-700">
                <div className="h-full rounded-full bg-accent-400 transition-all duration-500" style={{ width: `${todayPercent}%` }} />
              </div>
            </div>
          </div>
        </section>

        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setBrowseOffset((n) => Math.max(0, n - 1))}
            disabled={safeOffset === 0}
            className="rounded-lg border border-base-700 bg-base-850 p-2 text-neutral-400 hover:text-neutral-100 disabled:opacity-30"
          >
            <ChevronLeft size={17} />
          </button>
          <p className="min-w-24 text-center text-sm text-neutral-400">
            {browsePool.length > 0 ? `Task ${safeOffset + 1} of ${browsePool.length}` : "No open tasks"}
          </p>
          <button
            type="button"
            onClick={() => setBrowseOffset((n) => Math.min(Math.max(0, browsePool.length - 1), n + 1))}
            disabled={safeOffset >= browsePool.length - 1}
            className="rounded-lg border border-base-700 bg-base-850 p-2 text-neutral-400 hover:text-neutral-100 disabled:opacity-30"
          >
            <ChevronRight size={17} />
          </button>
        </div>

        {currentTask ? (
          <section className="relative mx-auto max-w-3xl pb-5">
            {browsePool.length > safeOffset + 2 && (
              <div className="absolute inset-x-8 bottom-0 top-8 translate-x-7 rounded-xl2 border border-base-700/50 bg-base-900/70" />
            )}
            {browsePool.length > safeOffset + 1 && (
              <div className="absolute inset-x-4 bottom-2 top-4 translate-x-3 rounded-xl2 border border-base-700/60 bg-base-850/80" />
            )}
            <div className="relative rounded-xl2 border border-base-600 bg-base-850 p-5 shadow-card transition-transform duration-300">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="rounded-lg bg-sky-500/10 p-2 text-sky-400"><ListChecks size={18} /></span>
                  {currentTask.seoModule && (
                    <span className="rounded-full bg-sky-500/10 px-2.5 py-1 text-xs font-medium text-sky-300">
                      {currentTask.seoModule.replace("_", " ")}
                    </span>
                  )}
                </div>
                <span
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
                    currentIsActive
                      ? "bg-accent-500/10 text-accent-300"
                      : currentIsPaused
                        ? "bg-amber-500/10 text-amber-300"
                        : "bg-base-700 text-neutral-300",
                  )}
                >
                  <Circle size={8} fill="currentColor" />
                  {currentIsActive ? "In Progress" : currentIsPaused ? "Paused" : "Ready"}
                </span>
              </div>

              <button type="button" onClick={() => setDetailTask(currentTask)} className="mt-5 block w-full text-left">
                <h2 className="text-2xl font-semibold leading-tight text-neutral-50 hover:text-accent-300">{currentTask.title}</h2>
                <p className="mt-3 text-sm text-neutral-400">
                  Project: <span className="text-sky-400">{currentProject?.name ?? "Assigned project"}</span>
                </p>
                {(currentTask.why || currentTask.expectedOutcome || currentTask.notes) && (
                  <p className="mt-4 max-w-2xl text-sm leading-6 text-neutral-300">
                    {currentTask.why || currentTask.expectedOutcome || currentTask.notes}
                  </p>
                )}
              </button>

              <div className="mt-5 grid gap-3 border-y border-base-700/70 py-4 sm:grid-cols-3">
                <div className="flex items-center gap-3">
                  <Clock3 size={20} className="text-neutral-400" />
                  <div>
                    <p className="text-xs text-neutral-500">Due</p>
                    <p className="text-sm font-medium text-neutral-100">
                      {currentTask.dueDate ? formatDateKey(currentTask.dueDate) : "No due date"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Target size={20} className="text-neutral-400" />
                  <div>
                    <p className="text-xs text-neutral-500">Task progress</p>
                    <p className="text-sm font-medium text-neutral-100">
                      {progress?.total ? `${progress.done} / ${progress.total} steps` : `${progress?.percent ?? 0}% complete`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Flag size={20} className="text-neutral-400" />
                  <div>
                    <p className="text-xs text-neutral-500">Priority</p>
                    <p className={cn("text-sm font-semibold", priorityTone(currentTask.priority))}>{priorityLabel(currentTask.priority)}</p>
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="text-neutral-500">Current task</span>
                  <span className="font-medium text-neutral-300">
                    {progress?.percent ?? 0}% done · {progress?.remaining ?? 100}% left
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-base-700">
                  <div className="h-full rounded-full bg-accent-400 transition-all duration-500" style={{ width: `${progress?.percent ?? 0}%` }} />
                </div>
              </div>

              <div className="mt-5 grid gap-2 sm:grid-cols-3">
                {!currentIsActive ? (
                  <button
                    type="button"
                    onClick={() => startTask(currentTask)}
                    className="flex items-center justify-center gap-2 rounded-lg bg-accent-400 px-4 py-3 text-sm font-semibold text-base-950 hover:bg-accent-300"
                  >
                    <Play size={16} fill="currentColor" />
                    {currentIsPaused ? "Resume" : "Start"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => pauseTask(currentTask)}
                    className="flex items-center justify-center gap-2 rounded-lg border border-base-600 bg-base-800 px-4 py-3 text-sm font-medium text-neutral-200 hover:bg-base-700"
                  >
                    <Pause size={16} fill="currentColor" />
                    Pause
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDetailTask(currentTask)}
                  className="flex items-center justify-center gap-2 rounded-lg border border-base-600 bg-base-800 px-4 py-3 text-sm font-medium text-neutral-200 hover:bg-base-700"
                >
                  <FileText size={16} />
                  Full details
                </button>
                <button
                  type="button"
                  onClick={() => completeTask(currentTask)}
                  className="flex items-center justify-center gap-2 rounded-lg border border-base-600 bg-base-800 px-4 py-3 text-sm font-medium text-neutral-200 hover:border-accent-500/50 hover:text-accent-300"
                >
                  <Check size={17} />
                  Mark done
                </button>
              </div>
            </div>
          </section>
        ) : (
          <section className="rounded-xl2 border border-dashed border-base-700 p-10 text-center">
            <CheckCircle2 className="mx-auto text-accent-400" size={36} />
            <h2 className="mt-3 text-lg font-semibold text-neutral-100">You&apos;re caught up.</h2>
            <p className="mt-1 text-sm text-neutral-500">No assigned work is waiting for you.</p>
          </section>
        )}

        <section className="rounded-xl2 border border-base-700/60 bg-base-850 p-4">
          <div className="flex items-start gap-3">
            <Target className="mt-0.5 shrink-0 text-accent-400" size={22} />
            <div>
              <h3 className="text-sm font-semibold text-neutral-100">Today&apos;s Focus</h3>
              <p className="mt-1 text-sm text-neutral-500">
                Work one task at a time. Paused work automatically comes back after you finish the next task.
              </p>
            </div>
          </div>
        </section>
      </main>

      <aside className="space-y-5">
        <section className="rounded-xl2 border border-base-700/60 bg-base-850 p-4 shadow-card">
          <div className="flex items-center gap-2">
            <Zap size={22} className="text-accent-400" fill="currentColor" />
            <div>
              <h2 className="font-semibold text-neutral-100">Quick Batch Update</h2>
              <p className="text-xs text-neutral-500">Finished several tasks? Select them here.</p>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {quickBatchTasks.length === 0 && <p className="py-4 text-center text-xs text-neutral-600">No other open tasks.</p>}
            {quickBatchTasks.map((task) => {
              const selected = selectedBatch.includes(task.id);
              return (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => toggleBatch(task.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                    selected ? "border-accent-500/50 bg-accent-500/10" : "border-base-700 bg-base-900/60 hover:bg-base-800",
                  )}
                >
                  <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-base-700 text-neutral-300", selected && "bg-accent-500 text-base-950")}>
                    {selected ? <Check size={16} /> : <FileText size={15} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-neutral-100">{task.title}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-neutral-500">
                      {projectById.get(task.projectId)?.name ?? "Project"}
                    </span>
                  </span>
                  <span className="text-[11px] text-neutral-400">{selected ? "Selected" : "Done"}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            disabled={selectedBatch.length === 0}
            onClick={completeBatch}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-accent-500/60 px-3 py-2.5 text-sm font-medium text-accent-300 hover:bg-accent-500/10 disabled:cursor-not-allowed disabled:border-base-700 disabled:text-neutral-600"
          >
            <Check size={16} />
            Mark {selectedBatch.length || ""} {selectedBatch.length === 1 ? "Task" : "Tasks"} as Done
          </button>
        </section>

        <section className="rounded-xl2 border border-base-700/60 bg-base-850 p-4 shadow-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={21} className="text-accent-400" />
              <h2 className="font-semibold text-neutral-100">Recently Finished</h2>
            </div>
            <span className="text-xs text-neutral-600">{completedToday.length} today</span>
          </div>
          <div className="mt-3 divide-y divide-base-700/70">
            {completedToday.slice(0, 5).map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => setDetailTask(task)}
                className="flex w-full items-center gap-3 py-3 text-left"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-base-700 text-neutral-300">
                  <FileText size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-neutral-100">{task.title}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-neutral-500">
                    {projectById.get(task.projectId)?.name ?? "Project"}
                  </span>
                </span>
                <CheckCircle2 size={16} className="shrink-0 text-accent-400" />
              </button>
            ))}
            {completedToday.length === 0 && <p className="py-5 text-center text-xs text-neutral-600">Nothing finished today yet.</p>}
          </div>
        </section>

        {nextTask && (
          <section className="rounded-xl2 border border-base-700/60 bg-base-850 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Up next</p>
            <button type="button" onClick={() => setDetailTask(nextTask)} className="mt-2 w-full text-left">
              <p className="text-sm font-semibold text-neutral-100 hover:text-accent-300">{nextTask.title}</p>
              <p className="mt-1 text-xs text-neutral-500">{projectById.get(nextTask.projectId)?.name ?? "Project"}</p>
            </button>
          </section>
        )}
      </aside>

      {detailTask && (
        <TaskDetailModal
          task={detailTask}
          stages={projectById.get(detailTask.projectId)?.stages ?? []}
          projectName={projectById.get(detailTask.projectId)?.name}
          onClose={() => setDetailTask(null)}
        />
      )}
    </div>
  );
}
