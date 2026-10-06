"use client";

import Link from "next/link";
import { Fragment, useMemo, useState, useTransition } from "react";
import {
  Bot,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Filter,
  Link2,
  MonitorUp,
  RefreshCcw,
  Save,
  Trash2,
  Video,
} from "lucide-react";
import type {
  ActivitySettings,
  EmployeeActivityTimelineItem,
  EmployeeDevice,
  Profile,
  Project,
  ProjectDomainMapping,
  ScreenShareSession,
} from "@/lib/types";

type Preset = "today" | "yesterday" | "7d" | "30d" | "custom";

function dateKey(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return String(map.year) + "-" + String(map.month) + "-" + String(map.day);
}

function addDays(key: string, days: number) {
  const date = new Date(key + "T12:00:00+05:00");
  date.setUTCDate(date.getUTCDate() + days);
  return dateKey(date);
}

function rangeFor(preset: Preset, customFrom: string, customTo: string) {
  const today = dateKey(new Date());
  if (preset === "today") return { from: today, to: addDays(today, 1) };
  if (preset === "yesterday") {
    const yesterday = addDays(today, -1);
    return { from: yesterday, to: today };
  }
  if (preset === "30d") return { from: addDays(today, -29), to: addDays(today, 1) };
  if (preset === "custom") return { from: customFrom || today, to: addDays(customTo || customFrom || today, 1) };
  return { from: addDays(today, -6), to: addDays(today, 1) };
}

function isoStart(key: string) {
  return new Date(key + "T00:00:00+05:00").toISOString();
}

function duration(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) return h + "h " + m + "m";
  if (m > 0) return m + "m " + s + "s";
  return s + "s";
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));
}


type GroupedActivityRow = {
  id: string;
  kind: "page_group" | "idle_group" | "ai_prompt";
  employeeId: string;
  employeeName: string;
  deviceId: string;
  deviceLabel: string;
  projectId: string | null;
  projectName: string | null;
  domain: string;
  url: string;
  pageTitle: string;
  startedAt: string;
  lastSeenAt: string;
  totalDurationSeconds: number;
  platform: "chatgpt" | "claude" | null;
  promptText: string | null;
  sessions: EmployeeActivityTimelineItem[];
  rawIds: string[];
};

function groupTimelineItems(items: EmployeeActivityTimelineItem[]): GroupedActivityRow[] {
  const groups = new Map<string, GroupedActivityRow>();
  const standalone: GroupedActivityRow[] = [];

  for (const item of items) {
    if (item.kind === "ai_prompt") {
      standalone.push({
        id: "prompt:" + item.id,
        kind: "ai_prompt",
        employeeId: item.employeeId,
        employeeName: item.employeeName,
        deviceId: item.deviceId,
        deviceLabel: item.deviceLabel,
        projectId: item.projectId,
        projectName: item.projectName,
        domain: item.domain,
        url: item.url,
        pageTitle: item.pageTitle,
        startedAt: item.startedAt,
        lastSeenAt: item.startedAt,
        totalDurationSeconds: 0,
        platform: item.platform,
        promptText: item.promptText,
        sessions: [item],
        rawIds: [item.id],
      });
      continue;
    }

    if (["heartbeat", "tab_switch", "session_start", "session_end", "offline"].includes(item.activityType)) continue;

    const isIdle = item.activityType === "idle";
    if (item.durationSeconds <= 0) continue;
    if (!isIdle && !item.url) continue;

    const key = isIdle
      ? ["idle", item.employeeId, item.deviceId].join("|")
      : ["page", item.employeeId, item.deviceId, item.url].join("|");

    const existing = groups.get(key);
    if (existing) {
      existing.sessions.push(item);
      existing.rawIds.push(item.id);
      existing.totalDurationSeconds += item.durationSeconds;
      if (item.startedAt < existing.startedAt) existing.startedAt = item.startedAt;
      if (item.startedAt > existing.lastSeenAt) {
        existing.lastSeenAt = item.startedAt;
        existing.pageTitle = item.pageTitle || existing.pageTitle;
        existing.projectId = item.projectId ?? existing.projectId;
        existing.projectName = item.projectName ?? existing.projectName;
      }
      continue;
    }

    groups.set(key, {
      id: key,
      kind: isIdle ? "idle_group" : "page_group",
      employeeId: item.employeeId,
      employeeName: item.employeeName,
      deviceId: item.deviceId,
      deviceLabel: item.deviceLabel,
      projectId: item.projectId,
      projectName: item.projectName,
      domain: item.domain,
      url: item.url,
      pageTitle: item.pageTitle,
      startedAt: item.startedAt,
      lastSeenAt: item.startedAt,
      totalDurationSeconds: item.durationSeconds,
      platform: null,
      promptText: null,
      sessions: [item],
      rawIds: [item.id],
    });
  }

  return [...groups.values(), ...standalone]
    .map((group) => ({ ...group, sessions: [...group.sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt)) }))
    .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
}

export function AdminEmployeeActivity({
  members,
  projects,
  devices,
  initialMappings,
  initialSettings,
  initialLiveShares,
  initialItems,
}: {
  members: Profile[];
  projects: Project[];
  devices: EmployeeDevice[];
  initialMappings: ProjectDomainMapping[];
  initialSettings: ActivitySettings;
  initialLiveShares: ScreenShareSession[];
  initialItems: EmployeeActivityTimelineItem[];
}) {
  const today = dateKey(new Date());
  const [preset, setPreset] = useState<Preset>("7d");
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  const [employeeId, setEmployeeId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [website, setWebsite] = useState("");
  const [activityType, setActivityType] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [aiOnly, setAiOnly] = useState(false);
  const [items, setItems] = useState(initialItems);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [retentionDays, setRetentionDays] = useState(initialSettings.retentionDays);
  const [mappings, setMappings] = useState(initialMappings);
  const [liveShares, setLiveShares] = useState(initialLiveShares);
  const [busy, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  const deviceOptions = useMemo(
    () => devices.filter((device) => !employeeId || device.employeeId === employeeId),
    [devices, employeeId],
  );

  const groupedItems = useMemo(() => groupTimelineItems(items), [items]);

  async function refresh() {
    setMessage("");
    const range = rangeFor(preset, customFrom, customTo);
    const params = new URLSearchParams({
      from: isoStart(range.from),
      to: isoStart(range.to),
    });
    if (employeeId) params.set("employeeId", employeeId);
    if (projectId) params.set("projectId", projectId);
    if (website) params.set("website", website);
    if (activityType) params.set("activityType", activityType);
    if (deviceId) params.set("deviceId", deviceId);
    if (aiOnly) params.set("aiOnly", "1");

    const response = await fetch("/api/admin/employee-activity?" + params.toString(), { cache: "no-store" });
    const data = (await response.json()) as { items?: EmployeeActivityTimelineItem[]; error?: string };
    if (!response.ok) throw new Error(data.error || "Could not load activity.");
    setItems(data.items || []);
    setSelected(new Set());

    const shareResponse = await fetch("/api/admin/screen-share", { cache: "no-store" });
    if (shareResponse.ok) {
      const shareData = (await shareResponse.json()) as { sessions?: ScreenShareSession[] };
      setLiveShares(shareData.sessions || []);
    }
  }

  function runRefresh() {
    startTransition(async () => {
      try {
        await refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Refresh failed.");
      }
    });
  }

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleExpanded(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function deleteRequest(payload: Record<string, unknown>) {
    const response = await fetch("/api/admin/employee-activity", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) throw new Error(data.error || "Delete failed.");
    await refresh();
  }

  function deleteSelected() {
    if (selected.size === 0) return;
    if (!confirm("Delete the selected activity records permanently?")) return;
    startTransition(async () => {
      try {
        const rawIds = groupedItems.filter((item) => selected.has(item.id)).flatMap((item) => item.rawIds);
        await deleteRequest({ mode: "selected", ids: rawIds });
        setMessage("Selected logs deleted.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Delete failed.");
      }
    });
  }

  function deleteEmployeeHistory() {
    if (!employeeId) {
      setMessage("Select an employee first.");
      return;
    }
    const member = members.find((item) => item.id === employeeId);
    if (!confirm("Delete all stored browser activity and AI prompt history for " + (member?.name || member?.email || "this employee") + "?")) return;
    startTransition(async () => {
      try {
        await deleteRequest({ mode: "employee", employeeId });
        setMessage("Employee history deleted.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Delete failed.");
      }
    });
  }

  function deleteBefore() {
    const before = prompt("Delete all activity before date (YYYY-MM-DD):");
    if (!before) return;
    if (!confirm("Permanently delete all employee activity before " + before + "?")) return;
    startTransition(async () => {
      try {
        await deleteRequest({ mode: "before", before: isoStart(before) });
        setMessage("Older activity deleted.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Delete failed.");
      }
    });
  }

  function saveRetention() {
    startTransition(async () => {
      const response = await fetch("/api/admin/activity-settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ retentionDays }),
      });
      const data = (await response.json()) as { retentionDays?: number; error?: string };
      if (!response.ok) {
        setMessage(data.error || "Could not update retention.");
        return;
      }
      setRetentionDays(data.retentionDays || retentionDays);
      setMessage("Retention setting saved.");
    });
  }

  function addMapping(formData: FormData) {
    startTransition(async () => {
      const response = await fetch("/api/admin/project-domain-mappings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: String(formData.get("projectId") || ""),
          matchType: String(formData.get("matchType") || "domain"),
          pattern: String(formData.get("pattern") || ""),
          label: String(formData.get("label") || ""),
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setMessage(data.error || "Could not add mapping.");
        return;
      }
      const listResponse = await fetch("/api/admin/project-domain-mappings", { cache: "no-store" });
      const listData = (await listResponse.json()) as { mappings?: ProjectDomainMapping[] };
      setMappings(listData.mappings || []);
      setMessage("Project mapping added.");
    });
  }

  function removeMapping(id: string) {
    if (!confirm("Delete this project mapping?")) return;
    startTransition(async () => {
      await fetch("/api/admin/project-domain-mappings", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setMappings((current) => current.filter((item) => item.id !== id));
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <MonitorUp size={14} className="text-accent-400" />
            Admin · Employee Activity
          </div>
          <h1 className="mt-2 text-2xl font-semibold text-neutral-50">Browser Activity</h1>
          <p className="mt-1 max-w-3xl text-sm text-neutral-500">
            Browser activity is linked to the employee&apos;s app account through a paired device token, not the Chrome Google account.
          </p>
        </div>
        <Link href="/admin" className="text-xs font-semibold text-accent-300 hover:text-accent-200">Back to dashboard</Link>
      </div>

      {message && <div className="rounded-lg border border-base-700 bg-base-850 px-3 py-2 text-xs text-neutral-300">{message}</div>}

      <section className="rounded-xl2 border border-base-700/60 bg-base-850 p-4 shadow-card">
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-neutral-500" />
          <h2 className="text-sm font-semibold text-neutral-100">Filters</h2>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          <select value={preset} onChange={(event) => setPreset(event.target.value as Preset)} className="rounded-lg border border-base-600 bg-base-900 px-3 py-2 text-xs text-neutral-300">
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="custom">Custom date</option>
          </select>
          <select value={employeeId} onChange={(event) => { setEmployeeId(event.target.value); setDeviceId(""); }} className="rounded-lg border border-base-600 bg-base-900 px-3 py-2 text-xs text-neutral-300">
            <option value="">All employees</option>
            {members.map((member) => <option key={member.id} value={member.id}>{member.name || member.email}</option>)}
          </select>
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="rounded-lg border border-base-600 bg-base-900 px-3 py-2 text-xs text-neutral-300">
            <option value="">All projects</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
          <select value={deviceId} onChange={(event) => setDeviceId(event.target.value)} className="rounded-lg border border-base-600 bg-base-900 px-3 py-2 text-xs text-neutral-300">
            <option value="">All devices</option>
            {deviceOptions.map((device) => <option key={device.id} value={device.id}>{device.deviceLabel || device.deviceId}</option>)}
          </select>
          <select value={activityType} onChange={(event) => setActivityType(event.target.value)} className="rounded-lg border border-base-600 bg-base-900 px-3 py-2 text-xs text-neutral-300">
            <option value="">All activity types</option>
            <option value="active">Active website</option>
            <option value="idle">Idle</option>
            <option value="tab_switch">Tab switch</option>
            <option value="session_start">Session start</option>
            <option value="session_end">Session end</option>
            <option value="ai_prompt">AI prompts</option>
          </select>
          <input value={website} onChange={(event) => setWebsite(event.target.value)} placeholder="Website/domain filter" className="rounded-lg border border-base-600 bg-base-900 px-3 py-2 text-xs text-neutral-300 placeholder:text-neutral-600" />
          <label className="flex items-center gap-2 rounded-lg border border-base-600 bg-base-900 px-3 py-2 text-xs text-neutral-400">
            <input type="checkbox" checked={aiOnly} onChange={(event) => setAiOnly(event.target.checked)} />
            AI prompts only
          </label>
          <button type="button" onClick={runRefresh} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent-500 px-3 py-2 text-xs font-semibold text-base-950 hover:bg-accent-400 disabled:opacity-60">
            <RefreshCcw size={13} />
            Refresh
          </button>
        </div>
        {preset === "custom" && (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} className="rounded-lg border border-base-600 bg-base-900 px-3 py-2 text-xs text-neutral-300" />
            <input type="date" value={customTo} min={customFrom} onChange={(event) => setCustomTo(event.target.value)} className="rounded-lg border border-base-600 bg-base-900 px-3 py-2 text-xs text-neutral-300" />
          </div>
        )}
      </section>

      <section className="rounded-xl2 border border-base-700/60 bg-base-850 p-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-neutral-100">Live Screen Sharing</h2>
            <p className="mt-1 text-xs text-neutral-500">Only sessions employees started manually are shown here.</p>
          </div>
          <span className="text-xs text-neutral-500">{liveShares.length} live</span>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {liveShares.map((share) => (
            <div key={share.id} className="rounded-xl border border-base-700 bg-base-900/55 p-3">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                <p className="text-sm font-semibold text-neutral-100">{share.employeeName}</p>
              </div>
              <p className="mt-1 text-[10px] text-neutral-600">{share.deviceLabel} · {share.microphoneEnabled ? "Mic on" : "Mic off"}</p>
              <Link href={"/admin/employee-activity/screen/" + share.id} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-300 hover:bg-sky-500/15">
                <Video size={13} />
                View live screen
              </Link>
            </div>
          ))}
          {liveShares.length === 0 && <p className="text-xs text-neutral-600">No employee is sharing a screen right now.</p>}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl2 border border-base-700/60 bg-base-850 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-base-700/50 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-neutral-100">Activity Timeline</h2>
            <p className="mt-1 text-xs text-neutral-500">{groupedItems.length} grouped activities · {items.length} raw events</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={deleteSelected} disabled={selected.size === 0 || busy} className="rounded-lg border border-rose-500/25 px-3 py-2 text-xs text-rose-300 disabled:opacity-40">Delete selected</button>
            <button type="button" onClick={deleteEmployeeHistory} disabled={busy} className="rounded-lg border border-base-600 px-3 py-2 text-xs text-neutral-400">Delete employee history</button>
            <button type="button" onClick={deleteBefore} disabled={busy} className="rounded-lg border border-base-600 px-3 py-2 text-xs text-neutral-400">Delete before date</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-left">
            <thead className="bg-base-900/70 text-[10px] uppercase tracking-wide text-neutral-600">
              <tr>
                <th className="px-3 py-2"></th>
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Employee</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Website / Prompt</th>
                <th className="px-3 py-2">Project</th>
                <th className="px-3 py-2">Device</th>
                <th className="px-3 py-2">Duration</th>
              </tr>
            </thead>
            <tbody>
              {groupedItems.map((item) => {
                const canExpand = item.kind !== "ai_prompt" && item.sessions.length > 0;
                const isExpanded = expanded.has(item.id);
                return (
                  <Fragment key={item.id}>
                    <tr className="border-t border-base-700/50 align-top">
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggleSelected(item.id)} />
                          {canExpand && (
                            <button type="button" onClick={() => toggleExpanded(item.id)} className="rounded p-0.5 text-neutral-500 hover:bg-base-700 hover:text-neutral-200" aria-label={isExpanded ? "Collapse visits" : "Expand visits"}>
                              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-neutral-500">{timeLabel(item.lastSeenAt)}</td>
                      <td className="px-3 py-3 text-xs font-medium text-neutral-300">{item.employeeName}</td>
                      <td className="px-3 py-3">
                        <span className={item.kind === "ai_prompt" ? "rounded-full bg-violet-500/10 px-2 py-1 text-[10px] font-semibold text-violet-300" : item.kind === "idle_group" ? "rounded-full bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-300" : "rounded-full bg-sky-500/10 px-2 py-1 text-[10px] font-semibold text-sky-300"}>
                          {item.kind === "ai_prompt" ? (item.platform === "claude" ? "Claude prompt" : "ChatGPT prompt") : item.kind === "idle_group" ? "idle" : "page activity"}
                        </span>
                      </td>
                      <td className="max-w-[460px] px-3 py-3">
                        {item.kind === "ai_prompt" ? (
                          <div>
                            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-violet-300"><Bot size={11} /> Submitted prompt</div>
                            <p className="mt-1 whitespace-pre-wrap break-words text-xs text-neutral-300">{item.promptText}</p>
                          </div>
                        ) : item.kind === "idle_group" ? (
                          <div>
                            <p className="text-xs font-medium text-neutral-300">Browser idle</p>
                            <p className="mt-1 text-[10px] text-neutral-600">{item.sessions.length} idle period{item.sessions.length === 1 ? "" : "s"}</p>
                          </div>
                        ) : (
                          <div>
                            <p className="truncate text-xs font-semibold text-neutral-200">{item.domain || "Browser"}</p>
                            <p className="mt-1 truncate text-[10px] text-neutral-600" title={item.pageTitle}>{item.pageTitle || item.url || "—"}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-3">
                              {item.url && <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] text-sky-300 hover:text-sky-200">Open URL <ExternalLink size={10} /></a>}
                              <span className="text-[10px] text-neutral-600">{item.sessions.length} visit{item.sessions.length === 1 ? "" : "s"}</span>
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs text-accent-300">{item.projectName || "—"}</td>
                      <td className="px-3 py-3 text-xs text-neutral-500">{item.deviceLabel}</td>
                      <td className="px-3 py-3 font-mono text-xs font-semibold text-neutral-200">{item.kind === "ai_prompt" ? "—" : duration(item.totalDurationSeconds)}</td>
                    </tr>
                    {canExpand && isExpanded && (
                      <tr className="border-t border-base-700/30 bg-base-900/35">
                        <td colSpan={8} className="px-4 py-3">
                          <div className="ml-8 overflow-hidden rounded-xl border border-base-700/60 bg-base-950/35">
                            <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-base-700/50 px-3 py-2 text-[9px] font-semibold uppercase tracking-wide text-neutral-600">
                              <span>Visit/session</span><span>Started</span><span>Duration</span>
                            </div>
                            {item.sessions.map((session, index) => (
                              <div key={session.id} className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-base-700/30 px-3 py-2 last:border-b-0">
                                <div className="min-w-0">
                                  <p className="truncate text-[11px] font-medium text-neutral-300">{item.kind === "idle_group" ? "Idle period " + (item.sessions.length - index) : "Visit " + (item.sessions.length - index)}</p>
                                  {item.kind === "page_group" && <p className="mt-0.5 truncate text-[9px] text-neutral-600">{session.pageTitle || session.url}</p>}
                                </div>
                                <span className="whitespace-nowrap text-[10px] text-neutral-500">{timeLabel(session.startedAt)}</span>
                                <span className="min-w-[72px] text-right font-mono text-[10px] font-semibold text-neutral-300">{duration(session.durationSeconds)}</span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {groupedItems.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-neutral-600">No activity matches these filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl2 border border-base-700/60 bg-base-850 p-4 shadow-card">
          <div className="flex items-center gap-2">
            <CalendarDays size={14} className="text-neutral-500" />
            <h2 className="text-sm font-semibold text-neutral-100">Data Retention</h2>
          </div>
          <p className="mt-1 text-xs text-neutral-500">Old activity, prompts and browser sessions are removed automatically by the cleanup job.</p>
          <div className="mt-3 flex items-center gap-2">
            <input type="number" min={1} max={3650} value={retentionDays} onChange={(event) => setRetentionDays(Number(event.target.value || 60))} className="w-28 rounded-lg border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-300" />
            <span className="text-xs text-neutral-500">days</span>
            <button type="button" onClick={saveRetention} disabled={busy} className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-accent-500 px-3 py-2 text-xs font-semibold text-base-950">
              <Save size={12} />
              Save
            </button>
          </div>
        </section>

        <section className="rounded-xl2 border border-base-700/60 bg-base-850 p-4 shadow-card">
          <div className="flex items-center gap-2">
            <Link2 size={14} className="text-neutral-500" />
            <h2 className="text-sm font-semibold text-neutral-100">Project URL Mapping</h2>
          </div>
          <p className="mt-1 text-xs text-neutral-500">Project website domains match automatically. Add overrides for extra domains, URL prefixes or GitHub repositories.</p>
          <form action={addMapping} className="mt-3 grid gap-2 sm:grid-cols-2">
            <select name="projectId" required className="rounded-lg border border-base-600 bg-base-900 px-3 py-2 text-xs text-neutral-300">
              <option value="">Choose project</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
            <select name="matchType" defaultValue="domain" className="rounded-lg border border-base-600 bg-base-900 px-3 py-2 text-xs text-neutral-300">
              <option value="domain">Domain</option>
              <option value="url_prefix">URL prefix</option>
              <option value="github_repo">GitHub repository</option>
            </select>
            <input name="pattern" required placeholder="rapid-tyres.com or github.com/org/repo" className="rounded-lg border border-base-600 bg-base-900 px-3 py-2 text-xs text-neutral-300 placeholder:text-neutral-600 sm:col-span-2" />
            <input name="label" placeholder="Optional label" className="rounded-lg border border-base-600 bg-base-900 px-3 py-2 text-xs text-neutral-300 placeholder:text-neutral-600" />
            <button type="submit" disabled={busy} className="rounded-lg bg-sky-500 px-3 py-2 text-xs font-semibold text-white">Add mapping</button>
          </form>
          <div className="mt-3 space-y-2">
            {mappings.slice(0, 10).map((mapping) => (
              <div key={mapping.id} className="flex items-center justify-between gap-3 rounded-lg border border-base-700 bg-base-900/55 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-neutral-300">{mapping.projectName}</p>
                  <p className="mt-0.5 truncate text-[10px] text-neutral-600">{mapping.matchType} · {mapping.pattern}</p>
                </div>
                <button type="button" onClick={() => removeMapping(mapping.id)} className="rounded-md p-1.5 text-neutral-600 hover:bg-rose-500/10 hover:text-rose-300" title="Delete mapping">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
