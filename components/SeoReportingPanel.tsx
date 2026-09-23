"use client";

import { useState, useTransition } from "react";
import { BarChart3, CheckCircle2, FileText } from "lucide-react";
import type { ReportPeriodType, ReportPreferences, SeoReport } from "@/lib/types";
import { generateSeoReportAction, updateSeoReportAction } from "@/lib/actions";
import { ReportPreferencesForm } from "@/components/ReportPreferencesForm";
import { cn } from "@/lib/utils";

const PERIOD_TYPE_LABEL: Record<ReportPeriodType, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** ISO week number for today, matching lib/store.ts's weekBounds. */
function currentIsoWeek(): string {
  const date = new Date();
  const dayNum = date.getDay() || 7;
  date.setDate(date.getDate() + 4 - dayNum);
  const yearStart = new Date(date.getFullYear(), 0, 1);
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getFullYear()}-W${pad(week)}`;
}

function currentPeriod(type: ReportPeriodType): string {
  const d = new Date();
  if (type === "daily") return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (type === "weekly") return currentIsoWeek();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function SeoReportingPanel({
  projectId,
  reports,
  preferences,
}: {
  projectId: string;
  reports: SeoReport[];
  preferences?: ReportPreferences;
}) {
  const [isPending, startTransition] = useTransition();
  const [periodType, setPeriodType] = useState<ReportPeriodType>("monthly");
  const period = currentPeriod(periodType);
  const hasCurrent = reports.some((r) => r.period === period && r.periodType === periodType);
  const visibleReports = reports.filter((r) => r.periodType === periodType);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BarChart3 size={16} className="text-accent-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Reporting</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-lg border border-base-700/60 bg-base-850 p-1">
            {(Object.keys(PERIOD_TYPE_LABEL) as ReportPeriodType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setPeriodType(type)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  periodType === type ? "bg-accent-500 text-base-950" : "text-neutral-400 hover:text-neutral-200",
                )}
              >
                {PERIOD_TYPE_LABEL[type]}
              </button>
            ))}
          </div>
          {!hasCurrent && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => startTransition(() => generateSeoReportAction(projectId, period, periodType))}
              className="flex items-center gap-1.5 rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-medium text-base-950 hover:bg-accent-400 disabled:opacity-60"
            >
              <FileText size={13} />
              {isPending ? "Generating…" : `Generate ${period}`}
            </button>
          )}
        </div>
      </div>

      {preferences && <ReportPreferencesForm projectId={projectId} preferences={preferences} />}

      {visibleReports.length === 0 && (
        <p className="rounded-lg border border-dashed border-base-700 p-6 text-center text-sm text-neutral-500">
          No {PERIOD_TYPE_LABEL[periodType].toLowerCase()} reports yet. Generate this period&apos;s to pull in keyword
          movement, completed tasks, backlinks, content, and technical fixes.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {visibleReports.map((report) => (
          <ReportCard key={report.id} projectId={projectId} report={report} />
        ))}
      </div>
    </div>
  );
}

function ReportCard({ projectId, report }: { projectId: string; report: SeoReport }) {
  const [isPending, startTransition] = useTransition();
  const [summary, setSummary] = useState(report.summary);

  return (
    <div className="rounded-xl2 border border-base-700/60 bg-base-850 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-100">{report.period}</h3>
        <button
          type="button"
          disabled={isPending || report.sentToClient}
          onClick={() => startTransition(() => updateSeoReportAction(report.id, projectId, { sentToClient: true }))}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
            report.sentToClient ? "bg-accent-500/15 text-accent-400" : "border border-base-600 text-neutral-400 hover:text-accent-300",
          )}
        >
          <CheckCircle2 size={12} />
          {report.sentToClient ? "Sent to client" : "Mark sent"}
        </button>
      </div>
      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        onBlur={() => summary !== report.summary && startTransition(() => updateSeoReportAction(report.id, projectId, { summary }))}
        rows={8}
        className="w-full rounded-md border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100 focus:border-accent-500 focus:outline-none"
      />
      {report.generatedByName && (
        <p className="mt-1.5 text-[11px] text-neutral-600">Generated by {report.generatedByName}</p>
      )}
    </div>
  );
}
