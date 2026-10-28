# Admin network access

Admin browser access requires an approved public IPv4 address in the private
ADMIN_ALLOWED_IPS Vercel setting (comma-separated exact addresses, no CIDRs).
No list values are included in source or sent to the browser.

Only x-vercel-forwarded-for in a Vercel runtime is trusted. Missing/malformed
configuration, ambiguous headers and unlisted IPv6 addresses deny admin access.
IPv4-mapped addresses normalize. No query, cookie or development bypass exists.
Never fall back to caller-supplied forwarded headers. Review any new upstream proxy.

Known admin-only routes return403 early. Verified role checks also protect shared
pages, server actions and APIs. Actual admin identity is checked before member/client
inspection. Admin password login signs out denied accounts; existing sessions,
password updates and MFA setup/removal are guarded. Normal members/customers keep
their own access. An allowed IP never replaces password/MFA/session/ownership checks.

This does not restrict SSH, ISPConfig, Vercel/Supabase dashboards, mail/DNS or
signed operator/cron/device protocols. It is not a site-wide WAF rule. Preserve
Deployment Protection and do not promote old unguarded deployments.

## Add an IP or recover

1. Verify the owner's new public IPv4 through a trusted channel.
2. Use the separately authenticated Vercel account to open the canonical Digigrow
   project > Settings > Environment Variables > ADMIN_ALLOWED_IPS.
3. Preserve existing addresses, add the approved one, and keep the list private.
   Apply to Production and Preview. Never use NEXT_PUBLIC or a public recovery route.
4. Redeploy the current reviewed main commit. Env changes affect new deployments.
5. Confirm admin login/action from an approved network, denial from another, and
   normal member/customer access independently.

If locked out, correct the Vercel setting and redeploy. Do not remove the guard,
add0.0.0.0/0 or roll back to an unguarded build. Vercel account access provides
out-of-band recovery; no in-app bypass is included.

## Checks

node --test tests/admin-network.cjs tests/hosting-domain-security.cjs

Tests use real middleware/auth/login/MFA/admin-API modules with isolated identities
and reserved documentation IPs. They cover existing sessions, role changes, member
inspection, missing/malformed settings, spoofed headers and normal users. No real
account, credential, factor or provider change is made.
