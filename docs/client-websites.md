# Client website dashboard, bank checkout and Contabo runtime

Prepared from production `main` at `9ccc8f5c2a4dc2d79fbb2e4da6c2ce9a30448c50`. This is a **new branch and PR only**. Do not merge or deploy automatically. No live DB, environment, VPS, DNS, payment, renewal or scheduler action was executed.

## What the client sees

The client portal has a clean, neutral dashboard with website cards, a deployment list and short navigation: Overview, Websites, Deployments, Domains and Website billing. Existing hosting services/invoices and gated integrations are still available under Existing services. The top Add New Website button opens an accessible native modal. The same action is available on the website list. Admin preview and suspended client accounts stay read-only.

The modal currently offers only Bank Transfer. It shows the saved price and real admin-configured bank details. Reference and PNG/JPEG screenshot are optional; a screenshot is private, limited to 2 MB and only opened through an authenticated admin endpoint. The client must confirm they sent the transfer. This creates a **pending payment notice**, not verified income. An in-app notification appears throughout the owner's hosting workspace, with the exact pending count and a link to the review queue. No email is sent.

`/hosting/website-payments` holds the paginated pending list, recent decisions, bank details and prices. An admin must confirm they checked their bank before Approve. Reject grants nothing. Approval creates exactly one unused website credit, including one website and 1 GB content storage. Row locks, unique keys and replay checks prevent a double-click/retry from granting extra credits. A consumed credit cannot create a second website. New websites cannot be reassigned to a different client by editing a form.

The website creation screen offers Direct upload and GitHub. An approved credit can be used even if new sales are subsequently disabled. The account must still be active. Source settings can correct the GitHub URL/token or build preset without consuming another credit. A failed upload/deployment keeps the credit's existing website, which can be retried; it does not silently consume another credit. No new hosting client account or fake bank receipt was created in production.

## PR #268 review and reuse

Reviewed unmerged `cursor/hosting-dashboard-agent-eb9c` at `60382ee3015cb3caa8a179fb332ace872d636438`.

Reused the useful app/deployment/domain presentation, baseline apps migration, AES-GCM app-secret storage, canonical signed-request format and parts of the agent authentication/validation. The client dashboard, checkout, entitlement/billing transactions, upload protocol and runtime execution/routing were replaced or extended for this request.

The broad PR #268 patch was **not merged or cherry-picked**. In particular, none of its stale login/reset, MFA, rate-limit, service-worker or auth-test changes were imported. This branch retains current main's hardening. It also excludes arbitrary Docker images/Dockerfiles, arbitrary Git hosts, app reassignment/deletion, CrowdSec unban controls and unsafe whole-zone DNS changes. The follow-up adds scoped REST v2 DNS additions as described below. The old A-record-only domain check has been replaced with mandatory per-website TXT proof. Client deployment queries now apply ownership before pagination; an admin preview cannot poll-write receipts.

This PR supersedes #268 for the new website experience. Do not merge the old PR alongside it. PR #274 (retired human extensions) remains separate; this branch is based on main and does not merge that PR either.

## Content storage and usage records

- **GB means 1,000,000,000 bytes.** Every ZIP or multi-file upload is capped at 1 GB combined, even when the website has a paid larger storage cap. Expanded source and the final deployed content must fit the approved site cap.
- The included content quota is a hard 1 GB. Extra storage is opt-in, with explicit client consent and a finite cap. Default deployment settings support up to 1 extra GB (2 GB total). Increasing this requires aligning the portal's `HOSTING_WEBSITE_MAX_EXTRA_GB`, the agent's `MAX_SITE_BYTES`, staging budget and physical VPS capacity first.
- Bills use **actual deployed content above 1 GB × elapsed storage time**, prorated over the real UTC calendar month. A reserved cap is not a purchased block. A saved approval snapshots the per-GB-month price; changing settings does not silently reprice existing websites.
- Example from isolated tests only: 0.5 GB of extra content for one whole month at 200 minor units per GB-month records 100 minor units. Real prices are never invented or seeded.
- Base container layers, temporary build/fetch workspaces, capped runtime caches and retained images are platform overhead, not billable client content. Stopped websites still retain their content and continue to count as stored. There are no writable persistent app disks in this release.
- A terminal deployment receipt is delivered directly by the agent with a body-bound HMAC and time window. A private durable outbox retries delivery if the browser closes or the portal is unavailable. The portal binds the receipt to the exact site, client and current deployment and reuses the original saved actor. Unconfirmed/failed deployments do not create new storage usage intervals.
- Admin Finalize storage records only accepts a completed UTC month and is idempotent. These are separate **unpaid billing records**, visible to the owner and client. It does not debit a bank/card, call a renewal provider or run a paid scheduler. Collection/refund and posting these records into the older hosting invoice ledger remain manual; do not record them twice.

## Database migrations — not applied

Apply only these three reviewed files, in this order, after PR approval and before enabling checkout:

1. `supabase/migrations/20261118180000_hosting_apps.sql` — reused from the unmerged PR #268; app, deployment, domain, encrypted-env and agent-config tables.
2. `supabase/migrations/20261119142249_website_bank_payments_and_storage.sql` — bank settings/requests, one-site credits, usage intervals, storage bills, private proof bucket and service-role-only transactional functions.
3. `supabase/migrations/20261120202602_website_domains_and_preview.sql` — atomic apex/www groups, preview allocation and scoped registrar operation functions.

The live read-only catalog confirmed the new app tables were absent. Existing hosting clients, services, contracts, invoices, payments, secrets and customer data are retained. The current production client-access table had no enrollments; create/invite real clients later through the existing owner client tools rather than creating staff accounts.

All new public tables have RLS enabled. Browser roles have no table or function privileges. Server-side helpers verify the current Supabase session, hosting identity/client ownership, active status, admin preview restrictions and existing admin IP/MFA/session guards. Transactional RPCs independently recheck the supplied verified actor and client/admin role. No SECURITY DEFINER workaround is added. Proofs use a new private bucket with no browser upload policy. Secret keys and encrypted values are excluded from client payloads.

Use the project's normal migration tooling to register these three versions. If SQL Editor is used, paste only these reviewed files and reconcile their history versions through the existing migration process. Do not run a blanket db push that could apply unrelated pending migrations. Do not apply PR #274's archive migration as part of this feature.

Rollback: disabling checkout stops new claims. Preserve all bank notices, credits, bills and app records. Revert the web code only after draining/reviewing new deployments. Do not drop payment/usage tables or erase existing customer records to roll back a UI release.

## Vercel environment — no changes made

Configure **the project that serves `web.housemysite.com`**, not a same-named preview project on another account:

| Variable | Purpose |
| --- | --- |
| `HOSTING_AGENT_URL` | Dedicated HTTPS agent origin, e.g. `https://deploy.housemysite.com` |
| `HOSTING_AGENT_TOKEN` | Random shared server-to-server bearer/HMAC key; identical on VPS and portal |
| `HOSTING_AGENT_SIGNING_KEY` | Ed25519 PKCS8 DER base64 private key; portal only |
| `HOSTING_APP_SECRETS_KEY` | Separate persistent 32+ character key for app env/private GitHub tokens; keep backed up |
| `HOSTING_WEBSITE_MAX_EXTRA_GB` | Optional, default `1`; keep aligned with VPS quota/capacity |

Existing `APP_URL`, Supabase keys and all current hosting/security variables stay in place. No new secret is NEXT_PUBLIC_. Never rotate the app-secret key without an explicit re-encryption plan. Generated credentials must be transferred privately, not pasted into chat.

There is no GitLab configuration in this release. GitHub works with an HTTPS repository URL and branch. Public repositories need no token. Private ones use a fine-grained read-only token limited to that repository, encrypted at rest. This is explicit branch deployment, not GitHub OAuth or automatic push/webhook deployment.

## VPS commands for Grok Bot

**These commands have not been run on `62.171.130.156`.** Keep the production app on main until the PR is approved. The read-only preflight is safe to run first. Installation adds a new agent/runtime only; it does not move or delete existing websites.

### 1. Fetch the reviewed branch and inspect the VPS

Run as root (or use sudo). If the checkout path already exists, inspect it rather than overwriting it:

```sh
sudo -i
install -d -m 755 /opt/hms-source
# Use a fresh path; do not overwrite another project checkout.
git clone --depth 1 --branch feat/client-website-payments-20261119 \
  https://github.com/digigrow100/Project-management-for-freelancers.git \
  /opt/hms-source/client-websites
cd /opt/hms-source/client-websites
python3 hosting-agent/preflight.py
```

Preflight prints only Traefik container/service/network/resolver names, RAM and disk. It does not print environment values or full configuration. Expected root is `/opt/stacks/traefik`. Confirm the actual external network name, HTTPS entrypoint, certificate resolver and CrowdSec middleware. The supplied compose defaults assume network `proxy`, entrypoint `websecure`, resolver `le`. Adjust only the new agent settings if your existing names differ.

Dynamic npm builds reserve up to 4 GB RAM in a single serialized builder. Plan at least 8 GB host RAM, room for existing sites, and at least 10 GB free disk before accepting builds. The staging budget is finite; exceeding capacity fails the new deployment while retaining its previous release. This service is not a promise of unlimited sites on the VPS.

### 2. Prepare only the new agent directories and credentials

Set an **A record** for the dedicated `deploy.housemysite.com` hostname to `62.171.130.156`. Do not replace the existing web.housemysite.com record or mail MX records.

```sh
install -d -m 755 /opt/stacks/hosting-agent
cp -a /opt/hms-source/client-websites/hosting-agent/. /opt/stacks/hosting-agent/
install -d -m 700 -o 1000 -g 1000 /opt/stacks/hms-website-data
cd /opt/stacks/hosting-agent
# Creates .env and vercel-private.env with mode 600. Prints no credentials.
# Refuses to overwrite existing credential files.
docker run --rm --network none -v "$PWD:/work" -w /work \
  node:22-bookworm-slim node setup-credentials.mjs deploy.housemysite.com
```

Open `.env` and `vercel-private.env` privately in an editor. Copy the four portal variables into the correct Vercel project only when releasing this PR. Keep the public signing key on the VPS and the private signing key on Vercel. `.env` also contains:

- `PORTAL_ORIGINS=https://web.housemysite.com` — exact allowed browser origin. Add only explicit trusted preview/staging origins when testing; no wildcard.
- `PORTAL_RECEIPT_URL=https://web.housemysite.com/api/hosting-websites/receipts` — signed receipt delivery.
- `TRAEFIK_ENTRYPOINT`, `TRAEFIK_CERT_RESOLVER`, optional existing `TRAEFIK_MIDDLEWARES` — use preflight's actual settings. Entry-point-level CrowdSec remains in place; if your installation uses a per-router middleware, attach its existing name here too.
- `MAX_SITE_BYTES=2000000000`, `STAGING_BUDGET_BYTES=6000000000` — defaults align with 1 GB included + 1 GB optional extra. Raise only after reviewing capacity and matching the portal's limit.

The agent's Docker proxy exposes no host port and no exec endpoint. It still has powerful Docker create/build permissions and must remain on its private control network. The agent uses allowlisted operations and only its own generated names; never expose the proxy or Docker socket to clients.

### 3. Enroll isolated networks without restarting Traefik

Use the exact Traefik container name from preflight below, replacing the example `traefik` if different. The script refuses overlapping subnets and requires bridge netfilter. It never flushes UFW/CrowdSec rules.

```sh
cd /opt/stacks/hosting-agent
# Read-only prerequisite check; it must report 1.
sysctl net.bridge.bridge-nf-call-iptables
# If missing/0, enable the standard bridge filter first:
modprobe br_netfilter
sysctl -w net.bridge.bridge-nf-call-iptables=1
printf 'net.bridge.bridge-nf-call-iptables = 1\n' > /etc/sysctl.d/90-hms-website-bridge.conf
# Change this one value to the exact name reported by preflight.
printf 'TRAEFIK_CONTAINER=traefik\n' > network-service.env
chmod 600 network-service.env
install -m 644 hms-website-networks.service /etc/systemd/system/hms-website-networks.service
systemctl daemon-reload
systemctl enable --now hms-website-networks.service
python3 persist-traefik-network.py traefik
```

The final Python command creates an additive network-only override and prints the exact future Traefik recreation command, preserving the existing networks. It does not execute that command or overwrite the original stack. Use it during future Traefik maintenance. Joining `hms-runtime` now does not restart Traefik.

New app containers use `hms-runtime`; dependency-fetch/build containers use `hms-build`. Scoped DOCKER-USER rules deny new app/build connections to private, metadata, other-client and host ranges, while allowing established responses and the enrolled Traefik/agent addresses. IPv6 is not enabled on these new networks. The boot-bound root-owned readiness record prevents the agent from accepting production work before enrollment after a reboot. App containers do not auto-start before those rules; the enrolled agent resumes the previously running ones. If your Docker installation uses a native nftables backend with no DOCKER-USER chain, stop here and adapt the scoped rule implementation; do not disable the existing firewall to force it through.

### 4. Build and start the new service

```sh
cd /opt/stacks/hosting-agent
# Builder image contains fixed tooling; no client source or credentials.
docker build -f Builder.Dockerfile -t hms-website-builder:1 .
docker compose config --quiet
docker compose up -d --build
curl -fsS https://deploy.housemysite.com/health
```

No new public port is needed: HTTPS goes through the existing Traefik. Do not open 8787 or 2375 in UFW. The health response only confirms the agent endpoint; it does not prove a client deployment, DNS ownership, paid entitlement or certificate acceptance.

Optional isolated agent tests on the VPS (fake Docker backend, no client deployment and no real bank action):

```sh
cd /opt/stacks/hosting-agent
docker run --rm --network none -v "$PWD:/src:ro" -w /src \
  node:22-bookworm-slim node --experimental-strip-types --test test/*.test.ts
```

### 5. Release sequence and acceptance

After human review/approval of the PR: apply the three DB migrations, configure the portal's private env, deploy the app code, then enable real bank settings at `/hosting/website-payments`. Until then, checkout is disabled and no price/account is invented. Enabling checkout also requires a successful signed agent readiness check, matching quota caps and the app-secret key. This check does not deploy a website or trigger a payment. Do not enable a paid scheduler or test renewal paths.

Use an isolated test client/DB first. Check: login → Add New Website → optional screenshot/reference → pending admin notification → Reject leaves zero credits → a separate approved request gives exactly one credit → create one site → Upload/GitHub → signed receipt → domains TXT/DNS/HTTPS → one usage record. A failed new release must leave the previous one available. Check over-1-GB rejection, expanded quota, two-client isolation, disabled accounts, and reboot enrollment before real customers use it.

Existing hosting clients should be invited/enabled through `/hosting/clients`. Do not repurpose retired human team accounts for hosting customers.

## Initial PR verification and limits

Local checks are recorded in the PR. Migrations, credit/payment/usage transactions, duplicate requests, quota/consent and two-client denials are exercised in disposable PGlite. Agent tests use a real local HTTP server with a fake Docker engine; Docker request/extraction policies are checked separately. Existing auth/MFA/client-scope tests remain required.

This workspace cannot launch Chromium: its process-singleton socket is denied (`Operation not permitted`). Do not claim browser screenshots or a visual browser pass. `local-checks/website-browser.cjs` is supplied for an unrestricted Chromium runner. It uses fixture data only and does not touch production. Its output directory is ignored.

No real Docker/Traefik/npm-build acceptance was run here, because Docker is not installed in this workspace and the VPS is operated by Grok Bot. GitHub billing may still prevent Actions from starting. The PR is implementation-ready for review, not a claim that live hosting has changed.

Other explicit boundaries: no GitLab/OAuth/automatic Git push deployment, arbitrary Dockerfile/image, monorepo workspace support, persistent writable app volume, automated storage collection/refunds or automatic cleanup of historical customer data. Private build logs use sanitized status codes; runtime logs remain scoped to the website. Native app dependencies and unusual build/output layouts may need a reviewed preset adjustment. Failed/uncertain deployments block further changes until status is resolved; interrupted builds are never replayed automatically after a worker crash. In an uncertain case an operator must inspect retained containers/metadata; do not delete customer records or force a new deployment to hide the uncertainty.


### Initial PR local results

- App typecheck and optimized production build: passed using dummy local endpoints.
- Lint: passed with four existing hook warnings in unchanged legacy components.
- 11 new Node UI/domain/scoping/readiness tests: passed.
- Disposable PostgreSQL migration/payment/credit/usage suite: passed, including rejection, price snapshots, retry protection and browser-role/grant denial.
- 7 agent HTTP/Docker-policy tests and 3 Python archive tests: passed.
- 12 existing related hosting/auth/MFA/client-scope/UI tests plus security-hardening, project/database boundaries and SEO bot workflow checks: passed.
- Shell syntax, Python compilation, YAML parsing and browser-fixture bundle: passed.
- Actual Chromium launch: blocked by this workspace's socket restriction; not passed.
- Actual VPS Docker/Traefik deployment and real-client bank flow: not run. No live migrations or env updates were made.

A GitHub Actions billing lock is separate from these local results. Check the PR's current run status; never label CI or production live based on a local pass.

## PR #275 follow-up: client release, domains and previews

This follow-up stays on **feat/client-website-payments-20261119**, with no main merge or production rollout. PR #268/#274 are untouched. The VPS preflight supplied by Hamza passed: `traefik`, `/opt/stacks/traefik`, networks `proxy`/`socket-proxy`, `websecure`, resolver `le`, 7.8 GB RAM and 137 GB free. Build concurrency remains one. Monitor existing workloads before accepting dynamic builds.

### Final migration order

The earlier two-file list is superseded by this **three-file** release list:

1. `20261118180000_hosting_apps.sql`
2. `20261119142249_website_bank_payments_and_storage.sql`
3. `20261120202602_website_domains_and_preview.sql`

The existing registrar migrations `20261031083515_hosting_dynadot_registrar.sql` and `20261031123124_hosting_registrar_inventory.sql` are prerequisites for path B and were found in the live schema. The read-only follow-up catalog again found no new app/domain tables. These three feature migrations remain prepared, **not applied**. Register only these reviewed versions through the existing migration process; do not blanket-push unrelated migrations. The new migration adds columns/functions, allocates preview rows and retains all existing customer/project/payment data. RLS and browser privilege denials remain intact. No old migration is modified.

### Custom domains: manual DNS and Dynadot

Add `example.com` (entering `www.example.com` also normalizes to this pair). Apex + www are saved atomically with one group/token, even before the website runs. Each pair counts as two of the ten custom-hostname slots. Copy buttons show full names and values; a DNS panel may need relative names instead:

| Type | Name in example.com zone | Value |
| --- | --- | --- |
| A | `@` | `62.171.130.156` |
| CNAME | `www` | `example.com` |
| TXT | `_hms-verify` | The website's displayed verification token |

Do not add AAAA. If an old AAAA sends traffic elsewhere, remove that conflicting record at the DNS provider. For Cloudflare, use **DNS only** during initial verification; once HTTPS is active, proxying may be enabled with Full (strict) TLS. The app also recognises current Cloudflare address ranges, but checks the origin certificate directly at the VPS. Do not replace unrelated MX/TXT records.

Verify checks both hostname routes against the group's apex TXT proof. Status proceeds from `pending_dns` to `verifying`, then `issuing_ssl` and `active`. A DNS-verified website without a successful deployment stays `verifying` with an explicit saved message. Its next deployment includes the verified routes. A signed successful receipt, Refresh, or Verify activates/checks routing and the origin certificate. If SSL is still issuing, choose Verify again shortly. Disconnect removes the pair from this app's routing; it does not delete provider DNS records.

For domains in the current production Dynadot inventory with `details.glue.glue_type=dns`, the server reuses `lib/hosting/registrar/api.ts` REST v2. It reads current provider state and appends only the missing A, www CNAME and proof TXT records, one record per request. Identical records are skipped. Conflicting A/AAAA/CNAME records require manual/admin review; the app never overwrites an existing zone or changes nameservers to force setup. Existing MX/TXT and unknown record metadata must survive exact readback. Each mutation is logged in `freelance_hq_hosting_registrar_operations`, linked to its website and client actor, using the existing global operation lock. A timeout, process crash or mismatched readback blocks further registrar writes until the admin uses **Check operation status** in registrar history. No automatic mutation retry occurs.

**Client authority:** finding a name in Hamza's shared account is not enough to grant a client control of it. The apex must also be assigned to that client in the existing owner **Service domains** records (`freelance_hq_hosting_domains.client_id`). An admin attaching a domain has their existing IP/MFA/session guard. An unassigned client gets clear manual/setup instructions. This prevents one client from claiming another client's account-owned domain through automatic TXT creation. A domain in the account with external nameservers falls back to manual DNS with a clear message.

`housemysite.com` is excluded from these provider writes. Its DNS is at **MySecureCloudHost**. The legacy `lib/dynadot.ts` DNS helper now always sets `add_dns_to_current_setting=1`, preserves every supported input record, rejects over-limit input instead of truncating, and rejects record types whose missing priority metadata could cause loss. Use the reviewed REST v2 editor for removal/editing.

### Operator DNS for preview routing

At **MySecureCloudHost**, add these records without changing `web`, existing mail records, or unrelated zones:

| Type | Name in housemysite.com zone | Value |
| --- | --- | --- |
| A | `deploy` | `62.171.130.156` |
| A | `*.deploy` | `62.171.130.156` |

The root `deploy.housemysite.com` is the agent endpoint. Each site gets `w-<32-character-site-id>.deploy.housemysite.com`; the allocated slug is shown on its card and Domains tab. This wildcard is a **DNS record**, not a wildcard certificate request. Traefik creates an individual hostname router/certificate with the existing `websecure` entrypoint and `le` resolver. The agent always preserves its own preview URL, rejects another app's preview, and blocks other HouseMySite infrastructure hostnames. No Dynadot request is used for these DNS records. No new public port or change to existing Traefik security configuration is needed.

### Final environment requirements

No new preview/DNS secret is introduced. Portal: `HOSTING_AGENT_URL=https://deploy.housemysite.com`, `HOSTING_AGENT_TOKEN`, `HOSTING_AGENT_SIGNING_KEY`, `HOSTING_APP_SECRETS_KEY`; optional `HOSTING_WEBSITE_MAX_EXTRA_GB=1`. Set `HOSTING_AGENT_URL` **before building** the release: only `/client/apps/*` and `/hosting/apps/*` receive its exact validated HTTPS origin in `connect-src`, allowing direct streaming uploads. Other pages retain the strict policy.

Agent: `AGENT_HOST=deploy.housemysite.com`, matching `HOSTING_AGENT_TOKEN`, `HOSTING_AGENT_SIGNING_PUBLIC_KEY`, `PORTAL_ORIGINS=https://web.housemysite.com`, `PORTAL_RECEIPT_URL=https://web.housemysite.com/api/hosting-websites/receipts`, `TRAEFIK_ENTRYPOINT=websecure`, `TRAEFIK_CERT_RESOLVER=le`, `MAX_SITE_BYTES=2000000000`, `STAGING_BUDGET_BYTES=6000000000`, `BUILDER_IMAGE=hms-website-builder:1`; preserve any existing `TRAEFIK_MIDDLEWARES` value.

Dynadot: keep the existing server-only `DYNADOT_SECRET` and tested encrypted REST v2 production connection under Hosting Settings → Domains. No browser/API credential field is added. Optional fixed-IP transport still uses the existing `DYNADOT_RELAY_ENABLED=approved`, `HOSTING_SERVICES_ORIGIN`, `HOSTING_SERVICES_PORTAL_KEY`. **Do not enable that flag merely because this code exists**: the old VPS was reinstalled, so any old relay must be separately installed/verified before using it. With the flag absent, existing direct v2 transport is used; provider IP restrictions still need to permit that transport. No renewal/scheduler request is part of setup or acceptance.

### Exact VPS sequence

For a **fresh installation**, run the existing numbered sections 1 → 2 → 3 → 4 above, after adding both DNS records. They include clone, private credential generation, isolated network enrollment, the additive network-only Traefik override, builder image, and agent compose. Keep ports **8787 and 2375 closed**. Apply the three migrations and portal env only at the later approved release; this PR does not merge itself.

If the earlier agent/source directories already exist, use this update sequence instead. It deliberately refuses a dirty source checkout and retains `.env`, `vercel-private.env`, data, networks and existing security settings:

```sh
sudo -i
cd /opt/hms-source/client-websites
test -z "$(git status --porcelain)"
git fetch origin feat/client-website-payments-20261119
git switch feat/client-website-payments-20261119
git merge --ff-only origin/feat/client-website-payments-20261119
# Review this PR's commit SHA before continuing.
cd /opt/stacks/hosting-agent
test -f .env
test -f vercel-private.env
cp -a /opt/hms-source/client-websites/hosting-agent/. /opt/stacks/hosting-agent/
docker compose config --quiet
docker compose up -d --build
curl -fsS https://deploy.housemysite.com/health
```

If a `test` fails, stop at that command; do not bypass it or regenerate existing keys. Run blocks interactively in order, or start with `set -e` in a dedicated shell. The update path assumes the earlier network enrollment/builder setup passed; a health response alone does not prove client hosting. All real VPS commands remain Hamza/Grok Bot operator work.

### Test organisation

The full `node --test tests/*.cjs` command now covers the self-contained app/SQL/protocol/UI suites and is part of Typecheck CI. Stale dependency mocks were updated to the current guarded interfaces and current SEO task UI; production auth/SEO/extension behaviour is unchanged.

Three existing non-unit scripts were moved to `local-checks/` with their assertions retained: `prepare-browser-runtime.cjs` (browser bootstrap, not a test), `operator-auth-browser.cjs` (built Next + Chromium + companion automation repository), and `backup-python-integration.cjs` (the existing cross-language signed gateway test, extracted from `tests/server.test.cjs`). Their explicit prerequisites are not provided by `npm ci` in this repo. Run separately when those environments are available:

```sh
node local-checks/prepare-browser-runtime.cjs
HMS_AUTOMATION_SOURCE=/absolute/path/to/automation-repo node local-checks/operator-auth-browser.cjs
HMS_RECOVERY_SOURCE=/absolute/path/to/automation-repo node --test local-checks/backup-python-integration.cjs
```

The operator browser additionally requires a built isolated app, Playwright and the existing pinned `@sparticuz/chromium`/`tar-fs` bootstrap dependencies. Do not supply production credentials. These separate integration checks are not claimed as locally passed. The new client browser fixture remains in Typecheck CI. The local system Chromium launch still fails with `socket() failed: Operation not permitted`; its bundle and React behaviour checks can run here. Actual VPS Docker/Traefik/custom-domain/provider acceptance remains an operator check, with no real bank transfer, renewal, live DNS mutation or customer-data deletion performed during this PR follow-up.

### Follow-up local results (21 November 2026)

- Full `node --test tests/*.cjs`: **119 passed, 0 failed, 0 skipped**.
- `npm run typecheck`, `npm run lint`, isolated optimized production build: passed. Lint retains the four existing legacy hook warnings.
- The additive domain migration suite passed on disposable PostgreSQL, including both existing registrar and all three website migrations, client isolation, record/value scope, operation locking, admin reconciliation and browser privilege denial. Existing payment/credit/usage suites also passed in the full test run.
- Agent TypeScript check and **9** fake-Docker HTTP/routing/security tests passed; **3** Python archive/quota tests passed.
- Client browser bundle passed. Actual local Chromium remains blocked by the process-socket permission; no screenshot/visual pass is claimed. The separate operator/companion-repository integration scripts were not run.
- No live SQL/DNS/provider mutation, VPS install, real transfer, renewal or paid scheduler was run. Check current GitHub Actions/Vercel status separately from these local results.
