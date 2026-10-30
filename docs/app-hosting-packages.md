# App Hosting packages and remaining server enforcement

The product is House My Site App Hosting. App Starter, App Business and App Pro
are real saved package records, not hardcoded UI cards. See packageLimits.ts for
all 23 finite limits (and schema version). MiB means 1024x1024 bytes. CPU percent
is a ceiling relative to one core. Runtime and build memory are separate budgets.
Limits are account totals, not a fresh allowance for each of 3/5 apps.

Owner: Hosting > Packages > Configure plan. Confirm a price explicitly (including
zero only if intentionally free), currency and billing cycle. Assign to client
opens the existing service form with the real package selected. Choose an active
client and an available server allowed by the plan, or save without a server as a
pending contract. Assignments are idempotent and snapshot the limits. Existing
assignments never silently inherit later plan edits. Pending unpriced contracts
cannot bill; cancel/recreate a pending contract after changing its terms.

Customer: Plans & limits shows safe catalogue fields and only their own assigned
snapshots. Existing admin read-only client inspection remains enforced. This is
not self-service purchasing and does not enable any client runtime controls.

## Account identity and receipt-gated activation (source; not live)

Each assignment now has an **account** and website slots (`freelance_hq_hosting_accounts`, `…_account_sites`). Websites of one account share one `website_limit`; a second purchase is a
second account. The owner opens the account, requests setup (a queued job on the VPS that still needs the owner's offline approval), and checks status. An account becomes `enforced`
only from a VPS status that repeats the stored contract identity and carries a verified receipt; the service can be set Active only then. Usage is shown exactly as the VPS reported it
and unmeasured values read **Unknown**. Legacy provisioning still never receives an App contract. Per-limit mechanisms, blocked features (databases, PHP/runtime, builds, mail sending
until its hook is approved) and the decisions that unblock them are in the automation repository, `docs/app-hosting-enforcement.md`; the version-pinned deployment, acceptance and rollback
steps are in `docs/app-hosting-deployment.md`. Nothing here has run on the production VPS. No prices were invented; client visibility, Next.js and automatic deployment stay off.

What a limit means on this server (all in the automation repository, `docs/app-hosting-enforcement.md`):
- **Memory, CPU and process limits** are account totals for Next.js runtimes (one kernel control group per account, shared by its websites). The control is built and kernel-tested but switched off together with
  Next.js hosting; static websites run no customer process. PHP is not part of App Hosting. **Build limits** (seconds for the whole build, memory per build) are built and tested and switched off with the build sandbox.
- **Database storage** has no safe hard control on the shared MariaDB (tested on a real server: a size-limited volume makes the whole database server abort when BLOB rows fill it). The server instead gives each account its
  **own private MariaDB instance** on the same VPS (own storage ceiling from a user quota, own memory/CPU/process limits, own credentials and socket; one account filling or crashing its instance does not stop another account or the panel
  database). It is built and tested in the automation repository but **not installed or accepted live**, so databases stay **not available yet** in the portal until the owner records the live acceptance. Prices stay unset.
- **Mailboxes** live on the account's primary domain (extra websites keep their own web domains). Sending stays off until the owner approves the Postfix recipient-policy hook.
- **Runtime variables** hold values up to 8192 bytes (the sealed format was raised from 4096 to match the packages).

Rollback UI: restore previous Vercel deployment. The schema is additive and old
portal code can continue; do not drop snapshots or erase assignments. Disable
new plan assignments via is_active=false if necessary. Existing catalogue
changes cannot mutate a saved contract.

## The pending migration `20261030090000_app_hosting_accounts.sql`

- **Adds** two tables (`freelance_hq_hosting_accounts`, `…_account_sites`, row-level security on, `service_role` only), six functions and two triggers. **Changes** one existing function: `freelance_hq_hosting_snapshot_plan`
  (the contract trigger on services). Before: an App Hosting contract can never be set Active ("server enforcement is not enrolled"). After: it can be set Active only if an `enforced` account with a verified receipt,
  the same limits digest and the same assignment key exists. Creating (assigning) an App contract is unchanged; legacy services are untouched.
- **Existing data:** none is rewritten. On the live portal database today there are 0 services (so none with an App snapshot), and the new tables do not exist yet. `tests/hosting-app-accounts-rollback.cjs` checks on a real Postgres engine
  that applying and rolling back leave every existing row byte-identical.
- **Order:** apply the migration first, then deploy the portal code that reads the tables (the code reads them as soon as it runs), then set `HOSTING_APP_ACCOUNTS_ENABLED=approved`. Never the other way round.
- **Rollback:** unset the switch (or promote the previous Vercel deployment) first, then run `supabase/rollbacks/20261030090000_app_hosting_accounts_down.sql`. It drops the new tables, functions and triggers and restores the previous
  trigger text exactly, but **refuses while any account exists** (accounts carry receipts and history and are never dropped by a rollback).
