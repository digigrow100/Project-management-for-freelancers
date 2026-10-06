"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Activity, Bot, Clock3, ExternalLink, MonitorUp, Timer, Users } from "lucide-react";
import type { EmployeeActivitySummary } from "@/lib/types";

function duration(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  return hours > 0 ? hours + "h " + mins + "m" : mins + "m";
}

function timeLabel(value: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function statusClass(status: EmployeeActivitySummary["status"]) {
  if (status === "active") return "bg-emerald-500/10 text-emerald-300";
  if (status === "idle") return "bg-amber-500/10 text-amber-300";
  return "bg-base-700 text-neutral-500";
}

export function EmployeeActivityOverview({ initialRows }: { initialRows: EmployeeActivitySummary[] }) {
  const [rows, setRows] = useState(initialRows);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const response = await fetch("/api/admin/employee-activity?summary=1", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { summaries?: EmployeeActivitySummary[] };
        if (!cancelled && Array.isArray(data.summaries)) setRows(data.summaries);
      } catch {
        // Keep last known state.
      }
    }
    const id = window.setInterval(refresh, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return (
    <section className="overflow-hidden rounded-xl2 border border-base-700/60 bg-base-850 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-base-700/50 px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <MonitorUp size={15} className="text-accent-400" />
            <h2 className="text-sm font-semibold text-neutral-100">Employee Activity</h2>
          </div>
          <p className="mt-1 text-xs text-neutral-500">Live browser presence, current site, project match and today&apos;s activity.</p>
        </div>
        <Link href="/admin/employee-activity" className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent-300 hover:text-accent-200">
          Open activity timeline <ExternalLink size={12} />
        </Link>
      </div>

      <div className="grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => (
          <article key={row.employeeId} className="rounded-xl border border-base-700/60 bg-base-900/55 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={row.status === "active" ? "h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400" : row.status === "idle" ? "h-2.5 w-2.5 rounded-full bg-amber-400" : "h-2.5 w-2.5 rounded-full bg-neutral-600"} />
                  <p className="truncate text-sm font-semibold text-neutral-100">{row.employeeName}</p>
                </div>
                <span className={"mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold " + statusClass(row.status)}>
                  {row.status === "active" ? "Active" : row.status === "idle" ? "Idle" : "Offline"}
                </span>
              </div>
              <p className="text-[10px] text-neutral-600">{row.deviceCount} device{row.deviceCount === 1 ? "" : "s"}</p>
            </div>

            <div className="mt-3 rounded-lg border border-base-700/40 bg-base-950/35 p-2.5">
              <p className="truncate text-xs font-medium text-neutral-300">{row.currentWebsite || "No active website"}</p>
              <p className="mt-1 truncate text-[10px] text-neutral-600" title={row.currentPageTitle}>{row.currentPageTitle || "No page title"}</p>
              <p className="mt-1 truncate text-[10px] font-medium text-sky-300">{row.currentProjectName || "No project match"}</p>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <Metric icon={Timer} label="Session" value={duration(row.currentSessionDurationSeconds)} />
              <Metric icon={Activity} label="Active today" value={duration(row.todayActiveSeconds)} />
              <Metric icon={Clock3} label="Idle today" value={duration(row.todayIdleSeconds)} />
              <Metric icon={Bot} label="AI prompts" value={String(row.aiPromptsToday)} />
            </div>
            <p className="mt-2 text-[10px] text-neutral-600">Last seen {timeLabel(row.lastSeenAt)}</p>
          </article>
        ))}
        {rows.length === 0 && (
          <div className="col-span-full rounded-xl border border-dashed border-base-700 p-8 text-center text-sm text-neutral-500">
            <Users size={24} className="mx-auto mb-2 text-neutral-600" />
            No employee extension has reported activity yet.
          </div>
        )}
      </div>
    </section>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-base-700/40 bg-base-950/35 p-2">
      <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wide text-neutral-600">
        <Icon size={11} />
        {label}
      </div>
      <p className="mt-1 text-xs font-semibold text-neutral-200">{value}</p>
    </div>
  );
}
