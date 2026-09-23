"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as store from "./store";
import {
  requireAdmin,
  requireBacklinkCredentialAccess,
  requireFinanceAccess,
  requireProfile,
  requireProjectAccess,
  requireRenewalsAccess,
} from "./auth";
import { uploadBacklinkFile, uploadLogo, uploadProjectAttachment, uploadTaskFile } from "./storage";
import type {
  BacklinkCategoryType,
  BacklinkLink,
  BacklinkStatus,
  BillingFrequency,
  ChecklistItem,
  ClientDetails,
  ClientServiceStatus,
  ContentStatus,
  DnsRecordType,
  DomainStatus,
  InvoiceStatus,
  KeywordGroupColor,
  KeywordStatus,
  LoginMethod,
  OnPageStatus,
  OutreachStatus,
  PageType,
  PaymentKind,
  PaymentPlanType,
  Priority,
  ProjectType,
  RenewalServiceType,
  RenewalStatus,
  ReportPeriodType,
  ResaleDomainStatus,
  RichContent,
  Role,
  SearchIntent,
  SeoModule,
  SubFeatureStatus,
  TaskPriority,
  TaskStatus,
  TechnicalIssueStatus,
  WebDevDetails,
} from "./types";

function refresh(projectId?: string) {
  revalidatePath("/");
  revalidatePath("/today");
  revalidatePath("/my-tasks");
  revalidatePath("/projects");
  if (projectId) revalidatePath(`/projects/${projectId}`);
}

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function numOrNull(value: string): number | null {
  if (!value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** A <select> always reports its field as present in FormData, even for an empty "Not set" option — check the value itself, not `.has()`. */
function boolOrNull(value: string): boolean | null {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

interface RawChecklistItem {
  id?: unknown;
  text?: unknown;
  done?: unknown;
}

function parseChecklistJson(formData: FormData): ChecklistItem[] {
  const raw = str(formData, "checklistJson");
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as RawChecklistItem[])
      .filter((item) => item && typeof item.text === "string" && item.text.trim() !== "")
      .map((item) => ({
        id: typeof item.id === "string" && item.id ? item.id : randomUUID(),
        text: String(item.text).trim(),
        done: Boolean(item.done),
      }));
  } catch {
    return [];
  }
}

export async function createProjectAction(formData: FormData) {
  await requireAdmin();

  const name = str(formData, "name");
  const type = str(formData, "type") as ProjectType;
  const description = str(formData, "description");
  const color = str(formData, "color") || "#33d485";
  const startDate = str(formData, "startDate") || null;
  const endDate = str(formData, "endDate") || null;
  const websiteUrl = str(formData, "websiteUrl");
  const clientId = str(formData, "clientId");

  if (!name || !clientId) return;

  const webDetails: Partial<WebDevDetails> | null =
    type === "web_dev" || type === "web_app"
      ? {
          websiteName: name,
          websiteUrl,
          domainStatus: (str(formData, "domainStatus") || "pending") as DomainStatus,
          logoUrl: str(formData, "logoUrl"),
          siteIconUrl: str(formData, "siteIconUrl"),
          openGraphImageUrl: str(formData, "openGraphImageUrl"),
          servicesDetails: str(formData, "servicesDetails"),
          hostingDetails: str(formData, "hostingDetails"),
          contactDetails: str(formData, "contactDetails"),
          notes: str(formData, "webNotes"),
        }
      : null;

  const project = await store.createProject({
    name,
    type,
    description,
    color,
    startDate,
    endDate,
    websiteUrl,
    clientId,
    webDetails,
  });
  refresh(project.id);
  return project.id;
}

export async function createClientAction(formData: FormData) {
  await requireAdmin();

  const name = str(formData, "name");
  const company = str(formData, "company");
  if (!name && !company) return;

  const client = await store.createClient({
    name,
    company,
    email: str(formData, "email"),
    phone: str(formData, "phone"),
    address: str(formData, "address"),
    website: str(formData, "website"),
    notes: str(formData, "notes"),
  });
  revalidatePath("/clients");
  revalidatePath("/projects/new");
  return client.id;
}

export async function updateClientAction(formData: FormData) {
  await requireAdmin();

  const id = str(formData, "id");
  if (!id) return;

  const logoFile = formData.get("logoFile");
  const uploadedLogoUrl = logoFile instanceof File ? await uploadLogo(logoFile, `clients/${id}`) : null;

  await store.updateClient(id, {
    name: str(formData, "name"),
    company: str(formData, "company"),
    email: str(formData, "email"),
    phone: str(formData, "phone"),
    address: str(formData, "address"),
    website: str(formData, "website"),
    notes: str(formData, "notes"),
    logoUrl: uploadedLogoUrl ?? str(formData, "existingLogoUrl"),
  });
  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
}

export async function updateClientDetailsAction(formData: FormData) {
  const projectId = str(formData, "projectId");
  if (!projectId) return;
  await requireProjectAccess(projectId);

  const logoFile = formData.get("logoFile");
  const uploadedLogoUrl = logoFile instanceof File ? await uploadLogo(logoFile, `clients/${projectId}`) : null;

  const clientDetails: ClientDetails = {
    name: str(formData, "clientName"),
    company: str(formData, "clientCompany"),
    email: str(formData, "clientEmail"),
    phone: str(formData, "clientPhone"),
    address: str(formData, "clientAddress"),
    notes: str(formData, "clientNotes"),
    logoUrl: uploadedLogoUrl ?? str(formData, "existingLogoUrl"),
  };

  await store.updateProjectDetails(projectId, { clientDetails });
  refresh(projectId);
}

export async function updateProjectMetaAction(formData: FormData) {
  const projectId = str(formData, "projectId");
  if (!projectId) return;
  await requireProjectAccess(projectId);

  await store.updateProjectDetails(projectId, {
    description: str(formData, "description"),
    startDate: str(formData, "startDate") || null,
    endDate: str(formData, "endDate") || null,
    websiteUrl: str(formData, "websiteUrl"),
  });
  refresh(projectId);
}

export async function updateWebDetailsAction(formData: FormData) {
  const projectId = str(formData, "projectId");
  if (!projectId) return;
  await requireProjectAccess(projectId);

  const webDetails: WebDevDetails = {
    websiteName: str(formData, "websiteName"),
    websiteUrl: str(formData, "websiteUrl"),
    domainStatus: (str(formData, "domainStatus") || "pending") as DomainStatus,
    logoUrl: str(formData, "logoUrl"),
    siteIconUrl: str(formData, "siteIconUrl"),
    openGraphImageUrl: str(formData, "openGraphImageUrl"),
    servicesDetails: str(formData, "servicesDetails"),
    hostingDetails: str(formData, "hostingDetails"),
    contactDetails: str(formData, "contactDetails"),
    notes: str(formData, "webNotes"),
  };

  await store.updateProjectDetails(projectId, { webDetails, websiteUrl: webDetails.websiteUrl });
  refresh(projectId);
}

export async function createTaskAction(formData: FormData) {
  const projectId = str(formData, "projectId");
  const stageId = str(formData, "stageId") || null;
  const title = str(formData, "title");
  const priority = (str(formData, "priority") || "medium") as TaskPriority;
  const scheduledFor = str(formData, "scheduledFor") || null;
  const markDoneOn = str(formData, "markDoneOn") || null;
  const assignedTo = str(formData, "assignedTo") || null;
  const checklist = parseChecklistJson(formData);
  if (!projectId || !title) return;
  await requireProjectAccess(projectId);

  const task = await store.createTask({
    projectId,
    stageId,
    title,
    priority,
    scheduledFor,
    checklist,
    markDoneOn,
    assignedTo,
    seoModule: (str(formData, "seoModule") || null) as SeoModule | null,
    keywordId: str(formData, "keywordId") || null,
    pageId: str(formData, "pageId") || null,
    contentItemId: str(formData, "contentItemId") || null,
    backlinkEntryId: str(formData, "backlinkEntryId") || null,
    outreachProspectId: str(formData, "outreachProspectId") || null,
  });

  const attachments = formData.getAll("attachmentFile").filter((f): f is File => f instanceof File && f.size > 0);
  for (const attachment of attachments) {
    const uploaded = await uploadTaskFile(attachment, task.id);
    if (uploaded) await store.addTaskFile(task.id, uploaded);
  }

  refresh(projectId);
}

export async function updateTaskDetailsAction(formData: FormData) {
  const taskId = str(formData, "taskId");
  const projectId = str(formData, "projectId");
  if (!taskId || !projectId) return;
  await requireProjectAccess(projectId);

  await store.updateTaskDetails(taskId, {
    title: str(formData, "title"),
    notes: str(formData, "notes"),
    priority: (str(formData, "priority") || "medium") as TaskPriority,
    stageId: str(formData, "stageId") || null,
    dueDate: str(formData, "dueDate") || null,
    status: (str(formData, "status") || "todo") as TaskStatus,
    scheduledFor: str(formData, "scheduledFor") || null,
    checklist: parseChecklistJson(formData),
    completedDate: str(formData, "completedDate") || null,
    assignedTo: str(formData, "assignedTo") || null,
    why: str(formData, "why"),
    expectedOutcome: str(formData, "expectedOutcome"),
    // Only present on the SEO task detail view — undefined here (non-SEO
    // projects) leaves these columns untouched rather than clearing them.
    ...(formData.has("seoModule") ? { seoModule: (str(formData, "seoModule") || null) as SeoModule | null } : {}),
    ...(formData.has("keywordId") ? { keywordId: str(formData, "keywordId") || null } : {}),
    ...(formData.has("pageId") ? { pageId: str(formData, "pageId") || null } : {}),
    ...(formData.has("contentItemId") ? { contentItemId: str(formData, "contentItemId") || null } : {}),
    ...(formData.has("backlinkEntryId") ? { backlinkEntryId: str(formData, "backlinkEntryId") || null } : {}),
    ...(formData.has("outreachProspectId")
      ? { outreachProspectId: str(formData, "outreachProspectId") || null }
      : {}),
  });
  refresh(projectId);
}

export async function updateTaskStatusAction(taskId: string, projectId: string, status: TaskStatus) {
  await requireProjectAccess(projectId);
  await store.updateTaskStatus(taskId, status);
  refresh(projectId);
}

export async function toggleTodayAction(taskId: string, projectId: string, today: string) {
  await requireProjectAccess(projectId);
  await store.toggleToday(taskId, today);
  refresh(projectId);
}

export async function toggleChecklistItemAction(taskId: string, projectId: string, itemId: string) {
  await requireProjectAccess(projectId);
  await store.toggleChecklistItem(taskId, itemId);
  refresh(projectId);
}

export async function deleteTaskAction(taskId: string, projectId: string) {
  await requireProjectAccess(projectId);
  await store.deleteTask(taskId);
  refresh(projectId);
}

export async function addStageAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!projectId || !name) return;
  await requireProjectAccess(projectId);
  await store.addStage(projectId, name);
  refresh(projectId);
}

export async function archiveProjectAction(projectId: string, archived: boolean) {
  await requireProjectAccess(projectId);
  await store.archiveProject(projectId, archived);
  refresh(projectId);
}

export async function deleteProjectAction(
  projectId: string,
  keepFinancialData: boolean,
): Promise<{ ok: false; error: string } | undefined> {
  await requireAdmin();

  try {
    await store.deleteProject(projectId, keepFinancialData);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Something went wrong deleting this project." };
  }

  refresh(projectId);
  revalidatePath("/finance");
  redirect("/projects");
}

export async function updateBusinessProfileAction(formData: FormData) {
  await requireAdmin();
  const logoFile = formData.get("logoFile");
  const uploadedLogoUrl = logoFile instanceof File ? await uploadLogo(logoFile, "company") : null;

  await store.updateBusinessProfile({
    companyName: str(formData, "companyName"),
    logoUrl: uploadedLogoUrl ?? str(formData, "existingLogoUrl"),
  });
  revalidatePath("/settings");
}

export async function addTaskFileAction(formData: FormData) {
  const taskId = str(formData, "taskId");
  const projectId = str(formData, "projectId");
  const file = formData.get("file");
  if (!taskId || !projectId || !(file instanceof File)) return;
  await requireProjectAccess(projectId);

  const uploaded = await uploadTaskFile(file, taskId);
  if (!uploaded) return;

  await store.addTaskFile(taskId, uploaded);
  refresh(projectId);
}

export async function removeTaskFileAction(taskId: string, projectId: string, url: string) {
  await requireProjectAccess(projectId);
  await store.removeTaskFile(taskId, url);
  refresh(projectId);
}

export async function addProjectAttachmentAction(formData: FormData) {
  const projectId = str(formData, "projectId");
  const file = formData.get("file");
  if (!projectId || !(file instanceof File)) return;
  await requireProjectAccess(projectId);

  const uploaded = await uploadProjectAttachment(file, projectId);
  if (!uploaded) return;

  await store.addProjectAttachment(projectId, uploaded);
  revalidatePath(`/projects/${projectId}`);
}

export async function removeProjectAttachmentAction(id: string, projectId: string) {
  await requireProjectAccess(projectId);
  await store.removeProjectAttachment(id);
  revalidatePath(`/projects/${projectId}`);
}

function parseBacklinkLinks(formData: FormData): BacklinkLink[] {
  const raw = str(formData, "links");
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is { url: unknown; label?: unknown } => Boolean(item) && typeof item.url === "string")
      .map((item) => ({ url: String(item.url), label: String(item.label ?? "") }));
  } catch {
    return [];
  }
}

export async function createBacklinkCategoryAction(
  projectId: string,
  name: string,
  categoryType: BacklinkCategoryType = "other",
): Promise<string | null> {
  if (!name.trim()) return null;
  await requireProjectAccess(projectId);
  try {
    const category = await store.createBacklinkCategory(projectId, name, categoryType);
    revalidatePath(`/projects/${projectId}`);
    return category.id;
  } catch {
    return null;
  }
}

export async function updateBacklinkCategoryAction(
  id: string,
  projectId: string,
  patch: { name?: string; categoryType?: BacklinkCategoryType },
) {
  await requireProjectAccess(projectId);
  try {
    await store.updateBacklinkCategory(id, patch);
    revalidatePath(`/projects/${projectId}`);
  } catch {
    // Non-critical: editing a category shouldn't be able to crash the page.
  }
}

export async function deleteBacklinkCategoryAction(id: string, projectId: string) {
  await requireProjectAccess(projectId);
  try {
    await store.deleteBacklinkCategory(id);
    revalidatePath(`/projects/${projectId}`);
  } catch {
    // Non-critical: deleting a category shouldn't be able to crash the page.
  }
}

function backlinkSaveErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("BACKLINKS_SECRET")) {
    return "Can't save a password yet — BACKLINKS_SECRET isn't configured. Ask your admin to set it, or leave the password field blank for now.";
  }
  return "Something went wrong saving this entry. Please try again.";
}

export async function createBacklinkEntryAction(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const projectId = str(formData, "projectId");
  const categoryId = str(formData, "categoryId");
  const name = str(formData, "name");
  if (!projectId || !categoryId || !name) return { ok: false, error: "Missing required fields." };
  await requireProjectAccess(projectId);

  try {
    const entry = await store.createBacklinkEntry({
      categoryId,
      projectId,
      name,
      url: str(formData, "url"),
      username: str(formData, "username"),
      email: str(formData, "email"),
      password: str(formData, "password") || null,
      loginMethod: (str(formData, "loginMethod") || "email") as LoginMethod,
      postsPerMonth: numOrNull(str(formData, "postsPerMonth")),
      status: (str(formData, "status") || "not_started") as BacklinkStatus,
      keywordId: str(formData, "keywordId") || null,
      indexed: boolOrNull(str(formData, "indexed")),
      listedOn: str(formData, "listedOn") || null,
      files: [],
      notes: str(formData, "notes"),
      links: parseBacklinkLinks(formData),
    });

    const attachments = formData.getAll("attachmentFile").filter((f): f is File => f instanceof File && f.size > 0);
    for (const attachment of attachments) {
      const uploaded = await uploadBacklinkFile(attachment, entry.id);
      if (uploaded) await store.addBacklinkFile(entry.id, uploaded);
    }

    revalidatePath(`/projects/${projectId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: backlinkSaveErrorMessage(error) };
  }
}

export async function updateBacklinkEntryAction(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = str(formData, "id");
  const projectId = str(formData, "projectId");
  if (!id || !projectId) return { ok: false, error: "Missing required fields." };
  await requireProjectAccess(projectId);

  try {
    await store.updateBacklinkEntry(id, {
      name: str(formData, "name"),
      url: str(formData, "url"),
      username: str(formData, "username"),
      email: str(formData, "email"),
      password: str(formData, "password") || undefined,
      clearPassword: formData.get("clearPassword") === "true",
      loginMethod: (str(formData, "loginMethod") || "email") as LoginMethod,
      postsPerMonth: numOrNull(str(formData, "postsPerMonth")),
      status: (str(formData, "status") || "not_started") as BacklinkStatus,
      keywordId: str(formData, "keywordId") || null,
      indexed: boolOrNull(str(formData, "indexed")),
      listedOn: str(formData, "listedOn") || null,
      notes: str(formData, "notes"),
      links: parseBacklinkLinks(formData),
    });

    const attachments = formData.getAll("attachmentFile").filter((f): f is File => f instanceof File && f.size > 0);
    for (const attachment of attachments) {
      const uploaded = await uploadBacklinkFile(attachment, id);
      if (uploaded) await store.addBacklinkFile(id, uploaded);
    }

    revalidatePath(`/projects/${projectId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: backlinkSaveErrorMessage(error) };
  }
}

export async function deleteBacklinkEntryAction(id: string, projectId: string) {
  await requireProjectAccess(projectId);
  try {
    await store.deleteBacklinkEntry(id);
    revalidatePath(`/projects/${projectId}`);
  } catch {
    // Non-critical: deleting an entry shouldn't be able to crash the page.
  }
}

export async function revealBacklinkPasswordAction(
  entryId: string,
  projectId: string,
  vaultPassword: string,
): Promise<
  | { ok: true; password: string }
  | { ok: false; reason: "no_vault_password" | "wrong_password" | "no_password_set" | "no_permission" | "error" }
> {
  let profile;
  try {
    profile = await requireBacklinkCredentialAccess(projectId);
  } catch {
    return { ok: false, reason: "no_permission" };
  }
  try {
    const password = await store.revealBacklinkPassword(entryId, profile.id, vaultPassword);
    return { ok: true, password };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "NO_VAULT_PASSWORD") return { ok: false, reason: "no_vault_password" };
    if (message === "WRONG_VAULT_PASSWORD") return { ok: false, reason: "wrong_password" };
    if (message === "NO_PASSWORD_SET") return { ok: false, reason: "no_password_set" };
    return { ok: false, reason: "error" };
  }
}

export async function setVaultPasswordAction(
  newPassword: string,
  currentPassword: string | null,
): Promise<{ ok: true } | { ok: false; reason: "wrong_current_password" | "too_short" | "error" }> {
  if (newPassword.length < 6) return { ok: false, reason: "too_short" };
  const profile = await requireProfile();
  try {
    await store.setVaultPassword(profile.id, newPassword, currentPassword);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "WRONG_VAULT_PASSWORD") return { ok: false, reason: "wrong_current_password" };
    return { ok: false, reason: "error" };
  }
}

export async function enableSharingAction(projectId: string): Promise<string> {
  await requireProjectAccess(projectId);
  const token = await store.getOrCreateShareToken(projectId);
  refresh(projectId);
  return token;
}

export async function regenerateShareTokenAction(projectId: string): Promise<string> {
  await requireProjectAccess(projectId);
  const token = await store.regenerateShareToken(projectId);
  refresh(projectId);
  return token;
}

export async function disableSharingAction(projectId: string) {
  await requireProjectAccess(projectId);
  await store.disableSharing(projectId);
  refresh(projectId);
}

/**
 * Admin-only team management. Team members are real Supabase Auth accounts
 * (created via the service-role admin API) with a role + optional per-project
 * assignments — see lib/auth.ts for how access is enforced.
 */
function inviteTeamMemberErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.toLowerCase().includes("already") || message.toLowerCase().includes("registered")) {
    return "A team member with that email already exists.";
  }
  if (message.toLowerCase().includes("password")) {
    return message;
  }
  return message || "Something went wrong inviting this team member. Please try again.";
}

export async function inviteTeamMemberAction(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();

  const email = str(formData, "email");
  const password = str(formData, "password");
  const name = str(formData, "name");
  const role = (str(formData, "role") || "member") as Role;
  if (!email || !password) return { ok: false, error: "Email and password are required." };

  try {
    await store.inviteTeamMember({ email, password, name, role });
    revalidatePath("/admin");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: inviteTeamMemberErrorMessage(error) };
  }
}

export async function updateMemberRoleAction(userId: string, role: Role) {
  await requireAdmin();
  await store.updateMemberRole(userId, role);
  revalidatePath("/admin");
}

export async function setMemberRenewalsAccessAction(userId: string, allowed: boolean) {
  await requireAdmin();
  await store.setMemberRenewalsAccess(userId, allowed);
  revalidatePath("/admin");
}

export async function setMemberBacklinkCredentialAccessAction(userId: string, allowed: boolean) {
  await requireAdmin();
  await store.setMemberBacklinkCredentialAccess(userId, allowed);
  revalidatePath("/admin");
}

export async function setMemberFinanceAccessAction(userId: string, allowed: boolean) {
  await requireAdmin();
  await store.setMemberFinanceAccess(userId, allowed);
  revalidatePath("/admin");
}

export async function assignProjectsAction(formData: FormData) {
  await requireAdmin();

  const userId = str(formData, "userId");
  if (!userId) return;

  const projectIds = formData.getAll("projectIds").map(String);
  await store.setMemberAssignments(userId, projectIds);
  revalidatePath("/admin");
}

export async function removeMemberAction(userId: string) {
  await requireAdmin();
  await store.removeMember(userId);
  revalidatePath("/admin");
}

/**
 * Billing. Kept admin-only since payment plans and the payment ledger are
 * financial data, unlike ordinary task/project management which members can
 * be given access to.
 */
export async function setPaymentPlanAction(formData: FormData) {
  await requireAdmin();

  const projectId = str(formData, "projectId");
  if (!projectId) return;

  const planType = (str(formData, "planType") || "monthly_fixed") as PaymentPlanType;
  const amount = Number(str(formData, "amount")) || 0;
  const currency = str(formData, "currency") || "PKR";
  const notes = str(formData, "notes");

  await store.setPaymentPlan(projectId, { planType, amount, currency, notes });
  refresh(projectId);
  revalidatePath("/finance");
}

export async function addPaymentAction(formData: FormData) {
  await requireAdmin();

  const projectId = str(formData, "projectId");
  const amount = Number(str(formData, "amount"));
  if (!projectId || !amount) return;

  const currency = str(formData, "currency") || "PKR";
  const kind = (str(formData, "kind") || "installment") as PaymentKind;
  const period = str(formData, "period") || null;
  const note = str(formData, "note");
  const paidOn = str(formData, "paidOn") || store.todayDateKey();

  await store.addPayment({ projectId, amount, currency, kind, period, note, paidOn });
  refresh(projectId);
  revalidatePath("/finance");
}

export async function deletePaymentAction(id: string, projectId: string) {
  await requireAdmin();
  await store.deletePayment(id);
  refresh(projectId);
  revalidatePath("/finance");
}

export async function deletePaymentPlanAction(formData: FormData) {
  await requireAdmin();

  const projectId = str(formData, "projectId");
  const currency = str(formData, "currency");
  if (!projectId || !currency) return;

  await store.deletePaymentPlan(projectId, currency);
  refresh(projectId);
  revalidatePath("/finance");
}

/* ------------------------------------------------------------------ */
/* Phase 4: Services, Client Services, Invoices                        */
/* ------------------------------------------------------------------ */

export async function createServiceAction(formData: FormData) {
  await requireAdmin();

  const name = str(formData, "name");
  if (!name) return;

  await store.createService({
    name,
    description: str(formData, "description"),
    price: Number(str(formData, "price")) || 0,
    currency: str(formData, "currency") || "PKR",
    billingFrequency: (str(formData, "billingFrequency") || "monthly") as BillingFrequency,
  });
  revalidatePath("/services");
}

export async function updateServiceAction(
  id: string,
  patch: Parameters<typeof store.updateService>[1],
) {
  await requireAdmin();
  await store.updateService(id, patch);
  revalidatePath("/services");
}

export async function deleteServiceAction(id: string) {
  await requireAdmin();
  await store.deleteService(id);
  revalidatePath("/services");
}

export async function createClientServiceAction(formData: FormData) {
  const clientId = str(formData, "clientId");
  const serviceId = str(formData, "serviceId");
  if (!clientId || !serviceId) return;
  await requireFinanceAccess();

  const priceOverrideStr = str(formData, "priceOverride");
  await store.createClientService({
    clientId,
    serviceId,
    projectId: str(formData, "projectId") || null,
    priceOverride: priceOverrideStr ? Number(priceOverrideStr) : null,
    currency: str(formData, "currency") || "PKR",
    billingFrequency: (str(formData, "billingFrequency") || "monthly") as BillingFrequency,
    nextInvoiceDate: str(formData, "nextInvoiceDate") || null,
    notes: str(formData, "notes"),
  });
  revalidatePath(`/clients/${clientId}`);
}

export async function updateClientServiceAction(
  id: string,
  clientId: string,
  patch: Parameters<typeof store.updateClientService>[1],
) {
  await requireFinanceAccess();
  await store.updateClientService(id, patch);
  revalidatePath(`/clients/${clientId}`);
}

export async function deleteClientServiceAction(id: string, clientId: string) {
  await requireFinanceAccess();
  await store.deleteClientService(id);
  revalidatePath(`/clients/${clientId}`);
}

interface RawInvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

function parseInvoiceItems(raw: string): RawInvoiceItem[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        description: String(item?.description ?? "").trim(),
        quantity: Number(item?.quantity) || 0,
        unitPrice: Number(item?.unitPrice) || 0,
      }))
      .filter((item) => item.description);
  } catch {
    return [];
  }
}

export async function createInvoiceAction(formData: FormData): Promise<string | undefined> {
  const clientId = str(formData, "clientId");
  if (!clientId) return;
  await requireFinanceAccess();

  const items = parseInvoiceItems(str(formData, "items"));
  const invoice = await store.createInvoice({
    clientId,
    projectId: str(formData, "projectId") || null,
    clientServiceId: str(formData, "clientServiceId") || null,
    seoReportId: str(formData, "seoReportId") || null,
    currency: str(formData, "currency") || "PKR",
    issueDate: str(formData, "issueDate") || store.todayDateKey(),
    dueDate: str(formData, "dueDate") || store.todayDateKey(),
    status: (str(formData, "status") || "draft") as InvoiceStatus,
    notes: str(formData, "notes"),
    items,
  });
  revalidatePath("/invoices");
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/finance");
  return invoice.id;
}

export async function updateInvoiceAction(id: string, clientId: string, formData: FormData) {
  await requireFinanceAccess();

  const items = parseInvoiceItems(str(formData, "items"));
  await store.updateInvoice(id, {
    projectId: str(formData, "projectId") || null,
    seoReportId: str(formData, "seoReportId") || null,
    currency: str(formData, "currency") || "PKR",
    issueDate: str(formData, "issueDate") || store.todayDateKey(),
    dueDate: str(formData, "dueDate") || store.todayDateKey(),
    notes: str(formData, "notes"),
  });
  await store.replaceInvoiceItems(id, items);
  await store.recomputeInvoiceStatus(id);
  revalidatePath(`/invoices/${id}`);
  revalidatePath("/invoices");
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/finance");
}

export async function setInvoiceStatusAction(id: string, clientId: string, status: InvoiceStatus) {
  await requireFinanceAccess();
  await store.updateInvoice(id, { status });
  revalidatePath(`/invoices/${id}`);
  revalidatePath("/invoices");
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/finance");
}

export async function deleteInvoiceAction(id: string, clientId: string) {
  await requireFinanceAccess();
  await store.deleteInvoice(id);
  revalidatePath("/invoices");
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/finance");
}

export async function addInvoicePaymentAction(formData: FormData) {
  const invoiceId = str(formData, "invoiceId");
  const clientId = str(formData, "clientId");
  const amount = Number(str(formData, "amount"));
  if (!invoiceId || !amount) return;
  await requireFinanceAccess();

  const currency = str(formData, "currency") || "PKR";
  const note = str(formData, "note");
  const paidOn = str(formData, "paidOn") || store.todayDateKey();

  await store.addPayment({
    projectId: null,
    invoiceId,
    amount,
    currency,
    kind: "installment",
    period: null,
    note,
    paidOn,
  });
  await store.recomputeInvoiceStatus(invoiceId);
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  if (clientId) revalidatePath(`/clients/${clientId}`);
  revalidatePath("/finance");
}

export async function deleteInvoicePaymentAction(paymentId: string, invoiceId: string, clientId: string) {
  await requireFinanceAccess();
  await store.deletePayment(paymentId);
  await store.recomputeInvoiceStatus(invoiceId);
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  if (clientId) revalidatePath(`/clients/${clientId}`);
  revalidatePath("/finance");
}

/** Generates draft invoices for every due recurring client_service. Never sends — drafts always need manual review. */
export async function generateDueInvoiceDraftsAction(): Promise<number> {
  await requireFinanceAccess();
  const created = await store.generateDueInvoiceDrafts();
  revalidatePath("/invoices");
  revalidatePath("/finance");
  return created.length;
}

export async function createKeywordAction(formData: FormData) {
  const projectId = str(formData, "projectId");
  const keyword = str(formData, "keyword");
  if (!projectId || !keyword) return;
  await requireProjectAccess(projectId);

  const created = await store.createKeyword({
    projectId,
    keyword,
    // targetPage is frozen (see decisions) — new keywords no longer collect
    // it; pageId below (via pageIds) is the live relationship.
    targetPage: "",
    searchVolume: numOrNull(str(formData, "searchVolume")),
    difficulty: numOrNull(str(formData, "difficulty")),
    currentRank: numOrNull(str(formData, "currentRank")),
    targetRank: numOrNull(str(formData, "targetRank")),
    status: (str(formData, "status") || "not_started") as KeywordStatus,
    notes: str(formData, "notes"),
    searchIntent: (str(formData, "searchIntent") || null) as SearchIntent | null,
    priority: (str(formData, "priority") || "medium") as Priority,
  });

  const pageId = str(formData, "pageId");
  if (pageId && !created.pageIds.includes(pageId)) {
    try {
      await store.addKeywordToPage(created.id, pageId);
    } catch {
      // Non-critical: the keyword itself was created fine even if this assignment failed.
    }
  }

  revalidatePath(`/projects/${projectId}`);
}

export async function updateKeywordAction(formData: FormData) {
  const id = str(formData, "id");
  const projectId = str(formData, "projectId");
  if (!id || !projectId) return;
  await requireProjectAccess(projectId);

  await store.updateKeyword(id, {
    keyword: str(formData, "keyword"),
    // targetPage is frozen — store.updateKeyword ignores it even if sent.
    searchVolume: numOrNull(str(formData, "searchVolume")),
    difficulty: numOrNull(str(formData, "difficulty")),
    currentRank: numOrNull(str(formData, "currentRank")),
    targetRank: numOrNull(str(formData, "targetRank")),
    status: (str(formData, "status") || "not_started") as KeywordStatus,
    notes: str(formData, "notes"),
    searchIntent: (str(formData, "searchIntent") || null) as SearchIntent | null,
    priority: (str(formData, "priority") || "medium") as Priority,
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteKeywordAction(id: string, projectId: string) {
  await requireProjectAccess(projectId);
  await store.deleteKeyword(id);
  revalidatePath(`/projects/${projectId}`);
}

export async function importKeywordsAction(
  projectId: string,
  rows: store.KeywordImportRow[],
): Promise<number> {
  await requireProjectAccess(projectId);
  const count = await store.createKeywordsBulk(projectId, rows);
  revalidatePath(`/projects/${projectId}`);
  return count;
}

export async function setKeywordTrackedAction(id: string, projectId: string, isTracked: boolean) {
  await requireProjectAccess(projectId);
  await store.setKeywordTracked(id, isTracked);
  revalidatePath(`/projects/${projectId}`);
}

export async function setMonthlyPositionAction(
  keywordId: string,
  projectId: string,
  month: string,
  rank: number | null,
) {
  await requireProjectAccess(projectId);
  await store.setMonthlyPosition(keywordId, month, rank);
  revalidatePath(`/projects/${projectId}`);
}

export async function addKeywordToPageAction(keywordId: string, projectId: string, pageId: string) {
  await requireProjectAccess(projectId);
  try {
    await store.addKeywordToPage(keywordId, pageId);
    revalidatePath(`/projects/${projectId}`);
  } catch {
    // Non-critical: assigning a keyword to a page shouldn't be able to crash the page.
  }
}

export async function removeKeywordFromPageAction(keywordId: string, projectId: string, pageId: string) {
  await requireProjectAccess(projectId);
  try {
    await store.removeKeywordFromPage(keywordId, pageId);
    revalidatePath(`/projects/${projectId}`);
  } catch {
    // Non-critical: unassigning a keyword from a page shouldn't be able to crash the page.
  }
}

export async function bulkAssignKeywordsToPageAction(keywordIds: string[], projectId: string, pageId: string) {
  await requireProjectAccess(projectId);
  await Promise.all(
    keywordIds.map((keywordId) =>
      store.addKeywordToPage(keywordId, pageId).catch(() => {
        // Non-critical: one failed assignment shouldn't stop the rest of the bulk action.
      }),
    ),
  );
  revalidatePath(`/projects/${projectId}`);
}

export async function bulkRemoveKeywordsFromPageAction(keywordIds: string[], projectId: string, pageId: string) {
  await requireProjectAccess(projectId);
  await Promise.all(
    keywordIds.map((keywordId) =>
      store.removeKeywordFromPage(keywordId, pageId).catch(() => {
        // Non-critical: one failed removal shouldn't stop the rest of the bulk action.
      }),
    ),
  );
  revalidatePath(`/projects/${projectId}`);
}

export async function bulkDeleteKeywordsAction(keywordIds: string[], projectId: string) {
  await requireProjectAccess(projectId);
  await Promise.all(
    keywordIds.map((keywordId) =>
      store.deleteKeyword(keywordId).catch(() => {
        // Non-critical: one failed deletion shouldn't stop the rest of the bulk action.
      }),
    ),
  );
  revalidatePath(`/projects/${projectId}`);
}

export async function createKeywordGroupAction(projectId: string, name: string, color: KeywordGroupColor) {
  if (!name.trim()) return;
  await requireProjectAccess(projectId);
  try {
    await store.createKeywordGroup({ projectId, name, color });
    revalidatePath(`/projects/${projectId}`);
  } catch {
    // Non-critical: creating a group shouldn't be able to crash the page.
  }
}

export async function updateKeywordGroupAction(
  id: string,
  projectId: string,
  patch: { name?: string; color?: KeywordGroupColor },
) {
  await requireProjectAccess(projectId);
  try {
    await store.updateKeywordGroup(id, patch);
    revalidatePath(`/projects/${projectId}`);
  } catch {
    // Non-critical: renaming a group shouldn't be able to crash the page.
  }
}

export async function deleteKeywordGroupAction(id: string, projectId: string) {
  await requireProjectAccess(projectId);
  try {
    await store.deleteKeywordGroup(id);
    revalidatePath(`/projects/${projectId}`);
  } catch {
    // Non-critical: deleting a group shouldn't be able to crash the page.
  }
}

export async function createKeywordPageAction(groupId: string, projectId: string, name: string, url: string) {
  if (!name.trim()) return;
  await requireProjectAccess(projectId);
  try {
    await store.createKeywordPage({ groupId, name, url });
    revalidatePath(`/projects/${projectId}`);
  } catch {
    // Non-critical: creating a page shouldn't be able to crash the page.
  }
}

export async function updateKeywordPageAction(
  id: string,
  projectId: string,
  patch: Parameters<typeof store.updateKeywordPage>[1],
) {
  await requireProjectAccess(projectId);
  try {
    await store.updateKeywordPage(id, patch);
    revalidatePath(`/projects/${projectId}`);
  } catch {
    // Non-critical: editing a page shouldn't be able to crash the page.
  }
}

export async function deleteKeywordPageAction(id: string, projectId: string) {
  await requireProjectAccess(projectId);
  try {
    await store.deleteKeywordPage(id);
    revalidatePath(`/projects/${projectId}`);
  } catch {
    // Non-critical: deleting a page shouldn't be able to crash the page.
  }
}

export async function setPrimaryKeywordForPageAction(pageId: string, projectId: string, keywordId: string | null) {
  await requireProjectAccess(projectId);
  try {
    await store.setPrimaryKeywordForPage(pageId, keywordId);
    revalidatePath(`/projects/${projectId}`);
  } catch {
    // Non-critical: setting a primary keyword shouldn't be able to crash the page.
  }
}

export async function createTechnicalIssueAction(formData: FormData) {
  const projectId = str(formData, "projectId");
  const title = str(formData, "title");
  if (!projectId || !title) return;
  await requireProjectAccess(projectId);

  await store.createTechnicalIssue({
    projectId,
    title,
    description: str(formData, "description"),
    urlAffected: str(formData, "urlAffected"),
    priority: (str(formData, "priority") || "medium") as Priority,
    assignedTo: str(formData, "assignedTo") || null,
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function updateTechnicalIssueAction(id: string, projectId: string, formData: FormData) {
  await requireProjectAccess(projectId);
  await store.updateTechnicalIssue(id, {
    title: str(formData, "title"),
    description: str(formData, "description"),
    urlAffected: str(formData, "urlAffected"),
    priority: (str(formData, "priority") || "medium") as Priority,
    assignedTo: str(formData, "assignedTo") || null,
    status: (str(formData, "status") || "open") as TechnicalIssueStatus,
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function createFixTaskForIssueAction(issueId: string, projectId: string) {
  await requireProjectAccess(projectId);
  const issues = await store.listTechnicalIssues(projectId);
  const issue = issues.find((i) => i.id === issueId);
  if (!issue) return;

  const task = await store.createTask({
    projectId,
    stageId: null,
    title: `Fix: ${issue.title}`,
    priority: issue.priority,
    seoModule: "technical",
  });
  await store.updateTechnicalIssue(issueId, { fixTaskId: task.id, status: "in_progress" });
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteTechnicalIssueAction(id: string, projectId: string) {
  await requireProjectAccess(projectId);
  await store.deleteTechnicalIssue(id);
  revalidatePath(`/projects/${projectId}`);
}

export async function createContentItemAction(formData: FormData) {
  const projectId = str(formData, "projectId");
  const topic = str(formData, "topic");
  if (!projectId || !topic) return;
  await requireProjectAccess(projectId);

  await store.createContentItem({
    projectId,
    topic,
    targetKeywordId: str(formData, "targetKeywordId") || null,
    assignedTo: str(formData, "assignedTo") || null,
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function updateContentItemAction(
  id: string,
  projectId: string,
  patch: Parameters<typeof store.updateContentItem>[1],
) {
  await requireProjectAccess(projectId);
  await store.updateContentItem(id, patch);
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteContentItemAction(id: string, projectId: string) {
  await requireProjectAccess(projectId);
  await store.deleteContentItem(id);
  revalidatePath(`/projects/${projectId}`);
}

export async function generateSeoReportAction(
  projectId: string,
  period: string,
  periodType: ReportPeriodType = "monthly",
) {
  const profile = await requireProjectAccess(projectId);
  const report = await store.getOrCreateSeoReport(projectId, period, profile.id, periodType);

  // Only seed content the first time — regenerating never overwrites what a human has since edited.
  if (!report.summary && !report.completedWork && !report.metricsNotes) {
    const draft = await store.buildSeoReportDraft(projectId, period, periodType);

    const completedWorkLines: string[] = [];
    if (draft.completedTaskTitles.length > 0) {
      completedWorkLines.push("Completed this period:");
      for (const title of draft.completedTaskTitles) completedWorkLines.push(`- ${title}`);
    }
    if (draft.rankMovements.length > 0) {
      completedWorkLines.push("", "Keyword movement:");
      for (const m of draft.rankMovements) {
        completedWorkLines.push(`- ${m.keyword}: ${m.from ?? "unranked"} -> ${m.to ?? "unranked"}`);
      }
    }

    const metricsLines = [
      `Keywords tracked: ${draft.metrics.keywordsTracked} (improved ${draft.metrics.keywordsImproved}, dropped ${draft.metrics.keywordsDropped})`,
      `Backlinks: ${draft.metrics.backlinksCreated} created, ${draft.metrics.backlinksLive} live`,
      `Content published: ${draft.metrics.contentPublished}`,
      `Technical fixes: ${draft.metrics.technicalFixed}`,
    ];

    await store.updateSeoReport(report.id, {
      summary: `SEO activity summary for ${period}.`,
      completedWork: completedWorkLines.join("\n"),
      metricsNotes: metricsLines.join("\n"),
    });
  }
  revalidatePath(`/projects/${projectId}`);
}

export async function updateSeoReportAction(
  id: string,
  projectId: string,
  patch: Parameters<typeof store.updateSeoReport>[1],
) {
  await requireProjectAccess(projectId);
  await store.updateSeoReport(id, patch);
  revalidatePath(`/projects/${projectId}`);
}

/** Approve step ahead of attaching a report to an invoice: Generate -> Edit -> Approve -> Attach. Approving never locks the content — every field stays editable afterward. */
export async function approveSeoReportAction(id: string, projectId: string) {
  await requireProjectAccess(projectId);
  await store.updateSeoReport(id, { approved: true });
  revalidatePath(`/projects/${projectId}`);
}

export async function setReportPreferencesAction(
  projectId: string,
  patch: Parameters<typeof store.setReportPreferences>[1],
) {
  await requireProjectAccess(projectId);
  await store.setReportPreferences(projectId, patch);
  revalidatePath(`/projects/${projectId}`);
}

export async function createOutreachProspectAction(formData: FormData) {
  const projectId = str(formData, "projectId");
  const website = str(formData, "website");
  if (!projectId || !website) return;
  await requireProjectAccess(projectId);

  await store.createOutreachProspect({
    projectId,
    website,
    contactPerson: str(formData, "contactPerson"),
    contactEmail: str(formData, "contactEmail"),
    drDa: numOrNull(str(formData, "drDa")),
    price: numOrNull(str(formData, "price")),
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function updateOutreachProspectAction(
  id: string,
  projectId: string,
  patch: Parameters<typeof store.updateOutreachProspect>[1],
) {
  await requireProjectAccess(projectId);
  await store.updateOutreachProspect(id, patch);
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteOutreachProspectAction(id: string, projectId: string) {
  await requireProjectAccess(projectId);
  await store.deleteOutreachProspect(id);
  revalidatePath(`/projects/${projectId}`);
}

export async function createFollowUpTaskForProspectAction(prospectId: string, projectId: string) {
  await requireProjectAccess(projectId);
  const prospects = await store.listOutreachProspects(projectId);
  const prospect = prospects.find((p) => p.id === prospectId);
  if (!prospect) return;

  await store.createTask({
    projectId,
    stageId: null,
    title: `Follow up: ${prospect.website}`,
    seoModule: "off_page",
    outreachProspectId: prospect.id,
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function createCompetitorBacklinkAction(formData: FormData) {
  const projectId = str(formData, "projectId");
  const competitorUrl = str(formData, "competitorUrl");
  if (!projectId || !competitorUrl) return;
  await requireProjectAccess(projectId);

  await store.createCompetitorBacklink({
    projectId,
    competitorUrl,
    sourceBacklinkUrl: str(formData, "sourceBacklinkUrl"),
    opportunityNotes: str(formData, "opportunityNotes"),
    targetPageId: str(formData, "targetPageId") || null,
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function updateCompetitorBacklinkAction(
  id: string,
  projectId: string,
  patch: Parameters<typeof store.updateCompetitorBacklink>[1],
) {
  await requireProjectAccess(projectId);
  await store.updateCompetitorBacklink(id, patch);
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteCompetitorBacklinkAction(id: string, projectId: string) {
  await requireProjectAccess(projectId);
  await store.deleteCompetitorBacklink(id);
  revalidatePath(`/projects/${projectId}`);
}

export async function saveBacklinksAsTemplateAction(projectId: string, name: string) {
  if (!name.trim()) return;
  const profile = await requireProjectAccess(projectId);
  await store.saveBacklinksAsTemplate(projectId, name, profile.id);
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteBacklinkTemplateAction(id: string) {
  await requireAdmin();
  await store.deleteBacklinkTemplate(id);
}

export async function importBacklinkTemplateItemsAction(projectId: string, itemIds: string[]): Promise<number> {
  await requireProjectAccess(projectId);
  const count = await store.importBacklinkTemplateItems(projectId, itemIds);
  revalidatePath(`/projects/${projectId}`);
  return count;
}

/**
 * Public, unauthenticated actions reachable from /share/[token]. These never trust a
 * client-supplied projectId — the project is always resolved strictly from the share
 * token itself, so a link only ever grants access to the one project it was created
 * for, and a disabled/regenerated link (null or different token) grants nothing.
 */
export async function createClientTaskAction(formData: FormData) {
  const token = str(formData, "shareToken");
  const title = str(formData, "title");
  if (!token || !title) return;

  const project = await store.getProjectByShareToken(token);
  if (!project) return;

  const stageId = str(formData, "stageId") || null;
  const notes = str(formData, "notes");

  const task = await store.createTask({
    projectId: project.id,
    stageId,
    title,
    notes,
  });

  const attachments = formData.getAll("attachmentFile").filter((f): f is File => f instanceof File && f.size > 0);
  for (const attachment of attachments) {
    const uploaded = await uploadTaskFile(attachment, `client-${task.id}`);
    if (uploaded) await store.addTaskFile(task.id, uploaded);
  }

  revalidatePath(`/share/${token}`);
  refresh(project.id);
  return task.id;
}

export async function addClientTaskFileAction(formData: FormData) {
  const token = str(formData, "shareToken");
  const taskId = str(formData, "taskId");
  const file = formData.get("file");
  if (!token || !taskId || !(file instanceof File)) return;

  const project = await store.getProjectByShareToken(token);
  if (!project) return;

  const tasks = await store.getTasksByProject(project.id);
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return;

  const uploaded = await uploadTaskFile(file, `client-${taskId}`);
  if (!uploaded) return;

  await store.addTaskFile(taskId, uploaded);
  revalidatePath(`/share/${token}`);
  refresh(project.id);
}

/**
 * Domain reselling. Admin-only, same as Finance — this is business inventory, not
 * ordinary project/task management members should touch. Actions that talk to
 * Dynadot return a typed {ok,error} result instead of throwing, since a reseller
 * API call failing (bad key, domain not in that account, rate limit, etc.) should
 * surface as an inline message, not crash the page.
 */

function refreshDomains() {
  revalidatePath("/domains");
}

function domainActionErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message === "NO_DYNADOT_KEY") {
    return "No Dynadot API key is saved yet. Add one in Domains → Settings first.";
  }
  return message || "Something went wrong talking to Dynadot. Please try again.";
}

export async function createDomainClientAction(
  formData: FormData,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await requireAdmin();
  const name = str(formData, "name");
  if (!name) return { ok: false, error: "Name is required." };

  const client = await store.createDomainClient({
    name,
    email: str(formData, "email"),
    phone: str(formData, "phone"),
    notes: str(formData, "notes"),
  });
  refreshDomains();
  return { ok: true, id: client.id };
}

export async function updateDomainClientAction(id: string, formData: FormData) {
  await requireAdmin();
  await store.updateDomainClient(id, {
    name: str(formData, "name"),
    email: str(formData, "email"),
    phone: str(formData, "phone"),
    notes: str(formData, "notes"),
  });
  refreshDomains();
}

export async function deleteDomainClientAction(id: string) {
  await requireAdmin();
  await store.deleteDomainClient(id);
  refreshDomains();
}

export async function createDomainAction(
  formData: FormData,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await requireAdmin();
  const name = str(formData, "name").toLowerCase();
  if (!name) return { ok: false, error: "Domain name is required." };

  try {
    const domain = await store.createDomain({
      name,
      domainClientId: str(formData, "domainClientId") || null,
      registrar: str(formData, "registrar") || "Dynadot",
      status: (str(formData, "status") || "available") as ResaleDomainStatus,
      purchasePrice: numOrNull(str(formData, "purchasePrice")),
      sellingPrice: numOrNull(str(formData, "sellingPrice")),
      expiryDate: str(formData, "expiryDate") || null,
      autoRenew: formData.get("autoRenew") === "on",
      notes: str(formData, "notes"),
    });
    refreshDomains();
    return { ok: true, id: domain.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("duplicate key")) return { ok: false, error: "That domain is already in your inventory." };
    return { ok: false, error: "Something went wrong saving this domain. Please try again." };
  }
}

export async function updateDomainAction(id: string, formData: FormData) {
  await requireAdmin();
  await store.updateDomain(id, {
    domainClientId: str(formData, "domainClientId") || null,
    registrar: str(formData, "registrar") || undefined,
    status: (str(formData, "status") || undefined) as ResaleDomainStatus | undefined,
    purchasePrice: numOrNull(str(formData, "purchasePrice")),
    sellingPrice: numOrNull(str(formData, "sellingPrice")),
    expiryDate: str(formData, "expiryDate") || null,
    autoRenew: formData.get("autoRenew") === "on",
    notes: str(formData, "notes"),
  });
  refreshDomains();
}

export async function deleteDomainAction(id: string) {
  await requireAdmin();
  await store.deleteDomain(id);
  refreshDomains();
}

/**
 * Toggles the lock on Dynadot first (if a key is saved and the domain's registrar
 * looks like Dynadot), then persists locally only once that succeeds — so the app
 * never shows a domain as locked/unlocked when the registrar-side call failed.
 * If no Dynadot key is configured, this just records the flag locally.
 */
export async function setDomainLockedAction(
  id: string,
  domainName: string,
  registrar: string,
  locked: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  try {
    if (registrar.toLowerCase().includes("dynadot")) {
      const { getDomainSettings } = store;
      const settings = await getDomainSettings();
      if (settings.dynadotApiKeyEncrypted) {
        const { lockDynadotDomain, unlockDynadotDomain } = await import("./dynadot");
        if (locked) await lockDynadotDomain(domainName);
        else await unlockDynadotDomain(domainName);
      }
    }
    await store.setDomainLocked(id, locked);
    refreshDomains();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: domainActionErrorMessage(error) };
  }
}

export async function listDomainDnsRecordsAction(domainId: string) {
  return store.listDomainDnsRecords(domainId);
}

export async function createDomainDnsRecordAction(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const domainId = str(formData, "domainId");
  const value = str(formData, "value");
  if (!domainId || !value) return { ok: false, error: "A value is required." };

  await store.createDomainDnsRecord({
    domainId,
    recordType: (str(formData, "recordType") || "A") as DnsRecordType,
    host: str(formData, "host") || "@",
    value,
    priority: numOrNull(str(formData, "priority")),
    ttl: numOrNull(str(formData, "ttl")),
  });
  refreshDomains();
  return { ok: true };
}

export async function updateDomainDnsRecordAction(id: string, domainId: string, formData: FormData) {
  await requireAdmin();
  await store.updateDomainDnsRecord(id, {
    recordType: (str(formData, "recordType") || undefined) as DnsRecordType | undefined,
    host: str(formData, "host") || undefined,
    value: str(formData, "value") || undefined,
    priority: numOrNull(str(formData, "priority")),
    ttl: numOrNull(str(formData, "ttl")),
  });
  refreshDomains();
}

export async function deleteDomainDnsRecordAction(id: string) {
  await requireAdmin();
  await store.deleteDomainDnsRecord(id);
  refreshDomains();
}

/**
 * Pushes this domain's locally-saved DNS records to Dynadot, replacing whatever
 * is currently set there (set_dns2 is a full replace, not incremental — see
 * lib/dynadot.ts). Only meaningful for domains actually registered at Dynadot.
 */
export async function pushDomainDnsToDynadotAction(
  domainId: string,
  domainName: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  try {
    const records = await store.listDomainDnsRecords(domainId);
    const { setDynadotDnsRecords } = await import("./dynadot");
    await setDynadotDnsRecords(
      domainName,
      records.map((r) => ({ host: r.host, recordType: r.recordType, value: r.value })),
    );
    return { ok: true };
  } catch (error) {
    return { ok: false, error: domainActionErrorMessage(error) };
  }
}

export async function syncDomainFromDynadotAction(
  domainId: string,
  domainName: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  try {
    const { getDynadotDomainInfo } = await import("./dynadot");
    const info = await getDynadotDomainInfo(domainName);
    await store.applyDynadotSync(domainId, {
      expiryDate: info.expiration,
      locked: info.locked,
      autoRenew: info.autoRenew,
      nameservers: info.nameservers,
    });
    refreshDomains();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: domainActionErrorMessage(error) };
  }
}

/**
 * Pulls the full domain list from Dynadot and creates any domain this app
 * doesn't already have (matched by name), so a wholesaler's whole Dynadot
 * portfolio can be imported in one click instead of typing each one in.
 * Existing domains are left as-is here; use syncDomainFromDynadotAction to
 * refresh one that's already in the inventory.
 */
export async function importDomainsFromDynadotAction(): Promise<
  { ok: true; added: number } | { ok: false; error: string }
> {
  await requireAdmin();
  try {
    const { listDynadotDomains } = await import("./dynadot");
    const [remoteNames, existing] = await Promise.all([listDynadotDomains(), store.listDomains()]);
    const existingNames = new Set(existing.map((d) => d.name.toLowerCase()));
    const toAdd = remoteNames.filter((name) => !existingNames.has(name.toLowerCase()));

    for (const name of toAdd) {
      await store.createDomain({
        name: name.toLowerCase(),
        domainClientId: null,
        registrar: "Dynadot",
        status: "available",
        purchasePrice: null,
        sellingPrice: null,
        expiryDate: null,
        autoRenew: false,
        notes: "",
      });
    }
    refreshDomains();
    return { ok: true, added: toAdd.length };
  } catch (error) {
    return { ok: false, error: domainActionErrorMessage(error) };
  }
}

export async function saveDynadotApiKeyAction(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const apiKey = str(formData, "apiKey");
  if (!apiKey) return { ok: false, error: "Enter an API key." };

  try {
    await store.setDynadotApiKey(apiKey);
    refreshDomains();
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("DYNADOT_SECRET")) {
      return {
        ok: false,
        error: "Can't save the key yet — DYNADOT_SECRET isn't configured. Ask your admin to set it in the environment.",
      };
    }
    return { ok: false, error: "Something went wrong saving the key. Please try again." };
  }
}

export async function clearDynadotApiKeyAction() {
  await requireAdmin();
  await store.setDynadotApiKey(null);
  refreshDomains();
}

/**
 * Docs-style notes. Edit/delete permission: admins can touch any note; a
 * member can always touch a note they authored; a member can touch a note
 * assigned to them only if the admin left editableByAssignee on.
 */
function refreshNotes(id?: string) {
  revalidatePath("/notes");
  revalidatePath("/");
  if (id) revalidatePath(`/notes/${id}`);
}

async function canEditNote(noteId: string): Promise<{ profile: Awaited<ReturnType<typeof requireProfile>>; note: NonNullable<Awaited<ReturnType<typeof store.getNote>>> }> {
  const profile = await requireProfile();
  const note = await store.getNote(noteId);
  if (!note) throw new Error("Note not found.");
  const canEdit =
    profile.role === "admin" ||
    note.authorId === profile.id ||
    (note.assignedToUserId === profile.id && note.editableByAssignee);
  if (!canEdit) throw new Error("You don't have permission to edit this note.");
  return { profile, note };
}

function parseRichContent(raw: string): RichContent {
  try {
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function createNoteAction(
  formData: FormData,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const profile = await requireProfile();
  const title = str(formData, "title") || "Untitled";

  const assignedToUserId = profile.role === "admin" ? str(formData, "assignedToUserId") || null : null;

  try {
    const note = await store.createNote({
      title,
      content: parseRichContent(str(formData, "contentJson")),
      authorId: profile.id,
      assignedToUserId,
      editableByAssignee: formData.get("editableByAssignee") !== "off",
      pinned: formData.get("pinned") === "on",
      projectId: str(formData, "projectId") || null,
      folderId: str(formData, "folderId") || null,
    });
    refreshNotes(note.id);
    return { ok: true, id: note.id };
  } catch {
    return { ok: false, error: "Something went wrong creating this note. Please try again." };
  }
}

export async function updateNoteAction(
  noteId: string,
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { profile, note } = await canEditNote(noteId);

    const patch: Parameters<typeof store.updateNote>[1] = {
      title: str(formData, "title") || "Untitled",
      content: parseRichContent(str(formData, "contentJson")),
      projectId: str(formData, "projectId") || null,
      folderId: str(formData, "folderId") || null,
    };
    if (profile.role === "admin") {
      patch.assignedToUserId = str(formData, "assignedToUserId") || null;
      patch.editableByAssignee = formData.get("editableByAssignee") !== "off";
    }
    if (profile.role === "admin" || note.authorId === profile.id) {
      patch.pinned = formData.get("pinned") === "on";
    }

    await store.updateNote(noteId, patch);
    refreshNotes(noteId);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Something went wrong saving this note." };
  }
}

export async function toggleNotePinAction(noteId: string, pinned: boolean) {
  await canEditNote(noteId);
  await store.updateNote(noteId, { pinned });
  refreshNotes(noteId);
}

export async function deleteNoteAction(noteId: string) {
  const profile = await requireProfile();
  const note = await store.getNote(noteId);
  if (!note) return;
  if (profile.role !== "admin" && note.authorId !== profile.id) {
    throw new Error("Only the author or an admin can delete this note.");
  }
  await store.deleteNote(noteId);
  refreshNotes();
}

export async function saveTaskNoteAction(taskId: string, projectId: string, contentJson: string) {
  const profile = await requireProjectAccess(projectId);
  await store.upsertTaskNote(taskId, parseRichContent(contentJson), profile.id);
  revalidatePath(`/projects/${projectId}`);
}

export async function getTaskNoteAction(taskId: string, projectId: string): Promise<RichContent> {
  await requireProjectAccess(projectId);
  const note = await store.getTaskNote(taskId);
  return note?.content ?? {};
}

/**
 * Note folders: one level under a project (or under the project-independent
 * "General" bucket when projectId is null). Anyone who can access the
 * project can create/rename/delete its folders — General is open to any
 * signed-in user. This is separate from each note's own author/admin/
 * assignee edit rules.
 */
async function requireFolderAccess(projectId: string | null) {
  if (projectId) return requireProjectAccess(projectId);
  return requireProfile();
}

export async function createNoteFolderAction(
  name: string,
  projectId: string | null,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    await requireFolderAccess(projectId);
    const folder = await store.createNoteFolder(name || "Untitled folder", projectId);
    refreshNotes();
    return { ok: true, id: folder.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't create the folder." };
  }
}

export async function renameNoteFolderAction(folderId: string, name: string) {
  const folder = await store.getNoteFolder(folderId);
  if (!folder) return;
  await requireFolderAccess(folder.projectId);
  await store.renameNoteFolder(folderId, name || "Untitled folder");
  refreshNotes();
}

export async function deleteNoteFolderAction(folderId: string) {
  const folder = await store.getNoteFolder(folderId);
  if (!folder) return;
  await requireFolderAccess(folder.projectId);
  await store.deleteNoteFolder(folderId);
  refreshNotes();
}

export async function createWebAppFeatureAction(formData: FormData) {
  const projectId = str(formData, "projectId");
  const name = str(formData, "name");
  if (!projectId || !name) return;
  await requireProjectAccess(projectId);
  await store.createWebAppFeature({ projectId, name, description: str(formData, "description") });
  revalidatePath(`/projects/${projectId}`);
}

export async function updateWebAppFeatureAction(formData: FormData) {
  const id = str(formData, "id");
  const projectId = str(formData, "projectId");
  if (!id || !projectId) return;
  await requireProjectAccess(projectId);
  await store.updateWebAppFeature(id, { name: str(formData, "name"), description: str(formData, "description") });
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteWebAppFeatureAction(id: string, projectId: string) {
  await requireProjectAccess(projectId);
  await store.deleteWebAppFeature(id);
  revalidatePath(`/projects/${projectId}`);
}

export async function bulkDeleteWebAppFeaturesAction(ids: string[], projectId: string) {
  await requireProjectAccess(projectId);
  await store.bulkDeleteWebAppFeatures(ids);
  revalidatePath(`/projects/${projectId}`);
}

export async function bulkCopyWebAppFeaturesAction(ids: string[], projectId: string) {
  await requireProjectAccess(projectId);
  await store.copyWebAppFeatures(ids);
  revalidatePath(`/projects/${projectId}`);
}

export async function createWebAppSubFeatureAction(formData: FormData) {
  const featureId = str(formData, "featureId");
  const projectId = str(formData, "projectId");
  const name = str(formData, "name");
  if (!featureId || !projectId || !name) return;
  await requireProjectAccess(projectId);
  await store.createWebAppSubFeature({ featureId, name, description: str(formData, "description") });
  revalidatePath(`/projects/${projectId}`);
}

export async function updateWebAppSubFeatureAction(formData: FormData) {
  const id = str(formData, "id");
  const projectId = str(formData, "projectId");
  if (!id || !projectId) return;
  await requireProjectAccess(projectId);
  await store.updateWebAppSubFeature(id, {
    name: str(formData, "name"),
    description: str(formData, "description"),
    status: (str(formData, "status") || "not_started") as SubFeatureStatus,
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function setWebAppSubFeatureStatusAction(id: string, projectId: string, status: string) {
  await requireProjectAccess(projectId);
  await store.updateWebAppSubFeature(id, { status: status as SubFeatureStatus });
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteWebAppSubFeatureAction(id: string, projectId: string) {
  await requireProjectAccess(projectId);
  await store.deleteWebAppSubFeature(id);
  revalidatePath(`/projects/${projectId}`);
}

export async function bulkDeleteWebAppSubFeaturesAction(ids: string[], projectId: string) {
  await requireProjectAccess(projectId);
  await store.bulkDeleteWebAppSubFeatures(ids);
  revalidatePath(`/projects/${projectId}`);
}

export async function bulkCopyWebAppSubFeaturesAction(ids: string[], projectId: string) {
  await requireProjectAccess(projectId);
  await store.copyWebAppSubFeatures(ids);
  revalidatePath(`/projects/${projectId}`);
}

export async function bulkMoveWebAppSubFeaturesAction(ids: string[], projectId: string, targetFeatureId: string) {
  await requireProjectAccess(projectId);
  await store.moveWebAppSubFeatures(ids, targetFeatureId);
  revalidatePath(`/projects/${projectId}`);
}

function refreshRenewals() {
  revalidatePath("/domains");
}

/**
 * Resolves the "link to domain" field on a renewal form: an existing domain
 * id, a brand-new domain name to register, or neither. Only call this for an
 * admin caller — domain linking touches the resale inventory, which
 * non-admin Renewals-access members can't see or edit.
 */
async function resolveRenewalDomainId(formData: FormData): Promise<string | null> {
  const domainId = str(formData, "domainId") || null;
  if (domainId) return domainId;

  const newDomainName = str(formData, "newDomainName").toLowerCase();
  if (!newDomainName) return null;

  const domain = await store.createDomain({
    name: newDomainName,
    domainClientId: null,
    registrar: "Dynadot",
    status: "available",
    purchasePrice: null,
    sellingPrice: null,
    expiryDate: null,
    autoRenew: false,
    notes: "",
  });
  return domain.id;
}

function parseServiceTypes(formData: FormData): RenewalServiceType[] {
  const valid: RenewalServiceType[] = ["domain", "hosting", "email", "malware_removal", "other"];
  return formData.getAll("serviceTypes").filter((v): v is RenewalServiceType => valid.includes(v as RenewalServiceType));
}

export async function createRenewalAction(
  formData: FormData,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const profile = await requireRenewalsAccess();

  let domainClientId = str(formData, "domainClientId") || null;
  const clientName = str(formData, "clientName");
  if (!clientName) return { ok: false, error: "A client name is required." };

  try {
    if (!domainClientId && formData.get("saveNewClient") === "on") {
      const created = await store.createDomainClient({ name: clientName, email: "", phone: "", notes: "" });
      domainClientId = created.id;
    }

    const domainId = profile.role === "admin" ? await resolveRenewalDomainId(formData) : null;

    const renewal = await store.createRenewal({
      domainClientId,
      domainId,
      clientName,
      itemName: str(formData, "itemName"),
      serviceTypes: parseServiceTypes(formData),
      amountCharged: numOrNull(str(formData, "amountCharged")),
      amountPaid: numOrNull(str(formData, "amountPaid")),
      currency: str(formData, "currency") || "PKR",
      dueDate: str(formData, "dueDate") || null,
      status: (str(formData, "status") || "pending") as RenewalStatus,
      notes: str(formData, "notes"),
    });
    refreshRenewals();
    return { ok: true, id: renewal.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Something went wrong saving this renewal.";
    return { ok: false, error: message };
  }
}

export async function updateRenewalAction(
  id: string,
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const profile = await requireRenewalsAccess();

  let domainClientId = str(formData, "domainClientId") || null;
  const clientName = str(formData, "clientName");
  try {
    if (!domainClientId && clientName && formData.get("saveNewClient") === "on") {
      const created = await store.createDomainClient({ name: clientName, email: "", phone: "", notes: "" });
      domainClientId = created.id;
    }

    const domainId = profile.role === "admin" ? await resolveRenewalDomainId(formData) : undefined;

    await store.updateRenewal(id, {
      domainClientId,
      domainId,
      clientName,
      itemName: str(formData, "itemName"),
      serviceTypes: parseServiceTypes(formData),
      amountCharged: numOrNull(str(formData, "amountCharged")),
      amountPaid: numOrNull(str(formData, "amountPaid")),
      currency: str(formData, "currency") || "PKR",
      dueDate: str(formData, "dueDate") || null,
      status: (str(formData, "status") || "pending") as RenewalStatus,
      notes: str(formData, "notes"),
    });
    refreshRenewals();
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Something went wrong saving this renewal.";
    return { ok: false, error: message };
  }
}

export async function setRenewalStatusAction(id: string, status: RenewalStatus) {
  await requireRenewalsAccess();
  await store.updateRenewal(id, { status });
  refreshRenewals();
}

export async function deleteRenewalAction(id: string) {
  await requireRenewalsAccess();
  await store.deleteRenewal(id);
  refreshRenewals();
}

function refreshWebsites() {
  revalidatePath("/domains");
}

function parseCities(formData: FormData): string[] {
  return str(formData, "cities")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

export async function upsertWebsiteForDomainAction(
  domainId: string,
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  if (!domainId) return { ok: false, error: "No domain selected." };

  try {
    await store.upsertWebsiteForDomain(domainId, {
      name: str(formData, "name"),
      contactEmail: str(formData, "contactEmail"),
      contactPhone: str(formData, "contactPhone"),
      contactAddress: str(formData, "contactAddress"),
      cities: parseCities(formData),
      headScripts: str(formData, "headScripts"),
      bodyScripts: str(formData, "bodyScripts"),
      notes: str(formData, "notes"),
    });
    refreshWebsites();
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't save the website config. Please try again." };
  }
}

export async function regenerateWebsiteApiKeyForDomainAction(
  domainId: string,
): Promise<{ ok: true; apiKey: string } | { ok: false; error: string }> {
  await requireAdmin();
  try {
    const apiKey = await store.regenerateWebsiteApiKeyForDomain(domainId);
    if (!apiKey) return { ok: false, error: "Save the website config before rotating its key." };
    refreshWebsites();
    return { ok: true, apiKey };
  } catch {
    return { ok: false, error: "Couldn't rotate the key. Please try again." };
  }
}

export async function setWebsiteOfflineForDomainAction(domainId: string, offline: boolean) {
  await requireAdmin();
  await store.setWebsiteOfflineForDomain(domainId, offline);
  refreshWebsites();
}
