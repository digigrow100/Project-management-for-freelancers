import { createHash, randomBytes, randomUUID } from "node:crypto";
import { getSupabase } from "./supabaseClient";
import type {
  ActivitySettings,
  BrowserActivityType,
  BrowserDeviceStatus,
  EmployeeActivitySummary,
  EmployeeActivityTimelineItem,
  EmployeeDevice,
  ProjectDomainMapping,
  ScreenShareSession,
} from "./types";

const PAIRING_TTL_MS = 10 * 60 * 1000;
const MAX_ACTIVITY_BATCH = 100;
const MAX_PROMPT_BATCH = 20;
const MAX_PROMPT_LENGTH = 8000;
const SENSITIVE_QUERY_KEYS = /pass(word)?|secret|token|auth|session|api[-_]?key|access[-_]?key|code/i;
const FINANCIAL_HOST = /(^|\.)(paypal\.com|stripe\.com|wise\.com|revolut\.com)$|(^|\.)[^.]*bank[^.]*\./i;

type DeviceRow = {
  id: string;
  employee_id: string;
  device_id: string;
  extension_install_id: string;
  device_label: string;
  last_seen_at: string;
  last_status: BrowserDeviceStatus;
  current_domain: string;
  current_url: string;
  current_title: string;
  current_project_id: string | null;
  revoked_at: string | null;
};

export type AuthenticatedDevice = {
  id: string;
  employeeId: string;
  deviceId: string;
  extensionInstallId: string;
  deviceLabel: string;
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeDomain(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^www\./, "");
}

function safeIso(value: unknown, fallback = nowIso()): string {
  if (typeof value !== "string") return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function clampDuration(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(86400, Math.floor(number)));
}

export function sanitizeActivityUrl(raw: unknown): { url: string; domain: string } {
  if (typeof raw !== "string" || !raw) return { url: "", domain: "" };
  try {
    const parsed = new URL(raw);
    const domain = normalizeDomain(parsed.hostname);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return { url: parsed.protocol + "//" + domain, domain };
    }
    parsed.username = "";
    parsed.password = "";
    parsed.hash = "";
    if (FINANCIAL_HOST.test(parsed.hostname)) {
      return { url: parsed.origin, domain };
    }
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (SENSITIVE_QUERY_KEYS.test(key)) parsed.searchParams.set(key, "[redacted]");
    }
    return { url: parsed.toString().slice(0, 4000), domain };
  } catch {
    return { url: "", domain: "" };
  }
}

export function sanitizePromptText(raw: unknown): string {
  if (typeof raw !== "string") return "";
  let text = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ").trim();
  text = text
    .replace(/(password\s*[:=]\s*)([^\s,;]+)/gi, "$1[redacted]")
    .replace(/((?:api[-_ ]?key|access[-_ ]?token|secret)\s*[:=]\s*)([^\s,;]+)/gi, "$1[redacted]");
  return text.slice(0, MAX_PROMPT_LENGTH);
}

function parsePairingCode(code: string): { origin: string; rawToken: string } | null {
  const parts = code.trim().split(".");
  const version = parts[0];
  const originPart = parts[1];
  const rawToken = parts[2];
  if (version !== "FHQ1" || !originPart || !rawToken) return null;
  try {
    const origin = Buffer.from(originPart, "base64url").toString("utf8");
    const parsed = new URL(origin);
    if (!["https:", "http:"].includes(parsed.protocol)) return null;
    return { origin: parsed.origin, rawToken };
  } catch {
    return null;
  }
}

export async function createExtensionPairingCode(userId: string, origin: string) {
  const rawToken = randomBytes(24).toString("base64url");
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MS).toISOString();
  const supabase = getSupabase();

  await supabase
    .from("freelance_hq_extension_pairing_tokens")
    .delete()
    .eq("user_id", userId)
    .is("used_at", null);

  const { error } = await supabase.from("freelance_hq_extension_pairing_tokens").insert({
    user_id: userId,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });
  if (error) throw error;

  const originPart = Buffer.from(new URL(origin).origin, "utf8").toString("base64url");
  return {
    pairingCode: "FHQ1." + originPart + "." + rawToken,
    expiresAt,
  };
}

export async function pairExtension(input: {
  pairingCode: string;
  deviceId: string;
  extensionInstallId: string;
  userAgent?: string;
  deviceLabel?: string;
}) {
  const parsed = parsePairingCode(input.pairingCode);
  if (!parsed) throw new Error("Invalid pairing code.");
  if (!input.deviceId || input.deviceId.length > 160) throw new Error("Invalid device ID.");
  if (!input.extensionInstallId || input.extensionInstallId.length > 160) throw new Error("Invalid install ID.");

  const supabase = getSupabase();
  const usedAt = nowIso();
  const { data: consumed, error: consumeError } = await supabase
    .from("freelance_hq_extension_pairing_tokens")
    .update({ used_at: usedAt })
    .eq("token_hash", sha256(parsed.rawToken))
    .is("used_at", null)
    .gt("expires_at", usedAt)
    .select("user_id")
    .maybeSingle();
  if (consumeError) throw consumeError;
  if (!consumed?.user_id) throw new Error("Pairing code expired or already used.");

  const rawDeviceToken = randomBytes(32).toString("base64url");
  const tokenHash = sha256(rawDeviceToken);
  const { data: device, error: deviceError } = await supabase
    .from("freelance_hq_employee_devices")
    .upsert(
      {
        employee_id: consumed.user_id,
        device_id: input.deviceId,
        extension_install_id: input.extensionInstallId,
        token_hash: tokenHash,
        device_label: String(input.deviceLabel ?? "").slice(0, 120),
        user_agent: String(input.userAgent ?? "").slice(0, 500),
        paired_at: usedAt,
        last_seen_at: usedAt,
        last_status: "active",
        revoked_at: null,
        updated_at: usedAt,
      },
      { onConflict: "extension_install_id" },
    )
    .select("id,employee_id")
    .single();
  if (deviceError) throw deviceError;

  const { data: profile, error: profileError } = await supabase
    .from("freelance_hq_profiles")
    .select("name,email")
    .eq("id", consumed.user_id)
    .single();
  if (profileError) throw profileError;

  return {
    deviceToken: rawDeviceToken,
    employee: {
      id: consumed.user_id as string,
      name: String(profile?.name || profile?.email || "Employee"),
      email: String(profile?.email || ""),
    },
    deviceRecordId: device.id as string,
    appOrigin: parsed.origin,
  };
}

export async function authenticateExtensionRequest(request: Request): Promise<AuthenticatedDevice> {
  const authorization = request.headers.get("authorization") ?? "";
  const rawToken = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!rawToken || rawToken.length < 20) throw new Error("Unauthorized.");

  const { data, error } = await getSupabase()
    .from("freelance_hq_employee_devices")
    .select("id,employee_id,device_id,extension_install_id,device_label")
    .eq("token_hash", sha256(rawToken))
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Unauthorized.");

  return {
    id: String(data.id),
    employeeId: String(data.employee_id),
    deviceId: String(data.device_id),
    extensionInstallId: String(data.extension_install_id),
    deviceLabel: String(data.device_label ?? ""),
  };
}

async function loadProjectMatchers() {
  const supabase = getSupabase();
  const [{ data: mappings, error: mappingError }, { data: projects, error: projectError }] = await Promise.all([
    supabase
      .from("freelance_hq_project_domain_mappings")
      .select("id,project_id,match_type,pattern,label,is_active")
      .eq("is_active", true),
    supabase.from("freelance_hq_projects").select("id,name,website_url").eq("archived", false),
  ]);
  if (mappingError) throw mappingError;
  if (projectError) throw projectError;

  return {
    mappings: (mappings ?? []) as Array<{
      id: string;
      project_id: string;
      match_type: "domain" | "url_prefix" | "github_repo";
      pattern: string;
      label: string;
      is_active: boolean;
    }>,
    projects: (projects ?? []) as Array<{ id: string; name: string; website_url: string }>,
  };
}

export async function matchProjectForUrl(rawUrl: string, promptText = ""): Promise<{ id: string; name: string } | null> {
  const { url, domain } = sanitizeActivityUrl(rawUrl);
  const source = (url + "\n" + promptText).toLowerCase();
  const { mappings, projects } = await loadProjectMatchers();

  for (const mapping of mappings) {
    const pattern = mapping.pattern.trim().toLowerCase();
    if (!pattern) continue;
    if (mapping.match_type === "domain" && domain === normalizeDomain(pattern)) {
      const project = projects.find((item) => item.id === mapping.project_id);
      if (project) return { id: project.id, name: project.name };
    }
    if (mapping.match_type === "url_prefix" && source.startsWith(pattern)) {
      const project = projects.find((item) => item.id === mapping.project_id);
      if (project) return { id: project.id, name: project.name };
    }
    if (mapping.match_type === "github_repo" && source.includes(pattern.replace(/^https?:\/\//, ""))) {
      const project = projects.find((item) => item.id === mapping.project_id);
      if (project) return { id: project.id, name: project.name };
    }
  }

  for (const project of projects) {
    const website = sanitizeActivityUrl(project.website_url);
    if (website.domain && website.domain === domain) return { id: project.id, name: project.name };
    if (website.domain && promptText.toLowerCase().includes(website.domain)) return { id: project.id, name: project.name };
  }
  return null;
}

type ActivityInput = {
  id?: unknown;
  sessionId?: unknown;
  activityType?: unknown;
  url?: unknown;
  pageTitle?: unknown;
  startedAt?: unknown;
  endedAt?: unknown;
  durationSeconds?: unknown;
  metadata?: unknown;
};

export async function ingestActivityBatch(device: AuthenticatedDevice, rawEvents: unknown) {
  if (!Array.isArray(rawEvents)) throw new Error("Events must be an array.");
  const events = rawEvents.slice(0, MAX_ACTIVITY_BATCH) as ActivityInput[];
  if (events.length === 0) return { inserted: 0 };

  const supabase = getSupabase();
  const rows: Array<Record<string, unknown>> = [];
  let latest: {
    at: string;
    status: BrowserDeviceStatus;
    url: string;
    domain: string;
    title: string;
    projectId: string | null;
  } | null = null;

  for (const event of events) {
    const activityType = String(event.activityType ?? "") as BrowserActivityType;
    if (!["active","idle","tab_switch","session_start","session_end","heartbeat","offline"].includes(activityType)) continue;

    const startedAt = safeIso(event.startedAt);
    const endedAt = event.endedAt ? safeIso(event.endedAt, startedAt) : null;
    const { url, domain } = sanitizeActivityUrl(event.url);
    const title = String(event.pageTitle ?? "").replace(/[\u0000-\u001F]/g, " ").slice(0, 500);
    const project = url ? await matchProjectForUrl(url) : null;
    const sessionId = typeof event.sessionId === "string" && /^[0-9a-f-]{36}$/i.test(event.sessionId)
      ? event.sessionId
      : null;

    if (sessionId) {
      if (activityType === "session_start") {
        await supabase.from("freelance_hq_browser_sessions").upsert(
          {
            id: sessionId,
            employee_id: device.employeeId,
            device_id: device.id,
            started_at: startedAt,
            last_seen_at: startedAt,
            status: "active",
          },
          { onConflict: "id" },
        );
      } else {
        const sessionUpdate: Record<string, unknown> = {
          last_seen_at: endedAt ?? startedAt,
          status: activityType === "session_end" ? "ended" : activityType === "idle" ? "idle" : activityType === "offline" ? "offline" : "active",
        };
        if (activityType === "session_end") sessionUpdate.ended_at = endedAt ?? startedAt;
        await supabase
          .from("freelance_hq_browser_sessions")
          .update(sessionUpdate)
          .eq("id", sessionId)
          .eq("employee_id", device.employeeId)
          .eq("device_id", device.id);
      }
    }

    rows.push({
      employee_id: device.employeeId,
      device_id: device.id,
      session_id: sessionId,
      project_id: project?.id ?? null,
      activity_type: activityType,
      domain,
      url,
      page_title: title,
      started_at: startedAt,
      ended_at: endedAt,
      duration_seconds: clampDuration(event.durationSeconds),
      metadata: event.metadata && typeof event.metadata === "object" ? event.metadata : {},
    });

    const status: BrowserDeviceStatus =
      activityType === "idle" ? "idle" : activityType === "offline" || activityType === "session_end" ? "offline" : "active";
    if (!latest || startedAt > latest.at) {
      latest = { at: endedAt ?? startedAt, status, url, domain, title, projectId: project?.id ?? null };
    }
  }

  if (rows.length > 0) {
    const { error } = await supabase.from("freelance_hq_activity_logs").insert(rows);
    if (error) throw error;
  }

  if (latest) {
    const { error } = await supabase
      .from("freelance_hq_employee_devices")
      .update({
        last_seen_at: latest.at,
        last_status: latest.status,
        current_domain: latest.domain,
        current_url: latest.url,
        current_title: latest.title,
        current_project_id: latest.projectId,
        updated_at: nowIso(),
      })
      .eq("id", device.id)
      .eq("employee_id", device.employeeId)
      .is("revoked_at", null);
    if (error) throw error;
  }

  return { inserted: rows.length };
}

type PromptInput = {
  platform?: unknown;
  promptText?: unknown;
  submittedAt?: unknown;
  sessionId?: unknown;
};

export async function ingestPromptBatch(device: AuthenticatedDevice, rawPrompts: unknown) {
  if (!Array.isArray(rawPrompts)) throw new Error("Prompts must be an array.");
  const prompts = rawPrompts.slice(0, MAX_PROMPT_BATCH) as PromptInput[];
  const rows: Array<Record<string, unknown>> = [];

  for (const item of prompts) {
    const platform = String(item.platform ?? "");
    if (platform !== "chatgpt" && platform !== "claude") continue;
    const promptText = sanitizePromptText(item.promptText);
    if (!promptText) continue;
    const sessionId = typeof item.sessionId === "string" && /^[0-9a-f-]{36}$/i.test(item.sessionId)
      ? item.sessionId
      : null;
    const project = await matchProjectForUrl("", promptText);
    rows.push({
      employee_id: device.employeeId,
      device_id: device.id,
      session_id: sessionId,
      project_id: project?.id ?? null,
      platform,
      prompt_text: promptText,
      submitted_at: safeIso(item.submittedAt),
    });
  }

  if (rows.length > 0) {
    const { error } = await getSupabase().from("freelance_hq_ai_prompt_logs").insert(rows);
    if (error) throw error;
  }

  return { inserted: rows.length };
}

function toDevice(row: DeviceRow): EmployeeDevice {
  return {
    id: row.id,
    employeeId: row.employee_id,
    deviceId: row.device_id,
    extensionInstallId: row.extension_install_id,
    deviceLabel: row.device_label,
    pairedAt: "",
    lastSeenAt: row.last_seen_at,
    lastStatus: row.last_status,
    currentDomain: row.current_domain,
    currentUrl: row.current_url,
    currentTitle: row.current_title,
    currentProjectId: row.current_project_id,
    revokedAt: row.revoked_at,
  };
}

function startOfPakistanDay(daysOffset = 0): Date {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const base = new Date(String(map.year) + "-" + String(map.month) + "-" + String(map.day) + "T00:00:00+05:00");
  base.setUTCDate(base.getUTCDate() + daysOffset);
  return base;
}

export async function getEmployeeActivitySummaries(): Promise<EmployeeActivitySummary[]> {
  const supabase = getSupabase();
  const todayStart = startOfPakistanDay(0).toISOString();
  const tomorrowStart = startOfPakistanDay(1).toISOString();
  const [{ data: profiles, error: profileError }, { data: devices, error: deviceError }, { data: activities, error: activityError }, { data: prompts, error: promptError }, { data: projects, error: projectError }, { data: sessions, error: sessionError }] = await Promise.all([
    supabase.from("freelance_hq_profiles").select("id,name,email,role").eq("role", "member"),
    supabase.from("freelance_hq_employee_devices").select("*").is("revoked_at", null),
    supabase
      .from("freelance_hq_activity_logs")
      .select("employee_id,activity_type,duration_seconds,started_at")
      .gte("started_at", todayStart)
      .lt("started_at", tomorrowStart),
    supabase
      .from("freelance_hq_ai_prompt_logs")
      .select("employee_id")
      .gte("submitted_at", todayStart)
      .lt("submitted_at", tomorrowStart),
    supabase.from("freelance_hq_projects").select("id,name"),
    supabase
      .from("freelance_hq_browser_sessions")
      .select("id,employee_id,device_id,started_at,status")
      .is("ended_at", null)
      .order("started_at", { ascending: false }),
  ]);
  for (const error of [profileError, deviceError, activityError, promptError, projectError, sessionError]) {
    if (error) throw error;
  }

  const projectNames = new Map((projects ?? []).map((project) => [String(project.id), String(project.name)]));
  const now = Date.now();

  return (profiles ?? []).map((profile) => {
    const employeeId = String(profile.id);
    const employeeDevices = (devices ?? []).filter((device) => String(device.employee_id) === employeeId) as DeviceRow[];
    const freshest = [...employeeDevices].sort((a, b) => String(b.last_seen_at).localeCompare(String(a.last_seen_at)))[0] ?? null;
    const seenAge = freshest ? now - new Date(freshest.last_seen_at).getTime() : Number.POSITIVE_INFINITY;
    const status: BrowserDeviceStatus =
      seenAge > 3 * 60 * 1000 ? "offline" : freshest?.last_status === "idle" ? "idle" : "active";
    const employeeActivities = (activities ?? []).filter((row) => String(row.employee_id) === employeeId);
    const todayActiveSeconds = employeeActivities
      .filter((row) => row.activity_type === "active")
      .reduce((sum, row) => sum + clampDuration(row.duration_seconds), 0);
    const todayIdleSeconds = employeeActivities
      .filter((row) => row.activity_type === "idle")
      .reduce((sum, row) => sum + clampDuration(row.duration_seconds), 0);
    const aiPromptsToday = (prompts ?? []).filter((row) => String(row.employee_id) === employeeId).length;
    const activeSession = (sessions ?? []).find(
      (session) => String(session.employee_id) === employeeId && String(session.device_id) === freshest?.id,
    );
    const startedAt = activeSession?.started_at ? String(activeSession.started_at) : null;

    return {
      employeeId,
      employeeName: String(profile.name || profile.email || "Employee"),
      employeeEmail: String(profile.email || ""),
      status,
      currentWebsite: freshest?.current_domain ?? "",
      currentPageTitle: freshest?.current_title ?? "",
      currentUrl: freshest?.current_url ?? "",
      currentProjectId: freshest?.current_project_id ?? null,
      currentProjectName: freshest?.current_project_id ? projectNames.get(freshest.current_project_id) ?? null : null,
      currentSessionStartedAt: startedAt,
      currentSessionDurationSeconds: startedAt ? Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000)) : 0,
      todayActiveSeconds,
      todayIdleSeconds,
      lastSeenAt: freshest?.last_seen_at ?? null,
      aiPromptsToday,
      deviceCount: employeeDevices.length,
    };
  });
}

export async function queryEmployeeActivity(input: {
  from: string;
  to: string;
  employeeId?: string;
  projectId?: string;
  website?: string;
  activityType?: string;
  deviceId?: string;
  aiOnly?: boolean;
}): Promise<EmployeeActivityTimelineItem[]> {
  const supabase = getSupabase();
  let activityQuery = supabase
    .from("freelance_hq_activity_logs")
    .select("id,employee_id,device_id,project_id,activity_type,domain,url,page_title,started_at,ended_at,duration_seconds")
    .gte("started_at", input.from)
    .lt("started_at", input.to)
    .order("started_at", { ascending: false })
    .limit(5000);
  if (input.employeeId) activityQuery = activityQuery.eq("employee_id", input.employeeId);
  if (input.projectId) activityQuery = activityQuery.eq("project_id", input.projectId);
  if (input.website) activityQuery = activityQuery.ilike("domain", "%" + input.website.replace(/[%_]/g, "") + "%");
  if (input.activityType && input.activityType !== "ai_prompt") activityQuery = activityQuery.eq("activity_type", input.activityType);
  if (input.deviceId) activityQuery = activityQuery.eq("device_id", input.deviceId);

  let promptQuery = supabase
    .from("freelance_hq_ai_prompt_logs")
    .select("id,employee_id,device_id,project_id,platform,prompt_text,submitted_at")
    .gte("submitted_at", input.from)
    .lt("submitted_at", input.to)
    .order("submitted_at", { ascending: false })
    .limit(2000);
  if (input.employeeId) promptQuery = promptQuery.eq("employee_id", input.employeeId);
  if (input.projectId) promptQuery = promptQuery.eq("project_id", input.projectId);
  if (input.deviceId) promptQuery = promptQuery.eq("device_id", input.deviceId);

  const [{ data: profiles, error: profileError }, { data: devices, error: deviceError }, { data: projects, error: projectError }, activityResult, promptResult] = await Promise.all([
    supabase.from("freelance_hq_profiles").select("id,name,email"),
    supabase.from("freelance_hq_employee_devices").select("id,device_label,device_id"),
    supabase.from("freelance_hq_projects").select("id,name"),
    input.aiOnly || input.activityType === "ai_prompt" ? Promise.resolve({ data: [], error: null }) : activityQuery,
    input.activityType && input.activityType !== "ai_prompt" ? Promise.resolve({ data: [], error: null }) : promptQuery,
  ]);
  for (const error of [profileError, deviceError, projectError, activityResult.error, promptResult.error]) {
    if (error) throw error;
  }

  const profileNames = new Map((profiles ?? []).map((profile) => [String(profile.id), String(profile.name || profile.email || "Employee")]));
  const deviceNames = new Map((devices ?? []).map((device) => [String(device.id), String(device.device_label || device.device_id || "Device")]));
  const projectNames = new Map((projects ?? []).map((project) => [String(project.id), String(project.name)]));

  const activityItems: EmployeeActivityTimelineItem[] = (activityResult.data ?? []).map((row) => ({
    id: String(row.id),
    kind: "activity",
    employeeId: String(row.employee_id),
    employeeName: profileNames.get(String(row.employee_id)) ?? "Employee",
    deviceId: String(row.device_id),
    deviceLabel: deviceNames.get(String(row.device_id)) ?? "Device",
    projectId: row.project_id ? String(row.project_id) : null,
    projectName: row.project_id ? projectNames.get(String(row.project_id)) ?? null : null,
    activityType: String(row.activity_type),
    domain: String(row.domain ?? ""),
    url: String(row.url ?? ""),
    pageTitle: String(row.page_title ?? ""),
    startedAt: String(row.started_at),
    endedAt: row.ended_at ? String(row.ended_at) : null,
    durationSeconds: clampDuration(row.duration_seconds),
    platform: null,
    promptText: null,
  }));

  const promptItems: EmployeeActivityTimelineItem[] = (promptResult.data ?? []).map((row) => ({
    id: String(row.id),
    kind: "ai_prompt",
    employeeId: String(row.employee_id),
    employeeName: profileNames.get(String(row.employee_id)) ?? "Employee",
    deviceId: String(row.device_id),
    deviceLabel: deviceNames.get(String(row.device_id)) ?? "Device",
    projectId: row.project_id ? String(row.project_id) : null,
    projectName: row.project_id ? projectNames.get(String(row.project_id)) ?? null : null,
    activityType: "ai_prompt",
    domain: String(row.platform === "chatgpt" ? "chatgpt.com" : "claude.ai"),
    url: "",
    pageTitle: "",
    startedAt: String(row.submitted_at),
    endedAt: null,
    durationSeconds: 0,
    platform: row.platform === "claude" ? "claude" : "chatgpt",
    promptText: String(row.prompt_text ?? ""),
  }));

  return [...activityItems, ...promptItems].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function listEmployeeDevices(): Promise<EmployeeDevice[]> {
  const { data, error } = await getSupabase()
    .from("freelance_hq_employee_devices")
    .select("id,employee_id,device_id,extension_install_id,device_label,last_seen_at,last_status,current_domain,current_url,current_title,current_project_id,revoked_at")
    .order("last_seen_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as DeviceRow[]).map(toDevice);
}

export async function listProjectDomainMappings(): Promise<ProjectDomainMapping[]> {
  const supabase = getSupabase();
  const [{ data, error }, { data: projects, error: projectError }] = await Promise.all([
    supabase.from("freelance_hq_project_domain_mappings").select("*").order("created_at", { ascending: false }),
    supabase.from("freelance_hq_projects").select("id,name"),
  ]);
  if (error) throw error;
  if (projectError) throw projectError;
  const names = new Map((projects ?? []).map((project) => [String(project.id), String(project.name)]));
  return (data ?? []).map((row) => ({
    id: String(row.id),
    projectId: String(row.project_id),
    projectName: names.get(String(row.project_id)) ?? "Project",
    matchType: row.match_type as ProjectDomainMapping["matchType"],
    pattern: String(row.pattern),
    label: String(row.label ?? ""),
    isActive: Boolean(row.is_active),
  }));
}

export async function createProjectDomainMapping(input: {
  projectId: string;
  matchType: ProjectDomainMapping["matchType"];
  pattern: string;
  label?: string;
  createdBy: string;
}) {
  const pattern = input.pattern.trim().toLowerCase().replace(/^https?:\/\//, "");
  if (!pattern) throw new Error("Pattern is required.");
  const { error } = await getSupabase().from("freelance_hq_project_domain_mappings").insert({
    project_id: input.projectId,
    match_type: input.matchType,
    pattern,
    label: String(input.label ?? "").slice(0, 120),
    created_by: input.createdBy,
  });
  if (error) throw error;
}

export async function deleteProjectDomainMapping(id: string) {
  const { error } = await getSupabase().from("freelance_hq_project_domain_mappings").delete().eq("id", id);
  if (error) throw error;
}

export async function getActivitySettings(): Promise<ActivitySettings> {
  const { data, error } = await getSupabase()
    .from("freelance_hq_activity_settings")
    .select("retention_days,updated_at")
    .eq("id", true)
    .single();
  if (error) throw error;
  return { retentionDays: Number(data.retention_days ?? 60), updatedAt: String(data.updated_at) };
}

export async function updateActivityRetention(retentionDays: number, adminId: string) {
  const days = Math.max(1, Math.min(3650, Math.floor(retentionDays)));
  const { error } = await getSupabase()
    .from("freelance_hq_activity_settings")
    .upsert({ id: true, retention_days: days, updated_by: adminId, updated_at: nowIso() }, { onConflict: "id" });
  if (error) throw error;
  return days;
}

export async function deleteEmployeeActivity(input: {
  mode: "selected" | "employee" | "before";
  ids?: string[];
  employeeId?: string;
  before?: string;
}) {
  const supabase = getSupabase();
  if (input.mode === "selected") {
    const ids = (input.ids ?? []).slice(0, 500);
    if (ids.length === 0) return;
    await Promise.all([
      supabase.from("freelance_hq_activity_logs").delete().in("id", ids),
      supabase.from("freelance_hq_ai_prompt_logs").delete().in("id", ids),
    ]);
    return;
  }
  if (input.mode === "employee" && input.employeeId) {
    await Promise.all([
      supabase.from("freelance_hq_activity_logs").delete().eq("employee_id", input.employeeId),
      supabase.from("freelance_hq_ai_prompt_logs").delete().eq("employee_id", input.employeeId),
      supabase.from("freelance_hq_browser_sessions").delete().eq("employee_id", input.employeeId),
    ]);
    return;
  }
  if (input.mode === "before" && input.before) {
    const before = safeIso(input.before);
    await Promise.all([
      supabase.from("freelance_hq_activity_logs").delete().lt("started_at", before),
      supabase.from("freelance_hq_ai_prompt_logs").delete().lt("submitted_at", before),
      supabase.from("freelance_hq_browser_sessions").delete().lt("started_at", before),
    ]);
    return;
  }
  throw new Error("Invalid delete request.");
}

export async function cleanupOldEmployeeActivity() {
  const settings = await getActivitySettings();
  const cutoff = new Date(Date.now() - settings.retentionDays * 86400000).toISOString();
  await deleteEmployeeActivity({ mode: "before", before: cutoff });
  await getSupabase()
    .from("freelance_hq_extension_pairing_tokens")
    .delete()
    .lt("expires_at", nowIso());
  await getSupabase()
    .from("freelance_hq_screen_share_signals")
    .delete()
    .lt("created_at", new Date(Date.now() - 86400000).toISOString());
  return { retentionDays: settings.retentionDays, cutoff };
}

export async function startScreenShare(device: AuthenticatedDevice, microphoneEnabled: boolean) {
  const { data, error } = await getSupabase()
    .from("freelance_hq_screen_share_sessions")
    .insert({
      employee_id: device.employeeId,
      device_id: device.id,
      status: "waiting",
      microphone_enabled: microphoneEnabled,
      last_seen_at: nowIso(),
    })
    .select("id")
    .single();
  if (error) throw error;
  return String(data.id);
}

export async function endScreenShare(device: AuthenticatedDevice, sessionId: string) {
  const now = nowIso();
  const { error } = await getSupabase()
    .from("freelance_hq_screen_share_sessions")
    .update({ status: "ended", ended_at: now, last_seen_at: now })
    .eq("id", sessionId)
    .eq("employee_id", device.employeeId)
    .eq("device_id", device.id);
  if (error) throw error;
}

export async function addScreenShareSignal(input: {
  sessionId: string;
  sender: "employee" | "admin";
  signalType: "offer" | "answer" | "ice";
  payload: Record<string, unknown>;
  device?: AuthenticatedDevice;
}) {
  const supabase = getSupabase();
  if (input.device) {
    const { data: session, error: sessionError } = await supabase
      .from("freelance_hq_screen_share_sessions")
      .select("id")
      .eq("id", input.sessionId)
      .eq("employee_id", input.device.employeeId)
      .eq("device_id", input.device.id)
      .neq("status", "ended")
      .maybeSingle();
    if (sessionError) throw sessionError;
    if (!session) throw new Error("Screen share session not found.");
  }
  const { error } = await supabase.from("freelance_hq_screen_share_signals").insert({
    session_id: input.sessionId,
    sender: input.sender,
    signal_type: input.signalType,
    payload: input.payload,
  });
  if (error) throw error;
  await supabase
    .from("freelance_hq_screen_share_sessions")
    .update({ status: "active", last_seen_at: nowIso() })
    .eq("id", input.sessionId)
    .neq("status", "ended");
}

export async function listScreenShareSignals(input: {
  sessionId: string;
  afterId: number;
  receiver: "employee" | "admin";
  device?: AuthenticatedDevice;
}) {
  const supabase = getSupabase();
  if (input.device) {
    const { data: session, error: sessionError } = await supabase
      .from("freelance_hq_screen_share_sessions")
      .select("id")
      .eq("id", input.sessionId)
      .eq("employee_id", input.device.employeeId)
      .eq("device_id", input.device.id)
      .maybeSingle();
    if (sessionError) throw sessionError;
    if (!session) throw new Error("Screen share session not found.");
  }
  const sender = input.receiver === "employee" ? "admin" : "employee";
  const { data, error } = await supabase
    .from("freelance_hq_screen_share_signals")
    .select("id,signal_type,payload,created_at")
    .eq("session_id", input.sessionId)
    .eq("sender", sender)
    .gt("id", Math.max(0, input.afterId))
    .order("id", { ascending: true })
    .limit(200);
  if (error) throw error;
  return data ?? [];
}

export async function listLiveScreenShares(): Promise<ScreenShareSession[]> {
  const supabase = getSupabase();
  const [{ data: sessions, error }, { data: profiles, error: profileError }, { data: devices, error: deviceError }] = await Promise.all([
    supabase
      .from("freelance_hq_screen_share_sessions")
      .select("*")
      .neq("status", "ended")
      .order("started_at", { ascending: false }),
    supabase.from("freelance_hq_profiles").select("id,name,email"),
    supabase.from("freelance_hq_employee_devices").select("id,device_label,device_id"),
  ]);
  if (error) throw error;
  if (profileError) throw profileError;
  if (deviceError) throw deviceError;
  const names = new Map((profiles ?? []).map((row) => [String(row.id), String(row.name || row.email || "Employee")]));
  const deviceNames = new Map((devices ?? []).map((row) => [String(row.id), String(row.device_label || row.device_id || "Device")]));
  return (sessions ?? []).map((row) => ({
    id: String(row.id),
    employeeId: String(row.employee_id),
    employeeName: names.get(String(row.employee_id)) ?? "Employee",
    deviceId: String(row.device_id),
    deviceLabel: deviceNames.get(String(row.device_id)) ?? "Device",
    status: row.status as ScreenShareSession["status"],
    microphoneEnabled: Boolean(row.microphone_enabled),
    startedAt: String(row.started_at),
    endedAt: row.ended_at ? String(row.ended_at) : null,
    lastSeenAt: String(row.last_seen_at),
  }));
}
