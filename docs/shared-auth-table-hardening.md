# Shared Supabase Auth table hardening — 2026-11-19

## Scope and result

The shared production database contains companion-app `public.users` and
`public.usage_logs` tables as well as the separate Freelance HQ tables.
Supabase-owned `auth.*` tables, accounts, credentials, sessions and MFA factors
were not changed. HQ still authorizes from `freelance_hq_profiles`, not from
the companion app's uppercase `ADMIN`/`USER` role.

Live migration: `20261119112518_shared_auth_table_boundaries.sql`.
The filename matches the version recorded by the Supabase migration tool.
This is a database-only fix; the portal UI and runtime source are unchanged.

## Findings and corrections

- Reading `public.users` as `authenticated` returned SQLSTATE `42P17`:
  `infinite recursion detected in policy for relation "users"`.
  The replacement policy uses a private current-user-only role predicate.
- Own-row policies allowed sensitive profile fields to be written without a
  separate guard. A private trigger now protects identity fields and prevents
  non-admin browser accounts changing role, plan or login email. Default
  USER/BASIC provisioning, ordinary profile fields, companion-admin management,
  Auth signup triggers and trusted backend access remain supported.
- `usage_logs` previously allowed unrestricted inserts and shared NULL-owner
  reads/updates. Browser writes are now revoked. Authenticated reads require an
  exact owner; guest/IP and other users' counters are not visible. Backend
  service-role writes remain available.
- Anonymous grants on the shared profile and usage tables are revoked.

The helper schema `freelance_hq_security` must remain outside Data API exposed
schemas. Its definer functions use an empty search path and qualified objects.
Only the current-user boolean predicate is executable by `authenticated`;
the trigger function has no public/browser execute grant. No caller-supplied
user ID or user-editable metadata grants a role.

## Verification

- Isolated PostgreSQL tests exercise own-profile reads/edits, protected fields,
  cross-user denial, safe default inserts, legitimate companion-admin and
  service-role operations, private helper grants, repeat application and a
  standalone HQ installation without companion tables.
- Existing team-boundary, bot-workspace and security-hardening tests pass.
- Typecheck, lint and an isolated production build pass. Lint reports four
  existing React hook dependency warnings in unrelated components.
- Live checks use SELECT/catalog reads and transaction-local role settings only.
  No live privileged-write test, signup, reset email, renewal, scheduler,
  payment, invoice, provisioning or external paid operation was run.
- The previous authenticated users query now succeeds and sees exactly the
  current user's profile. Anonymous table grants and browser quota writes are
  absent. All HQ tables still have RLS and no anon/authenticated table grants.
- Before/after database-side fingerprints match for Auth users, companion users,
  HQ profiles, projects and bots. Only equality results were reported; no
  credentials, password digests or row contents were exported.

## Remaining dashboard setting

Supabase Security Advisor still reports leaked-password protection disabled.
The organization is on Pro, but the connected database tools do not expose Auth
configuration changes and the available dashboard browser has no signed-in
session. No setting change or password reset was attempted. Enable through an
authenticated Supabase dashboard session; do not change credentials or force
existing users out. Supabase documents that strengthened password requirements
allow existing sign-ins, though clients should handle a weak-password warning:
https://supabase.com/docs/guides/auth/password-security

Advisor also reports 121 informational RLS-enabled/no-policy notices. These
default-deny tables are not made publicly readable to silence notices. HQ uses
server-only data access with backend authorization. The browser-grant audit
after this migration found zero accessible HQ tables.
