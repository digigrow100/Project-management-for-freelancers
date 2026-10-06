"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Clock3,
  FolderKanban,
  PauseCircle,
  Search,
  SkipForward,
  TimerReset,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AdminTimeTrackingEntry, TaskTimeStopReason } from "@/lib/types";
import { cn } from "@/lib/utils";

type RangePreset = "today" | "week" | "month" | "custom";

function pktDateKey(value = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function addDays(dateKey: string, days: number): string {
  const base = new Date(`${dateKey}T12:00:00+05:00`);
  return pktDateKey(new Date(base.getTime() + days * 86400000));
}

function startOfMonth(dateKey: string): string {
  return `${dateKey.slice(0, 7)}-01`;
}

function nextMonth(dateKey: string): string {
  const date = new Date(`${startOfMonth(dateKey)}T12:00:00+05:00`);
  date.setUTCDate(date.getUTCDate() + 32);
  return startOfMonth(pktDateKey(date));
}

function rangeForPreset(preset: RangePreset, customStart: string, customEnd: string) {
  const today = pktDateKey();
  if (preset === "today") return { start: today, endExclusive: addDays(today, 1), label: "Today" };
  if (preset === "month") {
    const start = startOfMonth(today);
    return { start, endExclusive: nextMonth(today), label: "This month" };
  }
  if (preset === "week") {
    const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Karachi", weekday: "short" }).format(new Date());
    const offset = ({ Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 } as Record<string, number>)[weekday] ?? 0;
    const start = addDays(today, -offset);
    return { start, endExclusive: addDays(start, 7), label: "This week" };
  }
  const start = customStart || today;
  const end = customEnd && customEnd >= start ? customEnd : start;
  return { start, endExclusive: addDays(end, 1), label: `${start} → ${end}` };
}

function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${safe}s`;
}

function formatDetailed(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function formatPkt(value: string | number): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));
}

function formatPktTime(value: string | number): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));
}

function reasonLabel(reason: TaskTimeStopReason | null): string {
  if (!reason) return "Legacy / unknown";
  if (reason === "paused") return "Paused";
  if (reason === "skipped") return "Skipped";
  if (reason === "completed") return "Completed";
  if (reason === "task_switched") return "Task switched";
  if (reason === "admin_action") return "Sent to admin";
  if (reason === "admin_completed") return "Closed by admin";
  return "Reconciled";
}

function reasonClass(reason: TaskTimeStopReason | null): string {
  if (reason === "completed") return "bg-emerald-500/10 text-emerald-300";
  if (reason === "skipped") return "bg-rose-500/10 text-rose-300";
  if (reason === "paused") return "bg-amber-500/10 text-amber-300";
  if (reason === "task_switched") return "bg-sky-500/10 text-sky-300";
  if (reason === "admin_action" || reason === "admin_completed") return "bg-violet-500/10 text-violet-300";
  return "bg-base-700 text-neutral-400";
}

export function AdminTimeTracking({ entries }: { entries: AdminTimeTrackingEntry[] }) {
  const [preset, setPreset] = useState<RangePreset>("today");
  const today = pktDateKey();
  const [customStart, setCustomStart] = useState(today);
  const [customEnd, setCustomEnd] = useState(today);
  const [member, setMember] = useState("all");
  const [project, setProject] = useState("all");
  const [query, setQuery] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, []);

  const members = useMemo(
    () => Array.from(new Map(entries.map((row) => [row.userId, row.userName])).entries()).sort((a, b) => a[1].localeCompare(b[1])),
    [entries],
  );
  const projects = useMemo(
    () => Array.from(new Map(entries.map((row) => [row.projectId, row.projectName])).entries()).sort((a, b) => a[1].localeCompare(b[1])),
    [entries],
  );

  const range = rangeForPreset(preset, customStart, customEnd);
  const rangeStart = new Date(`${range.start}T00:00:00+05:00`).getTime();
  const rangeEnd = new Date(`${range.endExclusive}T00:00:00+05:00`).getTime();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries
      .filter((entry) => {
        if (member !== "all" && entry.userId !== member) return false;
        if (project !== "all" && entry.projectId !== project) return false;
        if (q && ![entry.taskTitle, entry.projectName, entry.userName].some((value) => value.toLowerCase().includes(q))) return false;
        const start = new Date(entry.startedAt).getTime();
        const end = entry.endedAt ? new Date(entry.endedAt).getTime() : now;
        return start < rangeEnd && end > rangeStart;
      })
      .map((entry) => {
        const rawStart = new Date(entry.startedAt).getTime();
        const rawEnd = entry.endedAt ? new Date(entry.endedAt).getTime() : now;
        const clippedStart = Math.max(rawStart, rangeStart);
        const clippedEnd = Math.min(rawEnd, rangeEnd);
        return {
          ...entry,
          reportSeconds: Math.max(0, Math.floor((clippedEnd - clippedStart) / 1000)),
          reportStart: clippedStart,
          reportEnd: clippedEnd,
          rawSeconds: Math.max(0, Math.floor((rawEnd - rawStart) / 1000)),
        };
      })
      .sort((a, b) => b.reportStart - a.reportStart);
  }, [entries, member, project, query, rangeStart, rangeEnd, now]);

  const totalSeconds = filtered.reduce((sum, row) => sum + row.reportSeconds, 0);
  const activeSessions = filtered.filter((row) => !row.endedAt).length;
  const tasksWorked = new Set(filtered.map((row) => row.taskId)).size;
  const completedTasks = new Set(
    filtered
      .filter((row) => {
        if (!row.completedAt) return false;
        const completed = new Date(row.completedAt).getTime();
        return completed >= rangeStart && completed < rangeEnd;
      })
      .map((row) => row.taskId),
  ).size;
  const pausedCount = filtered.filter((row) => row.stopReason === "paused").length;
  const skippedCount = filtered.filter((row) => row.stopReason === "skipped").length;
  const switchCount = filtered.filter((row) => row.stopReason === "task_switched").length;
  const suspiciousCount = filtered.filter((row) => row.endedAt && row.rawSeconds < 60).length;

  const firstStart = filtered.length > 0 ? Math.min(...filtered.map((row) => row.reportStart)) : null;
  const lastActivity = filtered.length > 0 ? Math.max(...filtered.map((row) => row.reportEnd)) : null;

  const gapSeconds = useMemo(() => {
    const byUser = new Map<string, typeof filtered>();
    for (const row of filtered) {
      const list = byUser.get(row.userId) ?? [];
      list.push(row);
      byUser.set(row.userId, list);
    }
    let total = 0;
    for (const rows of byUser.values()) {
      if (rows.length < 2) continue;
      const sorted = [...rows].sort((a, b) => a.reportStart - b.reportStart);
      for (let i = 1; i < sorted.length; i += 1) {
        const current = sorted[i];
        const previous = sorted[i - 1];
        if (!current || !previous) continue;
        total += Math.max(0, Math.floor((current.reportStart - previous.reportEnd) / 1000));
      }
    }
    return total;
  }, [filtered]);

  const projectBreakdown = useMemo(() => {
    const map = new Map<string, { id: string; name: string; seconds: number; taskIds: Set<string>; completed: Set<string> }>();
    for (const row of filtered) {
      const current = map.get(row.projectId) ?? {
        id: row.projectId,
        name: row.projectName,
        seconds: 0,
        taskIds: new Set<string>(),
        completed: new Set<string>(),
      };
      current.seconds += row.reportSeconds;
      current.taskIds.add(row.taskId);
      if (row.completedAt) {
        const completed = new Date(row.completedAt).getTime();
        if (completed >= rangeStart && completed < rangeEnd) current.completed.add(row.taskId);
      }
      map.set(row.projectId, current);
    }
    return Array.from(map.values()).sort((a, b) => b.seconds - a.seconds);
  }, [filtered, rangeStart, rangeEnd]);

  return (
    <div className="space-y-5">
      <section className="rounded-xl2 border border-base-700/60 bg-base-850 p-4 shadow-card">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {([
              ["today", "Today"],
              ["week", "This Week"],
              ["month", "This Month"],
              ["custom", "Custom"],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setPreset(key)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-xs font-semibold transition-colors",
                  preset === key
                    ? "border-accent-500/40 bg-accent-500/10 text-accent-300"
                    : "border-base-700 bg-base-900/60 text-neutral-400 hover:text-neutral-200",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {preset === "custom" && (
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs text-neutral-500">
                From
                <input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} className="mt-1 w-full rounded-lg border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-200" />
              </label>
              <label className="text-xs text-neutral-500">
                To
                <input type="date" value={customEnd} min={customStart} onChange={(event) => setCustomEnd(event.target.value)} className="mt-1 w-full rounded-lg border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-200" />
              </label>
            </div>
          )}

          <div className="grid gap-2 md:grid-cols-3">
            <select value={member} onChange={(event) => setMember(event.target.value)} className="rounded-lg border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-300">
              <option value="all">All team members</option>
              {members.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
            <select value={project} onChange={(event) => setProject(event.target.value)} className="rounded-lg border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-300">
              <option value="all">All projects</option>
              {projects.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
            <label className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-600" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search task, project or member"
                className="w-full rounded-lg border border-base-600 bg-base-900 py-2 pl-9 pr-3 text-sm text-neutral-200 placeholder:text-neutral-600"
              />
            </label>
          </div>

          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <TimerReset size={14} />
            {range.label} · Pakistan time
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Stat icon={Clock3} label="Active work" value={formatDuration(totalSeconds)} />
        <Stat icon={Activity} label="Running now" value={String(activeSessions)} active={activeSessions > 0} />
        <Stat icon={Users} label="Tasks worked" value={String(tasksWorked)} />
        <Stat icon={CheckCircle2} label="Completed" value={String(completedTasks)} />
        <Stat icon={PauseCircle} label="Paused" value={String(pausedCount)} />
        <Stat icon={SkipForward} label="Skipped" value={String(skippedCount)} />
        <Stat icon={ArrowRightLeft} label="Task switches" value={String(switchCount)} />
        <Stat icon={AlertTriangle} label="Short sessions" value={String(suspiciousCount)} warning={suspiciousCount > 0} />
      </div>

      <section className="grid gap-3 lg:grid-cols-3">
        <MiniStat label="First start" value={firstStart ? formatPktTime(firstStart) : "—"} />
        <MiniStat label="Last activity" value={lastActivity ? formatPktTime(lastActivity) : "—"} />
        <MiniStat label="Gap / no active timer" value={formatDuration(gapSeconds)} />
      </section>

      <section className="rounded-xl2 border border-base-700/60 bg-base-850 p-4 shadow-card">
        <div>
          <h2 className="text-sm font-semibold text-neutral-100">Project breakdown</h2>
          <p className="mt-1 text-xs text-neutral-500">Where the selected member/time range was spent.</p>
        </div>
        {projectBreakdown.length === 0 ? (
          <Empty text="No tracked project time in this range." />
        ) : (
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {projectBreakdown.map((row) => (
              <div key={row.id} className="rounded-xl border border-base-700/60 bg-base-900/55 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-neutral-100">{row.name}</p>
                    <p className="mt-1 text-xs text-neutral-500">{row.taskIds.size} task{row.taskIds.size === 1 ? "" : "s"} · {row.completed.size} completed</p>
                  </div>
                  <p className="shrink-0 font-mono text-sm font-semibold text-accent-300">{formatDetailed(row.seconds)}</p>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-base-700">
                  <div className="h-full rounded-full bg-accent-400" style={{ width: `${totalSeconds > 0 ? Math.max(2, Math.round((row.seconds / totalSeconds) * 100)) : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl2 border border-base-700/60 bg-base-850 p-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-neutral-100">Session timeline</h2>
            <p className="mt-1 text-xs text-neutral-500">Every recorded work session with its exact stop reason.</p>
          </div>
          <span className="text-xs text-neutral-500">{filtered.length} session{filtered.length === 1 ? "" : "s"}</span>
        </div>

        {filtered.length === 0 ? (
          <Empty text="No sessions match this range and filters." />
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border border-base-700/70">
            <table className="w-full min-w-[1080px] border-collapse text-left">
              <thead className="bg-base-900/80 text-[10px] uppercase tracking-[0.12em] text-neutral-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Start / End</th>
                  <th className="px-4 py-3 font-medium">Member</th>
                  <th className="px-4 py-3 font-medium">Task</th>
                  <th className="px-4 py-3 font-medium">Project</th>
                  <th className="px-4 py-3 font-medium">Duration</th>
                  <th className="px-4 py-3 font-medium">Stopped because</th>
                  <th className="px-4 py-3 font-medium">Quality</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const suspicious = Boolean(row.endedAt && row.rawSeconds < 60);
                  return (
                    <tr key={row.id} className="border-t border-base-700/60 align-top hover:bg-base-900/45">
                      <td className="px-4 py-3 text-xs text-neutral-400">
                        <p>{formatPkt(row.startedAt)}</p>
                        <p className="mt-1 text-neutral-600">{row.endedAt ? formatPkt(row.endedAt) : "Running now"}</p>
                      </td>
                      <td className="px-4 py-3 text-xs font-medium text-neutral-300">{row.userName}</td>
                      <td className="max-w-[320px] px-4 py-3">
                        <p className="truncate text-sm font-medium text-neutral-100" title={row.taskTitle}>{row.taskTitle}</p>
                        {row.stopDetail && <p className="mt-1 text-[10px] text-neutral-600">{row.stopDetail.replaceAll("_", " ")}</p>}
                      </td>
                      <td className="px-4 py-3 text-xs text-accent-300">{row.projectName}</td>
                      <td className="px-4 py-3 font-mono text-sm font-semibold text-neutral-100">{formatDetailed(row.reportSeconds)}</td>
                      <td className="px-4 py-3">
                        {!row.endedAt ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium text-emerald-300">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                            Running
                          </span>
                        ) : (
                          <span className={cn("inline-flex rounded-full px-2.5 py-1 text-[10px] font-medium", reasonClass(row.stopReason))}>
                            {reasonLabel(row.stopReason)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {suspicious ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2.5 py-1 text-[10px] font-medium text-rose-300">
                            <AlertTriangle size={11} />
                            Short session
                          </span>
                        ) : (
                          <span className="text-[10px] text-neutral-500">Normal</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
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
  warning = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  active?: boolean;
  warning?: boolean;
}) {
  return (
    <div className="rounded-xl2 border border-base-700/60 bg-base-850 p-3 shadow-card">
      <span className={cn(
        "grid h-8 w-8 place-items-center rounded-lg",
        active ? "bg-emerald-500/10 text-emerald-300" : warning ? "bg-rose-500/10 text-rose-300" : "bg-base-900 text-neutral-400",
      )}>
        <Icon size={15} />
      </span>
      <p className="mt-3 text-lg font-semibold text-neutral-50">{value}</p>
      <p className="mt-1 text-[10px] uppercase tracking-wide text-neutral-600">{label}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-base-700/60 bg-base-900/55 px-4 py-3">
      <p className="text-[10px] uppercase tracking-wide text-neutral-600">{label}</p>
      <p className="mt-1 text-sm font-semibold text-neutral-100">{value}</p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="mt-4 rounded-xl border border-dashed border-base-700 p-8 text-center">
      <Clock3 size={26} className="mx-auto text-neutral-600" />
      <p className="mt-2 text-sm text-neutral-400">{text}</p>
    </div>
  );
}
