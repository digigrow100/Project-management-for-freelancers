# Hosting controls readiness — 27 October 2026

The owner authorized the initial hosting launch, including necessary source pushes,
merges, migrations, deployment and VPS setup. This authorization expires only when
hosting is functional; later production changes need approval again. Preserve current
customer services/data and rollback points. Do not interpret a fixture as live health.

Canonical project: Digigrow Team, prj_uaskxWpvMZK26bJn0VDboJBdqqbI, hqproject.com.
The older Hamza Vercel project is a duplicate and is not the launch target. PR230 is
merged0ab9c3e; its usage fix is READY on the canonical production project. APP_URL is
configured as https://hqproject.com for the next build.

This change extends existing PR228 and preserves current main's team/workflow and
Supabase fixes. No separate fragmented PR is needed. Test-only root dependencies
PGlite0.5.10, react-test-renderer18.3.1 and esbuild0.25.12 are pinned. Comparison with
main's lockfile found no version changes to any existing package. Optional platform
packages account for additional lock entries; root runtime dependencies are unchanged.

Implemented: typed/scoped operator transport, context/device signing and sealed export,
private service/backup gateways, admin/client Email/Database/Forms/Backups pages and
server-side feature publication gates. Current services/ownership/MFA/read-only checks
are mandatory. No private owner signing key or provider password reaches the portal.
Unreleased features are visible to admins for testing and absent from client links,
direct pages and APIs. Publication flags indicate configuration, not live service health.

Exactly2 transport migrations applied live via Supabase. Their source filenames now
match actual history versions20261027182003 and20261027182025. All3 new tables have
RLS, no anon/authenticated/PUBLIC grants and0 enrolled operators. No customer data
was exported or imported. Existing session/rate-limit RPCs remain private and present.

Local checks: full TypeScript/lint (4 prior unrelated hook warnings), optimized build,
10 usage tests/12 outage tests/security checks and16 Chromium HTTPS groups pass.
Root-dependency portal selection passes17 Node/React/protocol groups; isolated PGlite
claims, scope/revocation/receipt/body limits pass, including optional real Python Intake
interop when HMS_AUTOMATION_SOURCE points at the companion automation checkout.
CI now runs the new source tests, SQL checks and an isolated production compile.
Inspect CI for the exact new PR228 head before merging; previous local results are
not a GitHub CI result for an unpublished head.

Reproduce root tests after npm ci:

```sh
node --experimental-strip-types --test tests/operator-controls.test.cjs tests/operator-upload.test.cjs tests/hosting-operator-protocol.cjs tests/backupProtocol.test.mjs tests/manager.test.cjs tests/client-release.test.cjs
node tests/hosting-operator-database.cjs
python3 local-checks/build-isolated.py
```

Optional cross-repository browser drill: npm ci --prefix test-runtime --ignore-scripts;
prepare the pinned Linux browser with tests/prepare-browser-runtime.cjs; set NODE_PATH
to test-runtime/node_modules, HMS_PORTAL_APP_ROOT to the built isolated app directory,
HMS_AUTOMATION_SOURCE to the reviewed companion source and HMS_SERVICES_BROWSER_TEST=1.
OpenSSL/system Linux fonts required. Never reuse production credentials/customer data.

Live blockers: the VPS private service settings/runtime are absent. Its read-only
inventory confirms all14 provider methods and active Apache/MariaDB/Postfix/Dovecot,
MariaDB10.11.14/Dovecot2.3.21/PHP8.3.35; JSON wire/templates and scoped credentials
still need private acceptance. Runtime installation/TLS edge, actor/service/public-key
enrollment, SMTP sender/DNS, storage/evidence/backups and actual first-site acceptance
remain. Physical GC/count-vs-lock policy is unfinished; backup schedules remain off.
The VPS SSH keys are on the owner's Windows computer, not available to this workspace.
A consolidated terminal step may be required, but another launch approval is not.

Rollback: turn off affected publication/worker flags, stop new dispatch, return app
code to its reviewed predecessor and retain private ledgers/nonces/uncertain jobs.
Do not drop populated transport tables, delete user/provider resources or replay
uncertain operations as a code rollback.
