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

# Team Management / Hosting workspaces

### App Hosting plan contracts

### Recorded service status controls
`ServiceCreateOptions` defaults standard packages to Active and allows Pending. App Hosting always starts Pending until a matching server receipt exists. The server assignment RPC accepts explicit Active/Pending; omitted status stays Pending for old clients and retries. `ServiceStatusControl` changes only recorded status through the admin/MFA-protected `changeHostingServiceStatus` action and transactional `set_service_status` RPC, with an expected-status conflict check and audit. Failed requests leave the saved selection unchanged and show an actionable error. Edit no longer requires the redundant manual activation checkbox; the App receipt trigger still enforces activation. Recorded suspension/cancellation does not send VPS stop/delete commands. Migration `20261030221427_hosting_service_status_controls.sql`; regression tests `hosting-service-status.cjs` and `hosting-service-status-ui.cjs`.

### App Hosting accounts (identity, receipts, activation)
One assigned App Hosting contract (immutable `package_snapshot`: package, version, 23 limits, digest) is one **account** (`freelance_hq_hosting_accounts`, migration `20261030090000_app_hosting_accounts.sql`). All websites of the account are rows of `freelance_hq_hosting_account_sites` and draw on ONE `website_limit` (row-locked trigger); the primary website has the SAME id as the contract service, so existing per-website screens/commands keep working. Additional websites are added with `freelance_hq_hosting_add_site` (account must be `enforced`) and are valid targets of the existing `source.*` commands only when their site row is `verified` and the account is `enforced` (`serviceScope` merges them).
The only way to `enforced` is a VPS status that repeats the account, client, assignment UUID, limits digest, package and version and carries a receipt digest (`freelance_hq_hosting_record_app_status`, also re-checked in `lib/hosting/appAccounts.ts`). A service can become Active only for an enforced account whose digest still equals the frozen contract (trigger text: "App Hosting server enforcement is not verified"). The legacy one-site worker never receives an App contract (`hosting.provision` stays denied). New owner-only commands `hosting.app.provision|status|usage` need `HOSTING_APP_ACCOUNTS_ENABLED=approved` (default off) and rebuild the wire request from stored rows (the browser sends ids only). Usage is stored exactly as the VPS reports it (`unknown` stays `unknown`); customers get a read-only account summary on `/client/plans`. Enforcement mechanisms per limit, blocked features and decisions: `docs/app-hosting-enforcement.md` in the automation repository. Tests: `tests/hosting-app-accounts.cjs` (Postgres engine), `tests/hosting-app-provisioning.cjs` (also against the real Python gateway when `HMS_AUTOMATION_SOURCE` is set), `tests/hosting-limits-fixture.cjs`.

`lib/hosting/packageLimits.ts` defines finite versioned App Starter/Business/Pro
limits and their shared SQL/TS canonical SHA256 representation. Zero disables an
optional resource; it never means unlimited. Package records carry product_kind,
resource_limits, pricing_ready and limits_version. The additive app_hosting_packages
migration creates the three unpriced plans and maps only the existing matching
server; it does not mark the server available or enable any runtime.

All new assignments use the admin-only transactional assign_service RPC, with
idempotency and authoritative plan pricing. Retry hashes exclude server-derived
price/currency/cycle so catalogue changes do not break a retry. App assignments atomically snapshot
name/version/limits/digest/pricing readiness. Editing a catalogue never changes
existing contracts. Unpriced assignments cannot bill, and App assignments can be
manually marked Active only after server enforcement is verified. The legacy one-site provisioning worker cannot enforce all
account-wide app/mail/database/traffic budgets, so managed.ts rejects dispatch of
App contracts until a matching worker/enrollment integration is implemented. Do
not bypass this to make the UI look live. These are real saved plan assignments,
not proof of VPS enforcement. Existing standard packages retain their behavior.

Owner Packages shows editable plans and links into service assignment. The new
/client/plans catalogue authenticates the current customer, exposes only safe
product columns and joins no other client's data. App assignments are filtered
before pagination, so old plans remain reachable beyond the first 25 services. Assigned limits on customer
services come only from their saved snapshot. No price is invented: seeded zero
values are marked unpriced and must be explicitly confirmed before billing.
Tests: hosting-package-contracts.cjs, hosting-package-views.cjs, provisioning,
client-scope and existing security tests. No VPS, visibility release gates or
Next.js/automatic deployment flags are changed by this update.

### Professional email domain setup (onboarding rollout)

Owner `/hosting/email` uses `EmailWorkspacePanel` and server-only
`lib/hosting/email/{actions,schema,dns}.ts`. Hosted primary domains are discovered
from active/pending services of active clients; ownership is trusted ONLY from a
currently enforced App account with a receipt. Manual Active status is not proof.
External domains receive a stable random 256-bit TXT challenge. Exact TXT content
is checked through bounded DNS queries; an outage is distinct from missing proof.
The settings tab `/hosting/settings/email` stores public mail endpoint metadata
and the independently verified host-key fingerprint, never mail passwords or API
credentials. Neither these settings nor MX presence prove delivery.

Private email-domain/settings tables and admin-asserting SECURITY INVOKER RPCs
have no anon/authenticated grants. Browser never submits DNS observations or a
hosting service mapping; the server derives both. DNS observations retain their
MX target; settings changes invalidate the displayed match. Hosted verification
is derived fresh rather than saved as permanent proof. No GET creates domains.

For a linked, verified hosted domain, `EmailMailboxPanel` checks the exact enrolled
mail domain before exposing mailbox requests. Passwords use existing X25519 sealed
transport and the independently pinned fingerprint. Existing provider worker,
quota policy and independent owner signature remain mandatory. Owner email page
now embeds `OwnerApprovalsPanel` in email-only mode; its CSP allows only the same
fixed local signer origin as source/backups pages. Client email is unchanged.
Submitted unknown outcomes disable further writes; no automatic retry/signing.

`EmailDnsAssist` optionally prepares ONLY an additive ownership TXT through the
existing Dynadot review/typed-domain/one-shot flow; it never silently changes MX,
SPF, DKIM or nameservers. Other DNS is preserved by existing server checks.
SPF/DMARC presence is labelled presence only; per-domain server-generated DKIM,
actual routing, authenticated delivery and sender policy need separate verification.

**Rollout limit:** external domains can be saved/verified but have no mail-only
service provisioning integration yet. They cannot create mailboxes merely by
proving DNS ownership. Existing App account mail_send is currently blocked; never
remove that policy, infer send readiness from mailboxes capability, or label
mailboxes ready based on portal setup alone. `scripts/email/inspect_mail_readiness.py`
and its pinned PowerShell launcher are a single read-only enrollment/TLS check;
not executed on the VPS by Codex. No provider mutation or message delivery is part
of that check. Tests: `hosting-email.cjs`, `hosting-email-db.cjs`, actual Chromium
`local-checks/email-workspace-browser.cjs` with synthetic actions only.

### Owner hosting visual system

The owner `/hosting` workspace uses the approved navy sidebar / blue controls /
light content style in `app/(app)/hosting/hosting.css`, scoped by `WorkspaceFrame`
and `.hosting-shell`. Team and separate client themes retain their existing scope.
`WorkspaceChrome` supplies a page finder (not global record search), breadcrumbs
and House My Site branding. `HostingNavigation` groups every existing tab without
removing routes. `RecordEditor` uses an accessible native modal dialog for existing
server forms; `RecordTableView` searches and filters only the current page's records.
The overview displays saved records, admin-declared server availability and package
allowances; it never claims measured usage or verified uptime. Preserve all existing
authorization, action names, approvals, field names and release gates. This UI change
does not enroll workers or activate hosting features. Regression: `tests/hosting-ui.cjs`
and `tests/hosting-workspaces.cjs`, plus the existing hosting security suite.

### Owner hosting control center and setup guidance

`lib/hosting/panelCatalog.ts` maps every existing hosting tab to its features,
next step and related pages. `components/hosting/PanelGuide.tsx` renders owner-only
collapsible guides and a configuration overview on Settings. The overview uses
a real paginated service list and real counts. Labels describe portal switches only, never worker enrollment
or live health. Backup enablement uses the actual gateway value `true`, not
`approved`; source features include their parent gate dependencies.
Unconfigured owner Email, Database, Forms, Source and Backup pages authenticate
the admin first, then render setup guidance without loading provider scopes or the
owner-bound backup context. Enabled pages reuse existing controls, signatures,
protocols and permission checks. No env flags, client visibility, records, limits,
private settings or VPS configuration are changed. Client pages remain unchanged.
Regression: `node tests/hosting-panel-catalog.cjs` (real rendered components/pages,
no secret rendering, all-tab navigation and denied owner/disabled-service cases).

### Provisioning gateway integration (source only; not deployed)

Owner-only primary-domain controls now use `hosting.domain.request` and
`hosting.domain.status` behind HOSTING_DOMAIN_AUTOMATION_ENABLED=approved. Both
service and domain UUIDs are resolved to current saved records; client, service
and exact primary hostname must agree. No browser hostname/provider ID is trusted.
Extra aliases and subdomains are excluded. The private worker rechecks confirmed
provisioning ownership, gates Let's Encrypt flags on all advertised addresses
matching enrolled public VPS addresses, and never equates flags with a valid cert.
The Domains page shows saved DNS/TLS observations with a 15-minute freshness limit.
The portal independently rejects inconsistent expiry/freshness/green responses.
These controls do not change DNS, purchase domains, or make a site Active.
Runtime observation and its optional timer need deployment enrollment; no timer,
renewal or live SSL acceptance is implied by source tests. The read-only root
group broker uses a credential-checked local socket, keeping worker
NoNewPrivileges=yes without granting sudo. See companion automation docs.

`hosting.provision` and `hosting.status` use the existing authenticated services API.
They require a real hosting admin, MFA/session/IP guards, same origin, rate limits,
and HOSTING_PROVISIONING_ENABLED=approved. Browser requests contain only service ID
and an idempotency key. The server re-reads service ownership and pending status,
active client/package, available server and package-server permission before signing
the private VPS request. Private package policy digests are enrolled separately on
the VPS. The Services page shows owner-only ProvisioningPanel when enabled; it never
marks a service Active from queue/provider acknowledgement. Existing client APIs
cannot submit these commands. Runtime must be upgraded/enrolled before enabling.
Source integration is NOT evidence of a live worker or verified website/SSL.

### Website source control: GitHub, ZIP, deploy, export (source only; not deployed)

New `source.*` commands on the existing authenticated services API
(`/api/hosting-services`, owner or client scope): `source.status`,
`source.repositories`, `source.connect`, `source.switch`, `source.disconnect`,
`source.request` (deploy/export), `source.discard` and `source.upload_ticket`.
Schemas live in `lib/hosting/managedSchema.ts`; handling is in
`lib/hosting/managed.ts` (`isSourceCommand`); UI is `WebsiteSourcePanel` on
`/hosting/sources` (owner) and `/client/sources` (client, release feature
`sources` in HOSTING_CLIENT_FEATURES). Required switches:
HOSTING_SERVICES_ENABLED=approved and HOSTING_SOURCES_ENABLED=approved; ZIP upload
also needs HOSTING_SOURCES_UPLOAD_ENABLED=approved. All default off.

Ownership: the browser sends only a service UUID (plus repository/installation IDs
chosen from the list the VPS returned, a branch, version numbers and request keys).
The server re-reads the saved service, requires its client to equal the signed-in
client scope, requires an active hosting client for changes, and sends the saved
client to the VPS, which independently resolves ownership from the confirmed
provisioning receipt and its own actor membership file. Read-only/admin-view
sessions can only call `source.status`/`source.repositories`. Deploy and export are
only queued here; they require a separate owner Ed25519 approval and the explicit
one-shot `apply-source` worker on the VPS. Responses are strict-parsed; a change
response must show exactly the requested repository and version+1. ZIP bytes never
pass through Vercel: `source.upload_ticket` signs a 5-minute ticket (actor, client,
service, size, SHA-256) with the existing portal key and the browser posts the ZIP
directly to the private service. Nothing here publishes to a customer web root,
marks a service Active, or proves a site is live; every response carries
`published_to_web_root:false` and `live_verified:false`. GitHub authorization is an
owner-enrolled grants file on the VPS, not OAuth. See the automation repo's
`docs/website-source-integration.md`. Test: `tests/hosting-sources.cjs` (set
HMS_AUTOMATION_SOURCE to also drive the real Python gateway/SQLite).

### Website publishing, rollback and recovery (source only; not deployed)

`source.request` now also accepts `publish` (a released, publishable tree) and `rollback`
(no tree: the private service picks the retained previous release), and `source.recover`
resolves an interrupted publication. All three need HOSTING_PUBLISHING_ENABLED=approved
(separate from HOSTING_SOURCES_ENABLED), the same service/client scoping as every `source.*`
command, an active client, a non-read-only session, and an independent owner signature on the
VPS. Responses are strict-parsed: the queued job must be exactly the requested operation, and
`published_to_web_root` / `live_verified` are accepted only when the publication object says the
site is live **and** carries health evidence (`lib/hosting/managedSchema.ts`). The portal never
sends or receives a filesystem path, UID or provider ID.

`WebsiteSourcePanel` shows one lifecycle label derived from the private service's report
(`lifecycle()`): Uploaded, Staged, Awaiting owner approval, Staging/Publishing, Live on the
server, Failed (previous site restored) and Uncertain (review required, further changes
blocked). Node.js sources (without a Next.js standalone build) are listed as unsupported and offer
no publish button; the VPS also refuses them (Next.js: see the next section). "Live" means files written,
committed and a one-time marker served by the VPS; DNS/SSL stay on the Domains page.
`tests/hosting-source-lifecycle.cjs` covers every state and the no-live-without-proof rule;
`tests/hosting-sources.cjs` covers gating, scoping, strict responses and (with
HMS_AUTOMATION_SOURCE) the real Python queue. ZIP upload now targets a dedicated listener (see the
automation repo's `docs/website-publishing.md`); the ticket format is unchanged.

### Next.js build, activation, rollback and recovery (source only; not deployed)

A released tree whose runtime is `nextjs` is built on the private service, never in the portal or
the browser. `source.build` (`service`, `tree`, `request_key`, `variables`) queues an isolated build; it
needs HOSTING_SOURCES_ENABLED + HOSTING_PUBLISHING_ENABLED + **HOSTING_NEXTJS_ENABLED**=approved, the
`sources` client feature, an active client, a non-read-only session and the usual service/client
scoping. Build variables are plain, non-secret settings (`NEXT_PUBLIC_*` values reach browsers):
names `[A-Z][A-Z0-9_]{0,63}`, at most 32, values at most 2048 printable characters; reserved names
(`PATH`, `NODE_*`, `NPM_*`, `LD_*`, `HMS_*`, proxies ...) and secret-looking names are rejected by
the schema before any request is made. Runtime secrets are never sent through the portal (they are
set by the operator on the VPS with `scripts/services/nextjs_runtime_env.py`). A build needs no owner
approval because nothing live changes; **activation** is the ordinary `source.request` `publish` of the
built tree (and `rollback` / `source.recover`) and still needs the independent owner signature bound to
the exact artifact digest. The portal never signs anything and the server holds no owner private key.

`source.status` now carries `nextjs`: `state` (`none`, `queued`, `building`, `built`,
`awaiting_approval`, `starting`, `live`, `failed`, `rolled_back`, `uncertain`), `live`, and up to 12
`builds` (artifact digest, Next.js version, redacted log tail, failure reason). The schema refuses a
lifecycle that claims more than the publication proves (`live` needs a live Next.js publication with
health evidence; an uncertain publication forces `uncertain`; a tree is `publishable` only with a
successful build). `lifecycle()` shows the stage in plain language. Trees carry `buildable`. Static and
PHP behaviour is unchanged; a live static/PHP site cannot be switched to Next.js (or back) yet.
Test: `tests/hosting-nextjs.cjs` (strict schemas, gates, proof rules; with HMS_AUTOMATION_SOURCE and
root it also drives the real gateway -> queue -> worker -> isolated build -> runtime -> routed health ->
status flow, rollback, failed build and an uncertain/recovered activation via
`tests/fixtures/hosting-nextjs-harness.py`). Not live: nothing here has run on the VPS.

### GitHub connection and automatic deployment (source only; not deployed)

The GitHub App link is verified, not typed in. `POST /api/hosting-github/start` (session, CSRF, active
non-read-only client, website in scope, HOSTING_GITHUB_ENABLED + HOSTING_SOURCES_ENABLED and the App/OAuth
settings `HOSTING_GITHUB_APP_SLUG`, `_CLIENT_ID`, `_CLIENT_SECRET`, `_STATE_KEY` >= 32 chars) sets a
single-use HttpOnly nonce cookie and returns the fixed `github.com/apps/<slug>/installations/new` URL with
an HMAC state (10 minutes; bound to actor, website, scope and nonce). `GET /api/hosting-github/callback`
verifies state + cookie, exchanges the OAuth code, reads only `/user`, `/user/installations` and that
installation's repositories, DROPS the user token, and sends only the verified result in an internal-only
`source.github_link` command (a browser can never send it; `serviceRequest(..., {internal:true})`). The VPS
re-asks GitHub with the App key and stores the link only for the website's client. The portal refuses a
link response that does not show that installation as active. `source.github_status` (read-only members
may look), `source.auto_revoke` (always allowed while enabled) and `source.auto_resume` (also needs
HOSTING_AUTODEPLOY_ENABLED + HOSTING_PUBLISHING_ENABLED, and must end active) control an owner-signed
auto-deploy policy; the portal cannot create or extend a policy. Test: `tests/hosting-github.cjs`
(with HMS_AUTOMATION_SOURCE it drives the real gateway, signed webhooks and an owner-signed policy via
`tests/fixtures/hosting-github-gateway.py`). Not live: no GitHub App exists yet.

### Owner approvals and runtime secrets (source only; not deployed)

**Approvals.** The owner's Ed25519 key never reaches the portal, its database or the VPS. The owner runs
`scripts/signer/hms_signer.py serve` (automation repo) on their own computer; `OwnerApprovalsPanel` (owner
Website source page only) lists queued requests via `source.approvals_pending` / `source.approval_view`, asks the
signer on `http://127.0.0.1:47419` (`lib/hosting/signerClient.ts`; pairing code typed by the owner, optional
`HOSTING_SIGNER_FINGERPRINT` pin) and relays the signed result with `source.approve`. Every approval binds job
digest (hash of the full intent, which the signer recomputes), the reviewed plan digest, expiry and a single-use
nonce; the VPS verifies and consumes it. Only owner sessions can relay `source.approve`, `source.approval_withdraw`,
`source.approvals_pending`, `source.approval_view` and `source.auto_install` (the latter also needs
HOSTING_AUTODEPLOY_ENABLED + HOSTING_GITHUB_ENABLED + HOSTING_PUBLISHING_ENABLED). `signerContext()` /
`POST /api/hosting-approvals/context` give the signer the service, client and actor derived from the saved
service. When a browser blocks loopback, the panel offers the offline `sign-file` path. The signer cannot
recompute the server plan digest; plan counts are shown as portal/server-reported.

**Runtime secrets.** `RuntimeSecretsPanel` (HOSTING_NEXTJS_ENABLED; both scopes, not read-only) seals each value in
the browser (`lib/hosting/secretSeal.ts`: ECDH P-256 + HKDF-SHA-256 + AES-256-GCM, AAD = format|service|name) to
the server public key from `source.secret_key`, which must match `HOSTING_SECRETS_KEY_FINGERPRINT` (set by the
operator from the VPS key; without it sealing refuses). `source.secret_put/list/delete` carry only ciphertext and
names; no answer may contain a value (strict schemas) and names mirror the service's reserved list. Only the root
runtime broker opens them at activation; changes need a new activation approval. Tests:
`tests/hosting-approvals.cjs` (real gateway, real Signer class and a root-side opener with HMS_AUTOMATION_SOURCE).
Not live: no signer key, secrets key or fingerprint exist on any server.

### Hosting hostname and search privacy

The owner-selected hosting address is `https://web.housemysite.com`.
`lib/hosting/portalHost.ts` is the explicit hostname/origin boundary, shared by
middleware and `getSiteOrigin()`. Match the real Host exactly (case-insensitive,
optional standard443 port); never trust request Origin or arbitrary forwarded hosts
to expand the allowlist. Hosting CSRF checks and recovery/invitation URLs select
this trusted hosting origin; other hosts retain existing APP_URL behavior. The
legacy/shared APP_URL value is not overwritten by this source change.

For this hostname, middleware adds X-Robots-Tag noindex/nofollow/noarchive/nosnippet/
noimageindex and private/no-store to redirects, errors and normal responses.
robots.txt returns Disallow:/ before Supabase access, sitemap.xml and common secret/
WordPress probe paths return404 before any auth/DB call. Next configuration also
covers static assets with the host-scoped noindex header. These are search privacy
and cheap probe rejection, not an authentication boundary or a promise that all
malicious clients are unreachable. Keep server-side sessions, ownership, MFA and
rate limits. Do not install a blanket bot challenge on machine API routes.

On hosting-root entry, effective admins go to /hosting, team members retain their
assigned-work dashboard, and verified hosting identities go to /client through
the existing identity guard. Their existing authorization checks still apply. Hosting login labels
HouseMySite; the legacy login branding and team dashboard remain unchanged.
`tests/hosting-domain-security.cjs` exercises real middleware/response handling,
early crawler responses without auth calls, exact-host origin selection, foreign
Origin rejection, machine-route compatibility and static noindex scope.


Admins can switch between Team Management (`/admin`) and Hosting (`/hosting`) from the desktop sidebar or mobile top bar. `WorkspaceProvider` derives the workspace from the URL, so refresh, deep links and browser Back retain the correct navigation. Returning to Team Management opens the existing admin dashboard and restores its existing menus.

Hosting now provides server/package/client/service records, separate billing (invoices, manual payments/refunds, expenses, reviewed payment claims), renewal invoice generation, domain DNS/TLS checks, support threads, append-only audit events and settings. All new tables use `freelance_hq_hosting_`; migration `20261020202238_hosting_management.sql` is additive; `20261020205241_hosting_indexes.sql` covers ownership/audit foreign keys. Both were applied to the existing Freelance HQ Supabase project and live financial transaction checks passed with rollback (no retained test customers or payments). Agency records are not migrated; an optional client link is explicit.

- `lib/hosting/*` contains strict admin/client authorization, scoped data access, validation, guarded server actions and public-IP-only DNS/TLS probes. Browser database roles have no table or RPC grants; all hosting tables enable RLS. Monetary changes use transactional RPCs with idempotency and balance/currency checks; currencies remain separate.
- Client UI: `components/hosting/ClientNavigation.tsx`, `ClientServices.tsx`, and `app/(client)/client/portal.css` implement the white minimalist sidebar and responsive client-only styling. The account page shows existing contact details; changes are requested through support.
- `app/(client)/client/*` is a separate client shell. Verified invitations/account links grant access to owned services, invoices, payment claims and support only. Hosting identities (including revoked ones) cannot auto-create team profiles or enter team routes. Private admin notes/internal support messages are never selected for clients.
- Hosting Clients includes a one-click POST “Open client portal” read-only inspection. The original admin authentication remains unchanged. A domain-separated HMAC-signed, actor/client-bound, HTTP-only Strict SameSite cookie expires in 30 minutes; every request rechecks effective and database-backed admin access and target existence/status. The client shell shows an admin banner and return action; client writes are rejected server-side, not merely hidden. Start/return events are audited under the real admin. Logout clears the inspection cookie. `20261020211243_hosting_admin_client_summary.sql` provides client-scoped admin totals with no browser RPC grant; applied live and checked with rollback for target scoping, non-admin denial and closed-client denial.
- `/auth/invite` handles invitation code/token-hash and fragment flows. Configure this exact app URL in Supabase Auth redirect allowlist before sending client invitations. Invitations are only sent by an explicit admin form action.
- `/api/cron/hosting-renewals` requires `CRON_SECRET`; scheduled renewal invoicing is off by default. Manual generation works without it. Paying a period's invoice advances its service due date once. No email reminders or online payment gateway are connected.
- Server entries and service activation remain admin declarations. Note-only jobs remain `awaiting_connection`; the new signed manual transport is OFF by default. `operatorProtocol.ts`, `operator.ts`, bounded `operatorBody.ts`, `/api/hosting-operator` (exact machine-auth middleware exception only) and its admin/MFA/same-origin `/dispatch` endpoint implement per-server scoped claims and receipts. Migration `20261027182003_hosting_operator_transport.sql` adds private operator enrollments (disabled by default), host mappings and delivery records with service-role-only invoker RPCs; applied live during the approved initial launch; enrollments remain disabled. Existing host keys/roles/signatures remain authoritative. `cancel`/delete/rollback are not executable v1 operations; no shell execution or private signing keys enter the portal. Admin Operations distinguishes delivery/receipt observation from request status. Do not infer a running website from applied Intake intent. See `docs/hosting-operator-transport.md`; evidence/storage/recovery live enrollment and VPS installation still need owner inputs and approval.
- Desktop sidebar gives the navigation the full space between the fixed header/switcher and account footer. Rows keep a minimum 40px height without shrinking; `overflow-y-auto` scrolls only when the list exceeds that available space. There is no competing flex spacer. The sidebar scrollbar track/thumb are hidden in Firefox/WebKit while wheel, touch and keyboard scrolling remain available.
- `WorkspaceProvider`, `HostingNavigation` and `hostingWorkspace.ts` preserve desktop/mobile switching. Team-only floating tools are unmounted in Hosting; existing team routines remain intact.
- Checks: normal typecheck/lint/build, `node tests/hosting-workspaces.cjs` and `node tests/hosting-security.cjs` and `node tests/hosting-client-scope.cjs`. Isolated PostgreSQL integration: install pinned `@electric-sql/pglite@0.5.10` outside the repo and run `NODE_PATH=<install>/node_modules node tests/hosting-database.cjs` (verify the installed version used in release notes).

---

# Roles and Access

Admin-only `/team` reuses AdminTeamPanel for roles, job roles, project grants, finance/renewals/credential access, invites and account management. Each member has a one-click POST “Open as member” control and an admin-gated `/team/view/[id]` access link (GET only shows the launch form). Member view keeps the original verified Supabase session; getCurrentProfile applies the selected member’s permissions only while the actor still has database-backed admin access. The HTTP-only Strict SameSite cookie is actor-bound and expires in one hour. A persistent banner returns to admin; member presence heartbeats are suppressed during admin inspection. Real member actions affect real records. No member passwords or login tokens are put in links. Logout clears the view cookie.

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

Root `/` sends effective admins to `/hosting` on web.housemysite.com and `/admin` on other hosts, and keeps the member focus dashboard for effective members on every host. Hosting customers are routed to `/client` by the existing verified hosting-identity check in getAuthenticatedProfile; the team member role alone never grants hosting-client access. The obsolete root admin overview is removed; project detail routes remain. TaskDetailModal also uses a viewport-bounded body portal, fixed header/footer and internal scrolling. Assigned workflow task popups reuse SeoWorkflowPanel for login/contact/placement editing; their server loader verifies the saved task owner and project access. Workflow forms expose the saved login/contact fields consistently, preserve encrypted passwords and require explicit password reveal.

AdminWorkflowLauncher (Start My Work, including related team requests) uses a body portal and a viewport-bounded fixed-height flex dialog. Header and action footer do not grow with the queue; the middle content scrolls. Very short screens also permit scrolling inside the bounded header/footer. Close, Cancel and Escape dismiss without completing work; focus stays inside the dialog and returns on dismissal. Background scrolling is locked only while visible.

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

Migration 103 supplies categories to future GSC/GBP cycle tasks. Migration 102 fills seeded SEO categories and carries the fresh batch into the current issuance day during release, retiring any legacy task created in the transition without changing source progress or time history. Migration 101 retires the former Maaz/Junaid automatic queue by prefixing keys with retired:, unassigning unfinished entries, and preserving completed/source/time history. Retired entries are excluded from operational project/open/member task lists and ownership setters cannot revive them. Fresh workflow keys include tabplan-v2. One fresh pending item per owned project/tab is seeded alongside current GSC/GBP cycles; demo guest tasks are replaced by actual prospect research, and placeholder records are omitted from live workflow panels. Completed source checks carry forward. The generator excludes demo placeholders and legacy GSC/GBP items (structured review tasks cover those), and uses strict saved owners where a project has a tab plan.

The approved eight-project tab plan is applied by migration 100: Maaz owns Website Pages, Technical SEO, Blog Onsite and GSC; Junaid owns remaining Full Website tracking/setup, Social Media, Local Listing, Web 2.0, Guest Blogging, GBP and general recurring. Full Website technical items route to technical_seo. GSC/GBP review cycles create real member tasks through invoker database triggers. Saving review sections syncs their task checklist; finishing the cycle closes its task/timer and creates the next cycle task with a stable ID. Review tasks can start/pause normal focus timers. Assigned owners and admins can edit review checks directly from task cards and Full Details. These changes save the current structured review through its revision-checked RPC, preserve rows/notes, and finish the cycle automatically on the last check. Completed/stale cycles are rejected. Project review tabs remain available for detailed findings. Changing a review owner first closes the former member’s current review session and clears focus before the task transfers, retaining time history. Removing a GSC/GBP owner through the assignment action closes review timers and clears their open task assignment. Technical SEO has one tab-level owner control. Both member dashboard routes use the shared MemberFocusDashboard. Its assigned SEO tabs overview is removed; saved tab ownership and automatic task routing remain in place. System-created review tasks are excluded from the manual-task gate, so they do not block daily generation for other assigned tabs; undated reviews appear before legacy automatic work while manual/scheduled priorities and pauses remain intact. Archived projects and AI Ranko/Make Invo stay unassigned; completed tasks and running sessions are preserved. Paused/admin controls follow transferred tasks; historical sessions stay with their original worker.

GSC, GBP and remaining recurring checks have independent assignment groups (`gsc`, `gbp`, `recurring_general`). `seoAssignmentRouting.ts` resolves original workflow items to these groups, preserving original IDs and legacy module-owner fallback. Migration 099 extends allowed groups. Eight existing team SEO projects have GSC owned by Maaz and GBP/general recurring owned by Junaid; AI Ranko/MakeInvo remain unassigned. Matching inactive open tasks were rerouted; active timers/admin requests and completed tasks were preserved. New group routing/UI requires this release; Migration 100 subsequently adds structured review tasks.

GSC and GBP have separate tabs (`seoTab=gsc/gbp`): SeoReviewPanel, lib/seoReviewConfig.ts, lib/seoReviews.ts and lib/seoReviewActions.ts. Migration 098 was applied to production on 2026-10-11. Reviews save with optimistic revision checks in a transactional RPC. Saving a fully checked cycle archives a snapshot and resets only review checkboxes; rows/notes (including unresolved URLs) carry forward. Prior cycles are read-only. Current-cycle review rows can be removed; removal does not alter archived snapshots. Manual entry only: no Google APIs, automated indexing/disavow, is implemented. Review cycles now generate assigned tasks through migration 100. Existing GSC recurring and GBP setup records are shown in their respective tabs with original identities preserved.

Technical SEO has a dedicated tab (`seoTab=technical`) grouping page technical checks, sitewide technical setup and recurring technical reviews. `lib/seoTechnical.ts` defines grouping. Website Pages retains content/headings/meta/keywords; Full Website retains tracking and business setup; Recurring SEO retains nontechnical reviews. Grouping preserves existing database IDs, progress, module owners and task routing; technical workflow ownership is now independent through technical_seo; page checks remain owned by Website Pages (both are Maaz under the approved plan). No migration is required.

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

Hosting registrar management: `/hosting/registrar`, linked from `/hosting/domains`, is a dedicated Domains sidebar tab with a combined portfolio UI: account-wide summary cards (total, expiring within30 days, auto-renew, locked), server-grouped/filterable/paginated inventory, and a selected-domain split panel (stacked above list on small screens). `DomainInventory`, `DomainDetailsPanel`, `DomainHistory` and `DomainReview` separate views from the existing guarded actions. The read-only service-role-only `freelance_hq_hosting_registrar_inventory` RPC (migration `20261031123124_hosting_registrar_inventory.sql`) authenticates admin and current connection generation, calculates numeric expiry groups/global counts BEFORE filtering/pagination, and never reads credentials or calls Dynadot; the browser cannot execute it. Figures describe saved inventory, not live uptime. Manage loads fresh provider details. DNS opens `DomainDnsDialog`, a native accessible modal with keyboard/backdrop close, live records, exact add/remove and a guided Edit: separately reviewed removal followed by separately reviewed replacement, never automatic two-write execution. Original removal is not undone by clearing the draft. Unknown record metadata that cannot round-trip through supported intent is displayed read-only rather than silently truncated. External DNS stays read-only. Nameservers, renewal quotes, lock/auto-renew and history remain in the split panel. Successful mutation/reconciliation returns its existing verified readback to refresh the panel without an extra provider call. Source browser fixture `local-checks/domain-workspace-browser.cjs` never uses real credentials; CI pins Playwright1.62.1 and verifies actual Chromium popup, two explicit confirmations, preserved unrelated records, Escape and mobile fit. API setup stays in Settings. The owner connection form lives in Settings → Domain settings at `/hosting/settings/domains` (`RegistrarConnectionPanel`), alongside the General settings tab (`HostingSettingsTabs`). Connected accounts show a compact saved-connection summary; connection updates are explicitly opened, password fields are never populated, saving reuses the existing tested/encrypted action and clears them. Disconnected domain pages link to settings without credential inputs. Both routes use `registrarSummary` (admin authentication before selecting only mode/verified_at/sync_at; no credential loading/decryption). All new provider credentials, API setup and similar integration configuration belong under Hosting Settings, not operational domain pages; domain DNS/renewal forms remain on domain management. This is a separate owner-only Dynadot REST v2 integration (`lib/hosting/registrar/{api,schema,store,workflow,actions}.ts`, `RegistrarPanel`). It tests the API key+secret before encrypting them with DYNADOT_SECRET; sandbox/live use separate origins and inventory generations. It does not reuse or overwrite the legacy key. Sync is paginated with a durable run/cursor and completeness check; failures keep existing inventory. Inventory is account-owned, not assigned to hosting customers. Manage loads fresh provider ownership/details. Lock, auto-renew, nameserver changes, exact DNS add/remove and 1–10 year USD/GBP/EUR renewals when Dynadot provides a matching duration price require an expiring persisted review and typed domain confirmation. Claim is transactional, one-shot and global; unresolved requests block new writes/key changes. Unknown/crashed outcomes require read-only reconciliation and never retry automatically. Provider readback must match the requested result; readback alone is not a full billing acceptance test. Missing/ambiguous owned-domain renewal pricing blocks renewal rather than estimating a TLD price. DNS writes require Dynadot DNS and never submit a whole-zone replacement. Editing a record uses separately reviewed removal/addition. Domain transfers, contact updates, registration, DNSSEC and non-Dynadot DNS are not exposed in this release. Existing admin/IP/MFA/session guards and server-only storage remain. Browser roles have no table/function access. New tables/functions are migration `20261031083515_hosting_dynadot_registrar.sql`. Tests: `hosting-registrar.cjs`, `hosting-registrar-db.cjs`, `hosting-registrar-ui.cjs`. Live provider acceptance requires owner credentials and a selected test domain; no API keys or provider changes are made by deploying the feature.

Fixed-IP transport: `DYNADOT_RELAY_ENABLED=approved` routes every new registrar API request through the existing HTTPS `HOSTING_SERVICES_ORIGIN` at `/v1/dynadot-relay`, using the existing server-only `HOSTING_SERVICES_PORTAL_KEY` with a separate HMAC context. Unset retains direct behavior; malformed/partial enabled configuration fails closed. No direct fallback or retry. The relay receives only the provider key and already-generated signature, never its signing secret. `scripts/dynadot-relay/relay.py` is a separate TLS loopback18444 service as existing hms-services, fixed production/sandbox Dynadot destinations and supported REST routes only, IPv4 egress, bounded requests/concurrency and durable replay claims before upstream dispatch. Mutation request IDs are permanently retained so a fresh envelope cannot repeat a possibly accepted purchase. It reuses the existing internal TLS certificate and portal key without rotating them. Its restricted shared identity inherits hms-services access; this is not independent OS tenant isolation. Installer adds one exact route to the existing server1 HTTPS vhost only after checking the existing service route/TLS settings, stores a root-private backup, configtests/reloads and verifies signed health, invalid signature, replay, GET denial and existing root behavior. Failure restores Apache where no concurrent edit exists and stops relay; never automatically reinstall or delete its replay ledger. Health verifies TLS reachability and the socket source IPv4, not provider authentication/public NAT mapping. VPS installation and portal enablement are separate from source deployment; leave the flag absent until owner installation passes, correct IP is allowed and exposed provider keys have been rotated. See `docs/dynadot-fixed-ip.md`; regressions `hosting-registrar-relay.cjs`, `test_dynadot_relay.py` and mandatory disposable TLS Apache integration `hosting-relay-apache.py`.

Dynadot-specific legacy logic:
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

All native manager controls are disabled for the full duration of a manual request, including team-access chips, so clicks cannot change optimistic state while their server action is skipped.

My WhatsApp Chats has its own query state and Enter-key search. Manual actions hold an explicit async lock and pause live conversation polling; outdated peek results are discarded after changing chat or starting a manual action. Server request claiming prioritizes explicit actions over background peeks; new peek requests expire after 30 seconds and direct sends after 90 seconds. Expired processing requests are also closed, avoiding permanent processing states.

Bridge v1.3.6 rejects chat-search rows unless the displayed name/phone matches the submitted query, verifies inserted search text and waits past stale chat-list rows. Chat opening, sending and syncing require an exact header-name match; cached targets and a visible composer alone do not verify recipients. Stable ID/phone targets cannot silently fall back to a different label. Sending is acknowledged only after a new matching outgoing message appears. Visible message/composer text preserves rendered line breaks for multiline confirmation. Fixtures cover these failure paths; actual user-profile behavior remains to be verified after extension reload.

Bridge v1.3.4 locates visible chat search inputs across sidebar/wrapper layouts, skips hidden/compose/dialog inputs and waits for Chats/search UI to open. Download buttons use the standalone versioned WhatsApp ZIP. Exact-chat matching and manual history-sharing rules remain in place. Search fixtures pass; user-profile live testing still requires reloading the installed extension.

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
- **1.3.6**

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

The user explicitly authorized release of the pending team-app fixes on 25 October 2026: admin/workflow popup sizing, root admin dashboard routing, and workflow login/contact editing from assigned member tasks. This authorization does not cover unrelated hosting/operator draft PRs.

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

- Added owner Dynadot REST v2 connection, paginated registrar inventory, guarded domain changes, renewal review, durable audit and uncertain-result reconciliation. Legacy inventory and customer assignment stay separate. Provider acceptance awaits credentials.

- Added initial Active/Pending selection (standard default Active; App pending until verified), inline recorded-status dropdowns, clear activation errors and audited status-only updates. Preserved receipt, billing, admin and MFA guards; removed the redundant manual activation checkbox.

- Added App Hosting package limits, unpriced Starter/Business/Pro catalogue records, customer plans and assigned limit snapshots, owner assignment links, transactional/idempotent service assignment and billing/activation guards. VPS enforcement remains pending and App contracts are blocked from the legacy worker.

- Implemented the approved navy/blue owner Hosting UI across the existing tabs: grouped sidebar, light workspace, real overview list, current-page search/status filters, and right-side add/edit drawers. Existing server actions, financial controls, owner approvals and security gates are retained; no production hosting flags are enabled by the redesign.

- Added the owner hosting control center, all-tab feature guides, connection-setting labels and safe setup pages for disabled integrations. Existing backend actions and client release gates are preserved.

- Added owner-only primary-domain link/SSL request and saved-status controls,
  authoritative service/domain ownership checks, strict TLS observation validation
  and isolated regression tests. No production flag, timer or deployment enabled.

- Added the owner-selected web.housemysite.com hosting origin, hosting entry/login branding, scoped noindex headers and robots/probe responses. Kept existing shared-app origin fallback, authenticated route/MFA/ownership checks and machine protocols. Added domain-security regression tests to CI.

- Employee monitoring extension v1.2.5 adds persisted, shared cooldown state after failed requests (1/2/4/8/15-minute backoff, jitter and bounded Retry-After; direct 402 waits at least 15 minutes), a single in-flight authenticated request per context and 20-second network timeouts. Failed upload batches remain queued within the existing 500-event/100-prompt bounds; those existing overflow limits still apply. Screen-share polling cannot overlap and now sends the required installation/device headers. A per-server-instance 60-second outage circuit returns sanitized 503/Retry-After without caching successful authentication or bypassing revocation. Popup reports paused sync. Login now distinguishes an unavailable security backend from a genuine rate-limit denial while still failing closed. This reduces retries; it does not lift Supabase quota restrictions. Extension users must update/reload locally; no production deployment or database change is included.

- Consolidated the authorized team-app release: bounded admin workflow/task popups, root admin dashboard redirect, consistent workflow login/contact fields and direct assigned-member editing. No schema changes. Deployment status must be verified against the Digigrow project serving hqproject.com and the lake.vercel.app alias.

- Fixed the screenshot-confirmed Start My Work popup in AdminWorkflowLauncher: centered, bounded viewport height, scrollable related tasks, compact persistent actions, Close/Cancel/Escape and focus containment. This is distinct from TaskDetailModal. Browser fixtures passed with 1 and 150 tasks at 1920×1080, 1366×768, 1024×600, 390×844, 320×480 and 844×390, including transformed-parent containment and Escape dismissal. Deployment remains on user hold.

- Registered the owner-verified Contabo server1 inventory as draft (4 vCPU, 8 GiB RAM, 150 GiB physical disk; nominal totals, not free allocation). Its admin-only Connection page reads digest-bound, owner-authored health/services reports from the existing restricted GitHub/Windows bridge via server-only HOSTING_BRIDGE_GITHUB_TOKEN (Issues read-only, pinned repository/account). Reports older than 24h are historical; checking does not execute an audit or prove production readiness. No SSH, provisioning or production operator is enabled.

- Refreshed authenticator screens with responsive white/blue HouseMySite styling. Settings → Security and client Account link to own-account authenticator management. Removal requires explicit confirmation, a fresh code for an owned verified factor, active session and rate limiting; refresh session after removal. Hosting admin MFA remains mandatory.

- Security deployment mapping resolved after owner reconnected the Hamza Vercel account. Added the missing server-only anon-key setting and canonical APP_URL; rebuilt commit `fe53e709` for Production as `dpl_BrCocBQHeFPWF7wJ3BBtZbqu1yuk` (READY), attached to the original application alias. MFA still requires owner enrollment; authenticated live testing, critical dependency upgrades and recovery work remain open. See `docs/hosting-security-review.md`.


- Hosting hardening: mandatory admin TOTP enrollment/verification, live session revocation and 24h hosting-session checks, private transactional rate limits, HttpOnly/Secure auth cookies, safer recovery redirects, stronger reset passwords, fail-closed team roles and server-only secret modules. Migration `20261021095631_hosting_security_hardening.sql` adds only hosting-prefixed state and restricts legacy trigger RPC grants. See `docs/hosting-security-review.md` for verification and remaining deployment/enrollment/dependency limitations.


- Restyled the client portal with the selected white minimalist HouseMySite sidebar and blue accents. Added responsive active navigation, scoped light styling, service detail disclosures, billing tabs and a read-only account page. Existing billing/support actions and signed admin inspection remain intact. No database changes or new server controls; contact support handles account/service changes.


- Hide the sidebar scrollbar without disabling scrolling; add signed, expiring, audited read-only client inspection from Hosting Clients with live admin authorization and a return control.

- Corrected sidebar sizing: full available navigation height, nonshrinking menu rows/icons and automatic overflow only when needed, with account controls kept at the bottom.

- Added the Hosting management/admin and separate client portal with prefixed tables, manual financial ledger, renewal invoices, domain checks, support and scoped access. Server execution and gateway payments remain unconnected; validate release status before claiming deployment.

- Queue release follow-up: supplied seeded task SEO categories and handled a midnight legacy-generator carryover without resetting work.

- Retired legacy Maaz/Junaid automatic tasks and seeded fresh tab-plan work; hid retired data from operational queues while preserving source progress and time history.

- Added the Team navigation/page, member settings and admin-only member-view launch/return with actor-bound expiry and member permission checks. Prepared locally; deployment not confirmed.

- Review owner transfer now closes the old owner’s session before changing the task assignee, preventing orphaned timers.

- Review task follow-up: Start works with focus timers, Unassigned clears current review tasks/timers, and Technical SEO uses one owner control.

- Applied the full approved SEO tab workload to eight team projects, corrected existing inactive task owners, retained pause/admin-request state, and added cycle-linked GSC/GBP tasks with direct review links.

- WhatsApp follow-up: the manager disables its entire form while a manual request runs, including team-access controls, preventing optimistic changes that are silently skipped.

Keep this section short and newest-first. Every future app update must add an entry here and update any affected section above.

## 2026-10-11
- My WhatsApp Chats search/polling correction: independent query, Enter handler, async action lock, stale peek guard, manual request priority and short peek expiry. Live bridge verification: one scan completed with no matches; the next scan stalled as heartbeats stopped and was cancelled. No live open/history/send pass is claimed; no message was sent.
- WhatsApp v1.3.6 preserves rendered multiline text during composer checks and send confirmation, preventing false failure reports after successful multiline sends.
- WhatsApp follow-up v1.3.5: live Hamza scans returned unrelated names; fixed unfiltered/stale results, exact-recipient guards, current-chat sync validation and false-positive send acknowledgement.
- WhatsApp bridge search compatibility fix: live scan requests showed search-box-not-found while connected. Added visible-input/wrapper lookup and Chats activation retry; version 1.3.4 standalone ZIP replaces full-repository download.
- Applied the approved three-tab split in production for eight team SEO projects (24 owner records). Added independent assignment bars and item-level automatic routing. Existing inactive matching tasks reassigned; active/completed/admin-request tasks retained. Migration 099 applied; code deployment not yet confirmed.
- Work-time correction prepared: duplicate/overlapping intervals count once, unattended checkpoint gaps are capped at 90 seconds, and repeated uploads use stable event IDs. Raw historical logs are preserved. Extension closure has the same gap cap; release not yet confirmed.
- Timer-deferral follow-up now scopes closure by both task and acting member; regression coverage includes an open previous-assignee session.
- Release follow-up: deferring a queued task closes only that task’s time entries, keeping a different active timer running. GSC/GBP rows can be removed from the current cycle without changing archived history.
- User authorized production release. Database migrations 097/098 applied; rollback verification passed for save, revision conflict, history and carried-forward rows. Review saving now stays disabled for the full asynchronous request; rescheduling clears stale timestamps.
- Added local GSC/GBP recurring review tabs with structured records, indexing status tracking, original-photo fields, immutable cycle snapshots and carried-forward data. Migration 098 applied and transactional save/history/carry-forward verified with rollback; release authorized by user.
- Approved workload plan saved in config/seo-workload-plan.json: Maaz owns pages/technical/blog; Junaid owns remaining Full Website setup, social, local, Web 2.0 and guest work. Recurring is split by work type; both record evidence and Hamza reviews reports. Plan was subsequently applied with migration 100.
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

- Added owner-only provisioning request/status source wiring and Services controls.
  Pending owner approval, provider confirmation and live verification stay distinct.
  No production activation or client feature publication is implied.

If you change how the app works and do not update this file, the task is incomplete.

- Removed the assigned SEO tabs overview above member tasks on both dashboard routes. Existing task cards, assignments and history are preserved.

- Enabled assigned GBP/GSC review checkboxes on task cards and Full Details, preserving review data and automatic cycle completion. Server validates task/project/owner and cycle before saving.

- Browser Activity is now directly accessible in desktop and mobile admin navigation. Its initial timeline defaults to the last 30 Pakistan-calendar days, matching the selected filter. Existing member/site/date/AI filters and detailed saved prompts remain admin-only.

- Admin layout polls live screen shares every three seconds and displays an invitation before creating a viewer connection. Approve opens a compact muted viewer; expand/shrink retains the same stream, and close/dismiss affects only the admin view. Ended shares close the peer. Dedicated screen-viewer routes suppress the popup viewer to avoid competing connections. Member browser screen-capture consent remains required.

## Extension management

/extensions is available to signed-in users. Members see monitoring only; admins also see the WhatsApp bridge card and setup link. Monitoring downloads always remain available in this page, including after pairing. The dashboard download hides only while a device is reporting; non-reporting/expired records keep download and reconnect available. A reported offline/disconnect state immediately exposes recovery controls on the next status refresh. Removing a Chrome extension cannot be detected immediately; stale reporting is detected after the heartbeat window. /api/extension/devices lists only safe fields for the signed-in user and disconnects only their own device, preserving activity history. Add another monitoring profile always creates an independent pairing code.

- Added the role-aware Extensions page, persistent downloads, own-device disconnect and another-profile pairing controls. Fixed missing dashboard download for stale paired devices.

## Supabase recovery and request reduction — 2026-10-27 (local preparation)

Owner reports Supabase recharge. Live read-only checks confirm PostgreSQL17.6 and
all18 hosting tables have RLS enabled with no anon/authenticated/PUBLIC table grants.
All3 operator transport tables are still absent. The earlier outage retry fix is in
unmerged draft#230 at21b6e02; current main53c3327 contains the approved#229 popup
changes, while latest observed READY production uses5a3a4dd. Do not call new fixes live.

Additional LOCAL fixes: employeeActivity loads one lazy matcher snapshot per upload,
not per event/prompt (100-event batch2 matcher reads instead of up to200). The snapshot
is never shared across requests or identities; definitions refresh on the next batch.
Personal-summary queries now filter profiles/devices/prompts/sessions by employee
before transfer; device fields are explicit. Full monthly activity pagination remains.
AdminMyWorkTime and EmployeeActivityOverview use60-second visible-only nonoverlapping
polling with20-second timeout, bounded failure/402/Retry-After cooldown, cancellation,
late-response discard and stop on401/403. Visibility changes cannot bypass cooldown.
No authentication identity, success result or revocation cache was added.

Review source at pm-retry (new files/tests) and portal-full-local (current main53c3327
web snapshot +#230 sources + local hosting overlay). The local snapshot excludes
public assets/download ZIPs/native shells and MUST NOT be deployed as a complete repo.
Existing#230 retains its original source-matching1.2.5 ZIP; update/reload unpacked
extensions after a future approved release. New app edits remain local under the
previous source-push/deployment hold. No SQL migration, Auth setting or production
change has been made. Exact new tests10 and prior backoff12/security checks pass;
full actual dependency TypeScript/lint and fresh optimized build pass (same4 old
hook warnings). The first build hit stale generated export cleanup; preserved the
old .next tree and rebuilt cleanly. Source was not deleted to repair build outputs.

- Personal work widget display freshness allows150s for checkpoint/poll lag, while live extrapolation is capped at90s. Verified time rows and reports are unchanged.

## Hosting launch authorization — 2026-10-27

The owner explicitly authorizes reviewed changes needed to bring hosting live:
source pushes, required PR merges, hosting-specific migrations, app deployment,
VPS setup and connection work. Do not pause for another approval for those launch
steps. This overrides the earlier source/deployment hold ONLY for this launch.
Once hosting is live, request approval again for later production changes. Keep
unrelated projects, purchases and destructive customer data operations outside scope.
Preserve current services/data and rollback points; authorization does not turn a
fixture result into live acceptance. Never request or publish private credentials.

## Hosting controls release — 2026-10-27

Canonical live app: Digigrow Team project prj_uaskxWpvMZK26bJn0VDboJBdqqbI,
hqproject.com (lake.vercel.app alias). The Hamza project is an older duplicate;
do not use its deployment state as evidence for this live app. PR230 is merged
at0ab9c3eedc292db9f0d17afa813d4da4c11ac307; canonical production deployment
5EkNShGpjwvqiCi55cDbakXejv67 is READY. APP_URL=https://hqproject.com is now
configured for the next production build to make scoped API origins explicit.

New hosting source: admin/client Email, Database, Form Email API and Backups pages;
private authenticated/same-origin/rate-limited typed gateways; admin inspection is
read-only. Feature publication is server-side and default-off; clients get no link,
page or API access for unreleased features. Admin Operations shows testing/release
settings separately from actual health. HOSTING_CLIENT_FEATURES is an explicit
allowlist; do not publish a feature before the real provider/worker is enrolled.
Passwords are X25519/HKDF/AES-GCM sealed on device after independent host-key pinning.
Forms keys are one-time display with explicit rotation/revocation and fixed sender/
recipient paid entitlement; no online checkout is claimed. Restore prepares isolated
staging only; uncertain work never automatically retries or activates live data.

OperatorSigner/context/dispatch use a non-extractable scoped device key, public-key
enrollment and exact typed server requests. No private signing key reaches the
portal. Actual provider changes also require the separate reviewed owner signature.
The operator process itself is not installed just because the portal page is live.

Migrations now use the ACTUAL production history versions20261027182003 and
20261027182025. Exactly these2 migrations were applied via the Supabase connector.
All3 transport tables have RLS, no browser grants,0 enrolled operators; expanded job
kind/body constraints verified by isolated SQL tests. Previous proposed timestamps
were replaced so future migration tooling cannot apply the same tables twice.
No customer data export/import occurred. Keep runtime/feature flags absent until
private enrollment, storage/evidence/backup and provider acceptance are completed.

Owner approval covers only the initial hosting launch. Once it is live, obtain
approval for later production changes again. No unrelated purchase or destructive
customer operation is implied. Source tests/CI and live acceptance remain distinct.

## 2026-10-28 — Member login destination correction

The hosting-host root redirect now applies only to effective admins. Team members keep their existing assigned-work dashboard instead of being sent to the customer-only /client guard and receiving404. Verified hosting identities still use the existing /client redirect and enrollment/MFA/ownership checks. No passwords, roles, account links or customer permissions change. Regression tests exercise the actual root page for both hosts and admin/member/customer identities.

## 2026-10-28 — Authenticator issuer branding

New TOTP enrollments explicitly set issuer and friendlyName to House My Site, so authenticator QR labels no longer inherit localhost or the Supabase Site URL. Existing verified factors, secrets, codes, MFA checks and removal controls are unchanged. Existing authenticator entries can be renamed inside the authenticator app without removing the factor or re-enrolling.

## 2026-10-28 — Admin IP allowlist

Admin access requires ADMIN_ALLOWED_IPS (comma-separated exact IPv4 addresses, private Vercel Production/Preview setting) and the Vercel-managed x-forwarded-for header. Missing/malformed configuration, untrusted runtime, absent/ambiguous IP or unlisted IPv6 fail closed for admin access; never fall back to caller-supplied forwarded headers. IPv4-mapped addresses normalize. No development or query/cookie bypass exists. Other hosts/aliases share the same role guard.

Middleware returns403 early for known admin-only paths. The verified-user MFA/session guards additionally re-read the private profile role and restrict actual admins on shared pages, API routes, server actions, password updates and MFA management; members and customers retain their existing scope. Password sign-in signs out denied admins; an existing admin session gets no bypass. Admin member/client inspection remains tied to the actual admin identity. Unknown roles never gain privileges. No private allowlist values are committed.

The allowlist does not modify SSH, ISPConfig, Vercel/Supabase dashboards, public mail/DNS or authenticated operator/cron/device protocols. No blanket site-level Trusted IPs or WAF challenge is installed. Recovery: use the separately authenticated Vercel account to correct ADMIN_ALLOWED_IPS and redeploy; no public recovery bypass. Do not roll back to older unguarded deployments as a normal recovery step. Retain current deployment/source and env metadata for review. CI includes strict policy and actual auth/MFA/login integration regressions.

## 2026-10-28 — Fix approved admin IP denial

Live preview diagnosis showed trustedRuntime=true and policyConfigured=true but x-vercel-forwarded-for absent. The guard denied everyone because it read that unavailable header. Use Vercel's documented edge-overwritten x-forwarded-for only when VERCEL=1. Non-Vercel runtimes, missing/ambiguous/malformed IPs still fail closed. Never trust x-real-ip or custom headers. Current-connection /login/network-check is no-store/noindex and reveals no private list/credentials. Regression fixtures now model the actual header; prior tests incorrectly assumed the unavailable header existed. Existing allowlist and all auth/MFA/role checks retained.


## 2026-10-29 — Verified GitHub connection and automatic deployment (source only)

GitHub App connection through portal OAuth with signed state and a one-time nonce cookie; the user token is used for three reads and dropped, only the verified result reaches the private service (internal-only `source.github_link`, up to 64 KiB so a full 300-repository snapshot fits). Added `source.github_status`, `source.auto_revoke`, `source.auto_resume` and panel controls for an owner-signed, bounded auto-deploy policy. Gated by HOSTING_GITHUB_ENABLED / HOSTING_AUTODEPLOY_ENABLED; nothing is deployed or live. See "GitHub connection and automatic deployment".

## 2026-10-29 — Owner approvals through a local signer and sealed runtime secrets (source only)

Owner approvals and the automatic-deployment policy are signed on the owner's own computer (`scripts/signer/hms_signer.py`) and relayed by owner sessions only; runtime secrets are sealed in the browser to a pinned server key and never returned. The owner Website source page alone may connect to the local signer (`connect-src` exception for `http://127.0.0.1:47419`, tests/hosting-csp.cjs). Gated by HOSTING_NEXTJS_ENABLED, HOSTING_AUTODEPLOY_ENABLED and the key fingerprint settings; nothing is deployed or live. See "Owner approvals and runtime secrets".

## 2026-10-29 — Email, mail domain and database management completed end to end (source only)

Audit of portal -> API -> worker -> ISPConfig found and fixed: no mail-domain lifecycle (`domain_create`, enable/disable/delete of the enrolled domain), CLI-only approvals (owner now signs through the local signer: `managed.approvals_pending/approval_view/approve/approval_withdraw`, owner sessions only, digest recomputed by the signer), no active-client check on requests, post-claim errors always shown as uncertain (now `failed` = known unchanged, `uncertain`, `abandoned`), no partial-failure record (step journal, read-only reconcile, operator-only abandon), overlapping requests on one account, reuse of a kept database-user name, and no limits in the view (inventory now carries used/max and pending creates). The panel shows plain states and never provider text or passwords. Passwords stay sealed to the server key. Test: `tests/hosting-managed.cjs` (with HMS_AUTOMATION_SOURCE: real service, real Signer, worker, reconcile and a synthetic panel with injected faults). Not live: no ISPConfig, signer key or worker timer is enrolled anywhere.

## 2026-10-29 — Backup schedule, restore dates and scoped restore (source only)

`RestoreControls` (owner and client Backups pages) shows each website's restore dates, protected default, the real schedule, an honest plain-language retention explanation (3 points in total incl. the day-14 default; 3 copies = one backup about every 30 days; anything after the newest backup is not recoverable) and any conflict between schedule, copy limit and the storage Object Lock (pruning pauses, nothing is deleted early). New protocol actions: `policy` (read-only safe), `schedule` (owner, 1..30 days), `plan_scope` (one website / all websites of one client / chosen websites; a client names only its own; shared mailboxes/databases are skipped unless acknowledged), and `apply` (owner only: the owner-signed, plan-bound `hms-restore-approval-v1` made with the local signer; a safety copy is taken first, failures are reverted). Strict validators for every private-service response run once, on the server (`backupPolicies`, `backupScopePlan`, `backupApplyResult`); the browser validates the portal-shaped output with `lib/hosting/backupView.ts` (`policiesView`, `scopePlanView`) and must never re-parse it as wire format. Once a live apply request has been sent, any failure or unconfirmed answer is an UNKNOWN outcome: the page says live data may have changed, disables further preparation/apply and tells the owner to reload and have the operator check — it never claims nothing changed; the owner Backups page joins the Website source page in the signer `connect-src` exception. Tests: `tests/backupProtocol.test.mjs` (with HMS_AUTOMATION_SOURCE it validates real responses from the automation backup chain). Not live: no storage bucket, evidence service, quiescence hook or live-restore adapter is enrolled.

## 2026-10-30 — App Hosting account identity and receipt-gated activation (source only)

- Added account and website-slot tables, row-locked shared website allowance, receipt-gated `enforced` status and Active, owner-only `hosting.app.*` commands behind `HOSTING_APP_ACCOUNTS_ENABLED`, owner panel (`AppAccountPanel`) and read-only customer summary (`AppAccountSummary`), shared 23-limit fixture test. Legacy provisioning, billing guards and all other switches are unchanged. Not deployed; migration not applied to production by this change.

- Final batch (source only): databases for App accounts are now planned as one private MariaDB instance per account on the same VPS (automation repository, `docs/app-hosting-enforcement.md` section 6); they stay "not available yet" in the portal until the owner records the live acceptance. The migration `20261030090000_app_hosting_accounts.sql`, its rollback script and test are unchanged and still not applied; prices stay unset; nothing was merged, migrated or deployed.

- Production rollout (2026-10-30): migration `20261030090000_app_hosting_accounts.sql` applied to the portal database (0 services, nothing rewritten) followed by `20261030100000_app_hosting_accounts_revoke_browser_grants.sql` (browser roles had default table grants; removed, service_role only). Portal code merged with `HOSTING_APP_ACCOUNTS_ENABLED` unset; prices unset; server still draft; no client visibility change.


## 2026-10-31 — Dynadot fixed-IP relay preparation

Added an optional authenticated fixed-destination VPS relay for registrar requests, with IPv4-only provider connections, durable replay denial, no signing-secret forwarding and no direct fallback. Prepared guarded installer and backup-based rollback preserving the existing service release and vhost. Source tests do not prove VPS installation, correct allowlisting or successful Dynadot authentication; the portal flag stays absent until those deployment steps.


## 2026-10-31 — Registrar connection moved to Domain settings

Added General / Domain settings navigation under Hosting Settings and moved the secure Dynadot connection form to the dedicated owner route. Domain management now shows inventory, operations and a settings link; no API credentials form. Saved connections, encryption, fixed-IP routing, mutation reviews and authorization are preserved. Updated rendered component, route and auth/metadata regressions.


## 2026-10-31 — Combined Domains portfolio and modal DNS editor

Implemented the selected image concepts together: real global summary cards, grouped/searchable/filterable list, a dedicated Domains navigation item and responsive Manage split view. Native DNS modal supports reviewed exact add/remove and guided two-step edits; nameservers, renewal, lock/auto-renew and history retain existing guards. Added a private read-only inventory RPC with global grouping before pagination, PGlite tests and real-browser synthetic acceptance. No arbitrary provider changes, invoice, VPS install or API credential change is part of the design rollout.

## 2026-10-31 — Professional email setup and hosted mailbox requests

Added a dedicated hosted/external domain onboarding workspace, stable TXT ownership
proof, bounded DNS checks, reviewed Dynadot TXT helper, Email settings tab and
sealed, scoped hosted mailbox requests with on-page signed owner approvals.
External mail-only service allocation and live sender-policy enrollment remain
pending; no server/DNS change or real email was executed by this UI rollout.

## 2026-10-31 — Fix Windows PowerShell mail-check SSH transport

Owner returned a bash syntax error because native Windows SSH invocation stripped
the Python -c quotes. Python never ran; the uploaded file remains available.
Check-HouseMySiteMail.ps1 now fetches the reviewed Invoke-MailReadinessCheck.ps1
helper and pipes the hash verifier/Python code over stdin to the fixed command
`python3 -I -`. Strict SSH options, pinned source digest and read-only check remain.
A Windows-native ssh.exe capture regression exercises the actual helper under
Windows PowerShell5.1 and PowerShell7, checking argument boundaries, complete
stdin bytes, invalid-path denial and nonzero-exit propagation. Never rerun the
Dynadot relay installer for this unrelated mail-check launch error.

## 2026-10-31 — Preserve mail readiness findings after a failed section

Owner's stdin recovery executed Python but returned only generic ValueError. This
is not a successful readiness check and does not identify the actual VPS blocker.
inspect_mail_readiness.py now isolates settings, key, inventory, each service, DNS
and each TLS endpoint. It returns fixed stage/code findings and safe file mode,
UID/GID/size metadata; no exception text, credentials or customer addresses.
Missing, denied or unknown sections stay null/unavailable, never zero/ready.
A failed section preserves independent results. Private files still require the
original permission boundary and no symlink; non-public hostname resolution never
allows a connection to those addresses. TLS checks use only the existing pinned
public VPS62.171.130.156 with server1.housemysite.com certificate/SNI validation,
independently of local hostname aliases. Local resolution is reported separately. Never chmod files or relax networking based on this
opaque ValueError. A valid report with findings exits0; unexpected report failure
exits2, so the existing launcher can print the findings without a false transport
error. Nine fixture-based tests cover partial failures, no plaintext leakage,
read-only SQLite, no mail AUTH/send and independent TLS results. Real VPS result
remains pending; external mail-only allocation and sending enrollment remain open.

## 2026-10-31 — Guarded mailbox enrollment and signed approvals timer prepared

Owner's consolidated report confirmed SMTP STARTTLS and IMAP TLS on public VPS,
all four services active, private600 settings/key, stable public host fingerprint,
zero managed mail bindings and no pending mail jobs. Server-local hostname resolves
to127.0.1.1; this is not evidence public DNS/TLS is broken. Do not alter hosts/DNS
from that finding. Canonical Email settings now contain verified server1 hostname
and owner-returned public host fingerprint, written atomically only while blank
through existing audited admin RPC; webmail URL remains blank/unverified.

`scripts/email/enroll_verified_mail.py` and Install-HouseMySiteMail.ps1 prepare ONE
explicit --execute batch for the existing enforced owner acceptance account ONLY
(accounteb91..., service4029..., client4ac6..., domainhmsaccept1.housemysite.com).
No new plan, client, invoice, mailbox, mail domain or DNS record is created by the
installer. It derives a consistent /var/vmail/{domain}/{localpart} template from
protected local provider metadata, copies no password or resource mapping, checks
non-system vmail UID/GID, installed root-protected runtime, current owner grant,
current enforced account, pinned package policy and live provider client/group and
mail limits. Five mailboxes,409MiB each, within frozen2048MiB allowance; sending
must remain locked. Conflicting existing bindings are never overwritten.

Root grants ONLY missing eight mail user/domain lifecycle API methods, preserving
all existing remote-user methods with row-lock/compare-and-set and private backup.
Application assembly and binding writes run in a fork AFTER dropping to hms-services.
A private consistent SQLite backup is saved before first local binding. Existing
service code/signature verification is reused unchanged. Root installs a bounded
hms-services oneshot/timer for `service_runtime.py approvals-managed` every20s.
This existing command processes independently signed mailbox/database requests;
the initial preflight requires no database bindings and no unresolved jobs. It never
processes unsigned requests, bypasses signatures, enables SMTP or retries uncertain
provider outcomes. No new listener, sudo, owner private key or arbitrary command.

Installation failure stops only newly introduced timer/units and restores only
unchanged API permission updates. It never restores a stale whole DB over portal
requests. An enrolled binding may remain for operator review; preserve backups and
report error, never blindly repeat. Success still needs user-requested mail-domain
setup and mailbox creation with existing independent signature flow and provider
confirmation. External mail-only plans, future account auto-enrollment, sender-policy
activation and authenticated send/receive acceptance remain incomplete. This batch
is PREPARED, not executed by Codex. Regression: test_mail_enrollment.py and native
Windows5.1/7 stdin transport checks.


## 2026-10-31 — Accept native grouped ISPConfig remote permission lists

Owner installation stopped at api_permission_format_needs_review BEFORE the backup/grant/enrollment/timer mutation phase. The old parser incorrectly accepted only semicolon-separated names. ISPConfig checkPerm replaces semicolons with commas then splits on commas, so native grouped comma/semicolon lists and empty separator groups must be supported. The corrected parser preserves every original byte, checks exact method membership, appends only missing eight mail lifecycle permissions and enforces input/output budgets. Unknown encodings, wildcards and control characters still refuse. Literal ASCII spaces in legacy tokens are preserved without normalization by the follow-up correction below. Binary permission compare-and-set, backups, owner signatures, SMTP lock and all enrollment guards remain unchanged. Twelve enrollment tests include native mixed lists, idempotency, lookalike names, unknown encodings and size limits. This source correction is not proof of VPS enrollment or delivery; use the new reviewed source pin, never the failed old batch. External mail-only provisioning and sending remain pending.


## 2026-10-31 — Preserve literal spaces in stored remote permissions

Owner's actual read-only format report: string804 bytes,33 commas,4 semicolons, exactly2 U+0020 spaces; two nonmatching tokens of lengths31/36. No raw role string or credentials were exposed. Parser now accepts bounded legacy lowercase/digit/underscore/ASCII-space tokens, preserving every original byte. Spaces are NEVER stripped or treated as separators: ISPConfig checks comma/semicolon-separated tokens literally, so normalizing spaces could activate unrelated permissions. Only exact required method names count as already granted; padded or combined names remain unchanged/inert and a missing mail method is appended separately. Existing API role binary compare-and-set, backups, signatures and SMTP lock are unchanged. Thirteen tests cover whitespace preservation, exact membership, unchanged unrelated permissions, idempotency and control-character denial. This correction still needs the new pinned owner-run installation result. No live enrollment or authenticated delivery is implied.
