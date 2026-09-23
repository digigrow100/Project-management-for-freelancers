import * as store from "@/lib/store";
import * as activity from "@/lib/activity";
import type { Profile } from "@/lib/types";

/**
 * Every tool re-checks the SAME permission the equivalent page/action
 * already enforces — the AI layer never opens a wider door than the UI.
 * A denial is returned as data (not thrown), so the model can relay it as
 * a plain sentence instead of the whole turn failing.
 */
function denyAdmin() {
  return { error: "This requires admin access." };
}
function denyFinance() {
  return { error: "You don't have access to Finance." };
}
function denyProject() {
  return { error: "You don't have access to this project." };
}

async function assertProjectAccess(profile: Profile, projectId: string): Promise<boolean> {
  if (profile.role === "admin") return true;
  return store.isProjectAssignedToUser(projectId, profile.id);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** ISO week number for today, matching lib/store.ts's weekBounds and SeoReportingPanel's currentIsoWeek. */
function currentIsoWeek(): string {
  const date = new Date();
  const dayNum = date.getDay() || 7;
  date.setDate(date.getDate() + 4 - dayNum);
  const yearStart = new Date(date.getFullYear(), 0, 1);
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getFullYear()}-W${pad(week)}`;
}

function currentPeriod(periodType: "daily" | "weekly" | "monthly"): string {
  const d = new Date();
  if (periodType === "daily") return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (periodType === "weekly") return currentIsoWeek();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days));
  return date.toISOString().slice(0, 10);
}

/**
 * `conversationId` is only used by the propose_* tools below, to stage the
 * pending action against the current conversation — read-only tools ignore
 * it. No tool ever writes application data directly; propose_* tools only
 * ever insert an ai_pending_actions row (see app/api/ai/confirm for the
 * actual execution, which always goes through an existing Server Action).
 */
export type AiToolHandler = (profile: Profile, args: Record<string, unknown>, conversationId: string) => Promise<unknown>;

async function getTeamReport(profile: Profile, args: Record<string, unknown>): Promise<unknown> {
  const period = args.period === "today" ? "today" : "this_week";
  const memberName = typeof args.memberName === "string" ? args.memberName.trim().toLowerCase() : "";

  const projects = await store.getProjectsForProfile(profile);
  const members = await store.listTeamMembers();
  const performance = await activity.getTeamPerformance(
    projects.filter((p) => !p.archived),
    members,
    store.todayDateKey(),
  );

  const filtered = memberName
    ? performance.filter((p) => p.memberName.toLowerCase().includes(memberName))
    : performance;

  return filtered.map((p) => ({
    member: p.memberName,
    completed: period === "today" ? p.completedToday : p.completedThisWeek,
    projects: period === "today" ? p.projectNamesToday : undefined,
  }));
}

async function getClientSummary(profile: Profile, args: Record<string, unknown>): Promise<unknown> {
  if (profile.role !== "admin") return denyAdmin();
  const clientId = String(args.clientId ?? "");
  const client = clientId ? await store.getClient(clientId) : null;
  if (!client) return { error: "Client not found." };

  const [balance, projects, services] = await Promise.all([
    store.getClientBalance(client.id),
    store.getProjectsForClient(client.id),
    store.listClientServices(client.id),
  ]);

  return {
    client: client.name || client.company,
    balance,
    activeProjects: projects
      .filter((p) => !p.archived)
      .map((p) => ({ id: p.id, name: p.name, type: p.type })),
    activeServices: services
      .filter((s) => s.status === "active")
      .map((s) => ({ name: s.serviceName, price: s.priceOverride, currency: s.currency, frequency: s.billingFrequency })),
  };
}

async function getProjectStatus(profile: Profile, args: Record<string, unknown>): Promise<unknown> {
  const projectId = String(args.projectId ?? "");
  if (!projectId || !(await assertProjectAccess(profile, projectId))) return denyProject();

  const project = await store.getProject(projectId);
  if (!project) return { error: "Project not found." };

  const [progress, tasks] = await Promise.all([store.getProjectProgress(project.id), store.getTasksByProject(project.id)]);
  const openTasks = tasks.filter((t) => t.status !== "done");

  return {
    project: project.name,
    type: project.type,
    archived: project.archived,
    tasksDone: progress.done,
    tasksTotal: progress.total,
    openTasks: openTasks.slice(0, 10).map((t) => ({
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate,
      assignedTo: t.assignedToName,
    })),
  };
}

async function getSeoReport(profile: Profile, args: Record<string, unknown>): Promise<unknown> {
  const projectId = String(args.projectId ?? "");
  if (!projectId || !(await assertProjectAccess(profile, projectId))) return denyProject();

  const project = await store.getProject(projectId);
  if (!project) return { error: "Project not found." };
  if (project.type !== "seo") return { error: "This project is not an SEO project." };

  const periodType = (["daily", "weekly", "monthly"] as const).includes(args.periodType as "daily" | "weekly" | "monthly")
    ? (args.periodType as "daily" | "weekly" | "monthly")
    : "monthly";
  const period = typeof args.period === "string" && args.period ? args.period : currentPeriod(periodType);

  const draft = await store.buildSeoReportDraft(project.id, period, periodType);
  return { project: project.name, period, periodType, ...draft };
}

async function getInvoiceStatus(profile: Profile, args: Record<string, unknown>): Promise<unknown> {
  if (profile.role !== "admin" && !profile.canAccessFinance) return denyFinance();

  const clientId = typeof args.clientId === "string" && args.clientId ? args.clientId : null;
  const status = typeof args.status === "string" && args.status !== "all" ? args.status : null;

  const invoices = clientId ? await store.listInvoicesForClient(clientId) : await store.listInvoices();
  const filtered = status ? invoices.filter((i) => i.status === status) : invoices;

  return filtered.slice(0, 25).map((i) => ({
    invoiceNumber: i.invoiceNumber,
    client: i.clientName,
    status: i.status,
    dueDate: i.dueDate,
    currency: i.currency,
  }));
}

async function getPendingTasks(profile: Profile, args: Record<string, unknown>): Promise<unknown> {
  const scope = args.scope === "project" || args.scope === "all" ? args.scope : "mine";
  const projects = await store.getProjectsForProfile(profile);
  const projectNameById = new Map(projects.map((p) => [p.id, p.name]));

  let tasks;
  if (scope === "mine") {
    tasks = (await store.getMyTasks(profile.id)).filter((t) => t.status !== "done");
  } else if (scope === "project") {
    const projectId = String(args.projectId ?? "");
    if (!projectId || !(await assertProjectAccess(profile, projectId))) return denyProject();
    tasks = (await store.getTasksByProject(projectId)).filter((t) => t.status !== "done");
  } else {
    const visibleIds = new Set(projects.map((p) => p.id));
    tasks = (await store.getOpenTasks()).filter((t) => visibleIds.has(t.projectId));
  }

  return tasks.slice(0, 25).map((t) => ({
    title: t.title,
    project: projectNameById.get(t.projectId) ?? null,
    status: t.status,
    priority: t.priority,
    dueDate: t.dueDate,
    assignedTo: t.assignedToName,
  }));
}

async function getDashboardActivityTool(profile: Profile, args: Record<string, unknown>): Promise<unknown> {
  const projects = (await store.getProjectsForProfile(profile)).filter((p) => !p.archived);
  const date = typeof args.date === "string" && args.date ? args.date : store.todayDateKey();
  const events = await activity.getDashboardActivity(projects, date);

  return events.slice(0, 30).map((e) => ({
    project: e.projectName,
    person: e.personName,
    type: e.eventType,
    title: e.title,
    detail: e.detail,
    at: e.at,
  }));
}

/* -------------------------------------------------------------------- */
/* Write proposals (Phase 6.2/6.3) — stage a pending_action, never write  */
/* application data directly. The chat UI renders the returned preview   */
/* as a card; only a confirmed click (app/api/ai/confirm) executes the   */
/* real, existing Server Action.                                         */
/* -------------------------------------------------------------------- */

interface RawTaskInput {
  title?: unknown;
}

async function proposeTaskSchedule(profile: Profile, args: Record<string, unknown>, conversationId: string): Promise<unknown> {
  const projectId = String(args.projectId ?? "");
  if (!projectId || !(await assertProjectAccess(profile, projectId))) return denyProject();

  const project = await store.getProject(projectId);
  if (!project) return { error: "Project not found." };

  const rawTasks = Array.isArray(args.tasks) ? (args.tasks as RawTaskInput[]) : [];
  const titles = rawTasks.map((t) => String(t?.title ?? "").trim()).filter(Boolean);
  if (titles.length === 0) return { error: "No tasks provided." };

  const days = Math.max(1, Math.min(90, Math.round(Number(args.days)) || 1));
  const startDate = typeof args.startDate === "string" && args.startDate ? args.startDate : store.todayDateKey();

  const scheduled = titles.map((title, i) => ({
    title,
    scheduledFor: addDays(startDate, Math.floor((i * days) / titles.length)),
  }));

  const summary = `${scheduled.length} task${scheduled.length === 1 ? "" : "s"} for "${project.name}", spread across ${days} day${days === 1 ? "" : "s"} starting ${startDate}.`;
  const pending = await store.createAiPendingAction({
    conversationId,
    createdBy: profile.id,
    actionType: "create_tasks",
    payload: { projectId, tasks: scheduled },
    summary,
  });

  return { pendingActionId: pending.id, actionType: "create_tasks", summary, preview: scheduled };
}

interface RawInvoiceItemInput {
  description?: unknown;
  quantity?: unknown;
  unitPrice?: unknown;
}

async function proposeInvoice(profile: Profile, args: Record<string, unknown>, conversationId: string): Promise<unknown> {
  if (profile.role !== "admin" && !profile.canAccessFinance) return denyFinance();

  const clientId = String(args.clientId ?? "");
  const client = clientId ? await store.getClient(clientId) : null;
  if (!client) return { error: "Client not found." };

  const rawItems = Array.isArray(args.items) ? (args.items as RawInvoiceItemInput[]) : [];
  const items = rawItems
    .map((i) => ({
      description: String(i?.description ?? "").trim(),
      quantity: Number(i?.quantity) || 1,
      unitPrice: Number(i?.unitPrice) || 0,
    }))
    .filter((i) => i.description);
  if (items.length === 0) return { error: "No invoice items provided." };

  const currency = typeof args.currency === "string" && args.currency ? args.currency : "PKR";
  const issueDate = typeof args.issueDate === "string" && args.issueDate ? args.issueDate : store.todayDateKey();
  const dueDate = typeof args.dueDate === "string" && args.dueDate ? args.dueDate : issueDate;
  const projectId = typeof args.projectId === "string" && args.projectId ? args.projectId : null;
  const total = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  const clientLabel = client.name || client.company;

  const summary = `Invoice draft for ${clientLabel}: ${items.length} item${items.length === 1 ? "" : "s"}, ${currency} ${total.toFixed(2)}, due ${dueDate}.`;
  const pending = await store.createAiPendingAction({
    conversationId,
    createdBy: profile.id,
    actionType: "create_invoice",
    payload: { clientId, projectId, items, currency, issueDate, dueDate },
    summary,
  });

  return {
    pendingActionId: pending.id,
    actionType: "create_invoice",
    summary,
    preview: { client: clientLabel, items, currency, total, issueDate, dueDate },
  };
}

async function proposeProject(profile: Profile, args: Record<string, unknown>, conversationId: string): Promise<unknown> {
  if (profile.role !== "admin") return denyAdmin();

  const clientId = String(args.clientId ?? "");
  const client = clientId ? await store.getClient(clientId) : null;
  if (!client) return { error: "Client not found." };

  const name = String(args.name ?? "").trim();
  if (!name) return { error: "A project name is required." };

  const validTypes = ["seo", "web_dev", "web_app", "digital_marketing", "other"];
  const type = validTypes.includes(args.type as string) ? (args.type as string) : "other";
  const description = typeof args.description === "string" ? args.description : "";
  const clientLabel = client.name || client.company;

  const summary = `New ${type} project "${name}" for ${clientLabel}.`;
  const pending = await store.createAiPendingAction({
    conversationId,
    createdBy: profile.id,
    actionType: "create_project",
    payload: { clientId, name, type, description },
    summary,
  });

  return { pendingActionId: pending.id, actionType: "create_project", summary, preview: { client: clientLabel, name, type, description } };
}

async function proposeSeoReport(profile: Profile, args: Record<string, unknown>, conversationId: string): Promise<unknown> {
  const projectId = String(args.projectId ?? "");
  if (!projectId || !(await assertProjectAccess(profile, projectId))) return denyProject();

  const project = await store.getProject(projectId);
  if (!project) return { error: "Project not found." };
  if (project.type !== "seo") return { error: "This project is not an SEO project." };

  const periodType = (["daily", "weekly", "monthly"] as const).includes(args.periodType as "daily" | "weekly" | "monthly")
    ? (args.periodType as "daily" | "weekly" | "monthly")
    : "monthly";
  const period = typeof args.period === "string" && args.period ? args.period : currentPeriod(periodType);

  const draft = await store.buildSeoReportDraft(project.id, period, periodType);
  const summary = `${periodType} SEO report draft for "${project.name}" — ${period}. Never sent automatically; review and approve it on the Reporting tab after creating.`;
  const pending = await store.createAiPendingAction({
    conversationId,
    createdBy: profile.id,
    actionType: "create_seo_report",
    payload: { projectId, period, periodType },
    summary,
  });

  return { pendingActionId: pending.id, actionType: "create_seo_report", summary, preview: { project: project.name, period, periodType, ...draft } };
}

export const AI_TOOL_HANDLERS: Record<string, AiToolHandler> = {
  get_team_report: getTeamReport,
  get_client_summary: getClientSummary,
  get_project_status: getProjectStatus,
  get_seo_report: getSeoReport,
  get_invoice_status: getInvoiceStatus,
  get_pending_tasks: getPendingTasks,
  get_dashboard_activity: getDashboardActivityTool,
  propose_task_schedule: proposeTaskSchedule,
  propose_invoice: proposeInvoice,
  propose_project: proposeProject,
  propose_seo_report: proposeSeoReport,
};
