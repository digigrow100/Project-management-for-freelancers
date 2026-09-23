"use client";

import { useTransition } from "react";
import { Bell } from "lucide-react";
import type { ReportPreferences } from "@/lib/types";
import { setReportPreferencesAction } from "@/lib/actions";
import { cn } from "@/lib/utils";

export function ReportPreferencesForm({ projectId, preferences }: { projectId: string; preferences: ReportPreferences }) {
  const [isPending, startTransition] = useTransition();

  function toggle(key: "dailyEnabled" | "weeklyEnabled" | "monthlyEnabled") {
    startTransition(() => setReportPreferencesAction(projectId, { [key]: !preferences[key] }));
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-base-700/60 bg-base-900/50 px-3 py-2">
      <span className="flex items-center gap-1.5 text-xs font-medium text-neutral-400">
        <Bell size={13} />
        Auto-report drafts
      </span>
      {(
        [
          ["dailyEnabled", "Daily"],
          ["weeklyEnabled", "Weekly"],
          ["monthlyEnabled", "Monthly"],
        ] as const
      ).map(([key, label]) => (
        <button
          key={key}
          type="button"
          disabled={isPending}
          onClick={() => toggle(key)}
          className={cn(
            "rounded-full px-2.5 py-1 text-[11px] font-medium disabled:opacity-50",
            preferences[key] ? "bg-accent-500/15 text-accent-300" : "bg-base-800 text-neutral-500",
          )}
        >
          {label} {preferences[key] ? "on" : "off"}
        </button>
      ))}
    </div>
  );
}
