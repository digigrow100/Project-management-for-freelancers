# Email control center — one release

This release is gated by `HOSTING_EMAIL_SERVICES_ENABLED=approved`. Keep it off
until the database migration and VPS installation have succeeded. Do not infer
live readiness from a green build, saved product, DNS presence or provider row.

Database migration 20261031190001 was applied on 2026-10-31 to the canonical
project. New email tables are empty; VPS installation and live acceptance remain
pending. Do not apply that migration again.

## Included

- Search current production Dynadot inventory, or verify an external domain with TXT.
- Create a mail-only service without hosting or a client account. Assign its billing
  client and individual mailbox clients later. Explicit unassigned overrides inheritance.
- Mailbox creation/password/quota, separate SMTP/receiving/login flags, aliases,
  forwarding a copy and automatic replies, each independently signed.
- Saved policy versus observed enforcement, actual measured quota or unknown,
  80/95 percent usage warnings, read-only request history/reconciliation.
- Per-service and additional per-mailbox prices, monthly/yearly periods, discounts,
  due date and grace period. Explicit canonical invoice/payment operations; refunds
  synchronize. No automatic deletion/suspension or payment collection is implied.
- MX/SPF/DKIM/DMARC/PTR/TLS checks and existing explicit reviewed registrar changes.
- Isolated webmail at https://server1.housemysite.com/housemysite-webmail/ and
  IMAP993 TLS / SMTP587 STARTTLS setup. Existing webmail configurations are preserved.
- Explicit encrypted local backups, safety-backup-first restore as imported copies,
  authenticated TLS IMAP migration preserving source messages, folders/flags/dates.

Backups and encrypted mailbox credentials are stored on the same VPS. They do not
protect against total VPS loss. No daily schedule, automatic retention or offsite
protection is claimed. Archive capacity is bounded; when full, the operation stops
instead of silently deleting recovery points. Optional AWS S3 enrollment is separate.

## Operator release sequence

1. Verify exact PR head CI, migration fixture, Chromium screenshots, existing security
   regressions and isolated production build. Review the complete change.
2. Verify the already-applied `20261031190001_independent_email_services.sql`
   in canonical migration history and advisors. Do not create test customer data.
3. Deploy the portal with the independent-email flag still off; verify canonical project.
4. Run `scripts/email/Install-EmailControlCenter.ps1 -ReviewedCommit <reviewed40hex>`
   once on the owner's Windows machine, using existing strict root SSH enrollment.
   It fetches exact Git source, verifies SHA256 over stdin transport, preflights
   package/configuration/provider layout, preserves private backups, installs fixed
   services and isolated webmail, then checks HMAC, replay/bad signature rejection,
   old root route and webmail health. It creates no mailbox or DNS resource.
5. Preserve the final JSON and backup path. On any refusal, inspect that result;
   do not repeat the installer or replace it with the old enrollment batch.
6. After successful installation, enable the portal flag and deploy. Start the
   updated owner-local signer using the EXISTING encrypted key. The installer puts
   its starter in `%LOCALAPPDATA%\HouseMySiteEmailCenter\<reviewedSHA>\Start-HouseMySiteMailSigner.ps1`; keep the private
   key/passphrase/pairing code local. The signer prints the domain and exact action.
7. Use an owner-chosen domain and mailbox in the portal for signed setup. Never
   invent a real mailbox, password, invoice or recipient for acceptance tests.

Initial root allocation: at most 50 mailboxes per independent domain. Shared mail
quota pool is the lesser of16GiB and one quarter of available space after the
existing free-space reserve. Capacity is not an offer of unlimited storage. Each
signed service/mailbox quota is checked against the root policy and existing use.
Recipient defaults:100/hour and1000/day per mailbox,1000/hour per service. Existing
unrelated provider accounts keep their current policy; this is not whole-VM egress isolation.

## Acceptance after installation

- Verify domain ownership, dedicated provider ownership and confirmed quotas.
- Create the owner-chosen mailbox; confirm it stays SMTP paused initially.
- Verify its login and receiving; check actual MX/SPF/DKIM/DMARC/PTR/TLS results.
- Explicitly sign sending enable only after records match. Test real authenticated
  send AND receive with an owner-chosen external recipient; inspect inbox/spam and
  authentication headers. Until then `delivery_verified` remains false.
- Confirm cross-client access denial and explicit unassigned mailbox invisibility.
- For owner-requested billing only, verify canonical invoice totals and payment balance.
- Capture a local encrypted backup and restore into an owner-approved destination;
  compare sample folders, message count, flags and dates. Preserve the recovery key
  securely outside the server if disaster recovery is required.
- Inspect root install receipt, worker status and actual SMTP quota enforcement.

## Rollback and uncertain results

Turning off the portal flag returns the old page without deleting new customer data.
Keep the scoped SMTP limiter in place once new customer mail exists. Never blindly
retry uncertain provider operations or IMAP imports. Read-only reconciliation handles
supported outcomes; unknown password/import results need operator investigation.

Before any new provider allocation, root may run the reviewed uploaded installer:
`python3 -I /root/hms-email-center-<upload>/source/install_control_center.py --rollback-backup /root/hms-email-center-<receipt>`.
It requires unchanged installed Apache/Postfix hashes, a protected receipt, no active
worker/pending request and no new provider allocation. It restores only the exact
saved route/Postfix configuration, disables the new control services and preserves
state, source, keys, mail data, packages and webmail database. This is an installation
rollback, not a destructive customer-data rollback. After allocation, a reviewed
migration is required; do not remove sender controls or restore stale SQLite files.

An installation failure similarly preserves the private receipt and stops the new
controls. Package/database preparation may remain; no unattended cleanup drops
mailbox or webmail data. Review the saved state before a corrective batch.
