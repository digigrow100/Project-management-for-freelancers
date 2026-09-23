export type ProjectType = "seo" | "web_dev" | "web_app" | "digital_marketing" | "other";

export type TaskStatus = "todo" | "in_progress" | "done";

export type TaskPriority = "low" | "medium" | "high";

export type DomainStatus = "purchased" | "pending" | "not_required";

export interface Stage {
  id: string;
  name: string;
  order: number;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface TaskFile {
  url: string;
  name: string;
  type: string;
  size: number;
}

export interface Task {
  id: string;
  projectId: string;
  stageId: string | null;
  title: string;
  notes: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  scheduledFor: string | null;
  checklist: ChecklistItem[];
  files: TaskFile[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  order: number;
  /** The one person accountable for this task. Null until someone picks it up. */
  assignedTo: string | null;
  assignedToName: string | null;
  /** Why this task matters — shown separately from `notes`, which stays the working log. */
  why: string;
  /** What "done" looks like for this task. Labeled "Done When" in the UI. */
  expectedOutcome: string;
  /** Which SEO module this task belongs to. Only set for tasks on `type: "seo"` projects — stages/stageId are used for every other project type. */
  seoModule: SeoModule | null;
  /** Optional link to the keyword, page, or content item this task serves. A task links to at most one of each. */
  keywordId: string | null;
  pageId: string | null;
  contentItemId: string | null;
  backlinkEntryId: string | null;
  outreachProspectId: string | null;
}

export type SeoModule = "on_page" | "technical" | "off_page" | "content" | "reporting";

export interface ClientDetails {
  name: string;
  company: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
  logoUrl: string;
}

/** A reusable client record, picked when creating a project instead of retyping contact details each time. */
export interface Client {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  address: string;
  website: string;
  notes: string;
  logoUrl: string;
  createdAt: string;
}

export interface BusinessProfile {
  companyName: string;
  logoUrl: string;
}

export interface WebDevDetails {
  websiteName: string;
  websiteUrl: string;
  domainStatus: DomainStatus;
  logoUrl: string;
  siteIconUrl: string;
  openGraphImageUrl: string;
  servicesDetails: string;
  hostingDetails: string;
  contactDetails: string;
  notes: string;
}

export interface Project {
  id: string;
  name: string;
  client: string;
  clientId: string | null;
  clientDetails: ClientDetails;
  type: ProjectType;
  description: string;
  color: string;
  archived: boolean;
  startDate: string | null;
  endDate: string | null;
  websiteUrl: string;
  webDetails: WebDevDetails | null;
  shareToken: string | null;
  createdAt: string;
  updatedAt: string;
  stages: Stage[];
}

export type Role = "admin" | "member";

export interface Profile {
  id: string;
  email: string;
  name: string;
  role: Role;
  /** Members (non-admins) can be individually granted access to the Renewals tab. Admins always have access. */
  canAccessRenewals: boolean;
  /** Members (non-admins) can be individually granted permission to reveal backlink credentials. Admins always have access; project assignment alone is never enough. */
  canAccessBacklinkCredentials: boolean;
  /** Members (non-admins) can be individually granted access to Finance (Invoices, Services, client balances). Admins always have access. */
  canAccessFinance: boolean;
  createdAt: string;
}

export type PaymentPlanType = "monthly_fixed" | "one_time";

export interface PaymentPlan {
  id: string;
  projectId: string;
  planType: PaymentPlanType;
  amount: number;
  currency: string;
  notes: string;
}

export type PaymentKind = "monthly" | "additional" | "installment";

export interface Payment {
  id: string;
  /** Null once the project it was recorded against has been deleted with its payment history kept. */
  projectId: string | null;
  /** Set when this payment was recorded against a specific invoice. Null for the older project-only payment flow. */
  invoiceId: string | null;
  amount: number;
  currency: string;
  kind: PaymentKind;
  period: string | null;
  note: string;
  paidOn: string;
  createdAt: string;
}

export interface ProjectTemplate {
  type: ProjectType;
  label: string;
  description: string;
  stages: string[];
}

export type KeywordStatus = "not_started" | "in_progress" | "ranking" | "achieved";

export type SearchIntent = "informational" | "navigational" | "commercial" | "transactional" | "local";
export type Priority = "low" | "medium" | "high";

export interface Keyword {
  id: string;
  projectId: string;
  keyword: string;
  /** Legacy free-text target page, frozen — kept for older keywords that predate Groups/Pages. New keywords use `pageIds` instead. */
  targetPage: string;
  searchVolume: number | null;
  difficulty: number | null;
  currentRank: number | null;
  targetRank: number | null;
  status: KeywordStatus;
  notes: string;
  isTracked: boolean;
  pageIds: string[];
  searchIntent: SearchIntent | null;
  priority: Priority;
  createdAt: string;
  updatedAt: string;
}

export const KEYWORD_GROUP_COLORS = ["accent", "sky", "amber", "rose", "violet", "neutral"] as const;
export type KeywordGroupColor = (typeof KEYWORD_GROUP_COLORS)[number];

/** A named topic/silo that organizes a project's keywords into Pages. */
export interface KeywordGroup {
  id: string;
  projectId: string;
  name: string;
  color: KeywordGroupColor;
  order: number;
  createdAt: string;
}

export type PageType = "service" | "location" | "blog" | "landing" | "other";
export type OnPageStatus = "not_started" | "in_progress" | "done";

/**
 * A page within a Group that one or more keywords can target — the on-page
 * SEO workspace for that page. `primaryKeywordId` is the one linked keyword
 * marked primary (at most one, enforced at the database level); every other
 * linked keyword is this page's secondary keywords.
 */
export interface KeywordPage {
  id: string;
  groupId: string;
  name: string;
  url: string;
  order: number;
  pageType: PageType;
  metaTitle: string;
  metaDescription: string;
  h1: string;
  contentStatus: OnPageStatus;
  internalLinkingStatus: OnPageStatus;
  imageSeoStatus: OnPageStatus;
  schemaStatus: OnPageStatus;
  checklist: ChecklistItem[];
  primaryKeywordId: string | null;
  createdAt: string;
}

/**
 * A named grouping of backlink entries within a project (e.g. "Guest
 * Posting"). `seoModule` is always "off_page" for now — Phase 3 builds the
 * real Off-Page CRM (citations, web 2.0, guest posts, outreach, etc.) on
 * top of this; this field just lets it slot under the Off-Page tab today.
 */
export type BacklinkCategoryType =
  | "local_citation"
  | "web2"
  | "guest_post"
  | "outreach"
  | "competitor"
  | "social"
  | "other";

export interface BacklinkCategory {
  id: string;
  projectId: string;
  name: string;
  order: number;
  seoModule: SeoModule;
  categoryType: BacklinkCategoryType;
  createdAt: string;
}

export interface BacklinkLink {
  url: string;
  label: string;
}

export type BacklinkStatus = "not_started" | "account_created" | "submitted" | "verification_pending" | "live" | "rejected";
export type LoginMethod = "email" | "google" | "other";

/** A platform/site login and posting record — a managed SEO asset. `hasPassword` never carries the actual value. */
export interface BacklinkEntry {
  id: string;
  categoryId: string;
  projectId: string;
  name: string;
  url: string;
  username: string;
  email: string;
  hasPassword: boolean;
  loginMethod: LoginMethod;
  postsPerMonth: number | null;
  status: BacklinkStatus;
  /** Optional link to an existing keyword — reuses its rank history for "ranking tracking" instead of duplicating it (Web 2.0 assets). */
  keywordId: string | null;
  indexed: boolean | null;
  listedOn: string | null;
  files: TaskFile[];
  notes: string;
  links: BacklinkLink[];
  createdAt: string;
  updatedAt: string;
}

/** Guest Post / Outreach CRM: a pipeline of prospects, most of whom never get credentials. */
export type OutreachStatus =
  | "prospect_found"
  | "contacted"
  | "follow_up_1"
  | "follow_up_2"
  | "accepted"
  | "article_sent"
  | "published"
  | "live";

export interface OutreachProspect {
  id: string;
  projectId: string;
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
  createdAt: string;
  updatedAt: string;
}

/** Competitor backlink intel — not your asset, no login concept. */
export interface CompetitorBacklink {
  id: string;
  projectId: string;
  competitorUrl: string;
  sourceBacklinkUrl: string;
  opportunityNotes: string;
  targetPageId: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * A reusable, named set of platforms importable into any project. Never
 * stores credentials — imported entries always need fresh, client-specific
 * logins.
 */
export interface BacklinkTemplate {
  id: string;
  name: string;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface BacklinkTemplateItem {
  id: string;
  templateId: string;
  categoryType: BacklinkCategoryType;
  platformName: string;
  defaultUrl: string;
  order: number;
}

/** A file attached to a project as a whole (not tied to a single task). */
export interface ProjectAttachment {
  id: string;
  projectId: string;
  url: string;
  name: string;
  type: string;
  size: number;
  createdAt: string;
}

export interface KeywordRankHistoryEntry {
  id: string;
  keywordId: string;
  rank: number | null;
  recordedOn: string;
}

/** One manually-entered rank for a tracked keyword in a given calendar month ('YYYY-MM'). */
export interface KeywordMonthlyPosition {
  id: string;
  keywordId: string;
  month: string;
  rank: number | null;
}

/**
 * Domain reselling. A standalone inventory of domains held for resale — separate
 * from the project system's Clients. Domains can optionally be assigned to a
 * DomainClient and can be synced against a Dynadot reseller account.
 */
export type ResaleDomainStatus = "available" | "reserved" | "sold";

export interface DomainClient {
  id: string;
  name: string;
  email: string;
  phone: string;
  notes: string;
  createdAt: string;
}

export type DnsRecordType = "A" | "AAAA" | "CNAME" | "MX" | "TXT" | "NS" | "SRV";

export interface DomainDnsRecord {
  id: string;
  domainId: string;
  recordType: DnsRecordType;
  host: string;
  value: string;
  priority: number | null;
  ttl: number | null;
}

export interface Domain {
  id: string;
  name: string;
  domainClientId: string | null;
  registrar: string;
  status: ResaleDomainStatus;
  purchasePrice: number | null;
  sellingPrice: number | null;
  expiryDate: string | null;
  autoRenew: boolean;
  locked: boolean;
  nameservers: string[];
  notes: string;
  dynadotSyncedAt: string | null;
  createdAt: string;
}

/** Server-internal shape (store.ts / lib/dynadot.ts only) — never pass to a client component. */
export interface DomainSettings {
  dynadotApiKeyEncrypted: string | null;
}

/** Client-safe view of DomainSettings — never carries the encrypted key. */
export interface DomainSettingsView {
  hasDynadotApiKey: boolean;
}

/** Tiptap's document JSON shape — opaque here, rendered/edited only by RichTextEditor. */
export type RichContent = Record<string, unknown>;

/**
 * A docs-style note, shown in the global Notes sidebar. Visibility/edit rules
 * (see lib/actions.ts) are: admins can see and edit every note; a member can
 * always see/edit notes they authored; a note an admin assigns to a member is
 * also visible to that member, and editable by them unless the admin sets
 * editableByAssignee to false.
 */
export interface Note {
  id: string;
  title: string;
  content: RichContent;
  authorId: string;
  authorName: string;
  assignedToUserId: string | null;
  assignedToName: string | null;
  editableByAssignee: boolean;
  pinned: boolean;
  projectId: string | null;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * One level of folders inside a project's notes (or, when projectId is
 * null, inside the project-independent "General" notes bucket). Folders
 * don't nest — a folder holds notes directly, not other folders.
 */
export interface NoteFolder {
  id: string;
  name: string;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One rich-text note per task, shown in a "Notes" tab on the task detail modal. */
export interface TaskNote {
  taskId: string;
  content: RichContent;
  updatedAt: string;
  updatedBy: string | null;
}

/**
 * "Web Application" project type: a Features -> Sub-features spec for
 * planning a custom build. A Feature is a functional area (e.g. a
 * "Customer" tab); its sub-features are the individual capabilities that
 * area needs (e.g. "Add customer", "Export list").
 */
export type SubFeatureStatus = "not_started" | "in_progress" | "done";

export interface WebAppFeature {
  id: string;
  projectId: string;
  name: string;
  description: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface WebAppSubFeature {
  id: string;
  featureId: string;
  name: string;
  description: string;
  status: SubFeatureStatus;
  order: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Hosting/Domain Renewal tracker — standalone log of paid renewal work
 * (domain, hosting, email service, malware removal, etc.), separate from
 * both the Domains resale inventory and client Projects. Optionally links
 * to a DomainClient; otherwise clientName is a free-text snapshot.
 */
export type RenewalServiceType = "domain" | "hosting" | "email" | "malware_removal" | "other";
export type RenewalStatus = "pending" | "completed";

export interface Renewal {
  id: string;
  domainClientId: string | null;
  /** Optional link to a real inventory Domain — unlocks the Website settings popup on this renewal's row. */
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
  createdAt: string;
  updatedAt: string;
}

/**
 * Client Website Management: a Next.js site you built, attached to a Domain
 * (and, through it, that domain's Domain Client). Powers a public read-only
 * config endpoint (app/api/site-config) the live site fetches at runtime —
 * contact info, service-area cities, and head/body script injection (GTM,
 * GA, Meta Pixel, etc.) — gated by apiKey.
 */
export interface Website {
  id: string;
  domainId: string | null;
  name: string;
  contactEmail: string;
  contactPhone: string;
  contactAddress: string;
  cities: string[];
  headScripts: string;
  bodyScripts: string;
  apiKey: string;
  isOffline: boolean;
  /** Stamped by the public /api/site-config endpoint on every successful fetch — the basis for the "Connected" signal. */
  lastFetchedAt: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

/** The subset of a Website exposed by the public /api/site-config endpoint — never the id, domainId, notes, or apiKey itself. */
export interface WebsitePublicConfig {
  name: string;
  contactEmail: string;
  contactPhone: string;
  contactAddress: string;
  cities: string[];
  headScripts: string;
  bodyScripts: string;
  /** When true, the live site should show a simple "temporarily offline" state instead of rendering normally. */
  offline: boolean;
}

/** Technical SEO module: a simple issue tracker. `fixTaskId` optionally links the task doing the fix. */
export type TechnicalIssueStatus = "open" | "in_progress" | "fixed";

export interface TechnicalIssue {
  id: string;
  projectId: string;
  title: string;
  description: string;
  urlAffected: string;
  priority: Priority;
  assignedTo: string | null;
  assignedToName: string | null;
  status: TechnicalIssueStatus;
  fixTaskId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Content module: Idea -> Brief -> Writing -> Review -> Published. `targetKeywordId` is optional — content doesn't have to wait on keyword research. */
export type ContentStatus = "idea" | "brief" | "writing" | "review" | "published";

export interface ContentItem {
  id: string;
  projectId: string;
  topic: string;
  targetKeywordId: string | null;
  assignedTo: string | null;
  assignedToName: string | null;
  status: ContentStatus;
  url: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Reporting module: one record per client per month. Its content (keyword
 * movement, completed tasks, backlinks created) is computed at generate
 * time from existing data, not stored here — `summary` is the one thing a
 * human writes.
 */
export type ReportPeriodType = "daily" | "weekly" | "monthly";

/**
 * A report's content is split into distinct editable fields rather than one
 * blob, so a human can revise each part independently before approving it
 * for attachment to a client invoice. Nothing here is ever permanently
 * locked — `approved` is a flag, not a read-only state.
 */
export interface SeoReport {
  id: string;
  projectId: string;
  /** 'YYYY-MM-DD' for daily, 'YYYY-Www' (ISO week) for weekly, 'YYYY-MM' for monthly. */
  period: string;
  periodType: ReportPeriodType;
  summary: string;
  completedWork: string;
  metricsNotes: string;
  notes: string;
  generatedBy: string | null;
  generatedByName: string | null;
  approved: boolean;
  approvedAt: string | null;
  sentToClient: boolean;
  sentAt: string | null;
  createdAt: string;
}

/** Storage-only auto-report toggles per SEO project. No scheduling/email/AI reads this yet — Phase 6. */
export interface ReportPreferences {
  projectId: string;
  dailyEnabled: boolean;
  weeklyEnabled: boolean;
  monthlyEnabled: boolean;
  updatedAt: string;
}

export type BillingFrequency = "one_time" | "monthly" | "quarterly" | "yearly";

/** A reusable, priced offering in the agency's catalog (e.g. "SEO Monthly Retainer"). Not client- or project-specific. */
export interface Service {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  billingFrequency: BillingFrequency;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ClientServiceStatus = "active" | "paused" | "cancelled";

/**
 * A client's subscription to a Service. Optionally linked to the Project it's
 * delivered through (informational — a client can be subscribed to a service
 * before any project exists). `nextInvoiceDate` drives recurring draft
 * generation; null means it isn't scheduled for auto-drafting.
 */
export interface ClientService {
  id: string;
  clientId: string;
  serviceId: string;
  serviceName: string;
  projectId: string | null;
  projectName: string | null;
  /** Overrides the service's catalog price for this client when set. */
  priceOverride: number | null;
  currency: string;
  billingFrequency: BillingFrequency;
  status: ClientServiceStatus;
  nextInvoiceDate: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type InvoiceStatus = "draft" | "sent" | "paid" | "partially_paid" | "overdue" | "cancelled";

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  order: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  clientId: string;
  clientName: string;
  projectId: string | null;
  projectName: string | null;
  clientServiceId: string | null;
  /** Optional link to the SEO report sent alongside this invoice. An invoice can exist without one. */
  seoReportId: string | null;
  currency: string;
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

/** Aggregated billing snapshot for one client, used by the client overview and future AI queries. */
export interface ClientBalance {
  totalInvoiced: number;
  totalPaid: number;
  outstanding: number;
  currency: string;
}

/**
 * Phase 5: dashboard/reporting activity, computed at read time from existing
 * tables (tasks, keywords, backlinks, content, technical issues) — never
 * persisted. `eventType`/`source` are carried as plain metadata so Phase 6
 * (AI) can consume these objects directly without a schema change.
 */
export type ActivityEventType =
  | "task_completed"
  | "keyword_rank_improved"
  | "keyword_rank_dropped"
  | "backlink_created"
  | "content_published"
  | "technical_fixed";

export type ActivitySource = "tasks" | "keywords" | "backlinks" | "content" | "technical_issues";

export interface ActivityEvent {
  id: string;
  eventType: ActivityEventType;
  source: ActivitySource;
  at: string;
  projectId: string;
  projectName: string;
  personName: string | null;
  title: string;
  detail: string;
}

/** Per-member completed-task rollup for the Team Activity dashboard section. */
export interface TeamPerformance {
  memberId: string;
  memberName: string;
  completedToday: number;
  completedThisWeek: number;
  projectNamesToday: string[];
}

/**
 * Computed SEO metrics for a report period — pulled from existing tables at
 * generate time, never persisted itself (same pattern as SeoReportDraft's
 * rankMovements/completedTaskTitles/backlinksCreated, which this extends).
 */
export interface SeoReportMetrics {
  keywordsTracked: number;
  keywordsImproved: number;
  keywordsDropped: number;
  backlinksCreated: number;
  backlinksLive: number;
  contentPublished: number;
  technicalFixed: number;
}
