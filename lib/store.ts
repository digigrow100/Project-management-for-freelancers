import { randomBytes, randomUUID } from "node:crypto";
import { getSupabase } from "./supabaseClient";
import { PROJECT_TEMPLATES } from "./templates";
import { decryptSecret, encryptSecret, hashVaultPassword, verifyVaultPassword } from "./backlinkCrypto";
import type {
  BacklinkCategory,
  BacklinkCategoryType,
  BacklinkEntry,
  BacklinkLink,
  BacklinkStatus,
  BacklinkTemplate,
  BacklinkTemplateItem,
  BillingFrequency,
  BusinessProfile,
  ChecklistItem,
  Client,
  ClientBalance,
  ClientDetails,
  ClientService,
  ClientServiceStatus,
  CompetitorBacklink,
  ContentItem,
  ContentStatus,
  DnsRecordType,
  Domain,
  DomainClient,
  DomainDnsRecord,
  DomainSettings,
  Invoice,
  InvoiceItem,
  InvoiceStatus,
  Keyword,
  KeywordGroup,
  KeywordGroupColor,
  KeywordMonthlyPosition,
  KeywordPage,
  KeywordRankHistoryEntry,
  KeywordStatus,
  LoginMethod,
  Note,
  NoteFolder,
  OnPageStatus,
  OutreachProspect,
  OutreachStatus,
  PageType,
  ProjectAttachment,
  Payment,
  PaymentKind,
  PaymentPlan,
  PaymentPlanType,
  Priority,
  Profile,
  Project,
  ProjectType,
  ReportPeriodType,
  ReportPreferences,
  ResaleDomainStatus,
  RichContent,
  Role,
  SearchIntent,
  Service,
  SeoModule,
  SeoReport,
  SeoReportMetrics,
  Stage,
  Task,
  TaskFile,
  TaskNote,
  TechnicalIssue,
  TechnicalIssueStatus,
  Renewal,
  RenewalServiceType,
  RenewalStatus,
  TaskPriority,
  TaskStatus,
  WebAppFeature,
  WebAppSubFeature,
  WebDevDetails,
  Website,
} from "./types";

/**
 * Supabase-backed data layer. Every function here is async and mirrors the shape of
 * the app's domain types (lib/types.ts) so page and component code never has to know
 * it's talking to Postgres under the hood. All access goes through the server-only
 * service role client in lib/supabaseClient.ts.
 */

interface ProjectRow {
  id: string;
  name: string;
  client: string;
  client_id: string | null;
  client_details: ClientDetails;
  type: ProjectType;
  description: string;
  color: string;
  archived: boolean;
  start_date: string | null;
  end_date: string | null;
  website_url: string;
  web_details: WebDevDetails | null;
  share_token: string | null;
  created_at: string;
  updated_at: string;
}

interface StageRow {
  id: string;
  project_id: string;
  name: string;
  order_index: number;
}

interface TaskRow {
  id: string;
  project_id: string;
  stage_id: string | null;
  title: string;
  notes: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  scheduled_for: string | null;
  checklist: ChecklistItem[];
  files: (TaskFile | string)[];
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  order_index: number;
  assigned_to: string | null;
  why: string;
  expected_outcome: string;
  seo_module: SeoModule | null;
  keyword_id: string | null;
  page_id: string | null;
  content_item_id: string | null;
  backlink_entry_id: string | null;
  outreach_prospect_id: string | null;
}

/** Normalizes legacy plain-string image URLs (from before file attachments were
 * generalized) alongside the current {url, name, type, size} shape. */
function normalizeFiles(files: (TaskFile | string)[] | null | undefined): TaskFile[] {
  return (files ?? []).map((f) =>
    typeof f === "string" ? { url: f, name: f.split("/").pop() || "file", type: "image/*", size: 0 } : f,
  );
}

function toStage(row: StageRow): Stage {
  return { id: row.id, name: row.name, order: row.order_index };
}

/** `nameById` is optional so callers that don't need the resolved assignee name (e.g. a single-row update) can skip the extra query. */
function toTask(row: TaskRow, nameById?: Map<string, string>): Task {
  return {
    id: row.id,
    projectId: row.project_id,
    stageId: row.stage_id,
    title: row.title,
    notes: row.notes,
    status: row.status,
    priority: row.priority,
    dueDate: row.due_date,
    scheduledFor: row.scheduled_for,
    checklist: row.checklist ?? [],
    files: normalizeFiles(row.files),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    order: row.order_index,
    assignedTo: row.assigned_to,
    assignedToName: row.assigned_to ? (nameById?.get(row.assigned_to) ?? "Unknown") : null,
    why: row.why ?? "",
    expectedOutcome: row.expected_outcome ?? "",
    seoModule: row.seo_module ?? null,
    keywordId: row.keyword_id,
    pageId: row.page_id,
    contentItemId: row.content_item_id,
    backlinkEntryId: row.backlink_entry_id,
    outreachProspectId: row.outreach_prospect_id,
  };
}

/** Builds the id -> display-name map `toTask` needs to resolve `assignedToName`. */
async function taskNameLookup(): Promise<Map<string, string>> {
  const members = await listTeamMembers();
  return new Map(members.map((m) => [m.id, m.name || m.email]));
}

function toProject(row: ProjectRow, stages: Stage[]): Project {
  return {
    id: row.id,
    name: row.name,
    client: row.client,
    clientId: row.client_id,
    clientDetails: row.client_details,
    type: row.type,
    description: row.description,
    color: row.color,
    archived: row.archived,
    startDate: row.start_date,
    endDate: row.end_date,
    websiteUrl: row.website_url,
    webDetails: row.web_details,
    shareToken: row.share_token,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    stages: [...stages].sort((a, b) => a.order - b.order),
  };
}

function emptyWebDetails(): WebDevDetails {
  return {
    websiteName: "",
    websiteUrl: "",
    domainStatus: "pending",
    logoUrl: "",
    siteIconUrl: "",
    openGraphImageUrl: "",
    servicesDetails: "",
    hostingDetails: "",
    contactDetails: "",
    notes: "",
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * True when a query failed only because its table doesn't exist yet (i.e. the
 * relevant migration hasn't been run). Callers use this to fail open — return
 * an empty/default result — instead of crashing every page that touches a
 * newer, optional feature (teams/roles, payments) before it's set up.
 *
 * Covers two distinct error shapes for the same underlying problem: raw
 * Postgres ("42P01", "does not exist") when querying via a direct connection,
 * and PostgREST's own ("PGRST205", "...in the schema cache") when the table
 * is missing (or was just created and PostgREST's cache hasn't refreshed
 * yet) — Supabase's JS client goes through PostgREST, so this second shape is
 * actually the common case in production.
 */
export function isMissingTableError(error: unknown): boolean {
  const err = error as { code?: string; message?: string } | null;
  if (err?.code === "42P01" || err?.code === "PGRST205") return true;
  const message = err?.message ?? "";
  return message.includes("does not exist") || message.includes("schema cache");
}

export function todayDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function toCompletedTimestamp(dateKey: string | null): string {
  return `${dateKey || todayDateKey()}T12:00:00.000Z`;
}

function isChecklistComplete(checklist: ChecklistItem[]): boolean {
  return checklist.every((item) => item.done);
}

async function touchProject(projectId: string): Promise<void> {
  const { error } = await getSupabase()
    .from("freelance_hq_projects")
    .update({ updated_at: nowIso() })
    .eq("id", projectId);
  if (error) throw error;
}

async function fetchStagesForProjects(projectIds: string[]): Promise<Map<string, Stage[]>> {
  const map = new Map<string, Stage[]>();
  if (projectIds.length === 0) return map;

  const { data, error } = await getSupabase().from("freelance_hq_stages").select("*").in("project_id", projectIds);
  if (error) throw error;

  for (const row of (data ?? []) as StageRow[]) {
    const list = map.get(row.project_id) ?? [];
    list.push(toStage(row));
    map.set(row.project_id, list);
  }
  return map;
}

export async function getProjects(): Promise<Project[]> {
  const { data, error } = await getSupabase()
    .from("freelance_hq_projects")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as ProjectRow[];
  const stagesByProject = await fetchStagesForProjects(rows.map((r) => r.id));
  return rows.map((row) => toProject(row, stagesByProject.get(row.id) ?? []));
}

export async function getProject(id: string): Promise<Project | null> {
  const { data, error } = await getSupabase().from("freelance_hq_projects").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as ProjectRow;
  const { data: stageRows, error: stageError } = await getSupabase()
    .from("freelance_hq_stages")
    .select("*")
    .eq("project_id", id);
  if (stageError) throw stageError;

  return toProject(row, ((stageRows ?? []) as StageRow[]).map(toStage));
}

export async function createProject(input: {
  name: string;
  type: ProjectType;
  description: string;
  color: string;
  startDate?: string | null;
  endDate?: string | null;
  websiteUrl?: string;
  clientId: string;
  webDetails?: Partial<WebDevDetails> | null;
}): Promise<Project> {
  const client = await getClient(input.clientId);
  if (!client) throw new Error("Client not found.");
  const clientDetails: ClientDetails = {
    name: client.name,
    company: client.company,
    email: client.email,
    phone: client.phone,
    address: client.address,
    notes: client.notes,
    logoUrl: client.logoUrl,
  };

  const webDetails =
    input.type === "web_dev" || input.type === "web_app"
      ? { ...emptyWebDetails(), ...(input.webDetails ?? {}) }
      : null;

  const { data, error } = await getSupabase()
    .from("freelance_hq_projects")
    .insert({
      name: input.name,
      client: clientDetails.company || clientDetails.name,
      client_id: input.clientId,
      client_details: clientDetails,
      type: input.type,
      description: input.description,
      color: input.color,
      start_date: input.startDate ?? null,
      end_date: input.endDate ?? null,
      website_url: input.websiteUrl ?? "",
      web_details: webDetails,
    })
    .select()
    .single();
  if (error) throw error;

  const row = data as ProjectRow;
  // SEO projects use the fixed module set (Keywords/On-Page/Technical/
  // Content/Off-Page/Reporting) instead of freeform stages — every other
  // project type keeps seeding its template's stage list exactly as before.
  const stageNames = input.type === "seo" ? [] : PROJECT_TEMPLATES[input.type].stages;
  const { data: stageRows, error: stageError } =
    stageNames.length > 0
      ? await getSupabase()
          .from("freelance_hq_stages")
          .insert(stageNames.map((name, i) => ({ project_id: row.id, name, order_index: i })))
          .select()
      : { data: [], error: null };
  if (stageError) throw stageError;

  return toProject(row, ((stageRows ?? []) as StageRow[]).map(toStage));
}

export async function updateProjectDetails(
  id: string,
  patch: Partial<
    Pick<Project, "description" | "startDate" | "endDate" | "websiteUrl" | "clientDetails" | "webDetails">
  >,
): Promise<void> {
  const update: Record<string, unknown> = { updated_at: nowIso() };
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.startDate !== undefined) update.start_date = patch.startDate;
  if (patch.endDate !== undefined) update.end_date = patch.endDate;
  if (patch.websiteUrl !== undefined) update.website_url = patch.websiteUrl;
  if (patch.webDetails !== undefined) update.web_details = patch.webDetails;
  if (patch.clientDetails !== undefined) {
    update.client_details = patch.clientDetails;
    update.client = patch.clientDetails.company || patch.clientDetails.name;
  }

  const { error } = await getSupabase().from("freelance_hq_projects").update(update).eq("id", id);
  if (error) throw error;
}

interface ClientRow {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  address: string;
  website: string;
  notes: string;
  logo_url: string;
  created_at: string;
}

function toClient(row: ClientRow): Client {
  return {
    id: row.id,
    name: row.name,
    company: row.company,
    email: row.email,
    phone: row.phone,
    address: row.address ?? "",
    website: row.website ?? "",
    notes: row.notes,
    logoUrl: row.logo_url,
    createdAt: row.created_at,
  };
}

export async function listClients(): Promise<Client[]> {
  try {
    const { data, error } = await getSupabase().from("freelance_hq_clients").select("*").order("name", { ascending: true });
    if (error) throw error;
    return ((data ?? []) as ClientRow[]).map(toClient);
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

export async function getClient(id: string): Promise<Client | null> {
  try {
    const { data, error } = await getSupabase().from("freelance_hq_clients").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? toClient(data as ClientRow) : null;
  } catch (error) {
    if (isMissingTableError(error)) return null;
    throw error;
  }
}

export async function createClient(input: {
  name: string;
  company: string;
  email: string;
  phone: string;
  address?: string;
  website?: string;
  notes: string;
}): Promise<Client> {
  const { data, error } = await getSupabase()
    .from("freelance_hq_clients")
    .insert({
      name: input.name,
      company: input.company,
      email: input.email,
      phone: input.phone,
      address: input.address ?? "",
      website: input.website ?? "",
      notes: input.notes,
      logo_url: "",
    })
    .select()
    .single();
  if (error) throw error;
  return toClient(data as ClientRow);
}

export async function updateClient(
  id: string,
  patch: Partial<Pick<Client, "name" | "company" | "email" | "phone" | "address" | "website" | "notes" | "logoUrl">>,
): Promise<void> {
  const update: Record<string, unknown> = { updated_at: nowIso() };
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.company !== undefined) update.company = patch.company;
  if (patch.email !== undefined) update.email = patch.email;
  if (patch.phone !== undefined) update.phone = patch.phone;
  if (patch.address !== undefined) update.address = patch.address;
  if (patch.website !== undefined) update.website = patch.website;
  if (patch.notes !== undefined) update.notes = patch.notes;
  if (patch.logoUrl !== undefined) update.logo_url = patch.logoUrl;

  const { error } = await getSupabase().from("freelance_hq_clients").update(update).eq("id", id);
  if (error) throw error;
}

export async function getProjectsForClient(clientId: string): Promise<Project[]> {
  const { data, error } = await getSupabase()
    .from("freelance_hq_projects")
    .select("*")
    .eq("client_id", clientId)
    .order("updated_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as ProjectRow[];
  const stagesByProject = await fetchStagesForProjects(rows.map((r) => r.id));
  return rows.map((row) => toProject(row, stagesByProject.get(row.id) ?? []));
}

export async function archiveProject(id: string, archived: boolean): Promise<void> {
  const { error } = await getSupabase()
    .from("freelance_hq_projects")
    .update({ archived, updated_at: nowIso() })
    .eq("id", id);
  if (error) throw error;
}

/**
 * Permanently deletes a project (tasks, stages, payment plans, and team
 * assignments always go with it via foreign-key cascade). Payment history is
 * the one exception: when keepFinancialData is true, its payments are
 * detached (project_id set to null) first so they survive the cascade and
 * keep counting toward Finance totals.
 */
export async function deleteProject(id: string, keepFinancialData: boolean): Promise<void> {
  if (keepFinancialData) {
    const { error: detachError } = await getSupabase()
      .from("freelance_hq_payments")
      .update({ project_id: null })
      .eq("project_id", id);
    if (detachError) throw detachError;
  }

  const { error } = await getSupabase().from("freelance_hq_projects").delete().eq("id", id);
  if (error) throw error;
}

export async function addStage(projectId: string, name: string): Promise<Stage | null> {
  const { count, error: countError } = await getSupabase()
    .from("freelance_hq_stages")
    .select("*", { count: "exact", head: true })
    .eq("project_id", projectId);
  if (countError) throw countError;

  const { data, error } = await getSupabase()
    .from("freelance_hq_stages")
    .insert({ project_id: projectId, name, order_index: count ?? 0 })
    .select()
    .single();
  if (error) throw error;

  await touchProject(projectId);
  return toStage(data as StageRow);
}

export async function getTasksByProject(projectId: string): Promise<Task[]> {
  const [{ data, error }, nameById] = await Promise.all([
    getSupabase().from("freelance_hq_tasks").select("*").eq("project_id", projectId).order("order_index"),
    taskNameLookup(),
  ]);
  if (error) throw error;
  return ((data ?? []) as TaskRow[]).map((row) => toTask(row, nameById));
}

export async function getOpenTasks(): Promise<Task[]> {
  const [{ data, error }, nameById] = await Promise.all([
    getSupabase().from("freelance_hq_tasks").select("*").neq("status", "done"),
    taskNameLookup(),
  ]);
  if (error) throw error;

  const tasks = ((data ?? []) as TaskRow[]).map((row) => toTask(row, nameById));
  return tasks.sort((a, b) => {
    const aDate = a.dueDate ?? a.scheduledFor;
    const bDate = b.dueDate ?? b.scheduledFor;
    if (aDate && bDate && aDate !== bDate) return aDate < bDate ? -1 : 1;
    if (aDate && !bDate) return -1;
    if (!aDate && bDate) return 1;

    const rank = (s: TaskStatus) => (s === "in_progress" ? 0 : 1);
    if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
    const pr = { high: 0, medium: 1, low: 2 } as const;
    if (pr[a.priority] !== pr[b.priority]) return pr[a.priority] - pr[b.priority];
    return a.updatedAt < b.updatedAt ? 1 : -1;
  });
}

export async function getCompletedTasks(): Promise<Task[]> {
  const [{ data, error }, nameById] = await Promise.all([
    getSupabase().from("freelance_hq_tasks").select("*").eq("status", "done"),
    taskNameLookup(),
  ]);
  if (error) throw error;

  return ((data ?? []) as TaskRow[])
    .map((row) => toTask(row, nameById))
    .sort((a, b) => ((a.completedAt ?? "") < (b.completedAt ?? "") ? 1 : -1));
}

/**
 * Every task assigned to `userId`, regardless of status — the "My Tasks" page
 * buckets these itself (overdue / due today / upcoming / waiting review /
 * completed recently). Being the assignee is the access boundary here: if a
 * task is assigned to you, you see it, even for a project you're not formally
 * assigned to (an admin can hand anyone a task from the full team list).
 */
export async function getMyTasks(userId: string): Promise<Task[]> {
  const [{ data, error }, nameById] = await Promise.all([
    getSupabase().from("freelance_hq_tasks").select("*").eq("assigned_to", userId),
    taskNameLookup(),
  ]);
  if (error) throw error;
  return ((data ?? []) as TaskRow[]).map((row) => toTask(row, nameById));
}

export async function createTask(input: {
  projectId: string;
  stageId: string | null;
  title: string;
  notes?: string;
  priority?: TaskPriority;
  scheduledFor?: string | null;
  checklist?: ChecklistItem[];
  files?: TaskFile[];
  markDoneOn?: string | null;
  assignedTo?: string | null;
  seoModule?: SeoModule | null;
  keywordId?: string | null;
  pageId?: string | null;
  contentItemId?: string | null;
  backlinkEntryId?: string | null;
  outreachProspectId?: string | null;
}): Promise<Task> {
  const { count, error: countError } = await getSupabase()
    .from("freelance_hq_tasks")
    .select("*", { count: "exact", head: true })
    .eq("project_id", input.projectId);
  if (countError) throw countError;

  const checklist = input.checklist ?? [];
  const isBackdated = Boolean(input.markDoneOn) && isChecklistComplete(checklist);

  const { data, error } = await getSupabase()
    .from("freelance_hq_tasks")
    .insert({
      project_id: input.projectId,
      stage_id: input.stageId,
      title: input.title,
      notes: input.notes ?? "",
      priority: input.priority ?? "medium",
      scheduled_for: isBackdated ? null : (input.scheduledFor ?? null),
      checklist,
      files: input.files ?? [],
      status: isBackdated ? "done" : "todo",
      completed_at: isBackdated ? toCompletedTimestamp(input.markDoneOn ?? null) : null,
      order_index: count ?? 0,
      assigned_to: input.assignedTo ?? null,
      seo_module: input.seoModule ?? null,
      keyword_id: input.keywordId ?? null,
      page_id: input.pageId ?? null,
      content_item_id: input.contentItemId ?? null,
      backlink_entry_id: input.backlinkEntryId ?? null,
      outreach_prospect_id: input.outreachProspectId ?? null,
    })
    .select()
    .single();
  if (error) throw error;

  await touchProject(input.projectId);
  return toTask(data as TaskRow, await taskNameLookup());
}

export async function updateTaskStatus(taskId: string, status: TaskStatus): Promise<void> {
  let resolvedStatus = status;

  if (status === "done") {
    const { data: existing, error: fetchError } = await getSupabase()
      .from("freelance_hq_tasks")
      .select("checklist")
      .eq("id", taskId)
      .maybeSingle();
    if (fetchError) throw fetchError;
    const checklist = (existing as { checklist: ChecklistItem[] } | null)?.checklist ?? [];
    if (!isChecklistComplete(checklist)) resolvedStatus = "in_progress";
  }

  const update: Record<string, unknown> = {
    status: resolvedStatus,
    updated_at: nowIso(),
    completed_at: resolvedStatus === "done" ? nowIso() : null,
  };
  if (resolvedStatus === "done") update.scheduled_for = null;

  const { data, error } = await getSupabase()
    .from("freelance_hq_tasks")
    .update(update)
    .eq("id", taskId)
    .select("project_id")
    .maybeSingle();
  if (error) throw error;

  if (data) await touchProject((data as { project_id: string }).project_id);
}

export async function updateTaskDetails(
  taskId: string,
  patch: {
    title: string;
    notes: string;
    priority: TaskPriority;
    stageId: string | null;
    dueDate: string | null;
    status: TaskStatus;
    scheduledFor: string | null;
    checklist: ChecklistItem[];
    completedDate: string | null;
    assignedTo: string | null;
    why: string;
    expectedOutcome: string;
    seoModule?: SeoModule | null;
    keywordId?: string | null;
    pageId?: string | null;
    contentItemId?: string | null;
    backlinkEntryId?: string | null;
    outreachProspectId?: string | null;
  },
): Promise<void> {
  const status = patch.status === "done" && !isChecklistComplete(patch.checklist) ? "in_progress" : patch.status;

  const update: Record<string, unknown> = {
    title: patch.title,
    notes: patch.notes,
    priority: patch.priority,
    stage_id: patch.stageId,
    due_date: patch.dueDate,
    status,
    scheduled_for: status === "done" ? null : patch.scheduledFor,
    checklist: patch.checklist,
    completed_at: status === "done" ? toCompletedTimestamp(patch.completedDate) : null,
    updated_at: nowIso(),
    assigned_to: patch.assignedTo,
    why: patch.why,
    expected_outcome: patch.expectedOutcome,
  };
  // Optional — only touched when the caller supplies them (e.g. the SEO
  // task detail view), so editing a non-SEO task never clobbers these.
  if (patch.seoModule !== undefined) update.seo_module = patch.seoModule;
  if (patch.keywordId !== undefined) update.keyword_id = patch.keywordId;
  if (patch.pageId !== undefined) update.page_id = patch.pageId;
  if (patch.contentItemId !== undefined) update.content_item_id = patch.contentItemId;
  if (patch.backlinkEntryId !== undefined) update.backlink_entry_id = patch.backlinkEntryId;
  if (patch.outreachProspectId !== undefined) update.outreach_prospect_id = patch.outreachProspectId;

  const { data, error } = await getSupabase()
    .from("freelance_hq_tasks")
    .update(update)
    .eq("id", taskId)
    .select("project_id")
    .maybeSingle();
  if (error) throw error;

  if (data) await touchProject((data as { project_id: string }).project_id);
}

export async function toggleToday(taskId: string, today: string): Promise<void> {
  const { data, error } = await getSupabase()
    .from("freelance_hq_tasks")
    .select("scheduled_for")
    .eq("id", taskId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return;

  const current = (data as { scheduled_for: string | null }).scheduled_for;
  const next = current === today ? null : today;
  const { error: updateError } = await getSupabase()
    .from("freelance_hq_tasks")
    .update({ scheduled_for: next, updated_at: nowIso() })
    .eq("id", taskId);
  if (updateError) throw updateError;
}

export async function toggleChecklistItem(taskId: string, itemId: string): Promise<void> {
  const { data, error } = await getSupabase()
    .from("freelance_hq_tasks")
    .select("checklist, project_id, status")
    .eq("id", taskId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return;

  const row = data as { checklist: ChecklistItem[]; project_id: string; status: TaskStatus };
  const nextChecklist = row.checklist.map((item) =>
    item.id === itemId ? { ...item, done: !item.done } : item,
  );

  const update: Record<string, unknown> = { checklist: nextChecklist, updated_at: nowIso() };
  if (row.status === "done" && !isChecklistComplete(nextChecklist)) {
    update.status = "in_progress";
    update.completed_at = null;
  }

  const { error: updateError } = await getSupabase().from("freelance_hq_tasks").update(update).eq("id", taskId);
  if (updateError) throw updateError;

  await touchProject(row.project_id);
}

export async function addTaskFile(taskId: string, file: TaskFile): Promise<void> {
  const { data, error } = await getSupabase()
    .from("freelance_hq_tasks")
    .select("files, project_id")
    .eq("id", taskId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return;

  const row = data as { files: (TaskFile | string)[]; project_id: string };
  const { error: updateError } = await getSupabase()
    .from("freelance_hq_tasks")
    .update({ files: [...normalizeFiles(row.files), file], updated_at: nowIso() })
    .eq("id", taskId);
  if (updateError) throw updateError;

  await touchProject(row.project_id);
}

export async function removeTaskFile(taskId: string, url: string): Promise<void> {
  const { data, error } = await getSupabase()
    .from("freelance_hq_tasks")
    .select("files, project_id")
    .eq("id", taskId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return;

  const row = data as { files: (TaskFile | string)[]; project_id: string };
  const { error: updateError } = await getSupabase()
    .from("freelance_hq_tasks")
    .update({ files: normalizeFiles(row.files).filter((f) => f.url !== url), updated_at: nowIso() })
    .eq("id", taskId);
  if (updateError) throw updateError;

  await touchProject(row.project_id);
}

export async function deleteTask(taskId: string): Promise<void> {
  const { error } = await getSupabase().from("freelance_hq_tasks").delete().eq("id", taskId);
  if (error) throw error;
}

export async function getProjectProgress(projectId: string): Promise<{ done: number; total: number }> {
  const tasks = await getTasksByProject(projectId);
  const done = tasks.filter((t) => t.status === "done").length;
  return { done, total: tasks.length };
}

export async function getProjectProgressMap(): Promise<
  Record<string, { done: number; total: number; openCount: number }>
> {
  const { data, error } = await getSupabase().from("freelance_hq_tasks").select("project_id, status");
  if (error) throw error;

  const map: Record<string, { done: number; total: number; openCount: number }> = {};
  for (const row of (data ?? []) as { project_id: string; status: TaskStatus }[]) {
    const entry = map[row.project_id] ?? { done: 0, total: 0, openCount: 0 };
    entry.total += 1;
    if (row.status === "done") entry.done += 1;
    else entry.openCount += 1;
    map[row.project_id] = entry;
  }
  return map;
}

export async function getBusinessProfile(): Promise<BusinessProfile> {
  const { data, error } = await getSupabase()
    .from("freelance_hq_business_profile")
    .select("company_name, logo_url")
    .eq("id", true)
    .maybeSingle();
  if (error) throw error;

  return {
    companyName: (data as { company_name: string } | null)?.company_name ?? "",
    logoUrl: (data as { logo_url: string } | null)?.logo_url ?? "",
  };
}

export async function updateBusinessProfile(patch: BusinessProfile): Promise<void> {
  const { error } = await getSupabase()
    .from("freelance_hq_business_profile")
    .upsert({ id: true, company_name: patch.companyName, logo_url: patch.logoUrl, updated_at: nowIso() });
  if (error) throw error;
}

/**
 * A project's share_token being non-null is what "sharing enabled" means — there is
 * no separate boolean flag. Disabling sharing clears the token; the previous link
 * stops resolving to anything.
 */
export async function getOrCreateShareToken(projectId: string): Promise<string> {
  const { data, error } = await getSupabase()
    .from("freelance_hq_projects")
    .select("share_token")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw error;

  const existing = (data as { share_token: string | null } | null)?.share_token;
  if (existing) return existing;

  const token = randomUUID().replace(/-/g, "");
  const { error: updateError } = await getSupabase()
    .from("freelance_hq_projects")
    .update({ share_token: token, updated_at: nowIso() })
    .eq("id", projectId);
  if (updateError) throw updateError;

  return token;
}

export async function regenerateShareToken(projectId: string): Promise<string> {
  const token = randomUUID().replace(/-/g, "");
  const { error } = await getSupabase()
    .from("freelance_hq_projects")
    .update({ share_token: token, updated_at: nowIso() })
    .eq("id", projectId);
  if (error) throw error;
  return token;
}

export async function disableSharing(projectId: string): Promise<void> {
  const { error } = await getSupabase()
    .from("freelance_hq_projects")
    .update({ share_token: null, updated_at: nowIso() })
    .eq("id", projectId);
  if (error) throw error;
}

interface ProfileRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  can_access_renewals: boolean | null;
  can_access_backlink_credentials: boolean | null;
  can_access_finance: boolean | null;
  created_at: string;
}

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    canAccessRenewals: row.can_access_renewals ?? false,
    canAccessBacklinkCredentials: row.can_access_backlink_credentials ?? false,
    canAccessFinance: row.can_access_finance ?? false,
    createdAt: row.created_at,
  };
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await getSupabase().from("freelance_hq_profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data ? toProfile(data as ProfileRow) : null;
}

export async function getProfileCount(): Promise<number> {
  const { count, error } = await getSupabase().from("freelance_hq_profiles").select("*", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

export async function createProfile(input: { id: string; email: string; name: string; role: Role }): Promise<Profile> {
  const { data, error } = await getSupabase()
    .from("freelance_hq_profiles")
    .insert({ id: input.id, email: input.email, name: input.name, role: input.role })
    .select()
    .single();
  if (error) throw error;
  return toProfile(data as ProfileRow);
}

export async function listTeamMembers(): Promise<Profile[]> {
  try {
    const { data, error } = await getSupabase().from("freelance_hq_profiles").select("*").order("created_at");
    if (error) throw error;
    return ((data ?? []) as ProfileRow[]).map(toProfile);
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

export async function updateMemberRole(userId: string, role: Role): Promise<void> {
  const { error } = await getSupabase().from("freelance_hq_profiles").update({ role, updated_at: nowIso() }).eq("id", userId);
  if (error) throw error;
}

/**
 * Fails open when the can_access_renewals column doesn't exist yet
 * (migration 027 not run): granting Renewals access to a member is optional
 * on top of the core profile record, so a missing column shouldn't break
 * the Admin page.
 */
export async function setMemberRenewalsAccess(userId: string, allowed: boolean): Promise<void> {
  try {
    const { error } = await getSupabase()
      .from("freelance_hq_profiles")
      .update({ can_access_renewals: allowed, updated_at: nowIso() })
      .eq("id", userId);
    if (error) throw error;
  } catch (error) {
    if (!isMissingTableError(error)) throw error;
  }
}

/** Fails open when the can_access_backlink_credentials column doesn't exist yet (migration 042 not run). */
export async function setMemberBacklinkCredentialAccess(userId: string, allowed: boolean): Promise<void> {
  try {
    const { error } = await getSupabase()
      .from("freelance_hq_profiles")
      .update({ can_access_backlink_credentials: allowed, updated_at: nowIso() })
      .eq("id", userId);
    if (error) throw error;
  } catch (error) {
    if (!isMissingTableError(error)) throw error;
  }
}

/** Fails open when the can_access_finance column doesn't exist yet (migration 050 not run). */
export async function setMemberFinanceAccess(userId: string, allowed: boolean): Promise<void> {
  try {
    const { error } = await getSupabase()
      .from("freelance_hq_profiles")
      .update({ can_access_finance: allowed, updated_at: nowIso() })
      .eq("id", userId);
    if (error) throw error;
  } catch (error) {
    if (!isMissingTableError(error)) throw error;
  }
}

export async function inviteTeamMember(input: {
  email: string;
  password: string;
  name: string;
  role: Role;
}): Promise<Profile> {
  const { data, error } = await getSupabase().auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
  });
  if (error) throw error;

  return createProfile({ id: data.user.id, email: input.email, name: input.name, role: input.role });
}

export async function removeMember(userId: string): Promise<void> {
  const { error } = await getSupabase().auth.admin.deleteUser(userId);
  if (error) throw error;
}

export async function getAssignedProjectIds(userId: string): Promise<string[]> {
  try {
    const { data, error } = await getSupabase().from("freelance_hq_project_assignments").select("project_id").eq("user_id", userId);
    if (error) throw error;
    return ((data ?? []) as { project_id: string }[]).map((row) => row.project_id);
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

export async function isProjectAssignedToUser(projectId: string, userId: string): Promise<boolean> {
  try {
    const { data, error } = await getSupabase()
      .from("freelance_hq_project_assignments")
      .select("id")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return Boolean(data);
  } catch (error) {
    if (isMissingTableError(error)) return false;
    throw error;
  }
}

/**
 * Diffs against the current assignment set instead of delete-all-then-reinsert,
 * so an assignment's created_at survives being re-saved unchanged — that
 * timestamp powers the "new project assigned to you" notification badge, and
 * a full delete/reinsert would reset it (and re-trigger the badge) for every
 * member on every save, even ones whose access didn't actually change.
 */
export async function setMemberAssignments(userId: string, projectIds: string[]): Promise<void> {
  const current = new Set(await getAssignedProjectIds(userId));
  const next = new Set(projectIds);

  const toRemove = [...current].filter((id) => !next.has(id));
  const toAdd = [...next].filter((id) => !current.has(id));

  if (toRemove.length > 0) {
    const { error } = await getSupabase()
      .from("freelance_hq_project_assignments")
      .delete()
      .eq("user_id", userId)
      .in("project_id", toRemove);
    if (error) throw error;
  }
  if (toAdd.length > 0) {
    const { error } = await getSupabase()
      .from("freelance_hq_project_assignments")
      .insert(toAdd.map((projectId) => ({ project_id: projectId, user_id: userId })));
    if (error) throw error;
  }
}

export async function getProjectsForProfile(profile: Profile): Promise<Project[]> {
  const all = await getProjects();
  if (profile.role === "admin") return all;

  const assigned = new Set(await getAssignedProjectIds(profile.id));
  return all.filter((p) => assigned.has(p.id));
}

interface PaymentPlanRow {
  id: string;
  project_id: string;
  plan_type: PaymentPlanType;
  amount: number;
  currency: string;
  notes: string;
}

function toPaymentPlan(row: PaymentPlanRow): PaymentPlan {
  return {
    id: row.id,
    projectId: row.project_id,
    planType: row.plan_type,
    amount: Number(row.amount),
    currency: row.currency,
    notes: row.notes,
  };
}

/** A project can have one plan per currency (e.g. a PKR plan and a USD plan on the same project). */
export async function listPaymentPlansForProject(projectId: string): Promise<PaymentPlan[]> {
  try {
    const { data, error } = await getSupabase().from("freelance_hq_payment_plans").select("*").eq("project_id", projectId);
    if (error) throw error;
    return ((data ?? []) as PaymentPlanRow[]).map(toPaymentPlan);
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

export async function listPaymentPlans(): Promise<PaymentPlan[]> {
  try {
    const { data, error } = await getSupabase().from("freelance_hq_payment_plans").select("*");
    if (error) throw error;
    return ((data ?? []) as PaymentPlanRow[]).map(toPaymentPlan);
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

export async function setPaymentPlan(
  projectId: string,
  input: { planType: PaymentPlanType; amount: number; currency: string; notes: string },
): Promise<PaymentPlan> {
  const { data, error } = await getSupabase()
    .from("freelance_hq_payment_plans")
    .upsert(
      {
        project_id: projectId,
        plan_type: input.planType,
        amount: input.amount,
        currency: input.currency,
        notes: input.notes,
        updated_at: nowIso(),
      },
      { onConflict: "project_id,currency" },
    )
    .select()
    .single();
  if (error) throw error;
  return toPaymentPlan(data as PaymentPlanRow);
}

export async function deletePaymentPlan(projectId: string, currency: string): Promise<void> {
  const { error } = await getSupabase()
    .from("freelance_hq_payment_plans")
    .delete()
    .eq("project_id", projectId)
    .eq("currency", currency);
  if (error) throw error;
}

interface PaymentRow {
  id: string;
  project_id: string | null;
  invoice_id?: string | null;
  amount: number;
  currency: string;
  kind: PaymentKind;
  period: string | null;
  note: string;
  paid_on: string;
  created_at: string;
}

function toPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    projectId: row.project_id,
    invoiceId: row.invoice_id ?? null,
    amount: Number(row.amount),
    currency: row.currency,
    kind: row.kind,
    period: row.period,
    note: row.note,
    paidOn: row.paid_on,
    createdAt: row.created_at,
  };
}

export async function listPaymentsForProject(projectId: string): Promise<Payment[]> {
  try {
    const { data, error } = await getSupabase()
      .from("freelance_hq_payments")
      .select("*")
      .eq("project_id", projectId)
      .order("paid_on", { ascending: false });
    if (error) throw error;
    return ((data ?? []) as PaymentRow[]).map(toPayment);
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

export async function listAllPayments(): Promise<Payment[]> {
  try {
    const { data, error } = await getSupabase().from("freelance_hq_payments").select("*").order("paid_on", { ascending: false });
    if (error) throw error;
    return ((data ?? []) as PaymentRow[]).map(toPayment);
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

export async function addPayment(input: {
  projectId: string | null;
  invoiceId?: string | null;
  amount: number;
  currency: string;
  kind: PaymentKind;
  period: string | null;
  note: string;
  paidOn: string;
}): Promise<Payment> {
  const { data, error } = await getSupabase()
    .from("freelance_hq_payments")
    .insert({
      project_id: input.projectId,
      invoice_id: input.invoiceId ?? null,
      amount: input.amount,
      currency: input.currency,
      kind: input.kind,
      period: input.period,
      note: input.note,
      paid_on: input.paidOn,
    })
    .select()
    .single();
  if (error) throw error;
  return toPayment(data as PaymentRow);
}

export async function deletePayment(id: string): Promise<void> {
  const { error } = await getSupabase().from("freelance_hq_payments").delete().eq("id", id);
  if (error) throw error;
}

export async function listPaymentsForInvoice(invoiceId: string): Promise<Payment[]> {
  try {
    const { data, error } = await getSupabase()
      .from("freelance_hq_payments")
      .select("*")
      .eq("invoice_id", invoiceId)
      .order("paid_on", { ascending: false });
    if (error) throw error;
    return ((data ?? []) as PaymentRow[]).map(toPayment);
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

export async function listPaymentsForClient(clientId: string): Promise<Payment[]> {
  try {
    const invoices = await listInvoicesForClient(clientId);
    if (invoices.length === 0) return [];
    const { data, error } = await getSupabase()
      .from("freelance_hq_payments")
      .select("*")
      .in(
        "invoice_id",
        invoices.map((i) => i.id),
      )
      .order("paid_on", { ascending: false });
    if (error) throw error;
    return ((data ?? []) as PaymentRow[]).map(toPayment);
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

/* ------------------------------------------------------------------ */
/* Phase 4: Services, Client Services, Invoices                        */
/* ------------------------------------------------------------------ */

interface ServiceRow {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  billing_frequency: BillingFrequency;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

function toService(row: ServiceRow): Service {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: Number(row.price),
    currency: row.currency,
    billingFrequency: row.billing_frequency,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listServices(): Promise<Service[]> {
  try {
    const { data, error } = await getSupabase().from("freelance_hq_services").select("*").order("name", { ascending: true });
    if (error) throw error;
    return ((data ?? []) as ServiceRow[]).map(toService);
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

export async function getService(id: string): Promise<Service | null> {
  const { data, error } = await getSupabase().from("freelance_hq_services").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toService(data as ServiceRow) : null;
}

export async function createService(input: {
  name: string;
  description: string;
  price: number;
  currency: string;
  billingFrequency: BillingFrequency;
}): Promise<Service> {
  const { data, error } = await getSupabase()
    .from("freelance_hq_services")
    .insert({
      name: input.name,
      description: input.description,
      price: input.price,
      currency: input.currency,
      billing_frequency: input.billingFrequency,
    })
    .select()
    .single();
  if (error) throw error;
  return toService(data as ServiceRow);
}

export async function updateService(
  id: string,
  patch: Partial<Pick<Service, "name" | "description" | "price" | "currency" | "billingFrequency" | "isActive">>,
): Promise<void> {
  const update: Record<string, unknown> = { updated_at: nowIso() };
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.price !== undefined) update.price = patch.price;
  if (patch.currency !== undefined) update.currency = patch.currency;
  if (patch.billingFrequency !== undefined) update.billing_frequency = patch.billingFrequency;
  if (patch.isActive !== undefined) update.is_active = patch.isActive;

  const { error } = await getSupabase().from("freelance_hq_services").update(update).eq("id", id);
  if (error) throw error;
}

export async function deleteService(id: string): Promise<void> {
  const { error } = await getSupabase().from("freelance_hq_services").delete().eq("id", id);
  if (error) throw error;
}

interface ClientServiceRow {
  id: string;
  client_id: string;
  service_id: string;
  project_id: string | null;
  price_override: number | null;
  currency: string;
  billing_frequency: BillingFrequency;
  status: ClientServiceStatus;
  next_invoice_date: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
  freelance_hq_services?: { name: string } | null;
  freelance_hq_projects?: { name: string } | null;
}

function toClientService(row: ClientServiceRow): ClientService {
  return {
    id: row.id,
    clientId: row.client_id,
    serviceId: row.service_id,
    serviceName: row.freelance_hq_services?.name ?? "",
    projectId: row.project_id,
    projectName: row.freelance_hq_projects?.name ?? null,
    priceOverride: row.price_override === null || row.price_override === undefined ? null : Number(row.price_override),
    currency: row.currency,
    billingFrequency: row.billing_frequency,
    status: row.status,
    nextInvoiceDate: row.next_invoice_date,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const CLIENT_SERVICE_SELECT = "*, freelance_hq_services (name), freelance_hq_projects (name)";

export async function listClientServices(clientId: string): Promise<ClientService[]> {
  try {
    const { data, error } = await getSupabase()
      .from("freelance_hq_client_services")
      .select(CLIENT_SERVICE_SELECT)
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return ((data ?? []) as unknown as ClientServiceRow[]).map(toClientService);
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

export async function getClientService(id: string): Promise<ClientService | null> {
  const { data, error } = await getSupabase()
    .from("freelance_hq_client_services")
    .select(CLIENT_SERVICE_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? toClientService(data as unknown as ClientServiceRow) : null;
}

/** Every client_service that's due (or overdue) for its next recurring draft, across all clients. */
export async function listDueClientServices(asOf: string): Promise<ClientService[]> {
  try {
    const { data, error } = await getSupabase()
      .from("freelance_hq_client_services")
      .select(CLIENT_SERVICE_SELECT)
      .eq("status", "active")
      .not("next_invoice_date", "is", null)
      .lte("next_invoice_date", asOf);
    if (error) throw error;
    return ((data ?? []) as unknown as ClientServiceRow[]).map(toClientService);
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

export async function createClientService(input: {
  clientId: string;
  serviceId: string;
  projectId: string | null;
  priceOverride: number | null;
  currency: string;
  billingFrequency: BillingFrequency;
  nextInvoiceDate: string | null;
  notes: string;
}): Promise<ClientService> {
  const { data, error } = await getSupabase()
    .from("freelance_hq_client_services")
    .insert({
      client_id: input.clientId,
      service_id: input.serviceId,
      project_id: input.projectId,
      price_override: input.priceOverride,
      currency: input.currency,
      billing_frequency: input.billingFrequency,
      next_invoice_date: input.nextInvoiceDate,
      notes: input.notes,
    })
    .select(CLIENT_SERVICE_SELECT)
    .single();
  if (error) throw error;
  return toClientService(data as unknown as ClientServiceRow);
}

export async function updateClientService(
  id: string,
  patch: Partial<{
    projectId: string | null;
    priceOverride: number | null;
    currency: string;
    billingFrequency: BillingFrequency;
    status: ClientServiceStatus;
    nextInvoiceDate: string | null;
    notes: string;
  }>,
): Promise<void> {
  const update: Record<string, unknown> = { updated_at: nowIso() };
  if (patch.projectId !== undefined) update.project_id = patch.projectId;
  if (patch.priceOverride !== undefined) update.price_override = patch.priceOverride;
  if (patch.currency !== undefined) update.currency = patch.currency;
  if (patch.billingFrequency !== undefined) update.billing_frequency = patch.billingFrequency;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.nextInvoiceDate !== undefined) update.next_invoice_date = patch.nextInvoiceDate;
  if (patch.notes !== undefined) update.notes = patch.notes;

  const { error } = await getSupabase().from("freelance_hq_client_services").update(update).eq("id", id);
  if (error) throw error;
}

export async function deleteClientService(id: string): Promise<void> {
  const { error } = await getSupabase().from("freelance_hq_client_services").delete().eq("id", id);
  if (error) throw error;
}

function nextPeriodDate(from: string, frequency: BillingFrequency): string {
  const [y, m, d] = from.split("-").map(Number);
  const date = new Date(y ?? 0, (m ?? 1) - 1, d ?? 1);
  if (frequency === "monthly") date.setMonth(date.getMonth() + 1);
  else if (frequency === "quarterly") date.setMonth(date.getMonth() + 3);
  else if (frequency === "yearly") date.setFullYear(date.getFullYear() + 1);
  else return from;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Atomically claims the next invoice number for the given year via an
 * optimistic-lock update, retrying if two admins race. The counter table
 * (not a hardcoded format string) is what makes the numbering scheme
 * changeable later without touching already-issued invoice numbers.
 */
export async function nextInvoiceNumber(year: number): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: existing } = await getSupabase()
      .from("freelance_hq_invoice_counters")
      .select("last_number")
      .eq("year", year)
      .maybeSingle();

    const prev = existing?.last_number ?? 0;
    const next = prev + 1;

    if (!existing) {
      const { error: insertError } = await getSupabase()
        .from("freelance_hq_invoice_counters")
        .insert({ year, last_number: next });
      if (!insertError) return formatInvoiceNumber(year, next);
      continue;
    }

    const { data: updated, error: updateError } = await getSupabase()
      .from("freelance_hq_invoice_counters")
      .update({ last_number: next })
      .eq("year", year)
      .eq("last_number", prev)
      .select()
      .maybeSingle();
    if (updateError) throw updateError;
    if (updated) return formatInvoiceNumber(year, next);
  }
  throw new Error("Could not allocate an invoice number — please try again.");
}

function formatInvoiceNumber(year: number, n: number): string {
  return `INV-${year}-${String(n).padStart(3, "0")}`;
}

interface InvoiceRow {
  id: string;
  invoice_number: string;
  client_id: string;
  project_id: string | null;
  client_service_id: string | null;
  seo_report_id?: string | null;
  currency: string;
  issue_date: string;
  due_date: string;
  status: InvoiceStatus;
  notes: string;
  created_at: string;
  updated_at: string;
  freelance_hq_clients?: { name: string; company: string } | null;
  freelance_hq_projects?: { name: string } | null;
}

function toInvoice(row: InvoiceRow): Invoice {
  const client = row.freelance_hq_clients;
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    clientId: row.client_id,
    clientName: (client?.name || client?.company) ?? "",
    projectId: row.project_id,
    projectName: row.freelance_hq_projects?.name ?? null,
    clientServiceId: row.client_service_id,
    seoReportId: row.seo_report_id ?? null,
    currency: row.currency,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const INVOICE_SELECT = "*, freelance_hq_clients (name, company), freelance_hq_projects (name)";

/** Marks `sent` invoices past due_date as `overdue` for display, without a stored-status write. */
function withOverdueStatus(invoice: Invoice, today: string): Invoice {
  if (invoice.status === "sent" && invoice.dueDate < today) return { ...invoice, status: "overdue" };
  return invoice;
}

export async function listInvoices(): Promise<Invoice[]> {
  try {
    const { data, error } = await getSupabase()
      .from("freelance_hq_invoices")
      .select(INVOICE_SELECT)
      .order("issue_date", { ascending: false });
    if (error) throw error;
    const today = todayDateKey();
    return ((data ?? []) as unknown as InvoiceRow[]).map(toInvoice).map((inv) => withOverdueStatus(inv, today));
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

export async function listInvoicesForClient(clientId: string): Promise<Invoice[]> {
  try {
    const { data, error } = await getSupabase()
      .from("freelance_hq_invoices")
      .select(INVOICE_SELECT)
      .eq("client_id", clientId)
      .order("issue_date", { ascending: false });
    if (error) throw error;
    const today = todayDateKey();
    return ((data ?? []) as unknown as InvoiceRow[]).map(toInvoice).map((inv) => withOverdueStatus(inv, today));
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

export async function getInvoice(id: string): Promise<Invoice | null> {
  const { data, error } = await getSupabase().from("freelance_hq_invoices").select(INVOICE_SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return withOverdueStatus(toInvoice(data as unknown as InvoiceRow), todayDateKey());
}

interface InvoiceItemRow {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  order: number;
}

function toInvoiceItem(row: InvoiceItemRow): InvoiceItem {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    description: row.description,
    quantity: Number(row.quantity),
    unitPrice: Number(row.unit_price),
    order: row.order,
  };
}

export async function listInvoiceItems(invoiceId: string): Promise<InvoiceItem[]> {
  try {
    const { data, error } = await getSupabase()
      .from("freelance_hq_invoice_items")
      .select("*")
      .eq("invoice_id", invoiceId)
      .order("order", { ascending: true });
    if (error) throw error;
    return ((data ?? []) as InvoiceItemRow[]).map(toInvoiceItem);
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

export async function listInvoiceItemsForInvoices(invoiceIds: string[]): Promise<Record<string, InvoiceItem[]>> {
  if (invoiceIds.length === 0) return {};
  const { data, error } = await getSupabase().from("freelance_hq_invoice_items").select("*").in("invoice_id", invoiceIds).order("order", { ascending: true });
  if (error) throw error;
  const byInvoice: Record<string, InvoiceItem[]> = {};
  for (const row of (data ?? []) as InvoiceItemRow[]) {
    const item = toInvoiceItem(row);
    (byInvoice[item.invoiceId] ??= []).push(item);
  }
  return byInvoice;
}

export interface InvoiceItemInput {
  description: string;
  quantity: number;
  unitPrice: number;
}

export async function createInvoice(input: {
  clientId: string;
  projectId: string | null;
  clientServiceId: string | null;
  seoReportId?: string | null;
  currency: string;
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  notes: string;
  items: InvoiceItemInput[];
}): Promise<Invoice> {
  const year = Number(input.issueDate.slice(0, 4)) || new Date().getFullYear();
  const invoiceNumber = await nextInvoiceNumber(year);

  const { data, error } = await getSupabase()
    .from("freelance_hq_invoices")
    .insert({
      invoice_number: invoiceNumber,
      client_id: input.clientId,
      project_id: input.projectId,
      client_service_id: input.clientServiceId,
      seo_report_id: input.seoReportId ?? null,
      currency: input.currency,
      issue_date: input.issueDate,
      due_date: input.dueDate,
      status: input.status,
      notes: input.notes,
    })
    .select(INVOICE_SELECT)
    .single();
  if (error) throw error;
  const invoice = toInvoice(data as unknown as InvoiceRow);

  if (input.items.length > 0) {
    const { error: itemsError } = await getSupabase()
      .from("freelance_hq_invoice_items")
      .insert(
        input.items.map((item, i) => ({
          invoice_id: invoice.id,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          order: i,
        })),
      );
    if (itemsError) throw itemsError;
  }

  return invoice;
}

export async function updateInvoice(
  id: string,
  patch: Partial<{
    projectId: string | null;
    seoReportId: string | null;
    currency: string;
    issueDate: string;
    dueDate: string;
    status: InvoiceStatus;
    notes: string;
  }>,
): Promise<void> {
  const update: Record<string, unknown> = { updated_at: nowIso() };
  if (patch.projectId !== undefined) update.project_id = patch.projectId;
  if (patch.seoReportId !== undefined) update.seo_report_id = patch.seoReportId;
  if (patch.currency !== undefined) update.currency = patch.currency;
  if (patch.issueDate !== undefined) update.issue_date = patch.issueDate;
  if (patch.dueDate !== undefined) update.due_date = patch.dueDate;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.notes !== undefined) update.notes = patch.notes;

  const { error } = await getSupabase().from("freelance_hq_invoices").update(update).eq("id", id);
  if (error) throw error;
}

export async function deleteInvoice(id: string): Promise<void> {
  const { error } = await getSupabase().from("freelance_hq_invoices").delete().eq("id", id);
  if (error) throw error;
}

/** Replaces every line item on an invoice with the given set (add/edit/remove in one call, same pattern as a checklist rewrite). */
export async function replaceInvoiceItems(invoiceId: string, items: InvoiceItemInput[]): Promise<void> {
  const { error: deleteError } = await getSupabase().from("freelance_hq_invoice_items").delete().eq("invoice_id", invoiceId);
  if (deleteError) throw deleteError;
  if (items.length === 0) return;

  const { error: insertError } = await getSupabase()
    .from("freelance_hq_invoice_items")
    .insert(
      items.map((item, i) => ({
        invoice_id: invoiceId,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        order: i,
      })),
    );
  if (insertError) throw insertError;
}

export function invoiceTotal(items: InvoiceItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
}

/**
 * Recomputes a `sent`/`paid`/`partially_paid` invoice's status from the sum
 * of its payments vs. its line-item total. Never touches `draft` or
 * `cancelled` — those stay under manual control.
 */
export async function recomputeInvoiceStatus(invoiceId: string): Promise<void> {
  const invoice = await getInvoice(invoiceId);
  if (!invoice || invoice.status === "draft" || invoice.status === "cancelled") return;

  const [items, payments] = await Promise.all([listInvoiceItems(invoiceId), listPaymentsForInvoice(invoiceId)]);
  const total = invoiceTotal(items);
  const paid = payments.reduce((sum, p) => sum + p.amount, 0);

  let status: InvoiceStatus = invoice.status === "overdue" ? "sent" : invoice.status;
  if (paid <= 0) status = "sent";
  else if (paid >= total && total > 0) status = "paid";
  else status = "partially_paid";

  await updateInvoice(invoiceId, { status });
}

/**
 * On-demand recurring billing: creates a draft invoice for every active
 * client_service whose next_invoice_date is due, then advances that date by
 * one billing period. Never sends — drafts always need manual review/send.
 */
export async function generateDueInvoiceDrafts(): Promise<Invoice[]> {
  const today = todayDateKey();
  const due = await listDueClientServices(today);
  const created: Invoice[] = [];

  for (const cs of due) {
    const price = cs.priceOverride ?? (await getService(cs.serviceId))?.price ?? 0;
    const invoice = await createInvoice({
      clientId: cs.clientId,
      projectId: cs.projectId,
      clientServiceId: cs.id,
      currency: cs.currency,
      issueDate: today,
      dueDate: today,
      status: "draft",
      notes: "",
      items: [{ description: cs.serviceName || "Service", quantity: 1, unitPrice: price }],
    });
    created.push(invoice);

    if (cs.nextInvoiceDate) {
      await updateClientService(cs.id, { nextInvoiceDate: nextPeriodDate(cs.nextInvoiceDate, cs.billingFrequency) });
    }
  }

  return created;
}

/** Aggregated invoiced/paid/outstanding across every one of a client's invoices, per currency (first currency used if the client bills in more than one). */
export async function getClientBalance(clientId: string): Promise<ClientBalance> {
  const invoices = await listInvoicesForClient(clientId);
  const nonCancelled = invoices.filter((i) => i.status !== "cancelled");
  const currency = nonCancelled[0]?.currency ?? "PKR";
  const relevant = nonCancelled.filter((i) => i.currency === currency);

  const items = await listInvoiceItemsForInvoices(relevant.map((i) => i.id));
  const totalInvoiced = relevant.reduce((sum, inv) => sum + invoiceTotal(items[inv.id] ?? []), 0);

  const payments = await listPaymentsForClient(clientId);
  const totalPaid = payments.filter((p) => p.currency === currency).reduce((sum, p) => sum + p.amount, 0);

  return { totalInvoiced, totalPaid, outstanding: Math.max(0, totalInvoiced - totalPaid), currency };
}

interface KeywordRow {
  id: string;
  project_id: string;
  keyword: string;
  target_page: string;
  search_volume: number | null;
  difficulty: number | null;
  current_rank: number | null;
  target_rank: number | null;
  status: KeywordStatus;
  notes: string;
  is_tracked: boolean;
  search_intent: SearchIntent | null;
  priority: Priority;
  created_at: string;
  updated_at: string;
}

function toKeyword(row: KeywordRow, pageIds: string[]): Keyword {
  return {
    id: row.id,
    projectId: row.project_id,
    keyword: row.keyword,
    targetPage: row.target_page,
    searchVolume: row.search_volume,
    difficulty: row.difficulty,
    currentRank: row.current_rank,
    targetRank: row.target_rank,
    status: row.status,
    notes: row.notes,
    isTracked: row.is_tracked ?? false,
    pageIds,
    searchIntent: row.search_intent ?? null,
    priority: row.priority ?? "medium",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Fails open (empty map) when migration 019 hasn't run yet — keywords still load, just without page assignments. */
async function listKeywordPageIds(keywordIds: string[]): Promise<Record<string, string[]>> {
  if (keywordIds.length === 0) return {};
  try {
    const { data, error } = await getSupabase()
      .from("freelance_hq_keyword_page_links")
      .select("keyword_id, page_id")
      .in("keyword_id", keywordIds);
    if (error) throw error;
    const map: Record<string, string[]> = {};
    for (const row of (data ?? []) as { keyword_id: string; page_id: string }[]) {
      const list = map[row.keyword_id] ?? [];
      list.push(row.page_id);
      map[row.keyword_id] = list;
    }
    return map;
  } catch (error) {
    if (isMissingTableError(error)) return {};
    throw error;
  }
}

export async function listKeywords(projectId: string): Promise<Keyword[]> {
  try {
    const { data, error } = await getSupabase()
      .from("freelance_hq_keywords")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    const rows = (data ?? []) as KeywordRow[];
    const pageIdsByKeyword = await listKeywordPageIds(rows.map((r) => r.id));
    return rows.map((row) => toKeyword(row, pageIdsByKeyword[row.id] ?? []));
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

/** Case/whitespace-insensitive identity for a keyword string, used to silently dedupe instead of creating look-alike duplicate rows. */
function normalizeKeywordText(text: string): string {
  return text.trim().toLowerCase();
}

export async function createKeyword(input: {
  projectId: string;
  targetPage: string;
  keyword: string;
  searchVolume: number | null;
  difficulty: number | null;
  currentRank: number | null;
  targetRank: number | null;
  status: KeywordStatus;
  notes: string;
  searchIntent?: SearchIntent | null;
  priority?: Priority;
}): Promise<Keyword> {
  const { data: existingRows, error: existingError } = await getSupabase()
    .from("freelance_hq_keywords")
    .select("*")
    .eq("project_id", input.projectId)
    .ilike("keyword", input.keyword.trim());
  if (existingError) throw existingError;
  const existing = (existingRows as KeywordRow[] | null)?.find(
    (row) => normalizeKeywordText(row.keyword) === normalizeKeywordText(input.keyword),
  );
  if (existing) {
    const pageIds = (await listKeywordPageIds([existing.id]))[existing.id] ?? [];
    return toKeyword(existing, pageIds);
  }

  const { data, error } = await getSupabase()
    .from("freelance_hq_keywords")
    .insert({
      project_id: input.projectId,
      keyword: input.keyword,
      target_page: input.targetPage,
      search_volume: input.searchVolume,
      difficulty: input.difficulty,
      current_rank: input.currentRank,
      target_rank: input.targetRank,
      status: input.status,
      notes: input.notes,
      search_intent: input.searchIntent ?? null,
      priority: input.priority ?? "medium",
    })
    .select()
    .single();
  if (error) throw error;
  const keyword = toKeyword(data as KeywordRow, []);
  if (keyword.currentRank !== null) await logKeywordRank(keyword.id, keyword.currentRank);
  return keyword;
}

/**
 * Fails open when the history table doesn't exist yet (migration 014 not run):
 * rank history is a nice-to-have on top of a keyword's current rank, so a
 * missing optional table shouldn't break creating or updating a keyword.
 */
async function logKeywordRank(keywordId: string, rank: number | null): Promise<void> {
  try {
    const { error } = await getSupabase()
      .from("freelance_hq_keyword_rank_history")
      .insert({ keyword_id: keywordId, rank });
    if (error) throw error;
  } catch (error) {
    if (!isMissingTableError(error)) throw error;
  }
}

export async function updateKeyword(
  id: string,
  patch: Partial<
    Pick<
      Keyword,
      | "keyword"
      | "targetPage"
      | "searchVolume"
      | "difficulty"
      | "currentRank"
      | "targetRank"
      | "status"
      | "notes"
      | "searchIntent"
      | "priority"
    >
  >,
): Promise<void> {
  const update: Record<string, unknown> = { updated_at: nowIso() };
  if (patch.keyword !== undefined) update.keyword = patch.keyword;
  // targetPage is frozen (legacy free-text field, superseded by pageIds) —
  // intentionally not settable here even if a caller passes it.
  if (patch.searchVolume !== undefined) update.search_volume = patch.searchVolume;
  if (patch.difficulty !== undefined) update.difficulty = patch.difficulty;
  if (patch.currentRank !== undefined) update.current_rank = patch.currentRank;
  if (patch.targetRank !== undefined) update.target_rank = patch.targetRank;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.notes !== undefined) update.notes = patch.notes;
  if (patch.searchIntent !== undefined) update.search_intent = patch.searchIntent;
  if (patch.priority !== undefined) update.priority = patch.priority;

  if (patch.currentRank !== undefined) {
    const { data: existing, error: fetchError } = await getSupabase()
      .from("freelance_hq_keywords")
      .select("current_rank")
      .eq("id", id)
      .maybeSingle();
    if (fetchError) throw fetchError;
    const previousRank = (existing as { current_rank: number | null } | null)?.current_rank ?? null;
    if (previousRank !== patch.currentRank) await logKeywordRank(id, patch.currentRank);
  }

  const { error } = await getSupabase().from("freelance_hq_keywords").update(update).eq("id", id);
  if (error) throw error;
}

interface KeywordRankHistoryRow {
  id: string;
  keyword_id: string;
  rank: number | null;
  recorded_on: string;
}

/** Groups rank-history entries by keyword, newest first, for the keywords given. */
export async function listKeywordRankHistory(keywordIds: string[]): Promise<Record<string, KeywordRankHistoryEntry[]>> {
  if (keywordIds.length === 0) return {};
  try {
    const { data, error } = await getSupabase()
      .from("freelance_hq_keyword_rank_history")
      .select("*")
      .in("keyword_id", keywordIds)
      .order("recorded_on", { ascending: false });
    if (error) throw error;

    const map: Record<string, KeywordRankHistoryEntry[]> = {};
    for (const row of (data ?? []) as KeywordRankHistoryRow[]) {
      const entry: KeywordRankHistoryEntry = {
        id: row.id,
        keywordId: row.keyword_id,
        rank: row.rank,
        recordedOn: row.recorded_on,
      };
      const list = map[row.keyword_id] ?? [];
      list.push(entry);
      map[row.keyword_id] = list;
    }
    return map;
  } catch (error) {
    if (isMissingTableError(error)) return {};
    throw error;
  }
}

export async function deleteKeyword(id: string): Promise<void> {
  const { error } = await getSupabase().from("freelance_hq_keywords").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Fails open when the is_tracked column doesn't exist yet (migration 015 not
 * run yet): toggling the monthly-tracking list is optional on top of the
 * core keyword record, so a missing column shouldn't break the page.
 */
export async function setKeywordTracked(id: string, isTracked: boolean): Promise<void> {
  try {
    const { error } = await getSupabase()
      .from("freelance_hq_keywords")
      .update({ is_tracked: isTracked, updated_at: nowIso() })
      .eq("id", id);
    if (error) throw error;
  } catch (error) {
    if (!isMissingTableError(error)) throw error;
  }
}

/**
 * Fails open when the join table doesn't exist yet (migration 019 not run
 * yet): assigning a keyword to Pages is optional grouping on top of the
 * core keyword record, so a missing table shouldn't break the page.
 */
export async function addKeywordToPage(keywordId: string, pageId: string): Promise<void> {
  try {
    const { error } = await getSupabase()
      .from("freelance_hq_keyword_page_links")
      .upsert({ keyword_id: keywordId, page_id: pageId }, { onConflict: "keyword_id,page_id" });
    if (error) throw error;
  } catch (error) {
    if (!isMissingTableError(error)) throw error;
  }
}

export async function removeKeywordFromPage(keywordId: string, pageId: string): Promise<void> {
  try {
    const { error } = await getSupabase()
      .from("freelance_hq_keyword_page_links")
      .delete()
      .eq("keyword_id", keywordId)
      .eq("page_id", pageId);
    if (error) throw error;
  } catch (error) {
    if (!isMissingTableError(error)) throw error;
  }
}

interface KeywordGroupRow {
  id: string;
  project_id: string;
  name: string;
  color: KeywordGroupColor;
  order: number;
  created_at: string;
}

function toKeywordGroup(row: KeywordGroupRow): KeywordGroup {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    color: row.color,
    order: row.order,
    createdAt: row.created_at,
  };
}

export async function listKeywordGroups(projectId: string): Promise<KeywordGroup[]> {
  try {
    const { data, error } = await getSupabase()
      .from("freelance_hq_keyword_groups")
      .select("*")
      .eq("project_id", projectId)
      .order("order", { ascending: true });
    if (error) throw error;
    return ((data ?? []) as KeywordGroupRow[]).map(toKeywordGroup);
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

export async function createKeywordGroup(input: {
  projectId: string;
  name: string;
  color: KeywordGroupColor;
}): Promise<KeywordGroup> {
  const { data, error } = await getSupabase()
    .from("freelance_hq_keyword_groups")
    .insert({ project_id: input.projectId, name: input.name, color: input.color })
    .select()
    .single();
  if (error) throw error;
  return toKeywordGroup(data as KeywordGroupRow);
}

export async function updateKeywordGroup(id: string, patch: { name?: string; color?: KeywordGroupColor }): Promise<void> {
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.color !== undefined) update.color = patch.color;
  const { error } = await getSupabase().from("freelance_hq_keyword_groups").update(update).eq("id", id);
  if (error) throw error;
}

export async function deleteKeywordGroup(id: string): Promise<void> {
  const { error } = await getSupabase().from("freelance_hq_keyword_groups").delete().eq("id", id);
  if (error) throw error;
}

interface KeywordPageRow {
  id: string;
  group_id: string;
  name: string;
  url: string;
  order: number;
  page_type: PageType;
  meta_title: string;
  meta_description: string;
  h1: string;
  content_status: OnPageStatus;
  internal_linking_status: OnPageStatus;
  image_seo_status: OnPageStatus;
  schema_status: OnPageStatus;
  checklist: ChecklistItem[];
  created_at: string;
}

function toKeywordPage(row: KeywordPageRow, primaryKeywordId: string | null): KeywordPage {
  return {
    id: row.id,
    groupId: row.group_id,
    name: row.name,
    url: row.url,
    order: row.order,
    pageType: row.page_type ?? "other",
    metaTitle: row.meta_title ?? "",
    metaDescription: row.meta_description ?? "",
    h1: row.h1 ?? "",
    contentStatus: row.content_status ?? "not_started",
    internalLinkingStatus: row.internal_linking_status ?? "not_started",
    imageSeoStatus: row.image_seo_status ?? "not_started",
    schemaStatus: row.schema_status ?? "not_started",
    checklist: row.checklist ?? [],
    primaryKeywordId,
    createdAt: row.created_at,
  };
}

/** Fails open (empty map) when migration 036 hasn't run yet. */
async function listPrimaryKeywordIds(pageIds: string[]): Promise<Record<string, string>> {
  if (pageIds.length === 0) return {};
  try {
    const { data, error } = await getSupabase()
      .from("freelance_hq_keyword_page_links")
      .select("page_id, keyword_id")
      .in("page_id", pageIds)
      .eq("is_primary", true);
    if (error) throw error;
    const map: Record<string, string> = {};
    for (const row of (data ?? []) as { page_id: string; keyword_id: string }[]) {
      map[row.page_id] = row.keyword_id;
    }
    return map;
  } catch (error) {
    if (isMissingTableError(error)) return {};
    throw error;
  }
}

/** Groups pages by their parent group for the groups given. */
export async function listKeywordPages(groupIds: string[]): Promise<Record<string, KeywordPage[]>> {
  if (groupIds.length === 0) return {};
  try {
    const { data, error } = await getSupabase()
      .from("freelance_hq_keyword_pages")
      .select("*")
      .in("group_id", groupIds)
      .order("order", { ascending: true });
    if (error) throw error;

    const rows = (data ?? []) as KeywordPageRow[];
    const primaryByPage = await listPrimaryKeywordIds(rows.map((r) => r.id));

    const map: Record<string, KeywordPage[]> = {};
    for (const row of rows) {
      const page = toKeywordPage(row, primaryByPage[row.id] ?? null);
      const list = map[page.groupId] ?? [];
      list.push(page);
      map[page.groupId] = list;
    }
    return map;
  } catch (error) {
    if (isMissingTableError(error)) return {};
    throw error;
  }
}

export async function createKeywordPage(input: { groupId: string; name: string; url: string }): Promise<KeywordPage> {
  const { data, error } = await getSupabase()
    .from("freelance_hq_keyword_pages")
    .insert({ group_id: input.groupId, name: input.name, url: input.url })
    .select()
    .single();
  if (error) throw error;
  return toKeywordPage(data as KeywordPageRow, null);
}

export async function updateKeywordPage(
  id: string,
  patch: {
    name?: string;
    url?: string;
    pageType?: PageType;
    metaTitle?: string;
    metaDescription?: string;
    h1?: string;
    contentStatus?: OnPageStatus;
    internalLinkingStatus?: OnPageStatus;
    imageSeoStatus?: OnPageStatus;
    schemaStatus?: OnPageStatus;
    checklist?: ChecklistItem[];
  },
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.url !== undefined) update.url = patch.url;
  if (patch.pageType !== undefined) update.page_type = patch.pageType;
  if (patch.metaTitle !== undefined) update.meta_title = patch.metaTitle;
  if (patch.metaDescription !== undefined) update.meta_description = patch.metaDescription;
  if (patch.h1 !== undefined) update.h1 = patch.h1;
  if (patch.contentStatus !== undefined) update.content_status = patch.contentStatus;
  if (patch.internalLinkingStatus !== undefined) update.internal_linking_status = patch.internalLinkingStatus;
  if (patch.imageSeoStatus !== undefined) update.image_seo_status = patch.imageSeoStatus;
  if (patch.schemaStatus !== undefined) update.schema_status = patch.schemaStatus;
  if (patch.checklist !== undefined) update.checklist = patch.checklist;
  const { error } = await getSupabase().from("freelance_hq_keyword_pages").update(update).eq("id", id);
  if (error) throw error;
}

/** Marks `keywordId` as the primary keyword for `pageId` (must already be linked to it), clearing any previous primary on that page. Pass `keywordId: null` to clear the page's primary without setting a new one. */
export async function setPrimaryKeywordForPage(pageId: string, keywordId: string | null): Promise<void> {
  const { error: clearError } = await getSupabase()
    .from("freelance_hq_keyword_page_links")
    .update({ is_primary: false })
    .eq("page_id", pageId);
  if (clearError) throw clearError;

  if (!keywordId) return;

  const { error } = await getSupabase()
    .from("freelance_hq_keyword_page_links")
    .update({ is_primary: true })
    .eq("page_id", pageId)
    .eq("keyword_id", keywordId);
  if (error) throw error;
}

export async function deleteKeywordPage(id: string): Promise<void> {
  const { error } = await getSupabase().from("freelance_hq_keyword_pages").delete().eq("id", id);
  if (error) throw error;
}

interface KeywordMonthlyPositionRow {
  id: string;
  keyword_id: string;
  month: string;
  rank: number | null;
}

/** Groups monthly positions by keyword for the keywords given, oldest month first. */
export async function listMonthlyPositions(
  keywordIds: string[],
): Promise<Record<string, KeywordMonthlyPosition[]>> {
  if (keywordIds.length === 0) return {};
  try {
    const { data, error } = await getSupabase()
      .from("freelance_hq_keyword_monthly_positions")
      .select("*")
      .in("keyword_id", keywordIds)
      .order("month", { ascending: true });
    if (error) throw error;

    const map: Record<string, KeywordMonthlyPosition[]> = {};
    for (const row of (data ?? []) as KeywordMonthlyPositionRow[]) {
      const entry: KeywordMonthlyPosition = {
        id: row.id,
        keywordId: row.keyword_id,
        month: row.month,
        rank: row.rank,
      };
      const list = map[row.keyword_id] ?? [];
      list.push(entry);
      map[row.keyword_id] = list;
    }
    return map;
  } catch (error) {
    if (isMissingTableError(error)) return {};
    throw error;
  }
}

/** Upserts a keyword's manually-entered rank for a given month ('YYYY-MM'). */
export async function setMonthlyPosition(keywordId: string, month: string, rank: number | null): Promise<void> {
  const { error } = await getSupabase()
    .from("freelance_hq_keyword_monthly_positions")
    .upsert({ keyword_id: keywordId, month, rank, updated_at: nowIso() }, { onConflict: "keyword_id,month" });
  if (error) throw error;
}

export interface KeywordImportRow {
  keyword: string;
  targetPage: string;
  searchVolume: number | null;
  difficulty: number | null;
  currentRank: number | null;
  targetRank: number | null;
  status: KeywordStatus;
  notes: string;
}

/** Bulk-inserts imported keywords in a single round trip; rows without a keyword are dropped. */
export async function createKeywordsBulk(projectId: string, rows: KeywordImportRow[]): Promise<number> {
  const withText = rows.filter((r) => r.keyword.trim());
  if (withText.length === 0) return 0;

  const { data: existingRows, error: existingError } = await getSupabase()
    .from("freelance_hq_keywords")
    .select("keyword")
    .eq("project_id", projectId);
  if (existingError) throw existingError;
  const existingTexts = new Set(
    ((existingRows ?? []) as { keyword: string }[]).map((row) => normalizeKeywordText(row.keyword)),
  );

  const seenInBatch = new Set<string>();
  const valid = withText.filter((r) => {
    const normalized = normalizeKeywordText(r.keyword);
    if (existingTexts.has(normalized) || seenInBatch.has(normalized)) return false;
    seenInBatch.add(normalized);
    return true;
  });
  if (valid.length === 0) return 0;

  const { data, error } = await getSupabase()
    .from("freelance_hq_keywords")
    .insert(
      valid.map((r) => ({
        project_id: projectId,
        keyword: r.keyword,
        target_page: r.targetPage,
        search_volume: r.searchVolume,
        difficulty: r.difficulty,
        current_rank: r.currentRank,
        target_rank: r.targetRank,
        status: r.status,
        notes: r.notes,
      })),
    )
    .select("id, current_rank");
  if (error) throw error;

  const inserted = (data ?? []) as { id: string; current_rank: number | null }[];
  const withRank = inserted.filter((row) => row.current_rank !== null);
  if (withRank.length > 0) {
    try {
      const { error: historyError } = await getSupabase()
        .from("freelance_hq_keyword_rank_history")
        .insert(withRank.map((row) => ({ keyword_id: row.id, rank: row.current_rank })));
      if (historyError) throw historyError;
    } catch (error) {
      if (!isMissingTableError(error)) throw error;
    }
  }

  return valid.length;
}

interface ProjectAttachmentRow {
  id: string;
  project_id: string;
  url: string;
  name: string;
  type: string;
  size: number;
  created_at: string;
}

function toProjectAttachment(row: ProjectAttachmentRow): ProjectAttachment {
  return {
    id: row.id,
    projectId: row.project_id,
    url: row.url,
    name: row.name,
    type: row.type,
    size: row.size,
    createdAt: row.created_at,
  };
}

export async function listProjectAttachments(projectId: string): Promise<ProjectAttachment[]> {
  try {
    const { data, error } = await getSupabase()
      .from("freelance_hq_project_attachments")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return ((data ?? []) as ProjectAttachmentRow[]).map(toProjectAttachment);
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

export async function addProjectAttachment(
  projectId: string,
  file: { url: string; name: string; type: string; size: number },
): Promise<void> {
  const { error } = await getSupabase()
    .from("freelance_hq_project_attachments")
    .insert({ project_id: projectId, url: file.url, name: file.name, type: file.type, size: file.size });
  if (error) throw error;
}

export async function removeProjectAttachment(id: string): Promise<void> {
  const { error } = await getSupabase().from("freelance_hq_project_attachments").delete().eq("id", id);
  if (error) throw error;
}

const DEFAULT_BACKLINK_CATEGORIES: { name: string; categoryType: BacklinkCategoryType }[] = [
  { name: "Social Media Profiles", categoryType: "social" },
  { name: "Local Listing Backlinks", categoryType: "local_citation" },
  { name: "Web 2.0 Backlinks", categoryType: "web2" },
  { name: "Guest Posting", categoryType: "guest_post" },
];

interface BacklinkCategoryRow {
  id: string;
  project_id: string;
  name: string;
  order: number;
  seo_module: SeoModule;
  category_type: BacklinkCategoryType;
  created_at: string;
}

function toBacklinkCategory(row: BacklinkCategoryRow): BacklinkCategory {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    order: row.order,
    seoModule: row.seo_module ?? "off_page",
    categoryType: row.category_type ?? "other",
    createdAt: row.created_at,
  };
}

/** Auto-seeds the four default categories the first time a project has none, so they're always there without a manual setup step. */
export async function listBacklinkCategories(projectId: string): Promise<BacklinkCategory[]> {
  try {
    const { data, error } = await getSupabase()
      .from("freelance_hq_backlink_categories")
      .select("*")
      .eq("project_id", projectId)
      .order("order", { ascending: true });
    if (error) throw error;

    let rows = (data ?? []) as BacklinkCategoryRow[];
    if (rows.length === 0) {
      const { data: seeded, error: seedError } = await getSupabase()
        .from("freelance_hq_backlink_categories")
        .insert(
          DEFAULT_BACKLINK_CATEGORIES.map(({ name, categoryType }, order) => ({
            project_id: projectId,
            name,
            order,
            category_type: categoryType,
          })),
        )
        .select();
      if (seedError) throw seedError;
      rows = (seeded ?? []) as BacklinkCategoryRow[];
    }
    return rows.map(toBacklinkCategory);
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

export async function createBacklinkCategory(
  projectId: string,
  name: string,
  categoryType: BacklinkCategoryType = "other",
): Promise<BacklinkCategory> {
  const { data, error } = await getSupabase()
    .from("freelance_hq_backlink_categories")
    .insert({ project_id: projectId, name, category_type: categoryType })
    .select()
    .single();
  if (error) throw error;
  return toBacklinkCategory(data as BacklinkCategoryRow);
}

export async function updateBacklinkCategory(
  id: string,
  patch: { name?: string; categoryType?: BacklinkCategoryType },
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.categoryType !== undefined) update.category_type = patch.categoryType;
  const { error } = await getSupabase().from("freelance_hq_backlink_categories").update(update).eq("id", id);
  if (error) throw error;
}

export async function deleteBacklinkCategory(id: string): Promise<void> {
  const { error } = await getSupabase().from("freelance_hq_backlink_categories").delete().eq("id", id);
  if (error) throw error;
}

interface BacklinkEntryRow {
  id: string;
  category_id: string;
  project_id: string;
  name: string;
  url: string;
  username: string;
  email: string;
  password_encrypted: string | null;
  login_method: LoginMethod;
  posts_per_month: number | null;
  status: BacklinkStatus;
  keyword_id: string | null;
  indexed: boolean | null;
  listed_on: string | null;
  files: TaskFile[] | null;
  notes: string;
  links: BacklinkLink[] | null;
  created_at: string;
  updated_at: string;
}

function toBacklinkEntry(row: BacklinkEntryRow): BacklinkEntry {
  return {
    id: row.id,
    categoryId: row.category_id,
    projectId: row.project_id,
    name: row.name,
    url: row.url,
    username: row.username,
    email: row.email,
    hasPassword: Boolean(row.password_encrypted),
    loginMethod: row.login_method ?? "email",
    postsPerMonth: row.posts_per_month,
    status: row.status ?? "not_started",
    keywordId: row.keyword_id,
    indexed: row.indexed,
    listedOn: row.listed_on,
    files: normalizeFiles(row.files),
    notes: row.notes,
    links: row.links ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Groups entries by category for the categories given. Never returns the encrypted password itself, only `hasPassword`. */
export async function listBacklinkEntries(categoryIds: string[]): Promise<Record<string, BacklinkEntry[]>> {
  if (categoryIds.length === 0) return {};
  try {
    const { data, error } = await getSupabase()
      .from("freelance_hq_backlink_entries")
      .select("*")
      .in("category_id", categoryIds)
      .order("created_at", { ascending: true });
    if (error) throw error;

    const map: Record<string, BacklinkEntry[]> = {};
    for (const row of (data ?? []) as BacklinkEntryRow[]) {
      const entry = toBacklinkEntry(row);
      const list = map[entry.categoryId] ?? [];
      list.push(entry);
      map[entry.categoryId] = list;
    }
    return map;
  } catch (error) {
    if (isMissingTableError(error)) return {};
    throw error;
  }
}

export interface BacklinkEntryInput {
  categoryId: string;
  projectId: string;
  name: string;
  url: string;
  username: string;
  email: string;
  password: string | null;
  loginMethod: LoginMethod;
  postsPerMonth: number | null;
  status: BacklinkStatus;
  keywordId: string | null;
  indexed: boolean | null;
  listedOn: string | null;
  files: TaskFile[];
  notes: string;
  links: BacklinkLink[];
}

export async function createBacklinkEntry(input: BacklinkEntryInput): Promise<BacklinkEntry> {
  const { data, error } = await getSupabase()
    .from("freelance_hq_backlink_entries")
    .insert({
      category_id: input.categoryId,
      project_id: input.projectId,
      name: input.name,
      url: input.url,
      username: input.username,
      email: input.email,
      password_encrypted: input.password ? encryptSecret(input.password) : null,
      login_method: input.loginMethod,
      posts_per_month: input.postsPerMonth,
      status: input.status,
      keyword_id: input.keywordId,
      indexed: input.indexed,
      listed_on: input.listedOn,
      files: input.files,
      notes: input.notes,
      links: input.links,
    })
    .select()
    .single();
  if (error) throw error;
  return toBacklinkEntry(data as BacklinkEntryRow);
}

export async function updateBacklinkEntry(
  id: string,
  patch: Partial<Omit<BacklinkEntryInput, "categoryId" | "projectId">> & { clearPassword?: boolean },
): Promise<void> {
  const update: Record<string, unknown> = { updated_at: nowIso() };
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.url !== undefined) update.url = patch.url;
  if (patch.username !== undefined) update.username = patch.username;
  if (patch.email !== undefined) update.email = patch.email;
  if (patch.loginMethod !== undefined) update.login_method = patch.loginMethod;
  if (patch.postsPerMonth !== undefined) update.posts_per_month = patch.postsPerMonth;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.keywordId !== undefined) update.keyword_id = patch.keywordId;
  if (patch.indexed !== undefined) update.indexed = patch.indexed;
  if (patch.listedOn !== undefined) update.listed_on = patch.listedOn;
  if (patch.files !== undefined) update.files = patch.files;
  if (patch.notes !== undefined) update.notes = patch.notes;
  if (patch.links !== undefined) update.links = patch.links;
  if (patch.clearPassword) update.password_encrypted = null;
  else if (patch.password) update.password_encrypted = encryptSecret(patch.password);

  const { error } = await getSupabase().from("freelance_hq_backlink_entries").update(update).eq("id", id);
  if (error) throw error;
}

export async function addBacklinkFile(entryId: string, file: TaskFile): Promise<void> {
  const { data, error } = await getSupabase()
    .from("freelance_hq_backlink_entries")
    .select("files")
    .eq("id", entryId)
    .maybeSingle();
  if (error) throw error;
  const files = normalizeFiles((data as { files: TaskFile[] | null } | null)?.files);
  const { error: updateError } = await getSupabase()
    .from("freelance_hq_backlink_entries")
    .update({ files: [...files, file] })
    .eq("id", entryId);
  if (updateError) throw updateError;
}

export async function deleteBacklinkEntry(id: string): Promise<void> {
  const { error } = await getSupabase().from("freelance_hq_backlink_entries").delete().eq("id", id);
  if (error) throw error;
}

export async function hasVaultPassword(userId: string): Promise<boolean> {
  try {
    const { data, error } = await getSupabase()
      .from("freelance_hq_profiles")
      .select("vault_password_hash")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    return Boolean((data as { vault_password_hash: string | null } | null)?.vault_password_hash);
  } catch (error) {
    if (isMissingTableError(error)) return false;
    throw error;
  }
}

/** Sets or changes a user's security (reveal) password. If one is already set, `currentPassword` must match it. */
export async function setVaultPassword(
  userId: string,
  newPassword: string,
  currentPassword: string | null,
): Promise<void> {
  const { data, error } = await getSupabase()
    .from("freelance_hq_profiles")
    .select("vault_password_hash")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;

  const existingHash = (data as { vault_password_hash: string | null } | null)?.vault_password_hash ?? null;
  if (existingHash) {
    if (!currentPassword || !verifyVaultPassword(currentPassword, existingHash)) {
      throw new Error("WRONG_VAULT_PASSWORD");
    }
  }

  const { error: updateError } = await getSupabase()
    .from("freelance_hq_profiles")
    .update({ vault_password_hash: hashVaultPassword(newPassword), updated_at: nowIso() })
    .eq("id", userId);
  if (updateError) throw updateError;
}

/** Verifies the user's security password and decrypts the entry's saved password. Throws typed errors the caller maps to a message. */
export async function revealBacklinkPassword(
  entryId: string,
  userId: string,
  vaultPassword: string,
): Promise<string> {
  const { data: profileRow, error: profileError } = await getSupabase()
    .from("freelance_hq_profiles")
    .select("vault_password_hash")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) throw profileError;

  const hash = (profileRow as { vault_password_hash: string | null } | null)?.vault_password_hash ?? null;
  if (!hash) throw new Error("NO_VAULT_PASSWORD");
  if (!verifyVaultPassword(vaultPassword, hash)) throw new Error("WRONG_VAULT_PASSWORD");

  const { data, error } = await getSupabase()
    .from("freelance_hq_backlink_entries")
    .select("password_encrypted")
    .eq("id", entryId)
    .maybeSingle();
  if (error) throw error;

  const encrypted = (data as { password_encrypted: string | null } | null)?.password_encrypted ?? null;
  if (!encrypted) throw new Error("NO_PASSWORD_SET");
  return decryptSecret(encrypted);
}

/** Guest Post / Outreach CRM: a pipeline of prospects, kept separate from the credential vault table (see migration 046). */
interface OutreachProspectRow {
  id: string;
  project_id: string;
  website: string;
  contact_person: string;
  contact_email: string;
  dr_da: number | null;
  price: number | null;
  contact_date: string | null;
  last_follow_up: string | null;
  next_follow_up: string | null;
  response: string;
  status: OutreachStatus;
  notes: string;
  created_at: string;
  updated_at: string;
}

function toOutreachProspect(row: OutreachProspectRow): OutreachProspect {
  return {
    id: row.id,
    projectId: row.project_id,
    website: row.website,
    contactPerson: row.contact_person,
    contactEmail: row.contact_email,
    drDa: row.dr_da,
    price: row.price,
    contactDate: row.contact_date,
    lastFollowUp: row.last_follow_up,
    nextFollowUp: row.next_follow_up,
    response: row.response,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listOutreachProspects(projectId: string): Promise<OutreachProspect[]> {
  try {
    const { data, error } = await getSupabase()
      .from("freelance_hq_outreach_prospects")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return ((data ?? []) as OutreachProspectRow[]).map(toOutreachProspect);
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

export async function createOutreachProspect(input: {
  projectId: string;
  website: string;
  contactPerson: string;
  contactEmail: string;
  drDa: number | null;
  price: number | null;
}): Promise<OutreachProspect> {
  const { data, error } = await getSupabase()
    .from("freelance_hq_outreach_prospects")
    .insert({
      project_id: input.projectId,
      website: input.website,
      contact_person: input.contactPerson,
      contact_email: input.contactEmail,
      dr_da: input.drDa,
      price: input.price,
    })
    .select()
    .single();
  if (error) throw error;
  return toOutreachProspect(data as OutreachProspectRow);
}

export async function updateOutreachProspect(
  id: string,
  patch: Partial<{
    website: string;
    contactPerson: string;
    contactEmail: string;
    drDa: number | null;
    price: number | null;
    contactDate: string | null;
    lastFollowUp: string | null;
    nextFollowUp: string | null;
    response: string;
    status: OutreachStatus;
    notes: string;
  }>,
): Promise<void> {
  const update: Record<string, unknown> = { updated_at: nowIso() };
  if (patch.website !== undefined) update.website = patch.website;
  if (patch.contactPerson !== undefined) update.contact_person = patch.contactPerson;
  if (patch.contactEmail !== undefined) update.contact_email = patch.contactEmail;
  if (patch.drDa !== undefined) update.dr_da = patch.drDa;
  if (patch.price !== undefined) update.price = patch.price;
  if (patch.contactDate !== undefined) update.contact_date = patch.contactDate;
  if (patch.lastFollowUp !== undefined) update.last_follow_up = patch.lastFollowUp;
  if (patch.nextFollowUp !== undefined) update.next_follow_up = patch.nextFollowUp;
  if (patch.response !== undefined) update.response = patch.response;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.notes !== undefined) update.notes = patch.notes;
  const { error } = await getSupabase().from("freelance_hq_outreach_prospects").update(update).eq("id", id);
  if (error) throw error;
}

export async function deleteOutreachProspect(id: string): Promise<void> {
  const { error } = await getSupabase().from("freelance_hq_outreach_prospects").delete().eq("id", id);
  if (error) throw error;
}

/** Competitor backlink intel — not your asset, no login concept. */
interface CompetitorBacklinkRow {
  id: string;
  project_id: string;
  competitor_url: string;
  source_backlink_url: string;
  opportunity_notes: string;
  target_page_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

function toCompetitorBacklink(row: CompetitorBacklinkRow): CompetitorBacklink {
  return {
    id: row.id,
    projectId: row.project_id,
    competitorUrl: row.competitor_url,
    sourceBacklinkUrl: row.source_backlink_url,
    opportunityNotes: row.opportunity_notes,
    targetPageId: row.target_page_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listCompetitorBacklinks(projectId: string): Promise<CompetitorBacklink[]> {
  try {
    const { data, error } = await getSupabase()
      .from("freelance_hq_competitor_backlinks")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return ((data ?? []) as CompetitorBacklinkRow[]).map(toCompetitorBacklink);
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

export async function createCompetitorBacklink(input: {
  projectId: string;
  competitorUrl: string;
  sourceBacklinkUrl: string;
  opportunityNotes: string;
  targetPageId: string | null;
}): Promise<CompetitorBacklink> {
  const { data, error } = await getSupabase()
    .from("freelance_hq_competitor_backlinks")
    .insert({
      project_id: input.projectId,
      competitor_url: input.competitorUrl,
      source_backlink_url: input.sourceBacklinkUrl,
      opportunity_notes: input.opportunityNotes,
      target_page_id: input.targetPageId,
    })
    .select()
    .single();
  if (error) throw error;
  return toCompetitorBacklink(data as CompetitorBacklinkRow);
}

export async function updateCompetitorBacklink(
  id: string,
  patch: Partial<{
    competitorUrl: string;
    sourceBacklinkUrl: string;
    opportunityNotes: string;
    targetPageId: string | null;
    status: string;
  }>,
): Promise<void> {
  const update: Record<string, unknown> = { updated_at: nowIso() };
  if (patch.competitorUrl !== undefined) update.competitor_url = patch.competitorUrl;
  if (patch.sourceBacklinkUrl !== undefined) update.source_backlink_url = patch.sourceBacklinkUrl;
  if (patch.opportunityNotes !== undefined) update.opportunity_notes = patch.opportunityNotes;
  if (patch.targetPageId !== undefined) update.target_page_id = patch.targetPageId;
  if (patch.status !== undefined) update.status = patch.status;
  const { error } = await getSupabase().from("freelance_hq_competitor_backlinks").update(update).eq("id", id);
  if (error) throw error;
}

export async function deleteCompetitorBacklink(id: string): Promise<void> {
  const { error } = await getSupabase().from("freelance_hq_competitor_backlinks").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Backlink templates: a reusable, named set of platforms. NEVER stores
 * credentials — only platform_name/category_type/default_url. Importing
 * creates fresh, credential-free entries a team member fills in themselves.
 */
interface BacklinkTemplateRow {
  id: string;
  name: string;
  created_by: string | null;
  created_at: string;
}

interface BacklinkTemplateItemRow {
  id: string;
  template_id: string;
  category_type: BacklinkCategoryType;
  platform_name: string;
  default_url: string;
  order: number;
}

function toBacklinkTemplateItem(row: BacklinkTemplateItemRow): BacklinkTemplateItem {
  return {
    id: row.id,
    templateId: row.template_id,
    categoryType: row.category_type,
    platformName: row.platform_name,
    defaultUrl: row.default_url,
    order: row.order,
  };
}

export async function listBacklinkTemplates(): Promise<BacklinkTemplate[]> {
  try {
    const [{ data, error }, nameById] = await Promise.all([
      getSupabase().from("freelance_hq_backlink_templates").select("*").order("created_at", { ascending: false }),
      taskNameLookup(),
    ]);
    if (error) throw error;
    return ((data ?? []) as BacklinkTemplateRow[]).map((row) => ({
      id: row.id,
      name: row.name,
      createdBy: row.created_by,
      createdByName: row.created_by ? (nameById.get(row.created_by) ?? "Unknown") : null,
      createdAt: row.created_at,
    }));
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

export async function listBacklinkTemplateItems(templateId: string): Promise<BacklinkTemplateItem[]> {
  try {
    const { data, error } = await getSupabase()
      .from("freelance_hq_backlink_template_items")
      .select("*")
      .eq("template_id", templateId)
      .order("order", { ascending: true });
    if (error) throw error;
    return ((data ?? []) as BacklinkTemplateItemRow[]).map(toBacklinkTemplateItem);
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

/** Saves a project's current categories/entries as a reusable template — platform name + category type + URL only, never credentials. */
export async function saveBacklinksAsTemplate(
  projectId: string,
  name: string,
  createdBy: string,
): Promise<BacklinkTemplate> {
  const categories = await listBacklinkCategories(projectId);
  const entriesByCategory = await listBacklinkEntries(categories.map((c) => c.id));

  const { data: templateRow, error: templateError } = await getSupabase()
    .from("freelance_hq_backlink_templates")
    .insert({ name, created_by: createdBy })
    .select()
    .single();
  if (templateError) throw templateError;
  const template = templateRow as BacklinkTemplateRow;

  const items = categories.flatMap((category) =>
    (entriesByCategory[category.id] ?? []).map((entry, i) => ({
      template_id: template.id,
      category_type: category.categoryType,
      platform_name: entry.name,
      default_url: entry.url,
      order: i,
    })),
  );
  if (items.length > 0) {
    const { error: itemsError } = await getSupabase().from("freelance_hq_backlink_template_items").insert(items);
    if (itemsError) throw itemsError;
  }

  return {
    id: template.id,
    name: template.name,
    createdBy: template.created_by,
    createdByName: null,
    createdAt: template.created_at,
  };
}

export async function deleteBacklinkTemplate(id: string): Promise<void> {
  const { error } = await getSupabase().from("freelance_hq_backlink_templates").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Imports selected template items into a project: creates (or reuses) a
 * category per category_type, then a fresh, credential-free entry per item,
 * with the client's business details pre-filled into notes — all editable
 * immediately after. Never copies a credential, because templates never
 * store one.
 */
export async function importBacklinkTemplateItems(
  projectId: string,
  itemIds: string[],
): Promise<number> {
  if (itemIds.length === 0) return 0;

  const { data: itemRows, error: itemsError } = await getSupabase()
    .from("freelance_hq_backlink_template_items")
    .select("*")
    .in("id", itemIds);
  if (itemsError) throw itemsError;
  const items = (itemRows ?? []) as BacklinkTemplateItemRow[];
  if (items.length === 0) return 0;

  const project = await getProject(projectId);
  const client = project?.clientDetails;
  const businessDetailsNote = client
    ? [
        client.company || client.name,
        client.phone,
        client.email,
        project?.websiteUrl,
        client.address,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  const existingCategories = await listBacklinkCategories(projectId);
  const categoryIdByType = new Map(existingCategories.map((c) => [c.categoryType, c.id]));

  let created = 0;
  for (const item of items) {
    let categoryId = categoryIdByType.get(item.category_type);
    if (!categoryId) {
      const label = item.category_type
        .split("_")
        .map((w) => w[0]?.toUpperCase() + w.slice(1))
        .join(" ");
      const newCategory = await createBacklinkCategory(projectId, label, item.category_type);
      categoryId = newCategory.id;
      categoryIdByType.set(item.category_type, categoryId);
    }

    const { error } = await getSupabase().from("freelance_hq_backlink_entries").insert({
      category_id: categoryId,
      project_id: projectId,
      name: item.platform_name,
      url: item.default_url,
      notes: businessDetailsNote,
    });
    if (error) throw error;
    created += 1;
  }

  return created;
}

/**
 * Technical SEO module: a simple issue tracker. `assignedToName` is
 * resolved the same way task assignee names are (Phase 1 pattern).
 */
interface TechnicalIssueRow {
  id: string;
  project_id: string;
  title: string;
  description: string;
  url_affected: string;
  priority: Priority;
  assigned_to: string | null;
  status: TechnicalIssueStatus;
  fix_task_id: string | null;
  created_at: string;
  updated_at: string;
}

function toTechnicalIssue(row: TechnicalIssueRow, nameById: Map<string, string>): TechnicalIssue {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    urlAffected: row.url_affected,
    priority: row.priority,
    assignedTo: row.assigned_to,
    assignedToName: row.assigned_to ? (nameById.get(row.assigned_to) ?? "Unknown") : null,
    status: row.status,
    fixTaskId: row.fix_task_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listTechnicalIssues(projectId: string): Promise<TechnicalIssue[]> {
  try {
    const [{ data, error }, nameById] = await Promise.all([
      getSupabase()
        .from("freelance_hq_technical_issues")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false }),
      taskNameLookup(),
    ]);
    if (error) throw error;
    return ((data ?? []) as TechnicalIssueRow[]).map((row) => toTechnicalIssue(row, nameById));
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

export async function createTechnicalIssue(input: {
  projectId: string;
  title: string;
  description: string;
  urlAffected: string;
  priority: Priority;
  assignedTo: string | null;
}): Promise<TechnicalIssue> {
  const { data, error } = await getSupabase()
    .from("freelance_hq_technical_issues")
    .insert({
      project_id: input.projectId,
      title: input.title,
      description: input.description,
      url_affected: input.urlAffected,
      priority: input.priority,
      assigned_to: input.assignedTo,
    })
    .select()
    .single();
  if (error) throw error;
  return toTechnicalIssue(data as TechnicalIssueRow, await taskNameLookup());
}

export async function updateTechnicalIssue(
  id: string,
  patch: Partial<{
    title: string;
    description: string;
    urlAffected: string;
    priority: Priority;
    assignedTo: string | null;
    status: TechnicalIssueStatus;
    fixTaskId: string | null;
  }>,
): Promise<void> {
  const update: Record<string, unknown> = { updated_at: nowIso() };
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.urlAffected !== undefined) update.url_affected = patch.urlAffected;
  if (patch.priority !== undefined) update.priority = patch.priority;
  if (patch.assignedTo !== undefined) update.assigned_to = patch.assignedTo;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.fixTaskId !== undefined) update.fix_task_id = patch.fixTaskId;
  const { error } = await getSupabase().from("freelance_hq_technical_issues").update(update).eq("id", id);
  if (error) throw error;
}

export async function deleteTechnicalIssue(id: string): Promise<void> {
  const { error } = await getSupabase().from("freelance_hq_technical_issues").delete().eq("id", id);
  if (error) throw error;
}

/** Content module: Idea -> Brief -> Writing -> Review -> Published. */
interface ContentItemRow {
  id: string;
  project_id: string;
  topic: string;
  target_keyword_id: string | null;
  assigned_to: string | null;
  status: ContentStatus;
  url: string;
  created_at: string;
  updated_at: string;
}

function toContentItem(row: ContentItemRow, nameById: Map<string, string>): ContentItem {
  return {
    id: row.id,
    projectId: row.project_id,
    topic: row.topic,
    targetKeywordId: row.target_keyword_id,
    assignedTo: row.assigned_to,
    assignedToName: row.assigned_to ? (nameById.get(row.assigned_to) ?? "Unknown") : null,
    status: row.status,
    url: row.url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listContentItems(projectId: string): Promise<ContentItem[]> {
  try {
    const [{ data, error }, nameById] = await Promise.all([
      getSupabase()
        .from("freelance_hq_content_items")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false }),
      taskNameLookup(),
    ]);
    if (error) throw error;
    return ((data ?? []) as ContentItemRow[]).map((row) => toContentItem(row, nameById));
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

export async function createContentItem(input: {
  projectId: string;
  topic: string;
  targetKeywordId: string | null;
  assignedTo: string | null;
}): Promise<ContentItem> {
  const { data, error } = await getSupabase()
    .from("freelance_hq_content_items")
    .insert({
      project_id: input.projectId,
      topic: input.topic,
      target_keyword_id: input.targetKeywordId,
      assigned_to: input.assignedTo,
    })
    .select()
    .single();
  if (error) throw error;
  return toContentItem(data as ContentItemRow, await taskNameLookup());
}

export async function updateContentItem(
  id: string,
  patch: Partial<{
    topic: string;
    targetKeywordId: string | null;
    assignedTo: string | null;
    status: ContentStatus;
    url: string;
  }>,
): Promise<void> {
  const update: Record<string, unknown> = { updated_at: nowIso() };
  if (patch.topic !== undefined) update.topic = patch.topic;
  if (patch.targetKeywordId !== undefined) update.target_keyword_id = patch.targetKeywordId;
  if (patch.assignedTo !== undefined) update.assigned_to = patch.assignedTo;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.url !== undefined) update.url = patch.url;
  const { error } = await getSupabase().from("freelance_hq_content_items").update(update).eq("id", id);
  if (error) throw error;
}

export async function deleteContentItem(id: string): Promise<void> {
  const { error } = await getSupabase().from("freelance_hq_content_items").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Reporting module: one record per project per month. Report content
 * (keyword movement, completed tasks, backlinks created) is computed at
 * generate time from existing tables — see buildSeoReportDraft — not
 * stored on this row; `summary` is the one thing a human writes.
 */
interface SeoReportRow {
  id: string;
  project_id: string;
  period: string;
  period_type?: ReportPeriodType | null;
  summary: string;
  completed_work?: string | null;
  metrics_notes?: string | null;
  notes?: string | null;
  generated_by: string | null;
  approved?: boolean | null;
  approved_at?: string | null;
  sent_to_client: boolean;
  sent_at: string | null;
  created_at: string;
}

function toSeoReport(row: SeoReportRow, nameById: Map<string, string>): SeoReport {
  return {
    id: row.id,
    projectId: row.project_id,
    period: row.period,
    periodType: row.period_type ?? "monthly",
    summary: row.summary,
    completedWork: row.completed_work ?? "",
    metricsNotes: row.metrics_notes ?? "",
    notes: row.notes ?? "",
    generatedBy: row.generated_by,
    generatedByName: row.generated_by ? (nameById.get(row.generated_by) ?? "Unknown") : null,
    approved: row.approved ?? false,
    approvedAt: row.approved_at ?? null,
    sentToClient: row.sent_to_client,
    sentAt: row.sent_at,
    createdAt: row.created_at,
  };
}

export async function getSeoReport(id: string): Promise<SeoReport | null> {
  const { data, error } = await getSupabase().from("freelance_hq_seo_reports").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toSeoReport(data as SeoReportRow, await taskNameLookup()) : null;
}

export async function listSeoReports(projectId: string): Promise<SeoReport[]> {
  try {
    const [{ data, error }, nameById] = await Promise.all([
      getSupabase()
        .from("freelance_hq_seo_reports")
        .select("*")
        .eq("project_id", projectId)
        .order("period", { ascending: false }),
      taskNameLookup(),
    ]);
    if (error) throw error;
    return ((data ?? []) as SeoReportRow[]).map((row) => toSeoReport(row, nameById));
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

/** Creates (or returns the existing) report row for a period, so "Generate" is safe to click more than once. */
export async function getOrCreateSeoReport(
  projectId: string,
  period: string,
  generatedBy: string,
  periodType: ReportPeriodType = "monthly",
): Promise<SeoReport> {
  const { data: existing, error: existingError } = await getSupabase()
    .from("freelance_hq_seo_reports")
    .select("*")
    .eq("project_id", projectId)
    .eq("period", period)
    .eq("period_type", periodType)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return toSeoReport(existing as SeoReportRow, await taskNameLookup());

  const { data, error } = await getSupabase()
    .from("freelance_hq_seo_reports")
    .insert({ project_id: projectId, period, period_type: periodType, generated_by: generatedBy })
    .select()
    .single();
  if (error) throw error;
  return toSeoReport(data as SeoReportRow, await taskNameLookup());
}

export async function updateSeoReport(
  id: string,
  patch: Partial<{
    summary: string;
    completedWork: string;
    metricsNotes: string;
    notes: string;
    approved: boolean;
    sentToClient: boolean;
  }>,
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (patch.summary !== undefined) update.summary = patch.summary;
  if (patch.completedWork !== undefined) update.completed_work = patch.completedWork;
  if (patch.metricsNotes !== undefined) update.metrics_notes = patch.metricsNotes;
  if (patch.notes !== undefined) update.notes = patch.notes;
  if (patch.approved !== undefined) {
    update.approved = patch.approved;
    update.approved_at = patch.approved ? nowIso() : null;
  }
  if (patch.sentToClient !== undefined) {
    update.sent_to_client = patch.sentToClient;
    update.sent_at = patch.sentToClient ? nowIso() : null;
  }
  const { error } = await getSupabase().from("freelance_hq_seo_reports").update(update).eq("id", id);
  if (error) throw error;
}

/** Every approved SEO report across a client's SEO projects — powers the "attach existing report" picker on invoice creation. Only approved reports are offered, matching the Generate -> Edit -> Approve -> Attach workflow. */
export async function listApprovedSeoReportsForClient(clientId: string): Promise<SeoReport[]> {
  const projects = await getProjectsForClient(clientId);
  const seoProjectIds = projects.filter((p) => p.type === "seo").map((p) => p.id);
  if (seoProjectIds.length === 0) return [];

  const reportLists = await Promise.all(seoProjectIds.map((id) => listSeoReports(id)));
  return reportLists
    .flat()
    .filter((r) => r.approved)
    .sort((a, b) => (a.period < b.period ? 1 : -1));
}

/**
 * Computed draft data for a report period — pulled from existing tables at
 * generate time, never persisted itself. Powers the pre-filled summary a
 * human then edits before marking the report sent. `metrics` extends the
 * original rankMovements/completedTaskTitles/backlinksCreated set with the
 * full SEO metric block (keywords tracked/improved/dropped, backlinks
 * created/live, content published, technical fixes).
 */
export interface SeoReportDraft {
  rankMovements: { keyword: string; from: number | null; to: number | null }[];
  completedTaskTitles: string[];
  backlinksCreated: number;
  metrics: SeoReportMetrics;
}

export async function buildSeoReportDraft(
  projectId: string,
  period: string,
  periodType: ReportPeriodType = "monthly",
): Promise<SeoReportDraft> {
  const [start, end] = periodBounds(period, periodType);

  const keywords = await listKeywords(projectId);
  const rankHistory = await listKeywordRankHistory(keywords.map((k) => k.id));
  const movements = keywords
    .map((keyword) => {
      const history = (rankHistory[keyword.id] ?? []).filter((h) => h.recordedOn >= start && h.recordedOn < end);
      if (history.length === 0) return null;
      const sorted = [...history].sort((a, b) => (a.recordedOn < b.recordedOn ? -1 : 1));
      const first = sorted[0] ?? sorted[sorted.length - 1];
      const last = sorted[sorted.length - 1] ?? first;
      if (!first || !last) return null;
      return { keyword: keyword.keyword, from: first.rank, to: last.rank };
    })
    .filter((m): m is { keyword: string; from: number | null; to: number | null } => m !== null);

  const keywordsImproved = movements.filter((m) => m.from !== null && m.to !== null && m.to < m.from).length;
  const keywordsDropped = movements.filter((m) => m.from !== null && m.to !== null && m.to > m.from).length;

  const { data: completedTasks, error: taskError } = await getSupabase()
    .from("freelance_hq_tasks")
    .select("title")
    .eq("project_id", projectId)
    .eq("status", "done")
    .gte("completed_at", start)
    .lt("completed_at", end);
  if (taskError) throw taskError;

  const categories = await listBacklinkCategories(projectId);
  let backlinksCreated = 0;
  let backlinksLive = 0;
  if (categories.length > 0) {
    const categoryIds = categories.map((c) => c.id);
    const { count: createdCount, error: backlinkError } = await getSupabase()
      .from("freelance_hq_backlink_entries")
      .select("*", { count: "exact", head: true })
      .in("category_id", categoryIds)
      .gte("created_at", start)
      .lt("created_at", end);
    if (backlinkError) throw backlinkError;
    backlinksCreated = createdCount ?? 0;

    const { count: liveCount, error: liveError } = await getSupabase()
      .from("freelance_hq_backlink_entries")
      .select("*", { count: "exact", head: true })
      .in("category_id", categoryIds)
      .eq("status", "live");
    if (liveError) throw liveError;
    backlinksLive = liveCount ?? 0;
  }

  const { count: contentPublished, error: contentError } = await getSupabase()
    .from("freelance_hq_content_items")
    .select("*", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("status", "published")
    .gte("updated_at", start)
    .lt("updated_at", end);
  if (contentError) throw contentError;

  const { count: technicalFixed, error: technicalError } = await getSupabase()
    .from("freelance_hq_technical_issues")
    .select("*", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("status", "fixed")
    .gte("updated_at", start)
    .lt("updated_at", end);
  if (technicalError) throw technicalError;

  return {
    rankMovements: movements,
    completedTaskTitles: ((completedTasks ?? []) as { title: string }[]).map((t) => t.title),
    backlinksCreated,
    metrics: {
      keywordsTracked: keywords.filter((k) => k.isTracked).length,
      keywordsImproved,
      keywordsDropped,
      backlinksCreated,
      backlinksLive,
      contentPublished: contentPublished ?? 0,
      technicalFixed: technicalFixed ?? 0,
    },
  };
}

/** ['YYYY-MM-01', 'YYYY-(MM+1)-01'] for a 'YYYY-MM' period key. */
function monthBounds(period: string): [string, string] {
  const [yearStr, monthStr] = period.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const start = `${period}-01`;
  const endDate = new Date(Date.UTC(year, month, 1));
  const end = endDate.toISOString().slice(0, 10);
  return [start, end];
}

/** [period, period+1day) for a 'YYYY-MM-DD' day key. */
function dayBounds(period: string): [string, string] {
  const [year, month, day] = period.split("-").map(Number);
  const start = period;
  const endDate = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + 1));
  return [start, endDate.toISOString().slice(0, 10)];
}

/** [Monday, next Monday) for a 'YYYY-Www' ISO week key. */
function weekBounds(period: string): [string, string] {
  const [yearStr, weekStr] = period.split("-W");
  const year = Number(yearStr);
  const week = Number(weekStr);
  // ISO week 1 is the week containing the year's first Thursday.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1);
  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  const nextMonday = new Date(monday);
  nextMonday.setUTCDate(monday.getUTCDate() + 7);
  return [monday.toISOString().slice(0, 10), nextMonday.toISOString().slice(0, 10)];
}

function periodBounds(period: string, periodType: ReportPeriodType): [string, string] {
  if (periodType === "daily") return dayBounds(period);
  if (periodType === "weekly") return weekBounds(period);
  return monthBounds(period);
}

interface ReportPreferencesRow {
  project_id: string;
  daily_enabled: boolean;
  weekly_enabled: boolean;
  monthly_enabled: boolean;
  updated_at: string;
}

function toReportPreferences(row: ReportPreferencesRow): ReportPreferences {
  return {
    projectId: row.project_id,
    dailyEnabled: row.daily_enabled,
    weeklyEnabled: row.weekly_enabled,
    monthlyEnabled: row.monthly_enabled,
    updatedAt: row.updated_at,
  };
}

const DEFAULT_REPORT_PREFERENCES = (projectId: string): ReportPreferences => ({
  projectId,
  dailyEnabled: false,
  weeklyEnabled: false,
  monthlyEnabled: false,
  updatedAt: nowIso(),
});

export async function getReportPreferences(projectId: string): Promise<ReportPreferences> {
  try {
    const { data, error } = await getSupabase()
      .from("freelance_hq_report_preferences")
      .select("*")
      .eq("project_id", projectId)
      .maybeSingle();
    if (error) throw error;
    return data ? toReportPreferences(data as ReportPreferencesRow) : DEFAULT_REPORT_PREFERENCES(projectId);
  } catch (error) {
    if (isMissingTableError(error)) return DEFAULT_REPORT_PREFERENCES(projectId);
    throw error;
  }
}

export async function setReportPreferences(
  projectId: string,
  patch: Partial<{ dailyEnabled: boolean; weeklyEnabled: boolean; monthlyEnabled: boolean }>,
): Promise<void> {
  const update: Record<string, unknown> = { project_id: projectId, updated_at: nowIso() };
  if (patch.dailyEnabled !== undefined) update.daily_enabled = patch.dailyEnabled;
  if (patch.weeklyEnabled !== undefined) update.weekly_enabled = patch.weeklyEnabled;
  if (patch.monthlyEnabled !== undefined) update.monthly_enabled = patch.monthlyEnabled;

  const { error } = await getSupabase()
    .from("freelance_hq_report_preferences")
    .upsert(update, { onConflict: "project_id" });
  if (error) throw error;
}

export async function getProjectByShareToken(token: string): Promise<Project | null> {
  const { data, error } = await getSupabase()
    .from("freelance_hq_projects")
    .select("*")
    .eq("share_token", token)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as ProjectRow;
  const { data: stageRows, error: stageError } = await getSupabase()
    .from("freelance_hq_stages")
    .select("*")
    .eq("project_id", row.id);
  if (stageError) throw stageError;

  return toProject(row, ((stageRows ?? []) as StageRow[]).map(toStage));
}

/**
 * Domain reselling. Standalone from the project/Client system — see migration 020.
 */

interface DomainClientRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  notes: string;
  created_at: string;
}

function toDomainClient(row: DomainClientRow): DomainClient {
  return { id: row.id, name: row.name, email: row.email, phone: row.phone, notes: row.notes, createdAt: row.created_at };
}

export async function listDomainClients(): Promise<DomainClient[]> {
  try {
    const { data, error } = await getSupabase().from("freelance_hq_domain_clients").select("*").order("name");
    if (error) throw error;
    return ((data ?? []) as DomainClientRow[]).map(toDomainClient);
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

export async function createDomainClient(input: { name: string; email: string; phone: string; notes: string }): Promise<DomainClient> {
  const { data, error } = await getSupabase()
    .from("freelance_hq_domain_clients")
    .insert({ name: input.name, email: input.email, phone: input.phone, notes: input.notes })
    .select()
    .single();
  if (error) throw error;
  return toDomainClient(data as DomainClientRow);
}

export async function updateDomainClient(
  id: string,
  patch: Partial<{ name: string; email: string; phone: string; notes: string }>,
): Promise<void> {
  const { error } = await getSupabase()
    .from("freelance_hq_domain_clients")
    .update({ ...patch, updated_at: nowIso() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteDomainClient(id: string): Promise<void> {
  const { error } = await getSupabase().from("freelance_hq_domain_clients").delete().eq("id", id);
  if (error) throw error;
}

interface DomainRow {
  id: string;
  name: string;
  domain_client_id: string | null;
  registrar: string;
  status: ResaleDomainStatus;
  purchase_price: number | null;
  selling_price: number | null;
  expiry_date: string | null;
  auto_renew: boolean;
  locked: boolean;
  nameservers: string[] | null;
  notes: string;
  dynadot_synced_at: string | null;
  created_at: string;
}

function toDomain(row: DomainRow): Domain {
  return {
    id: row.id,
    name: row.name,
    domainClientId: row.domain_client_id,
    registrar: row.registrar,
    status: row.status,
    purchasePrice: row.purchase_price,
    sellingPrice: row.selling_price,
    expiryDate: row.expiry_date,
    autoRenew: row.auto_renew,
    locked: row.locked,
    nameservers: row.nameservers ?? [],
    notes: row.notes,
    dynadotSyncedAt: row.dynadot_synced_at,
    createdAt: row.created_at,
  };
}

export async function listDomains(): Promise<Domain[]> {
  try {
    const { data, error } = await getSupabase().from("freelance_hq_domains").select("*").order("name");
    if (error) throw error;
    return ((data ?? []) as DomainRow[]).map(toDomain);
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

export async function getDomain(id: string): Promise<Domain | null> {
  const { data, error } = await getSupabase().from("freelance_hq_domains").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toDomain(data as DomainRow) : null;
}

export interface DomainInput {
  name: string;
  domainClientId: string | null;
  registrar: string;
  status: ResaleDomainStatus;
  purchasePrice: number | null;
  sellingPrice: number | null;
  expiryDate: string | null;
  autoRenew: boolean;
  notes: string;
}

export async function createDomain(input: DomainInput): Promise<Domain> {
  const { data, error } = await getSupabase()
    .from("freelance_hq_domains")
    .insert({
      name: input.name,
      domain_client_id: input.domainClientId,
      registrar: input.registrar,
      status: input.status,
      purchase_price: input.purchasePrice,
      selling_price: input.sellingPrice,
      expiry_date: input.expiryDate,
      auto_renew: input.autoRenew,
      notes: input.notes,
    })
    .select()
    .single();
  if (error) throw error;
  return toDomain(data as DomainRow);
}

export async function updateDomain(id: string, patch: Partial<DomainInput>): Promise<void> {
  const update: Record<string, unknown> = { updated_at: nowIso() };
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.domainClientId !== undefined) update.domain_client_id = patch.domainClientId;
  if (patch.registrar !== undefined) update.registrar = patch.registrar;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.purchasePrice !== undefined) update.purchase_price = patch.purchasePrice;
  if (patch.sellingPrice !== undefined) update.selling_price = patch.sellingPrice;
  if (patch.expiryDate !== undefined) update.expiry_date = patch.expiryDate;
  if (patch.autoRenew !== undefined) update.auto_renew = patch.autoRenew;
  if (patch.notes !== undefined) update.notes = patch.notes;

  const { error } = await getSupabase().from("freelance_hq_domains").update(update).eq("id", id);
  if (error) throw error;
}

export async function setDomainLocked(id: string, locked: boolean): Promise<void> {
  const { error } = await getSupabase()
    .from("freelance_hq_domains")
    .update({ locked, updated_at: nowIso() })
    .eq("id", id);
  if (error) throw error;
}

export async function setDomainNameservers(id: string, nameservers: string[]): Promise<void> {
  const { error } = await getSupabase()
    .from("freelance_hq_domains")
    .update({ nameservers, updated_at: nowIso() })
    .eq("id", id);
  if (error) throw error;
}

export async function applyDynadotSync(
  id: string,
  info: { expiryDate: string | null; locked: boolean; autoRenew: boolean; nameservers: string[] },
): Promise<void> {
  const { error } = await getSupabase()
    .from("freelance_hq_domains")
    .update({
      expiry_date: info.expiryDate,
      locked: info.locked,
      auto_renew: info.autoRenew,
      nameservers: info.nameservers,
      dynadot_synced_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteDomain(id: string): Promise<void> {
  const { error } = await getSupabase().from("freelance_hq_domains").delete().eq("id", id);
  if (error) throw error;
}

interface DomainDnsRecordRow {
  id: string;
  domain_id: string;
  record_type: DnsRecordType;
  host: string;
  value: string;
  priority: number | null;
  ttl: number | null;
}

function toDomainDnsRecord(row: DomainDnsRecordRow): DomainDnsRecord {
  return {
    id: row.id,
    domainId: row.domain_id,
    recordType: row.record_type,
    host: row.host,
    value: row.value,
    priority: row.priority,
    ttl: row.ttl,
  };
}

export async function listDomainDnsRecords(domainId: string): Promise<DomainDnsRecord[]> {
  try {
    const { data, error } = await getSupabase()
      .from("freelance_hq_domain_dns_records")
      .select("*")
      .eq("domain_id", domainId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return ((data ?? []) as DomainDnsRecordRow[]).map(toDomainDnsRecord);
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

export interface DomainDnsRecordInput {
  domainId: string;
  recordType: DnsRecordType;
  host: string;
  value: string;
  priority: number | null;
  ttl: number | null;
}

export async function createDomainDnsRecord(input: DomainDnsRecordInput): Promise<DomainDnsRecord> {
  const { data, error } = await getSupabase()
    .from("freelance_hq_domain_dns_records")
    .insert({
      domain_id: input.domainId,
      record_type: input.recordType,
      host: input.host,
      value: input.value,
      priority: input.priority,
      ttl: input.ttl,
    })
    .select()
    .single();
  if (error) throw error;
  return toDomainDnsRecord(data as DomainDnsRecordRow);
}

export async function updateDomainDnsRecord(id: string, patch: Partial<Omit<DomainDnsRecordInput, "domainId">>): Promise<void> {
  const update: Record<string, unknown> = { updated_at: nowIso() };
  if (patch.recordType !== undefined) update.record_type = patch.recordType;
  if (patch.host !== undefined) update.host = patch.host;
  if (patch.value !== undefined) update.value = patch.value;
  if (patch.priority !== undefined) update.priority = patch.priority;
  if (patch.ttl !== undefined) update.ttl = patch.ttl;

  const { error } = await getSupabase().from("freelance_hq_domain_dns_records").update(update).eq("id", id);
  if (error) throw error;
}

export async function deleteDomainDnsRecord(id: string): Promise<void> {
  const { error } = await getSupabase().from("freelance_hq_domain_dns_records").delete().eq("id", id);
  if (error) throw error;
}

export async function getDomainSettings(): Promise<DomainSettings> {
  try {
    const { data, error } = await getSupabase()
      .from("freelance_hq_domain_settings")
      .select("dynadot_api_key_encrypted")
      .eq("id", true)
      .maybeSingle();
    if (error) throw error;
    return { dynadotApiKeyEncrypted: (data as { dynadot_api_key_encrypted: string | null } | null)?.dynadot_api_key_encrypted ?? null };
  } catch (error) {
    if (isMissingTableError(error)) return { dynadotApiKeyEncrypted: null };
    throw error;
  }
}

export async function setDynadotApiKey(apiKey: string | null): Promise<void> {
  const { encryptApiKey } = await import("./dynadotCrypto");
  const { error } = await getSupabase()
    .from("freelance_hq_domain_settings")
    .upsert({
      id: true,
      dynadot_api_key_encrypted: apiKey ? encryptApiKey(apiKey) : null,
      updated_at: nowIso(),
    });
  if (error) throw error;
}

/**
 * Docs-style notes. Visibility/edit permission is decided in lib/actions.ts
 * (the caller passes in the current profile so this stays a pure data layer);
 * these list/get functions just apply the DB-level "which rows" filter.
 */
interface NoteRow {
  id: string;
  title: string;
  content: RichContent;
  author_id: string;
  assigned_to_user_id: string | null;
  editable_by_assignee: boolean;
  pinned: boolean;
  project_id: string | null;
  folder_id: string | null;
  created_at: string;
  updated_at: string;
}

async function toNote(row: NoteRow): Promise<Note> {
  const members = await listTeamMembers();
  const nameById = new Map(members.map((m) => [m.id, m.name || m.email]));
  return {
    id: row.id,
    title: row.title,
    content: row.content ?? {},
    authorId: row.author_id,
    authorName: nameById.get(row.author_id) ?? "Unknown",
    assignedToUserId: row.assigned_to_user_id,
    assignedToName: row.assigned_to_user_id ? nameById.get(row.assigned_to_user_id) ?? "Unknown" : null,
    editableByAssignee: row.editable_by_assignee,
    pinned: row.pinned,
    projectId: row.project_id,
    folderId: row.folder_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** All notes visible to an admin, or to `userId` if not an admin (authored by or assigned to them). */
export async function listNotes(userId: string, isAdmin: boolean): Promise<Note[]> {
  try {
    let query = getSupabase().from("freelance_hq_notes").select("*").order("pinned", { ascending: false }).order("updated_at", { ascending: false });
    if (!isAdmin) {
      query = query.or(`author_id.eq.${userId},assigned_to_user_id.eq.${userId}`);
    }
    const { data, error } = await query;
    if (error) throw error;
    return Promise.all(((data ?? []) as NoteRow[]).map(toNote));
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

export async function listPinnedNotes(userId: string, isAdmin: boolean): Promise<Note[]> {
  const notes = await listNotes(userId, isAdmin);
  return notes.filter((n) => n.pinned);
}

export async function getNote(id: string): Promise<Note | null> {
  try {
    const { data, error } = await getSupabase().from("freelance_hq_notes").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? toNote(data as NoteRow) : null;
  } catch (error) {
    if (isMissingTableError(error)) return null;
    throw error;
  }
}

export interface NoteInput {
  title: string;
  content: RichContent;
  authorId: string;
  assignedToUserId: string | null;
  editableByAssignee: boolean;
  pinned: boolean;
  projectId: string | null;
  folderId: string | null;
}

export async function createNote(input: NoteInput): Promise<Note> {
  const { data, error } = await getSupabase()
    .from("freelance_hq_notes")
    .insert({
      title: input.title,
      content: input.content,
      author_id: input.authorId,
      assigned_to_user_id: input.assignedToUserId,
      editable_by_assignee: input.editableByAssignee,
      pinned: input.pinned,
      project_id: input.projectId,
      folder_id: input.folderId,
    })
    .select()
    .single();
  if (error) throw error;
  return toNote(data as NoteRow);
}

export async function updateNote(
  id: string,
  patch: Partial<Omit<NoteInput, "authorId">>,
): Promise<void> {
  const update: Record<string, unknown> = { updated_at: nowIso() };
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.content !== undefined) update.content = patch.content;
  if (patch.assignedToUserId !== undefined) update.assigned_to_user_id = patch.assignedToUserId;
  if (patch.editableByAssignee !== undefined) update.editable_by_assignee = patch.editableByAssignee;
  if (patch.pinned !== undefined) update.pinned = patch.pinned;
  if (patch.projectId !== undefined) update.project_id = patch.projectId;
  if (patch.folderId !== undefined) update.folder_id = patch.folderId;

  const { error } = await getSupabase().from("freelance_hq_notes").update(update).eq("id", id);
  if (error) throw error;
}

export async function deleteNote(id: string): Promise<void> {
  const { error } = await getSupabase().from("freelance_hq_notes").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Note folders: one level, scoped to a project (or to the project-independent
 * "General" bucket when projectId is null). Visibility/create/rename/delete
 * permission is "anyone who can access the project" (checked in actions.ts),
 * distinct from the per-note author/admin/assignee rules above.
 */
interface NoteFolderRow {
  id: string;
  name: string;
  project_id: string | null;
  created_at: string;
  updated_at: string;
}

function toNoteFolder(row: NoteFolderRow): NoteFolder {
  return { id: row.id, name: row.name, projectId: row.project_id, createdAt: row.created_at, updatedAt: row.updated_at };
}

/** All folders visible to a user: General (project_id null) plus folders in `accessibleProjectIds`. */
export async function listNoteFolders(accessibleProjectIds: string[]): Promise<NoteFolder[]> {
  try {
    let query = getSupabase().from("freelance_hq_note_folders").select("*").order("name");
    query =
      accessibleProjectIds.length > 0
        ? query.or(`project_id.is.null,project_id.in.(${accessibleProjectIds.join(",")})`)
        : query.is("project_id", null);
    const { data, error } = await query;
    if (error) throw error;
    return ((data ?? []) as NoteFolderRow[]).map(toNoteFolder);
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

export async function getNoteFolder(id: string): Promise<NoteFolder | null> {
  try {
    const { data, error } = await getSupabase().from("freelance_hq_note_folders").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? toNoteFolder(data as NoteFolderRow) : null;
  } catch (error) {
    if (isMissingTableError(error)) return null;
    throw error;
  }
}

export async function createNoteFolder(name: string, projectId: string | null): Promise<NoteFolder> {
  const { data, error } = await getSupabase()
    .from("freelance_hq_note_folders")
    .insert({ name, project_id: projectId })
    .select()
    .single();
  if (error) throw error;
  return toNoteFolder(data as NoteFolderRow);
}

export async function renameNoteFolder(id: string, name: string): Promise<void> {
  const { error } = await getSupabase()
    .from("freelance_hq_note_folders")
    .update({ name, updated_at: nowIso() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteNoteFolder(id: string): Promise<void> {
  const { error } = await getSupabase().from("freelance_hq_note_folders").delete().eq("id", id);
  if (error) throw error;
}

interface TaskNoteRow {
  task_id: string;
  content: RichContent;
  updated_at: string;
  updated_by: string | null;
}

function toTaskNote(row: TaskNoteRow): TaskNote {
  return { taskId: row.task_id, content: row.content ?? {}, updatedAt: row.updated_at, updatedBy: row.updated_by };
}

export async function getTaskNote(taskId: string): Promise<TaskNote | null> {
  try {
    const { data, error } = await getSupabase().from("freelance_hq_task_notes").select("*").eq("task_id", taskId).maybeSingle();
    if (error) throw error;
    return data ? toTaskNote(data as TaskNoteRow) : null;
  } catch (error) {
    if (isMissingTableError(error)) return null;
    throw error;
  }
}

export async function upsertTaskNote(taskId: string, content: RichContent, updatedBy: string): Promise<TaskNote> {
  const { data, error } = await getSupabase()
    .from("freelance_hq_task_notes")
    .upsert({ task_id: taskId, content, updated_by: updatedBy, updated_at: nowIso() })
    .select()
    .single();
  if (error) throw error;
  return toTaskNote(data as TaskNoteRow);
}

/**
 * "Unseen count" notification badges (e.g. Projects/Notes tabs in the
 * sidebar). One row per (user, section) tracks when that user last opened
 * that section; badge counts are computed by comparing against it.
 */
const EPOCH = "1970-01-01T00:00:00.000Z";

async function getLastSeen(userId: string, section: string): Promise<string> {
  try {
    const { data, error } = await getSupabase()
      .from("freelance_hq_notification_seen")
      .select("last_seen_at")
      .eq("user_id", userId)
      .eq("section", section)
      .maybeSingle();
    if (error) throw error;
    return (data as { last_seen_at: string } | null)?.last_seen_at ?? EPOCH;
  } catch (error) {
    if (isMissingTableError(error)) return EPOCH;
    throw error;
  }
}

export async function markSectionSeen(userId: string, section: string): Promise<void> {
  try {
    const { error } = await getSupabase()
      .from("freelance_hq_notification_seen")
      .upsert({ user_id: userId, section, last_seen_at: nowIso() });
    if (error) throw error;
  } catch (error) {
    if (!isMissingTableError(error)) throw error;
  }
}

/** New project assignments (or, for an admin, new projects) since the user last opened Projects. */
export async function countUnseenProjects(userId: string, isAdmin: boolean): Promise<number> {
  const lastSeen = await getLastSeen(userId, "projects");
  try {
    if (isAdmin) {
      const { count, error } = await getSupabase()
        .from("freelance_hq_projects")
        .select("*", { count: "exact", head: true })
        .gt("created_at", lastSeen);
      if (error) throw error;
      return count ?? 0;
    }
    const { count, error } = await getSupabase()
      .from("freelance_hq_project_assignments")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .gt("created_at", lastSeen);
    if (error) throw error;
    return count ?? 0;
  } catch (error) {
    if (isMissingTableError(error)) return 0;
    throw error;
  }
}

/** Notes an admin has assigned to this user since they last opened Notes. */
export async function countUnseenNotes(userId: string): Promise<number> {
  const lastSeen = await getLastSeen(userId, "notes");
  try {
    const { count, error } = await getSupabase()
      .from("freelance_hq_notes")
      .select("*", { count: "exact", head: true })
      .eq("assigned_to_user_id", userId)
      .gt("created_at", lastSeen);
    if (error) throw error;
    return count ?? 0;
  } catch (error) {
    if (isMissingTableError(error)) return 0;
    throw error;
  }
}

/**
 * Tasks assigned to this user that changed since they last opened My Tasks.
 * There's no separate "assigned at" timestamp, so this is `updated_at` past
 * last-seen — an approximation that also counts any other edit to a task
 * assigned to you, not just a new assignment. Acceptable for Phase 1; a
 * dedicated assigned_at column can tighten this later if it proves noisy.
 */
export async function countUnseenTasks(userId: string): Promise<number> {
  const lastSeen = await getLastSeen(userId, "tasks");
  const { count, error } = await getSupabase()
    .from("freelance_hq_tasks")
    .select("*", { count: "exact", head: true })
    .eq("assigned_to", userId)
    .gt("updated_at", lastSeen);
  if (error) throw error;
  return count ?? 0;
}

interface WebAppFeatureRow {
  id: string;
  project_id: string;
  name: string;
  description: string;
  order_index: number;
  created_at: string;
  updated_at: string;
}

interface WebAppSubFeatureRow {
  id: string;
  feature_id: string;
  name: string;
  description: string;
  status: WebAppSubFeature["status"];
  order_index: number;
  created_at: string;
  updated_at: string;
}

function toWebAppFeature(row: WebAppFeatureRow): WebAppFeature {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    description: row.description,
    order: row.order_index,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toWebAppSubFeature(row: WebAppSubFeatureRow): WebAppSubFeature {
  return {
    id: row.id,
    featureId: row.feature_id,
    name: row.name,
    description: row.description,
    status: row.status,
    order: row.order_index,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listWebAppFeatures(projectId: string): Promise<WebAppFeature[]> {
  try {
    const { data, error } = await getSupabase()
      .from("freelance_hq_web_app_features")
      .select("*")
      .eq("project_id", projectId)
      .order("order_index", { ascending: true });
    if (error) throw error;
    return ((data ?? []) as WebAppFeatureRow[]).map(toWebAppFeature);
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

export async function listWebAppSubFeatures(featureIds: string[]): Promise<Record<string, WebAppSubFeature[]>> {
  if (featureIds.length === 0) return {};
  try {
    const { data, error } = await getSupabase()
      .from("freelance_hq_web_app_subfeatures")
      .select("*")
      .in("feature_id", featureIds)
      .order("order_index", { ascending: true });
    if (error) throw error;
    const map: Record<string, WebAppSubFeature[]> = {};
    for (const row of (data ?? []) as WebAppSubFeatureRow[]) {
      const sub = toWebAppSubFeature(row);
      const list = map[sub.featureId] ?? [];
      list.push(sub);
      map[sub.featureId] = list;
    }
    return map;
  } catch (error) {
    if (isMissingTableError(error)) return {};
    throw error;
  }
}

export async function createWebAppFeature(input: {
  projectId: string;
  name: string;
  description: string;
}): Promise<WebAppFeature> {
  const { count } = await getSupabase()
    .from("freelance_hq_web_app_features")
    .select("*", { count: "exact", head: true })
    .eq("project_id", input.projectId);
  const { data, error } = await getSupabase()
    .from("freelance_hq_web_app_features")
    .insert({
      project_id: input.projectId,
      name: input.name,
      description: input.description,
      order_index: count ?? 0,
    })
    .select()
    .single();
  if (error) throw error;
  return toWebAppFeature(data as WebAppFeatureRow);
}

export async function updateWebAppFeature(id: string, patch: { name?: string; description?: string }): Promise<void> {
  const update: Record<string, unknown> = { updated_at: nowIso() };
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.description !== undefined) update.description = patch.description;
  const { error } = await getSupabase().from("freelance_hq_web_app_features").update(update).eq("id", id);
  if (error) throw error;
}

export async function deleteWebAppFeature(id: string): Promise<void> {
  const { error } = await getSupabase().from("freelance_hq_web_app_features").delete().eq("id", id);
  if (error) throw error;
}

export async function bulkDeleteWebAppFeatures(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await getSupabase().from("freelance_hq_web_app_features").delete().in("id", ids);
  if (error) throw error;
}

/** Duplicates each given feature (and all of its sub-features) as a new "<name> (copy)" feature. */
export async function copyWebAppFeatures(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const [{ data: featureRows, error: featureError }, subFeaturesByFeature] = await Promise.all([
    getSupabase().from("freelance_hq_web_app_features").select("*").in("id", ids),
    listWebAppSubFeatures(ids),
  ]);
  if (featureError) throw featureError;

  const { count } = await getSupabase()
    .from("freelance_hq_web_app_features")
    .select("*", { count: "exact", head: true });

  let nextOrder = count ?? 0;
  for (const row of (featureRows ?? []) as WebAppFeatureRow[]) {
    const { data: newFeature, error: insertError } = await getSupabase()
      .from("freelance_hq_web_app_features")
      .insert({
        project_id: row.project_id,
        name: `${row.name} (copy)`,
        description: row.description,
        order_index: nextOrder++,
      })
      .select()
      .single();
    if (insertError) throw insertError;

    const subFeatures = subFeaturesByFeature[row.id] ?? [];
    if (subFeatures.length > 0) {
      const { error: subError } = await getSupabase().from("freelance_hq_web_app_subfeatures").insert(
        subFeatures.map((sub) => ({
          feature_id: (newFeature as WebAppFeatureRow).id,
          name: sub.name,
          description: sub.description,
          status: sub.status,
          order_index: sub.order,
        })),
      );
      if (subError) throw subError;
    }
  }
}

export async function createWebAppSubFeature(input: {
  featureId: string;
  name: string;
  description: string;
}): Promise<WebAppSubFeature> {
  const { count } = await getSupabase()
    .from("freelance_hq_web_app_subfeatures")
    .select("*", { count: "exact", head: true })
    .eq("feature_id", input.featureId);
  const { data, error } = await getSupabase()
    .from("freelance_hq_web_app_subfeatures")
    .insert({
      feature_id: input.featureId,
      name: input.name,
      description: input.description,
      order_index: count ?? 0,
    })
    .select()
    .single();
  if (error) throw error;
  return toWebAppSubFeature(data as WebAppSubFeatureRow);
}

export async function updateWebAppSubFeature(
  id: string,
  patch: { name?: string; description?: string; status?: WebAppSubFeature["status"] },
): Promise<void> {
  const update: Record<string, unknown> = { updated_at: nowIso() };
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.status !== undefined) update.status = patch.status;
  const { error } = await getSupabase().from("freelance_hq_web_app_subfeatures").update(update).eq("id", id);
  if (error) throw error;
}

export async function deleteWebAppSubFeature(id: string): Promise<void> {
  const { error } = await getSupabase().from("freelance_hq_web_app_subfeatures").delete().eq("id", id);
  if (error) throw error;
}

export async function bulkDeleteWebAppSubFeatures(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await getSupabase().from("freelance_hq_web_app_subfeatures").delete().in("id", ids);
  if (error) throw error;
}

/** Duplicates each given sub-feature within its own feature as a new "<name> (copy)" row. */
export async function copyWebAppSubFeatures(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { data: rows, error } = await getSupabase().from("freelance_hq_web_app_subfeatures").select("*").in("id", ids);
  if (error) throw error;

  const countByFeature: Record<string, number> = {};
  for (const row of (rows ?? []) as WebAppSubFeatureRow[]) {
    if (!(row.feature_id in countByFeature)) {
      const { count } = await getSupabase()
        .from("freelance_hq_web_app_subfeatures")
        .select("*", { count: "exact", head: true })
        .eq("feature_id", row.feature_id);
      countByFeature[row.feature_id] = count ?? 0;
    }
    const nextOrder = countByFeature[row.feature_id] ?? 0;
    countByFeature[row.feature_id] = nextOrder + 1;
    const { error: insertError } = await getSupabase().from("freelance_hq_web_app_subfeatures").insert({
      feature_id: row.feature_id,
      name: `${row.name} (copy)`,
      description: row.description,
      status: row.status,
      order_index: nextOrder,
    });
    if (insertError) throw insertError;
  }
}

export async function moveWebAppSubFeatures(ids: string[], targetFeatureId: string): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await getSupabase()
    .from("freelance_hq_web_app_subfeatures")
    .update({ feature_id: targetFeatureId, updated_at: nowIso() })
    .in("id", ids);
  if (error) throw error;
}

/**
 * Hosting/Domain Renewal tracker. Standalone from Domains and Projects — see
 * migration 026.
 */

interface RenewalRow {
  id: string;
  domain_client_id: string | null;
  domain_id: string | null;
  client_name: string;
  item_name: string;
  service_types: RenewalServiceType[] | null;
  amount_charged: number | null;
  amount_paid: number | null;
  currency: string | null;
  due_date: string | null;
  status: RenewalStatus;
  notes: string;
  created_at: string;
  updated_at: string;
}

function toRenewal(row: RenewalRow): Renewal {
  return {
    id: row.id,
    domainClientId: row.domain_client_id,
    domainId: row.domain_id,
    clientName: row.client_name,
    itemName: row.item_name,
    serviceTypes: row.service_types ?? [],
    amountCharged: row.amount_charged,
    amountPaid: row.amount_paid,
    currency: row.currency ?? "PKR",
    dueDate: row.due_date,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listRenewals(): Promise<Renewal[]> {
  try {
    const { data, error } = await getSupabase()
      .from("freelance_hq_renewals")
      .select("*")
      .order("due_date", { ascending: true, nullsFirst: false });
    if (error) throw error;
    return ((data ?? []) as RenewalRow[]).map(toRenewal);
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

export async function createRenewal(input: {
  domainClientId: string | null;
  domainId: string | null;
  clientName: string;
  itemName: string;
  serviceTypes: RenewalServiceType[];
  amountCharged: number | null;
  amountPaid: number | null;
  currency: string;
  dueDate: string | null;
  status: RenewalStatus;
  notes: string;
}): Promise<Renewal> {
  const { data, error } = await getSupabase()
    .from("freelance_hq_renewals")
    .insert({
      domain_client_id: input.domainClientId,
      domain_id: input.domainId,
      client_name: input.clientName,
      item_name: input.itemName,
      service_types: input.serviceTypes,
      amount_charged: input.amountCharged,
      amount_paid: input.amountPaid,
      currency: input.currency,
      due_date: input.dueDate,
      status: input.status,
      notes: input.notes,
    })
    .select()
    .single();
  if (error) throw error;
  return toRenewal(data as RenewalRow);
}

export async function updateRenewal(
  id: string,
  patch: Partial<{
    domainClientId: string | null;
    domainId: string | null;
    clientName: string;
    itemName: string;
    serviceTypes: RenewalServiceType[];
    amountCharged: number | null;
    amountPaid: number | null;
    currency: string;
    dueDate: string | null;
    status: RenewalStatus;
    notes: string;
  }>,
): Promise<void> {
  const update: Record<string, unknown> = { updated_at: nowIso() };
  if (patch.domainClientId !== undefined) update.domain_client_id = patch.domainClientId;
  if (patch.domainId !== undefined) update.domain_id = patch.domainId;
  if (patch.clientName !== undefined) update.client_name = patch.clientName;
  if (patch.itemName !== undefined) update.item_name = patch.itemName;
  if (patch.serviceTypes !== undefined) update.service_types = patch.serviceTypes;
  if (patch.amountCharged !== undefined) update.amount_charged = patch.amountCharged;
  if (patch.amountPaid !== undefined) update.amount_paid = patch.amountPaid;
  if (patch.currency !== undefined) update.currency = patch.currency;
  if (patch.dueDate !== undefined) update.due_date = patch.dueDate;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.notes !== undefined) update.notes = patch.notes;

  const { error } = await getSupabase().from("freelance_hq_renewals").update(update).eq("id", id);
  if (error) throw error;
}

export async function deleteRenewal(id: string): Promise<void> {
  const { error } = await getSupabase().from("freelance_hq_renewals").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Client Website Management — one config per Domain (migration 029/030),
 * edited from a popup on that domain's row in the Domains tab rather than
 * a separate list. `api_key` is a random 64-hex-char secret (256 bits of
 * entropy) generated server-side; it is never returned by any listing that
 * a browser could see except this app's own admin UI, and the public
 * /api/site-config endpoint takes it as an *input* to look up a row, never
 * echoes it back. `last_fetched_at` is stamped by that same endpoint on
 * every successful lookup — the basis for the Domains tab's "Connected"
 * signal, which the caller derives from recency (this module has no
 * opinion on what counts as "recent").
 */

interface WebsiteRow {
  id: string;
  domain_id: string | null;
  name: string;
  contact_email: string;
  contact_phone: string;
  contact_address: string;
  cities: string[] | null;
  head_scripts: string;
  body_scripts: string;
  api_key: string;
  is_offline: boolean;
  last_fetched_at: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

function toWebsite(row: WebsiteRow): Website {
  return {
    id: row.id,
    domainId: row.domain_id,
    name: row.name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    contactAddress: row.contact_address,
    cities: row.cities ?? [],
    headScripts: row.head_scripts,
    bodyScripts: row.body_scripts,
    apiKey: row.api_key,
    isOffline: row.is_offline,
    lastFetchedAt: row.last_fetched_at,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function generateWebsiteApiKey(): string {
  return randomBytes(32).toString("hex");
}

/** Bulk-loads each domain's Website config (if any) for the Domains tab, keyed by domain_id. */
export async function listWebsitesByDomainIds(domainIds: string[]): Promise<Record<string, Website>> {
  if (domainIds.length === 0) return {};
  try {
    const { data, error } = await getSupabase().from("freelance_hq_websites").select("*").in("domain_id", domainIds);
    if (error) throw error;
    const map: Record<string, Website> = {};
    for (const row of (data ?? []) as WebsiteRow[]) {
      if (row.domain_id) map[row.domain_id] = toWebsite(row);
    }
    return map;
  } catch (error) {
    if (isMissingTableError(error)) return {};
    throw error;
  }
}

/** Server-only lookup for the public config endpoint — never call from a client-facing admin listing. */
export async function getWebsiteByApiKey(apiKey: string): Promise<Website | null> {
  if (!apiKey) return null;
  try {
    const { data, error } = await getSupabase().from("freelance_hq_websites").select("*").eq("api_key", apiKey).maybeSingle();
    if (error) throw error;
    return data ? toWebsite(data as WebsiteRow) : null;
  } catch (error) {
    if (isMissingTableError(error)) return null;
    throw error;
  }
}

/**
 * Fails open when the table doesn't exist yet: recording a fetch timestamp
 * is a nice-to-have "connected" signal on top of serving the config, so a
 * missing table shouldn't turn a successful config fetch into a 500 for
 * the live site calling this endpoint.
 */
export async function touchWebsiteLastFetched(id: string): Promise<void> {
  try {
    const { error } = await getSupabase().from("freelance_hq_websites").update({ last_fetched_at: nowIso() }).eq("id", id);
    if (error) throw error;
  } catch (error) {
    if (!isMissingTableError(error)) throw error;
  }
}

/** Creates or updates the one Website config for a domain — the popup always saves through this. */
export async function upsertWebsiteForDomain(
  domainId: string,
  input: {
    name: string;
    contactEmail: string;
    contactPhone: string;
    contactAddress: string;
    cities: string[];
    headScripts: string;
    bodyScripts: string;
    notes: string;
  },
): Promise<Website> {
  const existing = await getSupabase().from("freelance_hq_websites").select("*").eq("domain_id", domainId).maybeSingle();
  if (existing.error) throw existing.error;

  if (existing.data) {
    const { data, error } = await getSupabase()
      .from("freelance_hq_websites")
      .update({
        name: input.name,
        contact_email: input.contactEmail,
        contact_phone: input.contactPhone,
        contact_address: input.contactAddress,
        cities: input.cities,
        head_scripts: input.headScripts,
        body_scripts: input.bodyScripts,
        notes: input.notes,
        updated_at: nowIso(),
      })
      .eq("id", (existing.data as WebsiteRow).id)
      .select()
      .single();
    if (error) throw error;
    return toWebsite(data as WebsiteRow);
  }

  const { data, error } = await getSupabase()
    .from("freelance_hq_websites")
    .insert({
      domain_id: domainId,
      name: input.name,
      contact_email: input.contactEmail,
      contact_phone: input.contactPhone,
      contact_address: input.contactAddress,
      cities: input.cities,
      head_scripts: input.headScripts,
      body_scripts: input.bodyScripts,
      api_key: generateWebsiteApiKey(),
      notes: input.notes,
    })
    .select()
    .single();
  if (error) throw error;
  return toWebsite(data as WebsiteRow);
}

/** Rotates a domain's website secret key — use after a suspected leak, or any time you want to invalidate the old one. */
export async function regenerateWebsiteApiKeyForDomain(domainId: string): Promise<string | null> {
  const apiKey = generateWebsiteApiKey();
  const { data, error } = await getSupabase()
    .from("freelance_hq_websites")
    .update({ api_key: apiKey, updated_at: nowIso() })
    .eq("domain_id", domainId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return data ? apiKey : null;
}

export async function setWebsiteOfflineForDomain(domainId: string, offline: boolean): Promise<void> {
  const { error } = await getSupabase()
    .from("freelance_hq_websites")
    .update({ is_offline: offline, updated_at: nowIso() })
    .eq("domain_id", domainId);
  if (error) throw error;
}
