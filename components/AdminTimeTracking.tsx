"use client";

import { useMemo, useState } from "react";
import { Activity, CheckCircle2, Clock3, FolderKanban, Search, TimerReset, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { TaskTimeSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  if (hours >= 1) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  if (minutes >= 1) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  return `${seconds}s`;
}

function formatDetailedDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function formatActivityTime(value: string): string {
  return value.slice(0, 16).replace("T", " ") + " UTC";
}

export function AdminTimeTracking({ summaries }: { summaries: TaskTimeSummary[] }) {
  const [query, setQuery] = useState("");
  const [project, setProject] = useState("all");
  const [member, setMember] = useState("all");
  const [status, setStatus] = useState<"all" | "active" | "completed" | "in_progress">("all");

  const projects = useMemo(
    () => Array.from(new Map(summaries.map((row) => [row.projectId, row.projectName])).entries()).sort((a, b) => a[1].localeCompare(b[1])),
    [summaries],
  );
  const members = useMemo(
    () => Array.from(new Map(summaries.map((row) => [row.userId, row.userName])).entries()).sort((a, b) => a[1].localeCompare(b[1])),
    [summaries],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return summaries.filter((row) => {
      if (project !== "all" && row.projectId !== project) return false;
      if (member !== "all" && row.userId !== member) return false;
      if (status === "active" && !row.isActive) return false;
      if (status === "completed" && row.taskStatus !== "done") return false;
      if (status === "in_progress" && row.taskStatus === "done") return false;
      if (q && ![row.taskTitle, row.projectName, row.userName].some((value) => value.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [summaries, query, project, member, status]);

  const totalSeconds = filtered.reduce((sum, row) => sum + row.totalSeconds, 0);
  const activeCount = filtered.filter((row) => row.isActive).length;
  const completedCount = filtered.filter((row) => row.taskStatus === "done").length;
  const projectCount = new Set(filtered.map((row) => row.projectId)).size;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Clock3} label="Tracked time" value={formatDuration(totalSeconds)} />
        <Stat icon={Activity} label="Active timers" value={String(activeCount)} active={activeCount > 0} />
        <Stat icon={CheckCircle2} label="Completed tasks" value={String(completedCount)} />
        <Stat icon={FolderKanban} label="Projects" value={String(projectCount)} />
      </div>

      <section className="rounded-xl2 border border-base-700/60 bg-base-850 p-4 shadow-card">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-neutral-100">Task time history</h2>
            <p className="mt-1 text-xs text-neutral-500">
              Time is recorded automatically when a member starts, pauses, continues, or completes a focused task.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <TimerReset size={14} />
            {filtered.length} tracked task{filtered.length === 1 ? "" : "s"}
          </div>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <label className="relative md:col-span-2 xl:col-span-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-600" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search task, project or member"
              className="w-full rounded-lg border border-base-600 bg-base-900 py-2 pl-9 pr-3 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-accent-500 focus:outline-none"
            />
          </label>
          <select value={project} onChange={(event) => setProject(event.target.value)} className="rounded-lg border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-300 focus:border-accent-500 focus:outline-none">
            <option value="all">All projects</option>
            {projects.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <select value={member} onChange={(event) => setMember(event.target.value)} className="rounded-lg border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-300 focus:border-accent-500 focus:outline-none">
            <option value="all">All members</option>
            {members.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="rounded-lg border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-300 focus:border-accent-500 focus:outline-none">
            <option value="all">All statuses</option>
            <option value="active">Timer running</option>
            <option value="in_progress">Open tasks</option>
            <option value="completed">Completed tasks</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-base-700 p-8 text-center">
            <Clock3 size={28} className="mx-auto text-neutral-600" />
            <p className="mt-2 text-sm text-neutral-400">No tracked task time matches these filters.</p>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border border-base-700/70">
            <table className="w-full min-w-[900px] border-collapse text-left">
              <thead className="bg-base-900/80 text-[10px] uppercase tracking-[0.12em] text-neutral-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Task</th>
                  <th className="px-4 py-3 font-medium">Project</th>
                  <th className="px-4 py-3 font-medium">Member</th>
                  <th className="px-4 py-3 font-medium">Tracked time</th>
                  <th className="px-4 py-3 font-medium">Sessions</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Last activity</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={`${row.taskId}:${row.userId}`} className="border-t border-base-700/60 hover:bg-base-900/45">
                    <td className="max-w-[300px] px-4 py-3">
                      <p className="truncate text-sm font-medium text-neutral-100" title={row.taskTitle}>{row.taskTitle}</p>
                      {row.completedAt && <p className="mt-1 text-[10px] text-neutral-600">Completed {new Date(row.completedAt).toLocaleDateString()}</p>}
                    </td>
                    <td className="px-4 py-3 text-xs text-sky-300">{row.projectName}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-xs text-neutral-300">
                        <Users size={12} className="text-neutral-600" />
                        {row.userName}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-mono text-sm font-semibold text-neutral-100">{formatDetailedDuration(row.totalSeconds)}</p>
                      <p className="mt-0.5 text-[10px] text-neutral-600">{formatDuration(row.totalSeconds)}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-400">{row.sessionCount}</td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium",
                        row.isActive
                          ? "bg-emerald-500/10 text-emerald-300"
                          : row.taskStatus === "done"
                            ? "bg-sky-500/10 text-sky-300"
                            : "bg-amber-500/10 text-amber-300",
                      )}>
                        <span className={cn("h-1.5 w-1.5 rounded-full", row.isActive ? "animate-pulse bg-emerald-400" : "bg-current")} />
                        {row.isActive ? "Running" : row.taskStatus === "done" ? "Completed" : "Paused / open"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-500">{formatActivityTime(row.lastActivityAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  active = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  active?: boolean;
}) {
  return (
    <div className="rounded-xl2 border border-base-700/60 bg-base-850 p-4 shadow-card">
      <div className="flex items-center justify-between">
        <span className={cn("grid h-9 w-9 place-items-center rounded-lg", active ? "bg-emerald-500/10 text-emerald-300" : "bg-base-900 text-neutral-400")}>
          <Icon size={17} />
        </span>
        {active && <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />}
      </div>
      <p className="mt-4 text-xl font-semibold text-neutral-50">{value}</p>
      <p className="mt-1 text-[11px] uppercase tracking-wide text-neutral-600">{label}</p>
    </div>
  );
}
