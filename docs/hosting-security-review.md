# Hosting security review — 21 October 2026

## Scope and release state

Reviewed the HouseMySite client/admin portal, shared authentication/recovery paths, hosting authorization, session handling, DB grants, secret boundaries and production dependency advisories. This is an internal code/DB review, not an independent penetration test. New app protections require deployment; TOTP requires the account owner to enroll. There is one admin and no verified admin MFA factor at the time of the live check. No real authenticator, email invitation or customer financial entry was created by this review.

## Implemented

- `/login/security`: explicit TOTP enrollment, owned-factor verification and sign-out. QR is private response state, not a URL, log or database record in this app. No silent enrollment. No app-level MFA reset bypass. Lost-device recovery requires owner identity verification and Supabase account administration.
- Hosting admin access requires live database admin role, a live session, verified factor enrollment and AAL2. Client hosting access checks live session, ownership and AAL2 when enrolled. Team profile resolution enforces enrolled MFA and never grants admin because a profile table is missing or empty. New team profiles default to member.
- Hosting session lookup binds the Auth-validated user and token session ID to `auth.sessions`, checks `not_after`, rejects revoked sessions, and caps hosting session age at 24 hours. Expired users must sign out and sign in. MFA verification itself still requires a live session.
- Auth cookies set HttpOnly, Secure in production, SameSite=Lax and root path consistently in server actions/middleware. Redirect responses preserve refreshed cookies. Existing 30-minute read-only admin inspection stays signed and actor-bound.
- Private atomic rate limits: login 10 per account/15m plus 40 per trusted Vercel IP/15m; reset 3 per account/15m; MFA 10 per user/5m; password change 5 per user/15m; hosting writes 60 per user/minute; client writes 30 per user/minute. Only HMAC bucket keys are stored, not plain email/IP. Backend failures deny attempts. Direct Supabase Auth traffic remains subject to provider limits, not these app counters.
- Password reset accepts 12–128 characters, enrolled users must complete MFA, recovery paths reject backslashes/control characters, and production recovery origin requires configured/canonical Vercel origin rather than trusting request Host.
- Added HSTS, CSP base/object/frame/form restrictions and private no-store rules for portal/auth pages. Existing inline-script policy remains; no nonce migration is claimed.
- `server-only` guards added to privileged DB and registrar crypto/client modules. Registrar transport gets timeout, no redirects and generic remote errors. No registrar or VPS operation was executed.
- Safe patch dependency updates and lockfile refresh; Supabase dependencies pinned to the tested installed versions.

## Database evidence

Migration: `20261021095631_hosting_security_hardening.sql`, applied to the existing Freelance HQ project. Adds one `freelance_hq_hosting_` table, RLS enabled, no browser grants. Rate RPC is invoker; session RPC is narrowly scoped definer to read auth.sessions and returns only a boolean. Both are executable only by service_role. No browser role can supply arbitrary security RPC parameters.

Live rollback test: limiter results `[true,true,true,false,false]`; anon/authenticated table and RPC access false; service-role session lookup true. Fake session rejected. No test rate entries retained. The three legacy trigger functions now have no anon/authenticated EXECUTE; trigger definitions are unchanged.

Before: all 17 existing hosting tables had RLS and no anon/authenticated SELECT grants. After migration: Supabase advisors no longer report publicly executable SECURITY DEFINER trigger functions. RLS-with-no-policy remains expected for server-only tables. Leaked-password protection is still disabled and must be enabled in Supabase Auth settings (subject to project plan): https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## Tests and secret review

TypeScript, lint (four existing unrelated hook warnings), production build, client-scope, hosting authorization, signed admin-client inspection, workspace navigation and member-view regressions passed. New behavioral tests cover MFA/AAL requirements, revoked/expired/foreign sessions, fail-closed backend errors, cookie policy and preventing accidental admin fallback. PGlite 0.5.10 SQL tests cover thresholds, expiration, privileges and session age/ownership/revocation. Live DB tests used rollback.

Tracked-file pattern scan found no private keys, GitHub token patterns, Supabase secret-key patterns or tracked non-example env files. Browser JS bundles had zero references to SUPABASE_SERVICE_ROLE_KEY or DYNADOT_SECRET. This is a bounded pattern/import review, not proof that every possible credential is absent or that remote platform environment settings have been audited. No secrets were printed or rotated.

## Remaining work — do not describe this as fully secure

1. Dependency audit after safe patches: **35 advisories (1 critical, 3 high, 31 moderate)**. Remaining include Next.js 14.2.35, Tiptap 2.x/core and the npm `xlsx` package; some counts are shared/transitive packages. They require a tested framework/editor migration and a maintained spreadsheet replacement/distribution, not a blind `npm audit fix --force`. No clean dependency audit is claimed. See fresh `npm audit --omit=dev` for affected ranges and advisory links.
2. Owner must enroll and verify an authenticator after release; no MFA enrollment was performed on their behalf. Supabase account/project MFA and provider-level Auth rate limits/CAPTCHA/compromised-password settings require separate dashboard verification. App rate limits do not replace provider protections.
3. Authenticated live-browser testing (sign in, scan/verify QR, challenge after fresh sign-in, read-only inspection, payment and support flows) remains pending. No authenticated browser session was used for this review; build/unit/database checks do not stand in for this test.
4. Vercel team settings/environment values and platform firewall were not audited: connector access to the deployment team was previously denied. Production release status must be checked separately.
5. VPS operator and hosting registrar integration are not connected. Their future tests must cover scoped credentials, replay/idempotency, host/service ownership, no shell injection, registrar permissions and reviewed domain actions before activation. An older Team Domains registrar module exists; this review did not connect it to Hosting or make domain changes.
6. Backups remain paused by owner instruction. No offsite copy or restore drill was configured or verified. Database/hosting recovery assurance is unresolved; this review must not imply otherwise.

## Deployment and operational recovery

Deploy code only after the additive migration and its grant tests pass. Once released, Hosting admin navigation redirects to `/login/security` until the owner scans the QR and verifies a code. Already verified users with a lower-assurance session are challenged before app/hosting access. Keep the owner’s Supabase dashboard access available for verified lost-device recovery; never disable MFA based only on a support email.

If the application release fails, roll back the Vercel application to the previously working deployment. Keep the additive DB migration and restrictive grants; the old app does not depend on them, so removing security tables/functions is unnecessary. This is an application rollback plan, not a verified disaster recovery backup.
