# Retired human extensions

Prepared on 2026-11-19 from production branch `main`, base commit `9ccc8f5c2a4dc2d79fbb2e4da6c2ce9a30448c50`.
This is a branch/PR change. It has not been merged, deployed or applied to the live database.

## Removed behavior

- My Work Time and the employee browser activity/time-monitoring Chrome extension.
- Extension pairing, connected-device management, AI prompt capture, activity ingestion, monitoring reports and screen sharing.
- Team Performance and Team Workload panels backed by monitoring/presence data, and the separate admin time-report page.
- Presence heartbeat/polling, monitoring banners and automatic activity-retention cron.
- WhatsApp Client Bridge extension, downloads, pairing, mappings, chat requests, sending/receiving, shared-history access, chat widget, translation and related APIs/pages.
- Desktop/mobile menu links, background queries/polling and obsolete route revalidation calls.

Deleted routes and download URLs return HTTP 404 before authentication or database access, including requests from old installed extensions. The retired-prefix matcher uses path segment boundaries, so similarly named unrelated paths are not blocked. Public machine-route and CSRF exceptions for these extensions are removed.

## Preserved behavior

SEO bot management at `/team`, the bot workspace/login and `/api/seo-bots/*` remain unchanged. Projects, clients, finances, hosting, admin personal tasks, general AI assistant, auth/IP/MFA/session guards and manual task focus timers remain. Manual task timers are part of task progress, independent of the retired Chrome monitoring system. The remaining admin UI keeps its existing classes/styles; the Task Queue/My Tasks row simply fills the two remaining columns.

`lib/activity.ts`, task activity feeds, task focus/time-entry tables and shared Supabase/OpenAI keys are used by surviving features and are retained. Editor packages named `@tiptap/extension-*` and the hosting browser-test fixture named `services-browser-extension.cjs` are unrelated and remain.

## Live read-only inventory

The Supabase catalog was inspected for project `vgmnqlpbbvfxapyzyyjn`. All 22 dedicated legacy tables exist with RLS enabled and owner `postgres`. Foreign keys between them preserve their references when moved to another schema. No live rows were exported, updated or deleted.

Vercel environment-variable **names only** were reviewed for the production project. There are no dedicated WhatsApp/monitoring extension variables. Shared `SUPABASE_*`, `OPENAI_API_KEY`, `APP_URL`, encryption, network and hosting integration settings are retained. No Vercel settings were changed.

## Database retention and release order

Historical browser activity, prompts and client chats may still be useful for records. Do not delete them or edit their applied migration files. New migration:

`supabase/migrations/20261119134937_retire_human_extensions.sql`

The migration moves only the explicitly listed 22 tables from `public` into the non-API schema `freelance_hq_retired_extensions`. It keeps rows, indexes, triggers and foreign keys, enables RLS, revokes schema/table/sequence/function access from `PUBLIC`, `anon`, `authenticated` and `service_role`, and removes future default grants in the archive. Database-owner access remains. It contains no table drop, row deletion, timer closure, token export, customer mutation or paid-provider call. A five-second lock timeout fails the transaction safely rather than waiting indefinitely. It tolerates absent tables and repeated application; an archive collision aborts without overwriting either table.

1. Review and merge this PR when ready; deploy its code to production first.
2. Confirm retired URLs return 404 and SEO bot/admin login/task pages still work.
3. Apply **only this migration** through the Supabase SQL editor or migration tooling. It is deliberately NOT applied while old production code still runs. Do not expose the archive schema in Supabase API settings.
4. Confirm the 22 public table names are absent and archived rows/RLS remain. Migration history should contain version `20261119134937` when run with migration tooling. Direct SQL-editor execution does not automatically register migration history; reconcile that version through the project's normal migration process.
5. Each person removes both old extensions from every Chrome profile using `chrome://extensions`. A server release cannot uninstall local extensions or erase their local queues. Clear/uninstall rather than reload. No Windows/VPS command is needed for this PR.

Optional command for an operator with an already configured private database URL, **after step 2 only**:

```sh
psql "$DATABASE_URL" --set ON_ERROR_STOP=1 --file supabase/migrations/20261119134937_retire_human_extensions.sql
```

Do not paste the URL or credentials into chat. This command runs just the reviewed SQL; the same migration-history note applies. Do not run a blanket `db push` with unrelated pending migrations.

Rollback: before the archive migration, reverting the app commit restores the old source. After archival, reverting app code alone cannot restore integrations. An owner must review a separate transactional schema/grant rollback and rotate old pairing credentials before restoring old functionality. Preserve the archive and do not restore access merely to silence old-extension errors.

### Archived tables

- `freelance_hq_activity_logs`
- `freelance_hq_activity_settings`
- `freelance_hq_ai_prompt_logs`
- `freelance_hq_browser_sessions`
- `freelance_hq_employee_devices`
- `freelance_hq_extension_pair_attempts`
- `freelance_hq_extension_pairing_tokens`
- `freelance_hq_member_presence`
- `freelance_hq_project_domain_mappings`
- `freelance_hq_screen_share_sessions`
- `freelance_hq_screen_share_signals`
- `freelance_hq_whatsapp_admin_chats`
- `freelance_hq_whatsapp_audio_jobs`
- `freelance_hq_whatsapp_bridge_devices`
- `freelance_hq_whatsapp_bridge_pairing_tokens`
- `freelance_hq_whatsapp_bridge_requests`
- `freelance_hq_whatsapp_chat_access`
- `freelance_hq_whatsapp_client_links`
- `freelance_hq_whatsapp_message_shares`
- `freelance_hq_whatsapp_message_translations`
- `freelance_hq_whatsapp_messages`
- `freelance_hq_whatsapp_translation_settings`

## Verification

- `npm run typecheck` — passed.
- `npm run lint` — passed with one existing `InvoiceDetailPanel` hook warning.
- `python3 local-checks/build-isolated.py` — passed optimized build with dummy local credentials; no production API or paid path is contacted.
- Isolated production Next server: 28 real HTTP GET/POST checks returned 404 with no redirect/no-store for removed pages/APIs/downloads. Compiled bot and task routes remain present.
- `node --test tests/retired-human-extensions.cjs` — 4 tests pass: old route methods return 404 before Auth, bot routes survive, all archive rows/FKs/grants are preserved/locked, repeated/missing-table/collision behavior and real overview rendering.
- `node --test tests/admin-network.cjs tests/hosting-login-routing.cjs` — 6 tests pass, including actor/IP/MFA/session boundaries and routing. The API fixture now uses the surviving task-activity route.
- `node tests/seo-bot-workspaces.cjs` — bot authorization, daily queue, completion, replay and credential revocation pass in isolated Postgres.
- `node tests/security-hardening.cjs`, `node tests/team-security-boundaries.cjs`, `node tests/task-deferral-timer.cjs` — pass.
- The extra legacy `tests/seo-member-dashboard.cjs` fails its old `Your assigned SEO tabs` assertion on both the untouched base commit and this branch. It is not a CI step and is not a regression from removing extensions. No SEO bot implementation was changed to satisfy this stale human-dashboard test.

CI/deployment status must be checked separately from local validation. No live authenticated UI, messaging, cron or paid renewal test was run for this removal PR. GitHub Actions previously reported an account billing lock; local passes do not override that service restriction.

## Deleted file manifest

99 tracked files removed:

- `app/(app)/admin/employee-activity/page.tsx`
- `app/(app)/admin/employee-activity/screen/[sessionId]/page.tsx`
- `app/(app)/admin/time-tracking/page.tsx`
- `app/(app)/admin/whatsapp-bridge/page.tsx`
- `app/(app)/client-chat/page.tsx`
- `app/(app)/extensions/page.tsx`
- `app/api/admin/activity-settings/route.ts`
- `app/api/admin/employee-activity/route.ts`
- `app/api/admin/project-domain-mappings/route.ts`
- `app/api/admin/screen-share/route.ts`
- `app/api/admin/whatsapp-bridge/configure/route.ts`
- `app/api/admin/whatsapp-bridge/my-chats/route.ts`
- `app/api/admin/whatsapp-bridge/pairing/route.ts`
- `app/api/admin/whatsapp-bridge/remove-mapping/route.ts`
- `app/api/admin/whatsapp-bridge/requests/route.ts`
- `app/api/admin/whatsapp-bridge/revoke/route.ts`
- `app/api/admin/whatsapp-bridge/share/route.ts`
- `app/api/admin/whatsapp-bridge/status/route.ts`
- `app/api/client-chat/[clientId]/explain/route.ts`
- `app/api/client-chat/[clientId]/messages/route.ts`
- `app/api/client-chat/[clientId]/open/route.ts`
- `app/api/client-chat/[clientId]/send/route.ts`
- `app/api/client-chat/[clientId]/translation/route.ts`
- `app/api/client-chat/clients/route.ts`
- `app/api/cron/activity-retention/route.ts`
- `app/api/extension/activity/route.ts`
- `app/api/extension/devices/route.ts`
- `app/api/extension/health/route.ts`
- `app/api/extension/my-work-summary/route.ts`
- `app/api/extension/pair/route.ts`
- `app/api/extension/pairing/create/route.ts`
- `app/api/extension/prompts/route.ts`
- `app/api/extension/screen-share/session/route.ts`
- `app/api/extension/screen-share/signal/route.ts`
- `app/api/extension/status/route.ts`
- `app/api/presence/route.ts`
- `app/api/presence/team/route.ts`
- `app/api/whatsapp-bridge/ack/route.ts`
- `app/api/whatsapp-bridge/config/route.ts`
- `app/api/whatsapp-bridge/heartbeat/route.ts`
- `app/api/whatsapp-bridge/inbound/route.ts`
- `app/api/whatsapp-bridge/outbox/route.ts`
- `app/api/whatsapp-bridge/pair/route.ts`
- `app/api/whatsapp-bridge/requests/route.ts`
- `chrome-extension/README.md`
- `chrome-extension/content-ai.js`
- `chrome-extension/manifest.json`
- `chrome-extension/popup.css`
- `chrome-extension/popup.html`
- `chrome-extension/popup.js`
- `chrome-extension/request-gate.js`
- `chrome-extension/service-worker.js`
- `chrome-extension/share.css`
- `chrome-extension/share.html`
- `chrome-extension/share.js`
- `components/AdminEmployeeActivity.tsx`
- `components/AdminMyWorkTime.tsx`
- `components/AdminScreenSharePopup.tsx`
- `components/AdminTimeTracking.tsx`
- `components/ClientChatPanel.tsx`
- `components/EmployeeActivityOverview.tsx`
- `components/ExtensionConnectCard.tsx`
- `components/ExtensionDevices.tsx`
- `components/ExtensionHealthBanner.tsx`
- `components/PresenceHeartbeat.tsx`
- `components/ScreenShareViewer.tsx`
- `components/WhatsAppBridgeAdminCard.tsx`
- `components/WhatsAppBridgeManager.tsx`
- `components/WhatsAppChatWidget.tsx`
- `lib/activityIntervals.ts`
- `lib/activityPagination.ts`
- `lib/employeeActivity.ts`
- `lib/extensionAvailability.ts`
- `lib/visiblePolling.ts`
- `lib/whatsappBridge.ts`
- `lib/whatsappBridgeRequests.ts`
- `lib/whatsappTranslation.ts`
- `public/downloads/freelance-hq-chrome-extension.zip`
- `public/downloads/freelance-hq-whatsapp-bridge.zip`
- `tests/activity-intervals.cjs`
- `tests/extension-batch-matching.cjs`
- `tests/extension-devices.cjs`
- `tests/extension-health.cjs`
- `tests/extension-request-backoff.cjs`
- `tests/visible-polling.cjs`
- `tests/whatsapp-chat-matching.cjs`
- `tests/whatsapp-my-chats-ui.cjs`
- `tests/whatsapp-request-priority.cjs`
- `tests/whatsapp-search.cjs`
- `tests/whatsapp-send-confirmation.cjs`
- `tests/whatsapp-stale-peek.cjs`
- `tests/work-time-regression.cjs`
- `whatsapp-bridge-extension/README.md`
- `whatsapp-bridge-extension/content-whatsapp.js`
- `whatsapp-bridge-extension/manifest.json`
- `whatsapp-bridge-extension/popup.css`
- `whatsapp-bridge-extension/popup.html`
- `whatsapp-bridge-extension/popup.js`
- `whatsapp-bridge-extension/service-worker.js`

## Updated integration files

- `.github/workflows/typecheck.yml`
- `AGENTS.md`
- `README.md`
- `app/(app)/admin/page.tsx`
- `app/(app)/layout.tsx`
- `app/(app)/page.tsx`
- `components/AdminDashboardOverview.tsx`
- `components/AdminWorkflowLauncher.tsx`
- `components/MemberFocusDashboard.tsx`
- `components/MobileNav.tsx`
- `components/Sidebar.tsx`
- `lib/actions.ts`
- `lib/security/adminNetworkPolicy.ts`
- `lib/store.ts`
- `lib/types.ts`
- `middleware.ts`
- `tests/admin-network.cjs`
- `tests/hosting-login-routing.cjs`
- `vercel.json`

New files: this document, the retirement migration, `lib/retiredHumanExtensions.ts` and `tests/retired-human-extensions.cjs`.
