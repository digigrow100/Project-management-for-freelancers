"use client";

import { Activity, CalendarClock, Clock3, Pause, Play } from "lucide-react";
import { useEffect, useState } from "react";
import type { EmployeeActivitySummary } from "@/lib/types";
import { cn } from "@/lib/utils";

function duration(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return [hours, minutes, secs].map((value) => String(value).padStart(2, "0")).join(":");
}

function timeLabel(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function AdminMyWorkTime({ initialSummary }: { initialSummary: EmployeeActivitySummary | null }) {
  const [summary, setSummary] = useState(initialSummary);
  const [clockNow, setClockNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const response = await fetch("/api/extension/my-work-summary", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { summary?: EmployeeActivitySummary | null };
        if (!cancelled) setSummary(data.summary ?? null);
      } catch {
        // Keep the last known totals if a refresh fails.
      }
    }

    const clockId = window.setInterval(() => setClockNow(Date.now()), 1000);
    const refreshId = window.setInterval(() => void refresh(), 15000);
    return () => {
      cancelled = true;
      window.clearInterval(clockId);
      window.clearInterval(refreshId);
    };
  }, []);

  const fresh =
    summary?.lastSeenAt &&
    clockNow - new Date(summary.lastSeenAt).getTime() <= 90_000;
  const liveSeconds =
    summary?.status === "active" && fresh && summary.lastSeenAt
      ? Math.max(0, Math.floor((clockNow - new Date(summary.lastSeenAt).getTime()) / 1000))
      : 0;
  const today = (summary?.todayActiveSeconds ?? 0) + liveSeconds;
  const status = !summary?.deviceCount || !fresh ? "offline" : summary.status;

  return (
    <section className="rounded-xl2 border border-accent-500/20 bg-base-850 p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent-500/10 text-accent-300">
            <Activity size={19} />
          </span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-600">My Work Time</p>
            <p className="mt-1 font-mono text-2xl font-semibold text-accent-300">{duration(today)}</p>
          </div>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[10px] font-semibold",
            status === "active"
              ? "bg-emerald-500/10 text-emerald-300"
              : status === "idle"
                ? "bg-amber-500/10 text-amber-300"
                : "bg-base-700 text-neutral-500",
          )}
        >
          {status === "active" ? "Working" : status === "idle" ? "Paused" : "Offline"}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-5">
        <Metric icon={Play} label="Today" value={duration(today)} />
        <Metric icon={CalendarClock} label="This Month" value={duration(summary?.thisMonthActiveSeconds ?? 0)} />
        <Metric icon={Pause} label="Paused Today" value={duration(summary?.todayIdleSeconds ?? 0)} />
        <Metric icon={Clock3} label="Started Today" value={timeLabel(summary?.startedTodayAt ?? null)} />
        <Metric icon={Clock3} label="Last Activity" value={timeLabel(summary?.lastWorkAt ?? null)} />
      </div>

      {!summary?.deviceCount && (
        <p className="mt-3 text-[10px] text-neutral-600">
          Connect the Chrome extension above to start recording your admin work time.
        </p>
      )}
    </section>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-base-700/40 bg-base-950/35 p-2.5">
      <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wide text-neutral-600">
        <Icon size={11} />
        {label}
      </div>
      <p className="mt-1 font-mono text-xs font-semibold text-neutral-200">{value}</p>
    </div>
  );
}
