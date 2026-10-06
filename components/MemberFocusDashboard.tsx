"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
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
  ShieldAlert,
  X,
  Target,
} from "lucide-react";
import type { Project, Task, TaskFocusState, TaskSkipReason } from "@/lib/types";
import {
  completeFocusTaskAction,
  pauseFocusTaskAction,
  sendTaskToAdminAction,
  setAssignedPageChecklistStatusAction,
  setPausedTaskPendingModeAction,
  skipFocusTaskAction,
  startFocusTaskAction,
  toggleChecklistItemAction,
} from "@/lib/actions";
import { MemberTaskDetailModal } from "./MemberTaskDetailModal";
import { cn, formatDateKey } from "@/lib/utils";

function localDateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const priorityRank = { high: 0, medium: 1, low: 2 } as const;

function isActionableManualTask(task: Task, today = localDateKey()): boolean {
  if (task.isFallback || task.status === "done") return false;
  if (!task.scheduledFor && !task.dueDate) return true;
  if (task.scheduledFor && task.scheduledFor <= today) return true;
  if (task.dueDate && task.dueDate <= today) return true;
  return false;
}

function sortQueue(a: Task, b: Task): number {
  const today = localDateKey();
  const aManualNow = isActionableManualTask(a, today);
  const bManualNow = isActionableManualTask(b, today);
  if (aManualNow !== bManualNow) return aManualNow ? -1 : 1;

  // When no manual work is due today, the generated SEO workflow task comes
  // before normal tasks scheduled for a future date.
  if (a.isFallback !== b.isFallback) return a.isFallback ? -1 : 1;

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

function formatTrackedTime(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
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
  timeTotals,
}: {
  tasks: Task[];
  projects: Project[];
  focusStates: TaskFocusState[];
  timeTotals: Record<string, number>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [browseOffset, setBrowseOffset] = useState(0);
  const [skipReason, setSkipReason] = useState<TaskSkipReason>("waiting_for_client");
  const [adminRequestOpen, setAdminRequestOpen] = useState(false);
  const [adminNote, setAdminNote] = useState("");
  const [pendingPanelOpen, setPendingPanelOpen] = useState(false);
  const [clockNow, setClockNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setClockNow(Date.now()), 1000);
    const refreshId = window.setInterval(() => router.refresh(), 45000);
    return () => {
      window.clearInterval(id);
      window.clearInterval(refreshId);
    };
  }, [router]);

  const today = localDateKey();
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const focusByTask = useMemo(() => new Map(focusStates.map((state) => [state.taskId, state])), [focusStates]);
  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);

  const openTasks = useMemo(
    () => tasks.filter((task) => task.status !== "done" && !task.waitingForAdmin),
    [tasks],
  );
  const hasNormalOpenTasks = openTasks.some((task) => isActionableManualTask(task, today));
  const completedToday = useMemo(
    () =>
      tasks
        .filter((task) => task.status === "done" && isCompletedToday(task, today))
        .sort((a, b) => (a.completedAt ?? "") < (b.completedAt ?? "") ? 1 : -1),
    [tasks, today],
  );

  const doneTasks = useMemo(
    () =>
      tasks
        .filter((task) => task.status === "done")
        .sort((a, b) => (a.completedAt ?? "") < (b.completedAt ?? "") ? 1 : -1),
    [tasks],
  );

  const activeTask = focusStates
    .filter((state) => state.state === "active")
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .map((state) => taskById.get(state.taskId))
    .find((task): task is Task => !!task && task.status !== "done" && !task.waitingForAdmin);

  const readyPaused = focusStates
    .filter(
      (state) =>
        state.state === "paused" &&
        !state.keepPending &&
        (
          (state.availableOn ? state.availableOn <= today : state.resumeAfterCompletions === 0)
        ),
    )
    .map((state) => ({ state, task: taskById.get(state.taskId) }))
    .filter(
      (item): item is { state: TaskFocusState; task: Task } =>
        !!item.task &&
        item.task.status !== "done" &&
        !item.task.waitingForAdmin &&
        (!hasNormalOpenTasks || !item.task.isFallback),
    )
    .sort((a, b) => sortQueue(a.task, b.task));

  const pausedIds = new Set(focusStates.filter((state) => state.state === "paused").map((state) => state.taskId));
  const queuedTasks = openTasks
    .filter((task) => task.id !== activeTask?.id && !pausedIds.has(task.id))
    .sort(sortQueue);

  // A paused/skipped task with resumeAfterCompletions > 0 is deliberately
  // deferred. Never use it as a fallback current task: doing that makes two
  // skipped tasks bounce between each other forever when no fresh task exists.
  const waitingPaused = focusStates
    .filter(
      (state) =>
        state.state === "paused" &&
        (
          state.keepPending ||
          (state.availableOn ? state.availableOn > today : state.resumeAfterCompletions > 0)
        ),
    )
    .map((state) => ({ state, task: taskById.get(state.taskId) }))
    .filter(
      (item): item is { state: TaskFocusState; task: Task } =>
        !!item.task && item.task.status !== "done" && !item.task.waitingForAdmin,
    )
    .sort((a, b) => sortQueue(a.task, b.task));

  const naturalCurrent = activeTask ?? readyPaused[0]?.task ?? queuedTasks[0] ?? null;
  const browsePool = [
    ...(naturalCurrent ? [naturalCurrent] : []),
    ...readyPaused.map((item) => item.task).filter((task) => task.id !== naturalCurrent?.id),
    ...queuedTasks.filter((task) => task.id !== naturalCurrent?.id),
  ];
  const safeOffset = browsePool.length === 0 ? 0 : Math.min(browseOffset, browsePool.length - 1);
  const currentTask = browsePool[safeOffset] ?? null;
  const currentFocus = currentTask ? focusByTask.get(currentTask.id) : undefined;

  const dailyCandidates = tasks.filter(
    (task) => !task.waitingForAdmin && isPlannedForToday(task, today, focusByTask),
  );
  const dailyTasks = dailyCandidates.length > 0
    ? dailyCandidates
    : tasks.filter((task) => !task.waitingForAdmin && (task.status !== "done" || isCompletedToday(task, today)));
  const todayCompletedCount = dailyTasks.filter((task) => task.status === "done" && isCompletedToday(task, today)).length;
  const todayOpenCount = dailyTasks.filter((task) => task.status !== "done").length;
  const todayTotal = todayCompletedCount + todayOpenCount;
  const todayPercent = todayTotal === 0 ? 100 : Math.round((todayCompletedCount / todayTotal) * 100);

  const pendingItems = focusStates
    .filter((state) => state.state === "paused")
    .map((state) => ({ state, task: taskById.get(state.taskId) }))
    .filter(
      (item): item is { state: TaskFocusState; task: Task } =>
        !!item.task && item.task.status !== "done" && !item.task.waitingForAdmin,
    )
    .sort((a, b) => sortQueue(a.task, b.task));

  const upcomingTasks = openTasks
    .filter((task) => task.id !== activeTask?.id && !pausedIds.has(task.id))
    .sort(sortQueue);

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

  function setPendingMode(task: Task, mode: "tomorrow" | "keep_pending") {
    startTransition(async () => {
      await setPausedTaskPendingModeAction(task.id, mode);
      router.refresh();
      setBrowseOffset(0);
    });
  }

  function skipTask(task: Task) {
    startTransition(async () => {
      await skipFocusTaskAction(task.id, skipReason);
      setBrowseOffset(0);
    });
  }

  function toggleChecklist(task: Task, itemId: string) {
    startTransition(async () => {
      await toggleChecklistItemAction(task.id, task.projectId, itemId);
    });
  }

  function sendToAdmin(task: Task) {
    startTransition(async () => {
      await sendTaskToAdminAction(task.id, adminNote);
      router.refresh();
      setAdminNote("");
      setAdminRequestOpen(false);
      setBrowseOffset(0);
    });
  }

  function markNotRequired(task: Task, itemId: string) {
    startTransition(async () => {
      await setAssignedPageChecklistStatusAction(task.id, itemId, "not_applicable");
    });
  }

  function completeTask(task: Task) {
    startTransition(async () => {
      await completeFocusTaskAction(task.id);
      setBrowseOffset(0);
    });
  }

  const progress = currentTask ? checklistProgress(currentTask) : null;
  const currentProject = currentTask ? projectById.get(currentTask.projectId) : undefined;
  const currentIsActive = currentFocus?.state === "active";
  const currentIsPaused = currentFocus?.state === "paused";
  const currentIsCarryover =
    currentIsPaused &&
    !currentFocus?.keepPending &&
    Boolean(currentFocus?.availableOn && currentFocus.availableOn <= today);

  const currentClosedSeconds = currentTask ? (timeTotals[currentTask.id] ?? 0) : 0;
  const currentLiveSeconds =
    currentIsActive && currentFocus?.startedAt
      ? Math.max(0, Math.floor((clockNow - new Date(currentFocus.startedAt).getTime()) / 1000))
      : 0;
  const currentTrackedSeconds = currentClosedSeconds + currentLiveSeconds;

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
                  {currentIsActive ? "In Progress" : currentIsCarryover ? "Carryover" : currentIsPaused ? "Paused" : "Ready"}
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

              <div className="mt-5 rounded-xl border border-sky-500/20 bg-sky-500/5 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-sky-500/10 text-sky-300">
                      <Clock3 size={18} />
                    </span>
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500">Time tracked</p>
                      <p className="mt-0.5 font-mono text-2xl font-semibold tracking-tight text-neutral-50">
                        {formatTrackedTime(currentTrackedSeconds)}
                      </p>
                    </div>
                  </div>
                  <span className={cn(
                    "flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium",
                    currentIsActive ? "bg-emerald-500/10 text-emerald-300" : "bg-base-800 text-neutral-400",
                  )}>
                    <span className={cn("h-2 w-2 rounded-full", currentIsActive ? "animate-pulse bg-emerald-400" : "bg-neutral-600")} />
                    {currentIsActive ? "Timer running" : currentIsPaused ? "Timer paused" : "Timer ready"}
                  </span>
                </div>
              </div>

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

              {currentTask.checklist.length > 0 && (
                <div className="mt-5 rounded-xl border border-base-700/70 bg-base-900/45 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Checklist</h3>
                    <span className="text-[11px] text-neutral-500">
                      {progress?.done ?? 0}/{progress?.total ?? 0} complete
                    </span>
                  </div>
                  <div className="grid gap-1.5">
                    {currentTask.checklist.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        disabled={isPending}
                        onClick={() => toggleChecklist(currentTask, item.id)}
                        className="flex w-full items-center gap-2.5 rounded-lg border border-base-700/50 bg-base-950/55 px-3 py-2.5 text-left hover:border-base-600 disabled:opacity-60"
                      >
                        <span className={item.done ? "text-emerald-400" : "text-neutral-600"}>
                          {item.done ? <CheckCircle2 size={17} /> : <Circle size={17} />}
                        </span>
                        <span className={cn("min-w-0 flex-1 text-sm", item.done ? "text-neutral-500 line-through" : "text-neutral-200")}>
                          {item.text}
                        </span>
                        {item.id.startsWith("pageaudit:") && !item.done && (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(event) => {
                              event.stopPropagation();
                              markNotRequired(currentTask, item.id);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                event.stopPropagation();
                                markNotRequired(currentTask, item.id);
                              }
                            }}
                            className="shrink-0 rounded-md border border-base-600 px-2 py-1 text-[10px] font-medium text-neutral-400 hover:border-amber-500/40 hover:text-amber-300"
                          >
                            Not Required for This Page
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {!currentIsActive ? (
                  <button
                    type="button"
                    onClick={() => startTask(currentTask)}
                    className="flex items-center justify-center gap-2 rounded-lg bg-accent-400 px-4 py-3 text-sm font-semibold text-base-950 hover:bg-accent-300"
                  >
                    <Play size={16} fill="currentColor" />
                    {currentIsPaused ? "Continue" : "Start"}
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
                <div className="flex min-w-0 gap-1.5">
                  <select
                    value={skipReason}
                    onChange={(event) => setSkipReason(event.target.value as TaskSkipReason)}
                    className="min-w-0 flex-1 rounded-lg border border-base-600 bg-base-900 px-2 py-2 text-xs text-neutral-300"
                    aria-label="Reason for moving to next task"
                  >
                    <option value="waiting_for_client">Waiting for client</option>
                    <option value="login_required">Login required</option>
                    <option value="content_required">Content required</option>
                    <option value="other">Other</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => skipTask(currentTask)}
                    className="flex shrink-0 items-center justify-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-xs font-semibold text-amber-300 hover:bg-amber-500/15"
                  >
                    Next task
                    <ChevronRight size={15} />
                  </button>
                </div>
                <button
                  type="button"
                  disabled={Boolean(progress?.total && progress.done < progress.total)}
                  onClick={() => completeTask(currentTask)}
                  className="flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-3 text-sm font-semibold text-base-950 shadow-sm hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-base-700 disabled:text-neutral-500"
                  title={progress?.total && progress.done < progress.total ? "Complete the checklist first" : "Mark task done"}
                >
                  <Check size={17} />
                  Mark done
                </button>
              </div>

              <div className="mt-3">
                {!adminRequestOpen ? (
                  <button
                    type="button"
                    onClick={() => setAdminRequestOpen(true)}
                    className="inline-flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/15"
                  >
                    <ShieldAlert size={15} />
                    Send to Admin
                  </button>
                ) : (
                  <div className="rounded-xl border border-rose-500/25 bg-rose-500/5 p-3">
                    <div className="flex items-start gap-3">
                      <ShieldAlert size={18} className="mt-0.5 shrink-0 text-rose-300" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-neutral-100">Admin action required</p>
                        <p className="mt-1 text-xs text-neutral-500">
                          This task will leave your queue until the admin resolves it and returns it to you.
                        </p>
                        <textarea
                          value={adminNote}
                          onChange={(event) => setAdminNote(event.target.value)}
                          rows={3}
                          placeholder="Tell admin exactly what you need..."
                          className="mt-3 w-full resize-none rounded-lg border border-base-600 bg-base-950 px-3 py-2 text-sm text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-rose-500/50"
                        />
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => sendToAdmin(currentTask)}
                            className="rounded-lg bg-rose-500 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-400 disabled:opacity-60"
                          >
                            Send to Admin
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAdminRequestOpen(false);
                              setAdminNote("");
                            }}
                            className="rounded-lg border border-base-600 px-3 py-2 text-xs text-neutral-400 hover:text-neutral-200"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        ) : waitingPaused.length > 0 ? (
          <section className="rounded-xl2 border border-dashed border-amber-500/30 bg-amber-500/5 p-10 text-center">
            <Pause className="mx-auto text-amber-300" size={36} />
            <h2 className="mt-3 text-lg font-semibold text-neutral-100">Remaining tasks are deferred.</h2>
            <p className="mx-auto mt-1 max-w-xl text-sm text-neutral-500">
              No fresh task is available right now. Paused work is safely stored in Pending Tasks and will return on its selected day,
              unless it is marked Keep Pending.
            </p>
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
                Work one task at a time. Paused work leaves today&apos;s rotation, stays in Pending Tasks, and can return as carryover on the next work day.
              </p>
            </div>
          </div>
        </section>
      </main>

      <aside className="space-y-5">
        <section className="rounded-xl2 border border-base-700/60 bg-base-850 p-4 shadow-card">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-neutral-100">Upcoming Tasks</h2>
              <p className="mt-0.5 text-xs text-neutral-500">Tasks waiting in your queue.</p>
            </div>
            <span className="grid h-7 min-w-7 place-items-center rounded-full bg-sky-500/10 px-2 text-xs font-semibold text-sky-300">
              {upcomingTasks.length}
            </span>
          </div>

          <div className="mt-3 space-y-2">
            {upcomingTasks.slice(0, 6).map((task, index) => (
              <button
                key={task.id}
                type="button"
                onClick={() => setDetailTask(task)}
                className="flex w-full items-center gap-3 rounded-lg border border-base-700 bg-base-900/60 px-3 py-2.5 text-left hover:bg-base-800"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-sky-500/10 text-xs font-semibold text-sky-300">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-neutral-100">{task.title}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-neutral-500">
                    {projectById.get(task.projectId)?.name ?? "Project"}
                  </span>
                </span>
                <span className={cn("text-[10px] font-semibold uppercase", priorityTone(task.priority))}>
                  {priorityLabel(task.priority)}
                </span>
              </button>
            ))}
            {upcomingTasks.length === 0 && (
              <p className="py-4 text-center text-xs text-neutral-600">No upcoming tasks.</p>
            )}
          </div>
        </section>

        <section className="rounded-xl2 border border-base-700/60 bg-base-850 p-4 shadow-card">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-neutral-100">Done Tasks</h2>
              <p className="mt-0.5 text-xs text-neutral-500">Recently completed assigned work.</p>
            </div>
            <span className="grid h-7 min-w-7 place-items-center rounded-full bg-emerald-500/10 px-2 text-xs font-semibold text-emerald-300">
              {doneTasks.length}
            </span>
          </div>

          <div className="mt-3 space-y-2">
            {doneTasks.slice(0, 6).map((task, index) => (
              <button
                key={task.id}
                type="button"
                onClick={() => setDetailTask(task)}
                className="flex w-full items-center gap-3 rounded-lg border border-base-700 bg-base-900/40 px-3 py-2.5 text-left"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-500/10 text-xs font-semibold text-emerald-300">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-neutral-200">{task.title}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-neutral-600">
                    {projectById.get(task.projectId)?.name ?? "Project"}
                  </span>
                </span>
                <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />
              </button>
            ))}
            {doneTasks.length === 0 && (
              <p className="py-4 text-center text-xs text-neutral-600">No completed tasks yet.</p>
            )}
          </div>
        </section>
      </aside>
      {pendingItems.length > 0 && (
        <div className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-2xl md:left-auto md:right-5 md:mx-0 md:w-[460px]">
          {pendingPanelOpen && (
            <div className="mb-2 max-h-[52vh] overflow-y-auto rounded-xl2 border border-amber-500/25 bg-base-900/95 p-3 shadow-2xl backdrop-blur">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-neutral-100">Pending Tasks</p>
                  <p className="text-[11px] text-neutral-500">Paused work stays here without interrupting the normal queue.</p>
                </div>
                <button type="button" onClick={() => setPendingPanelOpen(false)} className="rounded-lg p-2 text-neutral-500 hover:bg-base-800 hover:text-neutral-200">
                  <X size={15} />
                </button>
              </div>
              <div className="space-y-2">
                {pendingItems.map(({ task, state }) => (
                  <div key={task.id} className="rounded-xl border border-base-700 bg-base-850 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <button type="button" onClick={() => setDetailTask(task)} className="min-w-0 flex-1 text-left">
                        <p className="truncate text-sm font-semibold text-neutral-100">{task.title}</p>
                        <p className="mt-1 truncate text-[11px] text-neutral-500">{projectById.get(task.projectId)?.name ?? "Project"}</p>
                      </button>
                      <span className={cn(
                        "shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold",
                        state.keepPending
                          ? "bg-rose-500/10 text-rose-300"
                          : state.availableOn && state.availableOn <= today
                            ? "bg-sky-500/10 text-sky-300"
                            : "bg-amber-500/10 text-amber-300",
                      )}>
                        {state.keepPending ? "Keep Pending" : state.availableOn && state.availableOn <= today ? "Carryover" : "Tomorrow"}
                      </span>
                    </div>
                    {state.skipReason && (
                      <p className="mt-2 text-[11px] text-neutral-500">Reason: {state.skipReason.replaceAll("_", " ")}</p>
                    )}
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => startTask(task)}
                        className="rounded-lg bg-accent-400 px-2 py-2 text-[11px] font-semibold text-base-950 hover:bg-accent-300 disabled:opacity-60"
                      >
                        Continue
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => setPendingMode(task, "tomorrow")}
                        className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-2 py-2 text-[11px] font-semibold text-amber-300 disabled:opacity-60"
                      >
                        Return Tomorrow
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => setPendingMode(task, "keep_pending")}
                        className="rounded-lg border border-base-600 bg-base-800 px-2 py-2 text-[11px] font-semibold text-neutral-300 disabled:opacity-60"
                      >
                        Keep Pending
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => setPendingPanelOpen((open) => !open)}
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-base-900/95 px-4 py-3 text-left shadow-xl backdrop-blur hover:bg-base-850"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-amber-500/10 text-amber-300">
                <Pause size={15} />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-neutral-100">Pending Tasks · {pendingItems.length}</span>
                <span className="block truncate text-[11px] text-neutral-500">
                  {pendingItems[0]?.task.title ?? "Paused work"}
                </span>
              </span>
            </span>
            <span className="text-[11px] font-semibold text-amber-300">{pendingPanelOpen ? "Hide" : "View"}</span>
          </button>
        </div>
      )}

      {detailTask && (
        <MemberTaskDetailModal
          task={detailTask}
          projectName={projectById.get(detailTask.projectId)?.name}
          onClose={() => setDetailTask(null)}
        />
      )}
    </div>
  );
}
