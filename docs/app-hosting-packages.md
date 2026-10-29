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

## Explicitly not ready on the VPS

The installed 99f373f worker does not consume all these account-wide budgets.
Its one-site policies and existing per-site controls cannot safely be called full
account enforcement. App contracts are therefore rejected before provisioning
dispatch; manual Active and invoice creation are blocked. Standard legacy flows
remain available. The server record remains draft. No prices were invented.

Before enabling App Hosting, the operator must connect an account identity and
its site slots to shared storage/runtime/mail/database budgets, enforce outgoing
mail recipients and transfer limits, map source upload/build/release/env/log
budgets and backup retention, verify readback, and return a receipt bound to the
assignment UUID and immutable limits digest. Both 80%/90% usage warnings need
real counters; absent telemetry must stay unknown. Do not delete customer data
at a threshold. Do not enable dispatch merely by removing the portal guard.

A real live acceptance must assign a synthetic account, hit each limit, verify
sibling apps share the budget, reject cross-client actions, and test rollback.
SSH from this workspace returned Network is unreachable; the owner's working
Windows PowerShell connection is needed for VPS inspection/deployment. No VPS
commands, firewall rules, runtime flags, production sites or real customer data
were changed here. Next.js activation and autodeploy remain separately gated.

Rollback UI: restore previous Vercel deployment. The schema is additive and old
portal code can continue; do not drop snapshots or erase assignments. Disable
new plan assignments via is_active=false if necessary. Existing catalogue
changes cannot mutate a saved contract.
