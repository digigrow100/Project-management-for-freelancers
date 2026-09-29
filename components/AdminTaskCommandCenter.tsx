"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, CheckCircle2, Clock3, ExternalLink, PlayCircle, Search } from "lucide-react";
import type { Project, Task, TaskFocusState } from "@/lib/types";
import { cn } from "@/lib/utils";

type ActivityPayload = {
  openTasks: Task[];
  completedTasks: Task[];
  focusStates: TaskFocusState[];
};

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.floor(diff / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function AdminTaskCommandCenter({
  projects,
  initialOpenTasks,
  initialCompletedTasks,
  initialFocusStates,
}: {
  projects: Project[];
  initialOpenTasks: Task[];
  initialCompletedTasks: Task[];
  initialFocusStates: TaskFocusState[];
}) {
  const [openTasks, setOpenTasks] = useState(initialOpenTasks);
  const [completedTasks, setCompletedTasks] = useState(initialCompletedTasks);
  const [focusStates, setFocusStates] = useState(initialFocusStates);
  const [query, setQuery] = useState("");
  const [toastTask, setToastTask] = useState<Task | null>(null);
  const [unread, setUnread] = useState(0);
  const firstPoll = useRef(true);

  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const activeTaskIds = useMemo(
    () => new Set(focusStates.filter((state) => state.state === "active").map((state) => state.taskId)),
    [focusStates],
  );

  useEffect(() => {
    const latestInitial = initialCompletedTasks[0]?.completedAt ?? null;
    const stored = window.localStorage.getItem("admin-last-seen-completed-task-at");
    if (!stored && latestInitial) {
      window.localStorage.setItem("admin-last-seen-completed-task-at", latestInitial);
    }

    const poll = async () => {
      try {
        const response = await fetch("/api/admin/task-activity", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as ActivityPayload;

        const previousSeen = window.localStorage.getItem("admin-last-seen-completed-task-at");
        const fresh = payload.completedTasks.filter(
          (task) => task.completedAt && (!previousSeen || task.completedAt > previousSeen),
        );

        if (!firstPoll.current && fresh.length > 0) {
          const newest = fresh[0];
          setToastTask(newest);
          setUnread((count) => count + fresh.length);
          if (newest?.completedAt) {
            window.localStorage.setItem("admin-last-seen-completed-task-at", newest.completedAt);
          }
        }

        setOpenTasks(payload.openTasks);
        setCompletedTasks(payload.completedTasks);
        setFocusStates(payload.focusStates);
        firstPoll.current = false;
      } catch {
        // Keep the dashboard usable if a background refresh briefly fails.
      }
    };

    const id = window.setInterval(poll, 12000);
    return () => window.clearInterval(id);
  }, [initialCompletedTasks]);

  useEffect(() => {
    if (!toastTask) return;
    const id = window.setTimeout(() => setToastTask(null), 8000);
    return () => window.clearTimeout(id);
  }, [toastTask]);

  const filteredProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((project) => {
      const projectTasks = [...openTasks, ...completedTasks].filter((task) => task.projectId === project.id);
      return (
        project.name.toLowerCase().includes(q) ||
        projectTasks.some(
          (task) =>
            task.title.toLowerCase().includes(q) ||
            (task.assignedToName ?? "").toLowerCase().includes(q),
        )
      );
    });
  }, [projects, openTasks, completedTasks, query]);

  const runningTasks = openTasks.filter((task) => activeTaskIds.has(task.id));
  const recentCompleted = completedTasks.slice(0, 20);

  return (
    <section className="relative rounded-xl2 border border-base-700/60 bg-base-850 p-4 shadow-card">
      {toastTask && (
        <div className="fixed right-4 top-4 z-50 w-[min(92vw,390px)] rounded-xl border border-emerald-500/30 bg-base-900 p-4 shadow-2xl">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-500/10 text-emerald-300">
              <CheckCircle2 size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">Task completed</p>
              <p className="mt-1 text-sm font-semibold text-neutral-100">{toastTask.title}</p>
              <p className="mt-1 text-xs text-neutral-400">
                {toastTask.assignedToName ?? "Team member"} · {projectById.get(toastTask.projectId)?.name ?? "Project"}
              </p>
            </div>
            <button onClick={() => setToastTask(null)} className="text-xs text-neutral-500 hover:text-neutral-200">Close</button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-neutral-100">Team Task Control</h2>
            {unread > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                <Bell size={10} /> {unread} new
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            Live view of what is running and what the team has just completed.
          </p>
        </div>
        <label className="relative w-full sm:w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-600" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search project, task or member"
            className="w-full rounded-lg border border-base-600 bg-base-900 py-2 pl-9 pr-3 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-accent-500 focus:outline-none"
          />
        </label>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Summary label="Running now" value={runningTasks.length} icon={PlayCircle} active />
        <Summary label="Open tasks" value={openTasks.length} icon={Clock3} />
        <Summary label="Recently completed" value={recentCompleted.length} icon={CheckCircle2} />
      </div>

      <div className="mt-5 space-y-3">
        {filteredProjects.map((project) => {
          const projectOpen = openTasks.filter((task) => task.projectId === project.id);
          const projectDone = recentCompleted.filter((task) => task.projectId === project.id);
          const running = projectOpen.filter((task) => activeTaskIds.has(task.id));
          if (projectOpen.length === 0 && projectDone.length === 0) return null;

          return (
            <div key={project.id} className="rounded-xl border border-base-700/60 bg-base-900/45">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-base-700/50 px-4 py-3">
                <div>
                  <Link href={`/projects/${project.id}`} className="text-sm font-semibold text-neutral-100 hover:text-accent-300">
                    {project.name}
                  </Link>
                  <p className="mt-0.5 text-[11px] text-neutral-600">
                    {running.length} running · {projectOpen.length} open · {projectDone.length} recently completed
                  </p>
                </div>
                {project.type === "seo" && (
                  <div className="flex gap-2">
                    <Link
                      href={`/projects/${project.id}?seoTab=pages`}
                      className="rounded-md border border-base-600 px-2.5 py-1.5 text-[11px] text-neutral-300 hover:border-accent-500/50 hover:text-accent-300"
                    >
                      Website Pages
                    </Link>
                    <Link
                      href={`/projects/${project.id}?seoTab=reporting`}
                      className="rounded-md border border-base-600 px-2.5 py-1.5 text-[11px] text-neutral-300 hover:border-accent-500/50 hover:text-accent-300"
                    >
                      Reports
                    </Link>
                  </div>
                )}
              </div>

              <div className="grid gap-3 p-3 lg:grid-cols-2">
                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-600">Running / Open</p>
                  <div className="space-y-1.5">
                    {projectOpen.slice(0, 6).map((task) => {
                      const isRunning = activeTaskIds.has(task.id);
                      return (
                        <div key={task.id} className="flex items-center gap-3 rounded-lg border border-base-700/50 bg-base-850 px-3 py-2.5">
                          <span className={cn("h-2 w-2 shrink-0 rounded-full", isRunning ? "animate-pulse bg-emerald-400" : "bg-amber-400")} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium text-neutral-200">{task.title}</p>
                            <p className="mt-0.5 text-[10px] text-neutral-600">
                              {task.assignedToName ?? "Unassigned"}{task.isFallback ? " · Automatic audit" : ""}
                            </p>
                          </div>
                          <span className={cn("text-[10px]", isRunning ? "text-emerald-300" : "text-amber-300")}>
                            {isRunning ? "Running" : "Open"}
                          </span>
                        </div>
                      );
                    })}
                    {projectOpen.length === 0 && <p className="px-2 py-3 text-xs text-neutral-600">No open tasks.</p>}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-600">Recently Done</p>
                  <div className="space-y-1.5">
                    {projectDone.slice(0, 6).map((task) => (
                      <div key={task.id} className="flex items-center gap-3 rounded-lg border border-base-700/50 bg-base-850 px-3 py-2.5">
                        <CheckCircle2 size={14} className="shrink-0 text-emerald-400" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-neutral-200">{task.title}</p>
                          <p className="mt-0.5 text-[10px] text-neutral-600">
                            {task.assignedToName ?? "Team member"} · {timeAgo(task.completedAt)}
                          </p>
                        </div>
                      </div>
                    ))}
                    {projectDone.length === 0 && <p className="px-2 py-3 text-xs text-neutral-600">Nothing recently completed.</p>}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {filteredProjects.every((project) => {
          const hasOpen = openTasks.some((task) => task.projectId === project.id);
          const hasDone = recentCompleted.some((task) => task.projectId === project.id);
          return !hasOpen && !hasDone;
        }) && (
          <p className="rounded-lg border border-dashed border-base-700 p-8 text-center text-sm text-neutral-500">
            No matching task activity.
          </p>
        )}
      </div>
    </section>
  );
}

function Summary({
  label,
  value,
  icon: Icon,
  active = false,
}: {
  label: string;
  value: number;
  icon: typeof Clock3;
  active?: boolean;
}) {
  return (
    <div className="rounded-lg border border-base-700/60 bg-base-900/60 p-3">
      <div className="flex items-center justify-between">
        <Icon size={16} className={active ? "text-emerald-300" : "text-neutral-500"} />
        <span className="text-xl font-semibold text-neutral-100">{value}</span>
      </div>
      <p className="mt-2 text-[10px] uppercase tracking-wide text-neutral-600">{label}</p>
    </div>
  );
}
