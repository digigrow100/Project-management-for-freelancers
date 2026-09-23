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

export type AiToolHandler = (profile: Profile, args: Record<string, unknown>) => Promise<unknown>;

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

export const AI_TOOL_HANDLERS: Record<string, AiToolHandler> = {
  get_team_report: getTeamReport,
  get_client_summary: getClientSummary,
  get_project_status: getProjectStatus,
  get_seo_report: getSeoReport,
  get_invoice_status: getInvoiceStatus,
  get_pending_tasks: getPendingTasks,
  get_dashboard_activity: getDashboardActivityTool,
};
