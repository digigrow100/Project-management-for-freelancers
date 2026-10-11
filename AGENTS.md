# AGENTS.md

## Purpose of this file

This is the primary working-context file for AI coding agents working in this repository.

Before doing broad repository research, read this file first. It exists so an agent can understand the app, the main architecture, the important product rules, and the current behavior without rediscovering the whole project every time.

### Mandatory agent workflow

1. Read this file first.
2. Read only the task-specific files listed in the relevant module section below.
3. Verify the exact code path before changing behavior.
4. Avoid broad/deep repository searches unless this file does not contain enough context or the task genuinely crosses multiple modules.
5. Do not guess that a feature is missing or broken just because one file does not show it.
6. For database-related work, inspect the relevant migration(s) and current live schema before changing data behavior.
7. For production-impacting work, verify CI and deployment status before claiming the change is live.
8. Never expose or commit secrets, tokens, service-role keys, API keys, passwords, pairing tokens, or private client data.

## Mandatory documentation rule

**Every new app update must also update this `AGENTS.md` file in the same change/PR.**

That includes:
- new features
- changed behavior
- removed behavior
- database/schema changes
- new routes or major components
- new extension behavior
- permission/role changes
- workflow changes
- important bug fixes that change how the app behaves
- deployment or architecture changes that future agents need to know

For each app update:
1. Update the relevant section of this file.
2. Add a short entry to **Recent App Updates** at the bottom.
3. Keep old information accurate; remove or rewrite stale instructions.
4. Do not let README and AGENTS contradict each other on current behavior.

Documentation-only spelling/formatting fixes do not need a changelog entry unless they change meaning.

---

# Product Overview

**Freelance HQ** is a private project-management and operations app for a freelance/agency workflow.

Primary use cases:
- SEO project management
- web development projects
- web application projects
- admin personal tasks
- team task assignment
- task focus/time tracking
- employee browser activity tracking
- finance/payments/invoices
- clients/services
- notes
- domains/renewals/website management
- SEO workflows, pages, keywords, backlinks, reporting
- WhatsApp client communication bridge
- AI assistant and AI-powered message translation

The web app is the source of truth. Android/iOS are Capacitor shells that load the production web app.

---

# Tech Stack

- Next.js 14 App Router
- TypeScript
- React 18
- Tailwind CSS
- Supabase / Postgres
- Supabase Auth
- Vercel deployment
- OpenAI API for AI features
- Capacitor for Android/iOS wrappers
- Chrome extensions for employee activity and WhatsApp bridge

Important root files:
- `README.md` — broad product/setup documentation; useful but can contain historical details
- `AGENTS.md` — canonical AI working context and current behavior
- `package.json` — scripts and dependency versions
- `middleware.ts` — auth/session route protection
- `capacitor.config.ts` — native wrapper target URL/settings

Common checks:
- `npm run typecheck`
- `npm run lint`
- `npm run build` when appropriate

---

# Repository Structure

## App routes
Main authenticated routes live under:
- `app/(app)/`

Important pages include:
- `app/(app)/admin/page.tsx`
- `app/(app)/admin/time-tracking/page.tsx`
- `app/(app)/admin/employee-activity/page.tsx`
- `app/(app)/admin/whatsapp-bridge/page.tsx`
- `app/(app)/admin/my-tasks/page.tsx`
- `app/(app)/projects/*`
- `app/(app)/clients/*`
- `app/(app)/finance/page.tsx`
- `app/(app)/invoices/*`
- `app/(app)/domains/*`
- `app/(app)/notes/*`
- `app/(app)/seo/pages/page.tsx`
- `app/(app)/today/page.tsx`
- `app/(app)/settings/page.tsx`

## API routes
Important API groups:
- `app/api/ai/*`
- `app/api/admin/*`
- `app/api/extension/*`
- `app/api/presence/*`
- `app/api/whatsapp-bridge/*`
- `app/api/client-chat/*`
- `app/api/site-config/route.ts`
- `app/api/cron/*`

## Components
Reusable UI is mainly in:
- `components/*`

## Server/domain logic
Important server modules:
- `lib/store.ts` — main application data access and business operations
- `lib/types.ts` — shared domain types
- `lib/actions.ts` — server actions
- `lib/auth.ts` — current user/profile/role logic
- `lib/supabaseClient.ts`
- `lib/supabase/server.ts`
- `lib/employeeActivity.ts`
- `lib/activity.ts`
- `lib/whatsappBridge.ts`
- `lib/whatsappBridgeRequests.ts`
- `lib/whatsappTranslation.ts`
- `lib/ai/*`

Important note: `lib/store.ts` is the main data layer, but newer specialized modules such as employee activity and WhatsApp also access Supabase directly. Do not assume `lib/store.ts` is literally the only DB-access file.

## Database
- Base schema: `supabase/schema.sql`
- Incremental changes: `supabase/migrations/*`
- App-owned tables use the `freelance_hq_` namespace.

Never edit an old migration that may already have run in production. Add a new migration unless the task is explicitly about an unreleased migration.

---

# Roles and Access

Primary roles:
- `admin`
- `member`

Admin:
- sees all projects
- manages team
- manages project assignments
- can access finance/invoices/admin tools
- manages WhatsApp mappings/history sharing
- can see employee activity
- can manage personal admin work/tasks

Members:
- only see projects explicitly assigned to them
- must not gain access to admin-only pages/data
- must not be able to browse all WhatsApp history
- may receive controlled WhatsApp client context
- may receive extra feature access through explicit per-profile permissions where supported

Always enforce permissions server-side, not only by hiding UI.

---

# Projects and Task Workflow

Deferring a task closes only the acting member’s open time entries for that task; other tasks and members keep their timers. Simple pauses go to the queue tail; scheduled returns and admin requests appear in Pending.

The app supports multiple project types, including:
- SEO
- Web Development
- Web Application
- other/general project workflows supported by the existing project model

Task behavior includes:
- task status/stages
- task detail modal
- files/attachments
- notes
- scheduling
- priorities
- personal/admin tasks
- pause/continue/done flows
- time tracking
- task switching
- blocked/admin-action states
- member-focused task workflow

When changing task behavior, inspect:
- `lib/store.ts`
- `lib/types.ts`
- `components/TaskDetailModal.tsx`
- `components/MemberTaskDetailModal.tsx`
- `components/MemberFocusDashboard.tsx`
- `components/AdminTaskCommandCenter.tsx`
- relevant task migrations, especially `067_task_time_tracking.sql` and later workflow migrations

Do not casually reintroduce a separate legacy flow when the current member focus workflow already handles the behavior.

---

# Admin Personal Work Time

Confirmed-time summaries merge overlapping device intervals and retry duplicates, clip to Pakistan day/month boundaries and cap unconfirmed checkpoint gaps at 90 seconds. Original logs remain intact; missed checkpoints cannot establish exact work duration. New activity writes use deterministic event IDs to make retries idempotent.

The admin can monitor their own work time.

Primary UI:
- `components/AdminMyWorkTime.tsx`
- rendered on `app/(app)/admin/page.tsx`

It shows:
- Today active time
- This Month active time
- Paused Today
- Started Today
- Last Activity
- current status: Working / Paused / Offline

It is driven by the employee activity Chrome extension and refreshes the summary from:
- `app/api/extension/my-work-summary/route.ts`

Detailed team/task time reporting:
- `app/(app)/admin/time-tracking/page.tsx`
- `components/AdminTimeTracking.tsx`

Reports support:
- Today
- This Week
- This Month
- Custom date range
- project/member filters
- task sessions
- start/end
- duration
- pause/skip/switch reasons
- running sessions

Relevant migrations:
- `067_task_time_tracking.sql`
- `084_accurate_time_tracking_reports.sql`

---

# Employee Browser Activity Extension

Main extension:
- `chrome-extension/*`

Server logic:
- `lib/employeeActivity.ts`
- `app/api/extension/activity/route.ts`
- `app/api/extension/health/route.ts`
- `app/api/extension/status/route.ts`
- `app/api/extension/pair/*`
- `app/api/extension/pairing/create/route.ts`

Admin UI:
- `components/AdminEmployeeActivity.tsx`
- `components/EmployeeActivityOverview.tsx`
- `app/(app)/admin/employee-activity/*`

The extension tracks browser work state such as:
- active
- idle
- tab switch
- session start/end
- heartbeat/offline

## Multiple Chrome profiles

A single Freelance HQ user/admin may use the employee activity extension in multiple Chrome profiles on the same or different machines.

Current required behavior:
- each Chrome profile is paired separately
- each profile gets its own one-time pairing code
- generating a new profile code must not invalidate other unused, unexpired profile codes
- each installed profile keeps its own `deviceId` / `extensionInstallId`
- all activity still belongs to the same signed-in Freelance HQ user
- product reporting should focus on work time, websites and projects, not on forcing the user to care which Chrome profile produced the activity
- pairing codes expire in about 10 minutes and work once
- the extension must handle non-JSON pairing responses with a readable error instead of surfacing a raw JSON parse error
- Chrome's host-permission Allow dialog may close the extension popup; the pairing code must be persisted before requesting permission and restored/auto-resumed afterward so the user does not paste the same code twice

Relevant UI:
- `components/ExtensionConnectCard.tsx`

The download button and connection card show the version directly from `chrome-extension/manifest.json`; the download URL includes that version to avoid stale cached ZIP downloads.

Current employee activity extension version:
- **1.2.4**

Security and retention logic are in the later activity migrations:
- `087_employee_activity_extension.sql`
- `088_extension_security_hardening.sql`

Do not weaken URL sanitization, token checks, privacy controls, or retention behavior without explicit instruction.

---

# SEO Module

GSC and GBP have separate tabs (`seoTab=gsc/gbp`): SeoReviewPanel, lib/seoReviewConfig.ts, lib/seoReviews.ts and lib/seoReviewActions.ts. Migration 098 was applied to production on 2026-10-11. Reviews save with optimistic revision checks in a transactional RPC. Saving a fully checked cycle archives a snapshot and resets only review checkboxes; rows/notes (including unresolved URLs) carry forward. Prior cycles are read-only. Current-cycle review rows can be removed; removal does not alter archived snapshots. Manual entry only: no Google APIs, automated indexing/disavow, or focus-task generation is implemented. Existing GSC recurring and GBP setup records are shown in their respective tabs with original identities preserved.

Technical SEO has a dedicated tab (`seoTab=technical`) grouping page technical checks, sitewide technical setup and recurring technical reviews. `lib/seoTechnical.ts` defines grouping. Website Pages retains content/headings/meta/keywords; Full Website retains tracking and business setup; Recurring SEO retains nontechnical reviews. Grouping preserves existing database IDs, progress, module owners and task routing; it does not introduce independent technical ownership. Sitewide/recurring assignment controls still assign their original complete modules. No migration is required.

SEO projects include page-level and workflow features such as:
- SEO pages/checklists
- page URLs
- keyword mapping
- keyword tracking
- monthly positions
- SEO module assignments
- on-page SEO
- technical SEO
- backlinks
- competitor backlinks
- outreach/content pipeline
- SEO reporting

Important components:
- `components/SeoProjectTabs.tsx`
- `components/SeoWorkflowPanel.tsx`
- `components/WebsitePagesPanel.tsx`
- `components/KeywordMappingOverview.tsx`
- `components/KeywordsPanel.tsx`
- `components/MonthlyPositionTracker.tsx`
- `components/OnPageSeoPanel.tsx`
- `components/TechnicalSeoPanel.tsx`
- `components/OffPagePanel.tsx`
- `components/SeoReportingPanel.tsx`
- `components/SeoModuleAssignmentBar.tsx`

Important migrations include:
- `064_task_focus_dashboard.sql`
- `065_project_urls.sql`
- `066_keyword_mapping_workflow.sql`
- `068_seo_project_pages_monthly_checks.sql`
- `069_seed_known_seo_pages.sql`
- `070_idle_seo_audit_task_pool.sql`
- `071_one_open_idle_task_per_member.sql`
- `072_team_job_roles.sql`
- `075_expand_seo_page_checklist.sql`
- `076_move_keywords_into_pages.sql`
- `077_seo_workflow_automation.sql`
- `078_retire_legacy_idle_audits.sql`
- `079_seo_workflow_credentials.sql`
- `094_seo_module_assignments.sql`

Preserve the current page-checklist/assignment workflow unless the task explicitly changes it.

---

# Finance, Payments and Invoices

Admin finance features include:
- payment plans
- payments
- currencies
- fixed monthly vs one-time billing
- invoice creation
- invoice templates
- supplemental invoice pages
- current-period filtering
- project/client financial summaries

Important routes/components:
- `app/(app)/finance/page.tsx`
- `app/(app)/invoices/*`
- `components/PaymentsCard.tsx`
- `components/InvoicesPanel.tsx`
- `components/InvoiceDetailPanel.tsx`
- `components/InvoiceTemplateSelector.tsx`

PDF logic:
- `lib/invoicePdf.ts`
- `lib/reportPdf.ts`

Keep currencies separate unless an explicit conversion feature is added.

---

# Clients, Services, Notes, Domains and Renewals

## Clients
- `app/(app)/clients/*`
- `components/ClientsPanel.tsx`
- `components/ClientDetailPanel.tsx`

## Services
- `app/(app)/services/page.tsx`
- `components/ServicesPanel.tsx`

## Notes
- `app/(app)/notes/*`
- `components/NotesPanel.tsx`
- `components/NoteEditor.tsx`
- `components/TaskNotesEditor.tsx`

## Domains / Renewals / Website management
- `app/(app)/domains/*`
- `components/DomainsPanel.tsx`
- `components/DomainDetailPanel.tsx`
- `components/RenewalsPanel.tsx`
- `components/WebsiteConfigModal.tsx`
- `app/api/site-config/route.ts`

Dynadot-specific logic:
- `lib/dynadot.ts`
- `lib/dynadotCrypto.ts`

Do not expose registrar credentials or decrypted secrets.

---

# AI Assistant

Main AI routes:
- `app/api/ai/chat/route.ts`
- `app/api/ai/confirm/route.ts`
- `app/api/ai/conversations/*`

Main server modules:
- `lib/ai/openaiClient.ts`
- `lib/ai/systemPrompt.ts`
- `lib/ai/toolSchemas.ts`
- `lib/ai/tools.ts`

Main UI:
- `components/AiAssistant.tsx`

AI actions that can change app data should continue to use confirmation/safe tool flows where already implemented. Do not silently turn a read-only AI action into a destructive write.

---

# WhatsApp Client Bridge

There are two related pieces:
- UI/server functionality in the main app
- a separate Chrome extension under `whatsapp-bridge-extension/*`

Important app files:
- `lib/whatsappBridge.ts`
- `lib/whatsappBridgeRequests.ts`
- `lib/whatsappTranslation.ts`
- `components/WhatsAppBridgeAdminCard.tsx`
- `components/WhatsAppBridgeManager.tsx`
- `components/WhatsAppChatWidget.tsx`
- `app/api/admin/whatsapp-bridge/*`
- `app/api/whatsapp-bridge/*`
- `app/api/client-chat/*`

## Locked mapping behavior

WhatsApp chats must **not** automatically appear in Client Mapping.

Required behavior:
- Admin searches WhatsApp by name.
- Matching results appear.
- Admin manually chooses the exact chat.
- Only manually mapped chats appear in Client Mapping.
- A mapping can be removed without deleting the WhatsApp chat.
- Admin has separate **My WhatsApp Chats**.
- My Chats must not auto-list every WhatsApp chat.
- Admin explicitly searches/adds chats to My Chats.
- Saved admin chats persist until manually removed.
- Admin chats do not have to map to a team member/client.

Do not replace this with automatic contact discovery/mapping.

## History and team privacy

Admin:
- may load selected history/date range
- may share selected old messages/full-day context to a specific team member

Team/member:
- must not receive old history by default
- must never browse all WhatsApp history
- only sees shared historical context plus allowed new/live context

## Sending/opening behavior

- Clicking an app chat should open the matching WhatsApp Web chat.
- App sending should use the currently mapped exact WhatsApp conversation.
- Incoming mapped-client text should sync automatically.
- Browser notifications are supported for incoming client messages.
- Avoid duplicate optimistic messages.

## Roman Urdu translation AI

This feature remains enabled.

Relevant files:
- `lib/whatsappTranslation.ts`
- `app/api/client-chat/[clientId]/translation/route.ts`
- `app/api/client-chat/[clientId]/explain/route.ts`
- `components/WhatsAppChatWidget.tsx`

Behavior:
- Translation toggle OFF means no translation API calls.
- Translation ON caches translations.
- Incoming client text can be shown in Roman Urdu.
- Outbound Roman Urdu can be translated into the client's latest detected language.
- The latest inbound language should be the authoritative language source when available.

Relevant migrations:
- `095_whatsapp_roman_urdu_translation.sql`
- `096_whatsapp_translation_language_source.sql`

## Voice-note behavior — current rule

**Audio transcription/capture has been removed.**

Current desired behavior:
- Do not upload voice-note audio.
- Do not transcribe voice-note audio.
- Do not show an audio player in the app.
- Do not call AI for the audio itself.
- When an inbound mapped-client voice note is detected, insert a normal text chat message:

`Client ny audio bajhi ha. Hamza sy pochy es k about.`

The notice should deduplicate using the WhatsApp message identity so the same voice note does not create repeated notices.

Current WhatsApp bridge extension version after this rollback/notice change:
- **1.3.3**

The old audio-transcription API/page hook should not be reintroduced unless explicitly requested.

---

# Presence and Live Status

Presence APIs:
- `app/api/presence/route.ts`
- `app/api/presence/team/route.ts`

UI:
- `components/PresenceHeartbeat.tsx`
- admin dashboard presence/activity components

Relevant migration:
- `086_member_presence.sql`

---

# Security Rules

1. Never commit environment secrets.
2. Never expose `SUPABASE_SERVICE_ROLE_KEY` to browser code.
3. Keep auth/role checks server-side.
4. Keep member project access restricted server-side.
5. Preserve sensitive URL/query sanitization in activity tracking.
6. Preserve encryption for stored confidential credentials.
7. Do not expose decrypted backlinks/Dynadot credentials through logs/UI.
8. Do not weaken WhatsApp history privacy.
9. Never log full device tokens, pairing tokens, passwords, or API keys.
10. Treat production data changes as high-risk and verify before running them.

---

# Database and Migration Rules

- Production database changes must use a new migration.
- Never assume a repo migration has been applied live; verify the live schema when the task depends on it.
- Never claim a migration is live without verification.
- Use the existing `freelance_hq_` naming pattern.
- Keep foreign keys/cascade behavior consistent with existing product behavior.
- Prefer backward-compatible migrations for live app changes.
- If code and schema must change together, deploy in an order that does not break the currently live version.

Latest relevant migration families in this repo include:
- task/time tracking: 064–085 range
- presence/activity extension: 086–088
- WhatsApp bridge: 089–093
- SEO module assignments: 094
- WhatsApp translation: 095–096

---

# Deployment and Verification Rules

User hold: do not trigger Vercel or push/merge app changes until the user explicitly authorizes deployment. Prepare and verify changes locally.

Main branch:
- `main`

Normal flow:
1. Create a focused branch.
2. Make the smallest safe change.
3. Run/verify CI.
4. Open PR.
5. Merge only after checks pass.
6. Verify Vercel deployment if the change needs a production deployment.
7. Verify live DB behavior when the task changes server/database behavior.

Important:
- A GitHub merge is not proof that production is live.
- A successful CI run is not proof that Vercel deployment succeeded.
- Vercel may rate-limit deployments; if that happens, state it clearly.
- Extension code is not auto-updated on the user's local Chrome installation just because GitHub changed. A local unpacked extension may require manual reload/update.
- Documentation-only changes do not require a production web deployment to be useful in GitHub.

---

# How AI Agents Should Investigate Tasks

Do **not** start every request by recursively searching the whole repo.

Use this sequence:

### If the task is about normal project/task behavior
Start with:
- `lib/store.ts`
- `lib/types.ts`
- relevant component/page
- relevant recent migration

### If about employee/admin work time
Start with:
- `components/AdminMyWorkTime.tsx`
- `components/AdminTimeTracking.tsx`
- `lib/employeeActivity.ts`
- `app/api/extension/*`
- migrations 067, 084, 087, 088

### If about WhatsApp
Start with:
- this WhatsApp section
- `lib/whatsappBridge.ts`
- `lib/whatsappBridgeRequests.ts`
- `lib/whatsappTranslation.ts`
- `whatsapp-bridge-extension/content-whatsapp.js`
- `whatsapp-bridge-extension/service-worker.js`
- relevant WhatsApp API route

Do not inspect every historical WhatsApp PR unless current code does not explain the issue.

### If about SEO
Start with:
- relevant SEO component
- `lib/store.ts`
- `lib/types.ts`
- migrations 064–079 and 094 as relevant

### If about finance/invoices
Start with:
- finance/invoice page/component
- `lib/store.ts`
- invoice/report PDF helper if export-related

### If about AI
Start with:
- `lib/ai/*`
- `app/api/ai/*`
- exact UI invoking the AI route

Only expand the search when the direct code path is insufficient.

---

# Product Decisions That Should Not Be Accidentally Reversed

- Manual WhatsApp chat mapping, not automatic mapping.
- Team cannot browse all WhatsApp history.
- Admin can selectively share old WhatsApp context.
- Roman Urdu translation remains available.
- Voice-note transcription is currently disabled; voice notes create a text notice instead.
- Admin personal work time is tracked through the employee activity extension.
- Role/access enforcement must exist server-side.
- App web code is the source of truth for Capacitor mobile shells.
- Keep currencies separate rather than inventing conversions.
- Preserve the existing SEO page/checklist/module workflow unless explicitly changing it.

---

# Recent App Updates

Keep this section short and newest-first. Every future app update must add an entry here and update any affected section above.

## 2026-10-11
- Work-time correction prepared: duplicate/overlapping intervals count once, unattended checkpoint gaps are capped at 90 seconds, and repeated uploads use stable event IDs. Raw historical logs are preserved. Extension closure has the same gap cap; release not yet confirmed.
- Timer-deferral follow-up now scopes closure by both task and acting member; regression coverage includes an open previous-assignee session.
- Release follow-up: deferring a queued task closes only that task’s time entries, keeping a different active timer running. GSC/GBP rows can be removed from the current cycle without changing archived history.
- User authorized production release. Database migrations 097/098 applied; rollback verification passed for save, revision conflict, history and carried-forward rows. Review saving now stays disabled for the full asynchronous request; rescheduling clears stale timestamps.
- Added local GSC/GBP recurring review tabs with structured records, indexing status tracking, original-photo fields, immutable cycle snapshots and carried-forward data. Migration 098 applied and transactional save/history/carry-forward verified with rollback; release authorized by user.
- Approved workload plan saved in config/seo-workload-plan.json: Maaz owns pages/technical/blog; Junaid owns remaining Full Website setup, social, local, Web 2.0 and guest work. Recurring is split by work type; both record evidence and Hamza reviews reports. Plan is not yet applied to live assignments; independent technical routing must be implemented first.
- Local pending update: simple Pause moves to the queue tail; scheduled 30m/1h/tomorrow tasks and admin requests appear in Pending. Assigned members can recall admin requests by resuming. Migration 097 adds resume_at and was applied to production.
- Added a dedicated Technical SEO tab using existing saved checks and workflow records, removing technical items from their previous panels without resetting history. Verified locally; release authorized by user.
- Work-time summaries now read all monthly activity pages and filter individual summaries by employee, preventing totals from disappearing after the API row limit. Empty refreshes retain the last total. Extension v1.2.3 serializes tracking transitions, prevents concurrent uploads, preserves events added during upload, and flushes on pause/tab transitions. Download ZIP refreshed.
- Employee extension download button and connection card now display the manifest version automatically; refreshed the outdated v1.2.0 download ZIP to v1.2.2.
- Employee activity extension multi-profile pairing was hardened: each Chrome profile gets an independent one-time code, non-JSON pairing responses now show a readable error, and v1.2.2 persists the code through Chrome's Allow permission popup so pairing can resume without re-pasting.
- Employee activity extension multi-profile pairing: admins/members can generate a separate one-time code for each Chrome profile; unused codes no longer invalidate each other.
- Extension pairing now binds the code to the exact app origin that generated it and reports a readable error if the endpoint returns HTML/non-JSON. Employee extension version is now 1.2.1.
- Added root `AGENTS.md` as the canonical AI working-context file.
- Added the mandatory rule that every future app update must also update `AGENTS.md`.
- Documented the preferred targeted-investigation workflow so AI agents read known context first instead of doing unnecessary full-repo research.
- WhatsApp audio transcription/capture was rolled back. Current voice-note behavior is a normal chat notice: `Client ny audio bajhi ha. Hamza sy pochy es k about.`
- WhatsApp Roman Urdu translation/AI text features remain enabled.

---

# Final Rule for Future Agents

If you change how the app works and do not update this file, the task is incomplete.
