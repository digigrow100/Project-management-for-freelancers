"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  FileSpreadsheet,
  FileText,
  PoundSterling,
  ShieldCheck,
} from "lucide-react";
import type {
  ReportPeriodType,
  ReportPreferences,
  SeoReport,
  SeoTaskReportData,
  SeoTaskReportItem,
} from "@/lib/types";
import {
  approveSeoReportAction,
  generateSeoReportAction,
  getSeoTaskReportAction,
  updateSeoReportAction,
} from "@/lib/actions";
import { ReportPreferencesForm } from "@/components/ReportPreferencesForm";
import { cn } from "@/lib/utils";
import { businessDateKey } from "@/lib/date";

const PERIOD_TYPE_LABEL: Record<ReportPeriodType, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

type ActivityRange = ReportPeriodType | "custom";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

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
  if (type === "daily") return businessDateKey();
  if (type === "weekly") return currentIsoWeek();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function rangeFor(
  mode: ActivityRange,
  anchorDate: string,
  month: string,
  customStart: string,
  customEnd: string,
): { startDate: string; endDate: string } {
  if (mode === "daily") return { startDate: anchorDate, endDate: anchorDate };

  if (mode === "weekly") {
    const date = new Date(`${anchorDate}T12:00:00`);
    const day = date.getDay() || 7;
    const monday = new Date(date);
    monday.setDate(date.getDate() - day + 1);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { startDate: dateKey(monday), endDate: dateKey(sunday) };
  }

  if (mode === "monthly") {
    const year = Number(month.slice(0, 4)) || new Date().getFullYear();
    const monthNumber = Number(month.slice(5, 7)) || 1;
    const first = new Date(year, monthNumber - 1, 1);
    const last = new Date(year, monthNumber, 0);
    return { startDate: dateKey(first), endDate: dateKey(last) };
  }

  return {
    startDate: customStart || anchorDate,
    endDate: customEnd || customStart || anchorDate,
  };
}

function displayDate(value: string | null, includeTime = false) {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit", hour12: true } : {}),
  }).format(date);
}

function priceLabel(item: SeoTaskReportItem) {
  if (item.price === null || !item.currency) return null;
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: item.currency,
      maximumFractionDigits: 2,
    }).format(item.price);
  } catch {
    return `${item.currency} ${item.price.toLocaleString("en-GB")}`;
  }
}

function statusLabel(status: SeoTaskReportItem["status"]) {
  if (status === "in_progress") return "In Progress";
  if (status === "not_applicable") return "N/A";
  return status === "done" ? "Done" : "Pending";
}

function statusClass(status: SeoTaskReportItem["status"]) {
  if (status === "done") return "bg-emerald-500/15 text-emerald-300";
  if (status === "in_progress") return "bg-sky-500/15 text-sky-300";
  if (status === "not_applicable") return "bg-neutral-500/15 text-neutral-400";
  return "bg-amber-500/15 text-amber-300";
}



function csvCell(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function safeFilename(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "report";
}

export function SeoReportingPanel({
  projectId,
  projectName,
  companyName,
  reports,
  preferences,
}: {
  projectId: string;
  projectName: string;
  companyName: string;
  reports: SeoReport[];
  preferences?: ReportPreferences;
}) {
  const [isPending, startTransition] = useTransition();
  const today = businessDateKey();
  const [periodType, setPeriodType] = useState<ReportPeriodType>("monthly");
  const [activityRange, setActivityRange] = useState<ActivityRange>("monthly");
  const [anchorDate, setAnchorDate] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [customStart, setCustomStart] = useState(today);
  const [customEnd, setCustomEnd] = useState(today);
  const [showTaskDates, setShowTaskDates] = useState(true);
  const [hideDatesFromClient, setHideDatesFromClient] = useState(false);
  const [includePricesForClient, setIncludePricesForClient] = useState(false);
  const [includedStatuses, setIncludedStatuses] = useState<Set<SeoTaskReportItem["status"]>>(
    () => new Set(["done"]),
  );
  const [activity, setActivity] = useState<SeoTaskReportData | null>(null);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState<string | null>(null);

  const selectedRange = useMemo(
    () => rangeFor(activityRange, anchorDate, month, customStart, customEnd),
    [activityRange, anchorDate, month, customStart, customEnd],
  );

  useEffect(() => {
    let cancelled = false;
    setActivityLoading(true);
    setActivityError(null);

    void getSeoTaskReportAction(projectId, selectedRange.startDate, selectedRange.endDate)
      .then((result) => {
        if (!cancelled) setActivity(result);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setActivity(null);
          setActivityError(error instanceof Error ? error.message : "Could not load task activity.");
        }
      })
      .finally(() => {
        if (!cancelled) setActivityLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, selectedRange.startDate, selectedRange.endDate]);

  const clientItems = useMemo(
    () => (activity?.items ?? []).filter((item) => includedStatuses.has(item.status)),
    [activity, includedStatuses],
  );

  const groupedItems = useMemo(() => {
    const groups = new Map<string, SeoTaskReportItem[]>();
    for (const item of clientItems) {
      const list = groups.get(item.group) ?? [];
      list.push(item);
      groups.set(item.group, list);
    }
    return Array.from(groups.entries());
  }, [clientItems]);

  const period = currentPeriod(periodType);
  const hasCurrent = reports.some((report) => report.period === period && report.periodType === periodType);
  const visibleReports = reports.filter((report) => report.periodType === periodType);
  const denominator = activity
    ? Math.max(0, activity.totals.total - activity.totals.notApplicable)
    : 0;
  const completionRate = activity && denominator > 0 ? Math.round((activity.totals.done / denominator) * 100) : 0;
  const internalPriceTotal = (activity?.items ?? []).reduce((sum, item) => sum + (item.price ?? 0), 0);
  const pricedItems = (activity?.items ?? []).filter((item) => item.price !== null);
  const allStatuses: Array<{ key: SeoTaskReportItem["status"]; label: string }> = [
    { key: "done", label: "Done" },
    { key: "in_progress", label: "In Progress" },
    { key: "pending", label: "Pending" },
    { key: "not_applicable", label: "N/A" },
  ];
  const allStatusesSelected = allStatuses.every((status) => includedStatuses.has(status.key));

  const toggleStatus = (status: SeoTaskReportItem["status"]) => {
    setIncludedStatuses((current) => {
      const next = new Set(current);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

  const toggleAllStatuses = () => {
    setIncludedStatuses(
      allStatusesSelected
        ? new Set<SeoTaskReportItem["status"]>(["done"])
        : new Set(allStatuses.map((status) => status.key)),
    );
  };

  const exportClientCsv = () => {
    if (clientItems.length === 0) return;

    const header = [
      "Group",
      "Task",
      "Status",
      "Assigned To",
      ...(hideDatesFromClient ? [] : ["Started", "Completed"]),
      ...(includePricesForClient ? ["Price", "Currency"] : []),
      "Notes",
    ];

    const rows = clientItems.map((item) => [
      item.group,
      item.title,
      statusLabel(item.status),
      item.assignedToName ?? "",
      ...(hideDatesFromClient
        ? []
        : [
            item.startedAt ? displayDate(item.startedAt, true) : "",
            item.completedAt ? displayDate(item.completedAt, true) : "",
          ]),
      ...(includePricesForClient ? [item.price ?? "", item.currency ?? ""] : []),
      item.notes,
    ]);

    const meta: Array<Array<string | number>> = [
      ["Company", companyName || "Company"],
      ["Project", projectName],
      ...(!hideDatesFromClient
        ? [["Report From", selectedRange.startDate], ["Report To", selectedRange.endDate]]
        : []),
      ["Included Statuses", allStatuses.filter((status) => includedStatuses.has(status.key)).map((status) => status.label).join(", ")],
      [],
    ];

    const csv = [...meta, header, ...rows]
      .map((row) => row.map((cell) => csvCell(cell)).join(","))
      .join("\r\n");

    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeFilename(companyName)}-${safeFilename(projectName)}-seo-report.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const exportClientPdf = async () => {
    if (clientItems.length === 0) return;

    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 42;
    const contentWidth = pageWidth - margin * 2;
    const bottomLimit = pageHeight - 48;
    let y = 48;

    const ensureSpace = (height: number) => {
      if (y + height <= bottomLimit) return;
      doc.addPage();
      y = 48;
    };

    const drawWrapped = (
      text: string,
      x: number,
      maxWidth: number,
      fontSize: number,
      lineHeight: number,
      style: "normal" | "bold" = "normal",
    ) => {
      doc.setFont("helvetica", style);
      doc.setFontSize(fontSize);
      const lines = doc.splitTextToSize(text || "", maxWidth) as string[];
      ensureSpace(Math.max(lineHeight, lines.length * lineHeight));
      doc.text(lines, x, y);
      y += Math.max(lineHeight, lines.length * lineHeight);
    };

    doc.setTextColor(4, 120, 87);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text((companyName || "Company").toUpperCase(), margin, y);
    y += 20;

    doc.setTextColor(17, 24, 39);
    doc.setFontSize(22);
    doc.text("SEO Work Report", margin, y);
    y += 22;

    doc.setFontSize(12);
    doc.text(projectName, margin, y);
    y += 18;

    if (!hideDatesFromClient) {
      doc.setTextColor(107, 114, 128);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(
        `Report period: ${displayDate(selectedRange.startDate)} - ${displayDate(selectedRange.endDate)}`,
        margin,
        y,
      );
      y += 18;
    }

    doc.setDrawColor(209, 213, 219);
    doc.line(margin, y, pageWidth - margin, y);
    y += 18;

    doc.setTextColor(75, 85, 99);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const selectedStatusLabels =
      allStatuses
        .filter((status) => includedStatuses.has(status.key))
        .map((status) => status.label)
        .join(", ") || "No statuses selected";
    drawWrapped(
      `${clientItems.length} included tasks | ${selectedStatusLabels} | ${includePricesForClient ? "Prices included" : "Prices hidden"} | ${hideDatesFromClient ? "Dates hidden" : "Dates included"}`,
      margin,
      contentWidth,
      9,
      13,
    );
    y += 8;

    const grouped = new Map<string, SeoTaskReportItem[]>();
    for (const item of clientItems) {
      const list = grouped.get(item.group) ?? [];
      list.push(item);
      grouped.set(item.group, list);
    }

    for (const [group, items] of grouped.entries()) {
      ensureSpace(54);
      doc.setTextColor(17, 24, 39);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text(group, margin, y);
      y += 16;

      const doneCount = items.filter((item) => item.status === "done").length;
      const pendingCount = items.filter((item) => item.status === "pending").length;
      const progressCount = items.filter((item) => item.status === "in_progress").length;

      doc.setTextColor(107, 114, 128);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.text(
        `${items.length} tasks | ${doneCount} done | ${progressCount} in progress | ${pendingCount} pending`,
        margin,
        y,
      );
      y += 14;

      for (const item of items) {
        const price = priceLabel(item);
        const details: string[] = [];
        if (item.assignedToName) details.push(`By ${item.assignedToName}`);
        details.push(item.source.replaceAll("_", " "));
        if (includePricesForClient && price) details.push(`Price ${price}`);

        const dateParts: string[] = [];
        if (!hideDatesFromClient) {
          if (item.startedAt) dateParts.push(`Started ${displayDate(item.startedAt, true)}`);
          if (item.completedAt) dateParts.push(`Completed ${displayDate(item.completedAt, true)}`);
        }

        const titleLines = doc.splitTextToSize(item.title, contentWidth - 90) as string[];
        const notesLines = item.notes ? (doc.splitTextToSize(item.notes, contentWidth - 12) as string[]) : [];
        const rowHeight =
          18 +
          titleLines.length * 11 +
          (details.length ? 13 : 0) +
          (dateParts.length ? 13 : 0) +
          (notesLines.length ? notesLines.length * 10 + 5 : 0);

        ensureSpace(rowHeight + 10);

        doc.setFillColor(249, 250, 251);
        doc.setDrawColor(229, 231, 235);
        doc.roundedRect(margin, y - 9, contentWidth, rowHeight, 4, 4, "FD");

        doc.setTextColor(17, 24, 39);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9.5);
        doc.text(titleLines, margin + 9, y + 4);

        doc.setTextColor(75, 85, 99);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.text(statusLabel(item.status), pageWidth - margin - 9, y + 4, { align: "right" });

        let detailY = y + 4 + titleLines.length * 11;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.8);
        doc.setTextColor(107, 114, 128);

        if (details.length) {
          doc.text(details.join(" | "), margin + 9, detailY);
          detailY += 13;
        }

        if (dateParts.length) {
          doc.text(dateParts.join(" | "), margin + 9, detailY);
          detailY += 13;
        }

        if (notesLines.length) {
          doc.setTextColor(75, 85, 99);
          doc.text(notesLines, margin + 9, detailY + 2);
        }

        y += rowHeight + 8;
      }

      y += 8;
    }

    ensureSpace(28);
    doc.setDrawColor(229, 231, 235);
    doc.line(margin, y, pageWidth - margin, y);
    y += 14;
    doc.setTextColor(156, 163, 175);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text("Generated from the project reporting dashboard.", margin, y);

    doc.save(`${safeFilename(companyName)}-${safeFilename(projectName)}-seo-report.pdf`);
  };

  return (
    <div className="flex flex-col gap-5">
      <section className="overflow-hidden rounded-xl2 border border-base-700/60 bg-base-850 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-base-700/60 px-4 py-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent-400">
              {companyName || "Company"}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <BarChart3 size={16} className="text-accent-400" />
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-300">SEO Work Report</h2>
            </div>
            <p className="mt-1 text-xs font-medium text-neutral-400">{projectName}</p>
            <p className="mt-1 text-[11px] text-neutral-600">
              Task-level report built from actual page checks, workflow items and project work.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1 rounded-lg border border-base-700/60 bg-base-900 p-1">
              {(["daily", "weekly", "monthly", "custom"] as ActivityRange[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setActivityRange(mode)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                    activityRange === mode ? "bg-accent-500 text-base-950" : "text-neutral-400 hover:text-neutral-200",
                  )}
                >
                  {mode === "custom" ? "Selected Dates" : mode}
                </button>
              ))}
            </div>

            <div className="flex gap-1.5">
              <button
                type="button"
                disabled={activityLoading || clientItems.length === 0}
                onClick={exportClientPdf}
                className="inline-flex items-center gap-1.5 rounded-lg border border-base-600 bg-base-900 px-3 py-2 text-xs font-medium text-neutral-300 hover:border-accent-500/50 hover:text-accent-300 disabled:cursor-not-allowed disabled:opacity-40"
                title="Download the selected client report as a PDF"
              >
                <Download size={13} />
                Download PDF
              </button>
              <button
                type="button"
                disabled={activityLoading || clientItems.length === 0}
                onClick={exportClientCsv}
                className="inline-flex items-center gap-1.5 rounded-lg border border-base-600 bg-base-900 px-3 py-2 text-xs font-medium text-neutral-300 hover:border-sky-500/50 hover:text-sky-300 disabled:cursor-not-allowed disabled:opacity-40"
                title="Download the selected report rows as CSV"
              >
                <FileSpreadsheet size={13} />
                CSV
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4 p-4">
          <div className="flex flex-wrap items-end gap-3">
            {(activityRange === "daily" || activityRange === "weekly") && (
              <label className="text-xs text-neutral-500">
                {activityRange === "daily" ? "Date" : "Week containing"}
                <input
                  type="date"
                  value={anchorDate}
                  onChange={(event) => setAnchorDate(event.target.value)}
                  className="mt-1 block rounded-md border border-base-600 bg-base-950 px-3 py-2 text-sm text-neutral-200"
                />
              </label>
            )}

            {activityRange === "monthly" && (
              <label className="text-xs text-neutral-500">
                Month
                <input
                  type="month"
                  value={month}
                  onChange={(event) => setMonth(event.target.value)}
                  className="mt-1 block rounded-md border border-base-600 bg-base-950 px-3 py-2 text-sm text-neutral-200"
                />
              </label>
            )}

            {activityRange === "custom" && (
              <>
                <label className="text-xs text-neutral-500">
                  From
                  <input
                    type="date"
                    value={customStart}
                    onChange={(event) => setCustomStart(event.target.value)}
                    className="mt-1 block rounded-md border border-base-600 bg-base-950 px-3 py-2 text-sm text-neutral-200"
                  />
                </label>
                <label className="text-xs text-neutral-500">
                  To
                  <input
                    type="date"
                    min={customStart}
                    value={customEnd}
                    onChange={(event) => setCustomEnd(event.target.value)}
                    className="mt-1 block rounded-md border border-base-600 bg-base-950 px-3 py-2 text-sm text-neutral-200"
                  />
                </label>
              </>
            )}

            <div className="min-w-[240px] flex-1 rounded-lg border border-accent-500/20 bg-accent-500/5 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-accent-400">Report period</p>
              <p className="mt-1 text-sm font-medium text-neutral-200">
                {displayDate(selectedRange.startDate)} → {displayDate(selectedRange.endDate)}
              </p>
              {hideDatesFromClient && (
                <p className="mt-1 text-[10px] text-amber-300">Hidden from client-facing report</p>
              )}
            </div>

            <label className="flex items-center gap-2 rounded-lg border border-base-700 bg-base-900/60 px-3 py-2 text-xs text-neutral-400">
              <input
                type="checkbox"
                checked={showTaskDates}
                onChange={(event) => setShowTaskDates(event.target.checked)}
                className="accent-accent-500"
              />
              Task-wise dates
            </label>

            <label className="flex items-center gap-2 rounded-lg border border-base-700 bg-base-900/60 px-3 py-2 text-xs text-neutral-400">
              <input
                type="checkbox"
                checked={includePricesForClient}
                onChange={(event) => setIncludePricesForClient(event.target.checked)}
                className="accent-accent-500"
              />
              Include prices in client report
            </label>
          </div>

          <div className="rounded-xl border border-base-700/60 bg-base-900/45 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-neutral-300">Client report content</p>
                <p className="mt-1 text-[10px] text-neutral-600">
                  Choose exactly which task statuses will be included. Done is selected by default.
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <ShieldCheck size={13} className="text-accent-400" />
                <span className="text-[10px] text-neutral-500">Internal data stays available here</span>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-base-700 bg-base-950/45 px-3 py-2 text-xs text-neutral-300">
                <input
                  type="checkbox"
                  checked={allStatusesSelected}
                  onChange={toggleAllStatuses}
                  className="accent-accent-500"
                />
                All
              </label>
              {allStatuses.map((status) => (
                <label
                  key={status.key}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-base-700 bg-base-950/45 px-3 py-2 text-xs text-neutral-300"
                >
                  <input
                    type="checkbox"
                    checked={includedStatuses.has(status.key)}
                    onChange={() => toggleStatus(status.key)}
                    className="accent-accent-500"
                  />
                  {status.label}
                </label>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap gap-2 border-t border-base-700/40 pt-3">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-base-700 bg-base-950/45 px-3 py-2 text-xs text-neutral-300">
                <input
                  type="checkbox"
                  checked={hideDatesFromClient}
                  onChange={(event) => setHideDatesFromClient(event.target.checked)}
                  className="accent-accent-500"
                />
                Hide all dates from client report
              </label>
              <span className="self-center text-[10px] text-neutral-600">
                You can still see and use the selected date range in the admin controls above.
              </span>
            </div>
          </div>

          {activityLoading && (
            <div className="rounded-lg border border-dashed border-base-700 p-6 text-center text-sm text-neutral-500">
              Loading task activity…
            </div>
          )}

          {activityError && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
              {activityError}
            </div>
          )}

          {activity && !activityLoading && (
            <>
              <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
                <MiniStat label="All tasks" value={activity.totals.total} />
                <MiniStat label="Done" value={activity.totals.done} tone="done" />
                <MiniStat label="In progress" value={activity.totals.inProgress} tone="progress" />
                <MiniStat label="Pending" value={activity.totals.pending} tone="pending" />
                <MiniStat label="N/A" value={activity.totals.notApplicable} />
                <MiniStat label="Completion" value={`${completionRate}%`} tone="done" />
              </div>

              {pricedItems.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-base-700/60 bg-base-900/45 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <PoundSterling size={14} className="text-amber-300" />
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-neutral-600">Internal pricing</p>
                      <p className="text-xs text-neutral-300">
                        {pricedItems.length} priced task{pricedItems.length === 1 ? "" : "s"} · raw total {internalPriceTotal.toLocaleString("en-GB")}
                      </p>
                    </div>
                  </div>
                  <p className="text-[10px] text-neutral-600">
                    Prices stay visible internally; client-facing inclusion is controlled by the toggle above.
                  </p>
                </div>
              )}

              <div className="rounded-lg border border-base-700/50 bg-base-950/30 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] uppercase tracking-wide text-neutral-600">Client-facing report preview</p>
                  <span className="inline-flex items-center gap-1 text-[9px] text-neutral-700"><Download size={10} /> Export uses this view</span>
                </div>
                <p className="mt-1 text-xs text-neutral-300">
                  {companyName || "Company"} · {projectName}
                  {!hideDatesFromClient && (
                    <> · {displayDate(selectedRange.startDate)} → {displayDate(selectedRange.endDate)}</>
                  )}
                </p>
                <p className="mt-1 text-[10px] text-neutral-600">
                  Included: {allStatuses.filter((status) => includedStatuses.has(status.key)).map((status) => status.label).join(", ") || "No statuses selected"}
                  {hideDatesFromClient ? " · Dates hidden" : ""}
                  {includePricesForClient ? " · Prices included" : " · Prices hidden"}
                </p>
              </div>

              <div className="space-y-3">
                {groupedItems.map(([group, items]) => {
                  const done = items.filter((item) => item.status === "done").length;
                  const pending = items.filter((item) => item.status === "pending").length;
                  const inProgress = items.filter((item) => item.status === "in_progress").length;

                  return (
                    <section key={group} className="overflow-hidden rounded-xl border border-base-700/60 bg-base-900/45">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-base-700/50 px-3 py-2.5">
                        <div>
                          <h3 className="text-sm font-semibold text-neutral-200">{group}</h3>
                          <p className="mt-0.5 text-[10px] text-neutral-600">
                            {items.length} tasks · {done} done · {inProgress} in progress · {pending} pending
                          </p>
                        </div>
                        <span className="rounded-full bg-base-800 px-2 py-1 text-[10px] text-neutral-500">
                          {items.length > 0 ? Math.round((done / Math.max(1, items.filter((item) => item.status !== "not_applicable").length)) * 100) : 0}% done
                        </span>
                      </div>

                      <div className="divide-y divide-base-700/40">
                        {items.map((item) => {
                          const price = priceLabel(item);
                          return (
                            <div
                              key={item.id}
                              className={cn(
                                "grid gap-2 px-3 py-2.5",
                                showTaskDates && !hideDatesFromClient
                                  ? "lg:grid-cols-[minmax(0,1fr)_120px_150px_150px]"
                                  : "lg:grid-cols-[minmax(0,1fr)_120px]",
                              )}
                            >
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-xs font-medium text-neutral-200">{item.title}</p>
                                  <span className={cn("rounded-full px-2 py-0.5 text-[9px] font-semibold", statusClass(item.status))}>
                                    {statusLabel(item.status)}
                                  </span>
                                </div>
                                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-neutral-600">
                                  {item.assignedToName && <span>By {item.assignedToName}</span>}
                                  <span className="capitalize">{item.source.replaceAll("_", " ")}</span>
                                  {price && includePricesForClient && (
                                    <span className="text-amber-300">Price {price}</span>
                                  )}
                                </div>
                                {item.notes && <p className="mt-1 line-clamp-2 text-[10px] text-neutral-700">{item.notes}</p>}
                              </div>

                              <div className="lg:text-right">
                                <p className="text-[9px] uppercase tracking-wide text-neutral-700">Status</p>
                                <p className="mt-1 text-[11px] text-neutral-400">{statusLabel(item.status)}</p>
                              </div>

                              {showTaskDates && !hideDatesFromClient && (
                                <>
                                  <div>
                                    <p className="flex items-center gap-1 text-[9px] uppercase tracking-wide text-neutral-700">
                                      <Clock3 size={10} /> Started
                                    </p>
                                    <p className="mt-1 text-[11px] text-neutral-400">{displayDate(item.startedAt, true)}</p>
                                  </div>
                                  <div>
                                    <p className="flex items-center gap-1 text-[9px] uppercase tracking-wide text-neutral-700">
                                      <CalendarDays size={10} /> Completed
                                    </p>
                                    <p className="mt-1 text-[11px] text-neutral-400">{displayDate(item.completedAt, true)}</p>
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}

                {clientItems.length === 0 && (
                  <div className="rounded-lg border border-dashed border-base-700 p-8 text-center text-sm text-neutral-500">
                    No tasks match the selected client-report statuses for this range.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </section>

      <section className="rounded-xl2 border border-base-700/60 bg-base-850 p-4 shadow-card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Saved report drafts</h2>
            <p className="mt-1 text-xs text-neutral-600">Editable summaries for approval, invoicing and client sending.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 rounded-lg border border-base-700/60 bg-base-900 p-1">
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
          <p className="mt-3 rounded-lg border border-dashed border-base-700 p-6 text-center text-sm text-neutral-500">
            No {PERIOD_TYPE_LABEL[periodType].toLowerCase()} report draft yet.
          </p>
        )}

        <div className="mt-3 flex flex-col gap-3">
          {visibleReports.map((report) => (
            <ReportCard key={report.id} projectId={projectId} report={report} />
          ))}
        </div>
      </section>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "done" | "progress" | "pending";
}) {
  return (
    <div className="rounded-lg border border-base-700/60 bg-base-900/50 p-3">
      <p className="text-[9px] uppercase tracking-wide text-neutral-600">{label}</p>
      <p
        className={cn(
          "mt-1 text-lg font-semibold text-neutral-200",
          tone === "done" && "text-emerald-300",
          tone === "progress" && "text-sky-300",
          tone === "pending" && "text-amber-300",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function ReportCard({ projectId, report }: { projectId: string; report: SeoReport }) {
  const [isPending, startTransition] = useTransition();
  const [summary, setSummary] = useState(report.summary);
  const [completedWork, setCompletedWork] = useState(report.completedWork);
  const [metricsNotes, setMetricsNotes] = useState(report.metricsNotes);
  const [notes, setNotes] = useState(report.notes);

  function saveField(field: "summary" | "completedWork" | "metricsNotes" | "notes", value: string, original: string) {
    if (value === original) return;
    startTransition(() => updateSeoReportAction(report.id, projectId, { [field]: value }));
  }

  return (
    <div className="rounded-xl2 border border-base-700/60 bg-base-850 p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-neutral-100">{report.period}</h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isPending || report.approved}
            onClick={() => startTransition(() => approveSeoReportAction(report.id, projectId))}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
              report.approved ? "bg-sky-500/15 text-sky-400" : "border border-base-600 text-neutral-400 hover:text-sky-300",
            )}
            title="Approve so this report can be attached to an invoice"
          >
            <ShieldCheck size={12} />
            {report.approved ? "Approved" : "Approve"}
          </button>
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
      </div>

      <div className="flex flex-col gap-3">
        <Field
          label="Summary"
          value={summary}
          onChange={setSummary}
          onBlur={() => saveField("summary", summary, report.summary)}
          rows={2}
        />
        <Field
          label="Completed work"
          value={completedWork}
          onChange={setCompletedWork}
          onBlur={() => saveField("completedWork", completedWork, report.completedWork)}
          rows={5}
        />
        <Field
          label="Metrics"
          value={metricsNotes}
          onChange={setMetricsNotes}
          onBlur={() => saveField("metricsNotes", metricsNotes, report.metricsNotes)}
          rows={4}
        />
        <Field
          label="Notes"
          value={notes}
          onChange={setNotes}
          onBlur={() => saveField("notes", notes, report.notes)}
          rows={2}
          placeholder="Anything worth adding for the client (optional)"
        />
      </div>

      {report.generatedByName && (
        <p className="mt-2 text-[11px] text-neutral-600">Generated by {report.generatedByName}</p>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  onBlur,
  rows,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  rows: number;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-neutral-500">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        rows={rows}
        placeholder={placeholder}
        className="w-full rounded-md border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
      />
    </div>
  );
}
