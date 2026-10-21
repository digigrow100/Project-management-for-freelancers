# HouseMySite server connection

## Registered server

HouseMySite Server 1 (`7c8d73d5-54a4-4144-906e-2defa1fb08a7`), Contabo, `server1.housemysite.com`, IPv4 `62.171.130.156`. Owner records report Ubuntu 24.04, 4 vCPU, 8 GiB RAM, and a 150 GiB physical disk. Portal memory/disk values are nominal installed totals, not free or allocatable capacity. Region remains unset. Registered idempotently as **draft**, with an append-only admin audit entry, on 2026-10-21. No VPS commands were run.

## Read-only report connection

Hosting → Servers → Connection reuses the existing `digigrow100/housemysite-server-automation` GitHub/Windows restricted SSH bridge. It reads existing health/services result comments only. It cannot create an issue, send commands, reboot, provision, install or deploy. The existing Windows scheduled task needs its normal awake/signed-in host and enrolled SSH agent to publish new reports.

The owner supplies a fine-grained GitHub token for account `digigrow100`, limited to that automation repository with **Issues: Read-only**. Add it privately to the original Hamza Vercel project's Production environment as sensitive `HOSTING_BRIDGE_GITHUB_TOKEN`, then redeploy. Never add `NEXT_PUBLIC_`, put the value in chat, commit it, or replace the bridge's existing token/key. No SSH or owner signing key is needed by this portal connector.

Original Vercel project: https://vercel.com/hamzafarooq5060-9321s-projects/project-management-for-freelancers/settings/environment-variables

Server credentials remain server-only. Requests use a fixed GitHub API origin/repository, bearer authentication, no cache, no redirects and a 12-second timeout per request. Each admin-triggered read requires live hosting admin/MFA authorization, exact server identity and rate limiting. At most 30 latest labelled issues, four candidate requests and 100 comments per request are read. Missing or older reports may fall outside that bounded window; missing evidence is never interpreted as success.

Only owner-authored, labelled fixed health/services requests and owner-authored result comments with the exact issue, request ID, operation and request-body SHA-256 are accepted. Timestamps are bounded; reports older than 24 hours are historical. Only operation, status, time and warning/error counts reach the browser. This is authenticated GitHub report provenance, not independent signed production evidence or continuous monitoring. No result changes server availability or production readiness.

## Production connection remains separate

Latest reviewed automation handover (2026-10-18) records production acceptance **0/26**, missing production operator/storage guard, independent evidence-service enrollment, and permanent storage policy. Four existing smoke runtimes and unrelated websites/mail are protected. Automatic deployment remains off. Backups/storage purchases remain paused unless separately requested. Do not repeat the completed broad storage census or bounded quota rehearsal, invent storage budgets, or bypass installer/evidence gates.

The next live production installation must be based on the existing reviewed automation approval package and actual owner-side prerequisites. A GitHub read token alone does not complete those prerequisites.

## Verification

Typecheck, lint, production build and existing hosting/session security tests; `node tests/hosting-bridge-reports.cjs` checks provenance, digest/operation/issue/timestamp rejection and stale-state behavior. End-to-end token enrollment and a fresh bridge result remain owner-dependent. Do not label the server connected or production-ready until actual evidence supports it.
