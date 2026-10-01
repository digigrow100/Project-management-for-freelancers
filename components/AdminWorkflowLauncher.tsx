"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  AlarmClock,
  ArrowRight,
  CheckCircle2,
  Clock3,
  ListTodo,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";
import type { AdminWorkItem, AdminWorkflowSettings, Project } from "@/lib/types";
import {
  clearAdminWorkflowSnoozeAction,
  completeAdminWorkItemAction,
  getAdminWorkQueueAction,
  snoozeAdminWorkItemAction,
  snoozeAllAdminWorkAction,
} from "@/lib/actions";
import { cn } from "@/lib/utils";

const priorityRank = { high: 0, medium: 1, low: 2 } as const;

function sortItems(a: AdminWorkItem, b: AdminWorkItem) {
  if (a.source !== b.source) return a.source === "team_request" ? -1 : 1;
  if (priorityRank[a.priority] !== priorityRank[b.priority]) {
    return priorityRank[a.priority] - priorityRank[b.priority];
  }
  const ad = a.dueDate ?? "9999-12-31";
  const bd = b.dueDate ?? "9999-12-31";
  if (ad !== bd) return ad.localeCompare(bd);
  return a.createdAt.localeCompare(b.createdAt);
}

function isEligible(item: AdminWorkItem, now: number) {
  if (item.status !== "pending") return false;
  if (item.resumeMode === "after_next_task") return false;
  if (item.snoozedUntil && new Date(item.snoozedUntil).getTime() > now) return false;
  return true;
}

export function AdminWorkflowLauncher({
  initialItems,
  initialSettings,
  projects,
}: {
  initialItems: AdminWorkItem[];
  initialSettings: AdminWorkflowSettings;
  projects: Project[];
}) {
  const [isPending, startTransition] = useTransition();
  const [items, setItems] = useState(initialItems);
  const [settings, setSettings] = useState(initialSettings);
  const [open, setOpen] = useState(false);
  const [clockNow, setClockNow] = useState(() => Date.now());

  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const eligible = useMemo(
    () => items.filter((item) => isEligible(item, clockNow)).sort(sortItems),
    [items, clockNow],
  );
  const current = eligible[0] ?? null;
  const pendingCount = items.filter((item) => item.status === "pending").length;
  const teamCount = items.filter((item) => item.status === "pending" && item.source === "team_request").length;
  const workflowSnoozed =
    Boolean(settings.snoozedUntil) && new Date(settings.snoozedUntil as string).getTime() > clockNow;

  async function refreshQueue() {
    try {
      const result = await getAdminWorkQueueAction();
      setItems(result.items);
      setSettings(result.settings);
    } catch {
      // Keep the current queue visible if a refresh briefly fails.
    }
  }

  useEffect(() => {
    const tick = window.setInterval(() => setClockNow(Date.now()), 30000);
    const poll = window.setInterval(refreshQueue, 60000);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(poll);
    };
  }, []);

  useEffect(() => {
    if (open || workflowSnoozed || eligible.length === 0) return;
    const dismissedAt = Number(window.localStorage.getItem("admin-workflow-dismissed-at") ?? "0");
    const oneHour = 60 * 60 * 1000;
    if (!dismissedAt || Date.now() - dismissedAt >= oneHour) {
      const id = window.setTimeout(() => setOpen(true), 500);
      return () => window.clearTimeout(id);
    }
  }, [eligible.length, workflowSnoozed, open]);

  function closeForNow() {
    window.localStorage.setItem("admin-workflow-dismissed-at", String(Date.now()));
    setOpen(false);
  }

  function startWorkflow() {
    startTransition(async () => {
      if (workflowSnoozed) {
        await clearAdminWorkflowSnoozeAction();
        setSettings((currentSettings) => ({ ...currentSettings, snoozedUntil: null }));
      }
      window.localStorage.removeItem("admin-workflow-dismissed-at");
      await refreshQueue();
      setOpen(true);
    });
  }

  function completeCurrent() {
    if (!current) return;
    startTransition(async () => {
      await completeAdminWorkItemAction(current.id);
      setItems((list) => list.filter((item) => item.id !== current.id));
      await refreshQueue();
    });
  }

  function snoozeCurrent(mode: "30m" | "1h" | "after_next_task") {
    if (!current) return;
    startTransition(async () => {
      await snoozeAdminWorkItemAction(current.id, mode);
      const now = Date.now();
      setItems((list) =>
        list.map((item) =>
          item.id !== current.id
            ? item
            : {
                ...item,
                resumeMode: mode === "after_next_task" ? "after_next_task" : null,
                snoozedUntil:
                  mode === "30m"
                    ? new Date(now + 30 * 60000).toISOString()
                    : mode === "1h"
                      ? new Date(now + 60 * 60000).toISOString()
                      : null,
              },
        ),
      );
      await refreshQueue();
    });
  }

  function snoozeAll(minutes: 30 | 60 | 120) {
    startTransition(async () => {
      await snoozeAllAdminWorkAction(minutes);
      const until = new Date(Date.now() + minutes * 60000).toISOString();
      setSettings((currentSettings) => ({ ...currentSettings, snoozedUntil: until }));
      setOpen(false);
      window.localStorage.setItem("admin-workflow-dismissed-at", String(Date.now()));
    });
  }

  if (pendingCount === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={startWorkflow}
        className="fixed bottom-24 right-4 z-40 flex items-center gap-3 rounded-2xl border border-accent-500/25 bg-base-900/95 px-4 py-3 text-left shadow-2xl backdrop-blur md:bottom-5 md:right-5"
      >
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-500/12 text-accent-300">
          <ListTodo size={19} />
        </span>
        <span>
          <span className="block text-sm font-semibold text-neutral-100">Start My Work</span>
          <span className="mt-0.5 block text-[11px] text-neutral-500">
            {pendingCount} tasks{teamCount > 0 ? ` · ${teamCount} team requests` : ""}
          </span>
        </span>
        <ArrowRight size={16} className="text-neutral-500" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-3 backdrop-blur-md sm:p-6">
          <div className={cn(
            "w-full max-w-2xl overflow-hidden rounded-3xl border bg-base-900 shadow-[0_30px_100px_rgba(0,0,0,.55)]",
            current?.source === "team_request" ? "border-rose-500/30" : "border-base-600",
          )}>
            <div className={cn(
              "border-b px-5 py-4 sm:px-6",
              current?.source === "team_request"
                ? "border-rose-500/20 bg-gradient-to-r from-rose-500/10 via-base-900 to-base-900"
                : "border-base-700 bg-gradient-to-r from-accent-500/8 via-base-900 to-base-900",
            )}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span className={cn(
                    "grid h-11 w-11 shrink-0 place-items-center rounded-2xl",
                    current?.source === "team_request"
                      ? "bg-rose-500/15 text-rose-300"
                      : "bg-accent-500/12 text-accent-300",
                  )}>
                    {current?.source === "team_request" ? <ShieldAlert size={20} /> : <Sparkles size={20} />}
                  </span>
                  <div className="min-w-0">
                    <p className={cn(
                      "text-[11px] font-semibold uppercase tracking-[0.16em]",
                      current?.source === "team_request" ? "text-rose-300" : "text-accent-300",
                    )}>
                      {current?.source === "team_request" ? "High Priority · Team Request" : "My Task"}
                    </p>
                    <h2 className="mt-1 text-xl font-semibold leading-snug text-neutral-50 sm:text-2xl">
                      {current?.title ?? "No task ready right now"}
                    </h2>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeForNow}
                  className="rounded-xl p-2 text-neutral-500 hover:bg-base-800 hover:text-neutral-200"
                  aria-label="Close workflow"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {current ? (
              <>
                <div className="space-y-4 px-5 py-5 sm:px-6">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Info label="Priority" value={current.priority.toUpperCase()} tone={current.priority === "high" ? "rose" : "neutral"} />
                    <Info
                      label="Project"
                      value={current.projectId ? projectById.get(current.projectId)?.name ?? "Project" : "Personal"}
                    />
                    <Info label="Due" value={current.dueDate ?? "No due date"} />
                  </div>

                  {current.source === "team_request" && (
                    <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4">
                      <p className="text-xs font-semibold text-rose-300">
                        Sent by {current.sentByName ?? "Team member"}
                      </p>
                      <p className="mt-1 text-xs text-neutral-500">{current.sentReason || "Admin action required"}</p>
                      {current.sentNote && (
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-neutral-200">{current.sentNote}</p>
                      )}
                    </div>
                  )}

                  {current.details && (
                    <div className="rounded-2xl border border-base-700 bg-base-950/45 p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-600">Details</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-300">{current.details}</p>
                    </div>
                  )}

                  <div className="rounded-2xl border border-base-700/70 bg-base-850 p-3">
                    <div className="flex items-center gap-2 text-xs text-neutral-500">
                      <Clock3 size={14} />
                      Task {eligible.indexOf(current) + 1} of {eligible.length} ready now · {pendingCount} total pending
                    </div>
                  </div>
                </div>

                <div className="border-t border-base-700/70 px-5 py-4 sm:px-6">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={completeCurrent}
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-base-950 hover:bg-emerald-400 disabled:opacity-60"
                    >
                      <CheckCircle2 size={17} />
                      {current.source === "team_request" ? "Done & Return to Team" : "Done"}
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => snoozeCurrent("30m")}
                      className="rounded-xl border border-base-600 bg-base-850 px-3 py-3 text-xs font-medium text-neutral-300 hover:bg-base-800"
                    >
                      30 min
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => snoozeCurrent("1h")}
                      className="rounded-xl border border-base-600 bg-base-850 px-3 py-3 text-xs font-medium text-neutral-300 hover:bg-base-800"
                    >
                      1 hour
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => snoozeCurrent("after_next_task")}
                      className="rounded-xl border border-base-600 bg-base-850 px-3 py-3 text-xs font-medium text-neutral-300 hover:bg-base-800"
                    >
                      After next task
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-2">
                      {current.projectId && (
                        <Link
                          href={`/projects/${current.projectId}`}
                          className="text-xs text-sky-400 hover:text-sky-300"
                        >
                          Open project
                        </Link>
                      )}
                      <Link href="/admin/my-tasks" className="text-xs text-neutral-500 hover:text-neutral-300">
                        Open My Tasks
                      </Link>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <AlarmClock size={13} className="text-neutral-600" />
                      <span className="text-[10px] text-neutral-600">Snooze all:</span>
                      <button onClick={() => snoozeAll(30)} className="text-[10px] text-neutral-400 hover:text-neutral-200">30m</button>
                      <span className="text-neutral-700">·</span>
                      <button onClick={() => snoozeAll(60)} className="text-[10px] text-neutral-400 hover:text-neutral-200">1h</button>
                      <span className="text-neutral-700">·</span>
                      <button onClick={() => snoozeAll(120)} className="text-[10px] text-neutral-400 hover:text-neutral-200">2h</button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="px-6 py-10 text-center">
                <CheckCircle2 size={34} className="mx-auto text-emerald-400" />
                <h3 className="mt-3 text-lg font-semibold text-neutral-100">Nothing ready right now</h3>
                <p className="mt-1 text-sm text-neutral-500">
                  Your remaining tasks are snoozed or waiting until another task is completed.
                </p>
                <button
                  onClick={() => setOpen(false)}
                  className="mt-5 rounded-xl border border-base-600 px-4 py-2 text-sm text-neutral-300"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Info({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "rose";
}) {
  return (
    <div className="rounded-xl border border-base-700 bg-base-850 px-3 py-3">
      <p className="text-[10px] uppercase tracking-wide text-neutral-600">{label}</p>
      <p className={cn("mt-1 truncate text-xs font-semibold", tone === "rose" ? "text-rose-300" : "text-neutral-200")}>
        {value}
      </p>
    </div>
  );
}
