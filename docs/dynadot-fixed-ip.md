# Dynadot fixed-IP connection

The registrar runs on Vercel. Its direct outgoing IP changes by default; a Dynadot allowlist containing an unrelated single IP can block it. The owner's Networking screenshot shows Static IPs off. This is a plausible network blocker, not proof that every rejected credential was valid. Do not remove the existing IP or allow the entire internet. Rotate the provider key/secret exposed in the owner's screenshot before reconnecting. Never paste them into chat.

## Prepared architecture

`DYNADOT_RELAY_ENABLED=approved` sends all registrar requests to `/v1/dynadot-relay` on the existing HTTPS `HOSTING_SERVICES_ORIGIN`. The existing `HOSTING_SERVICES_PORTAL_KEY` signs a separate HMAC context. No new secret enrollment or key rotation is required. Unset keeps existing direct transport; invalid enabled configuration fails closed. There is no fallback or automatic retry after a relay error.

The separate hms-services unit listens on TLS loopback18444 and uses the existing internal certificate/key. It never changes the current services release. Only fixed Dynadot production/sandbox hosts and supported REST routes are accepted. Provider connections explicitly use IPv4, validate system CAs and hostnames and never follow redirects. The API signing secret stays in Vercel; the relay holds the API key/signature/request body only in memory. It logs no request or provider content. The existing hms-services identity/key is reused; this is not independent OS isolation from that identity.

A bounded SQLite replay ledger commits each signed nonce before dispatch. Mutation request IDs are also stored permanently, so replacing an envelope nonce cannot resend a possibly accepted purchase. Replays, stale envelopes, unknown routes and overload fail closed. Crashes and lost replies never automatically resend the upstream request. The portal's persisted review/claim/uncertain-operation controls remain authoritative for business operations. A new nonce must never be used to bypass an uncertain renewal.

## Installation and acceptance

Source tests are not VPS acceptance. The installation is authorized by the owner but must run through their existing strict root SSH connection; Codex has no direct SSH credential.

`Install-HouseMySiteDynadotRelay.ps1 -ReviewedCommit <exact40hex>` performs one Windows batch: fetch the pinned Git commit into a fresh temporary directory with CRLF conversion disabled, hash the three files, strict existing root SSH/SCP to a new root-private directory, verify all remote hashes, and invoke the installer once. No API key/passphrase is required. Preserve the final output; an error stops the batch without automatic repetition.

Stage `relay.py`, `housemysite-dynadot-relay.service`, and `install.py` from one reviewed commit in a fresh root-private directory. Verify the pinned SHA256 of all three before execution. The installer verifies its relay/unit hashes again. Run:

```
python3 -I /root/REVIEWED-STAGE/install.py --relay-sha REVIEWED_SHA --unit-sha REVIEWED_SHA --execute
```

The installer requires the existing single `*:443` server1.housemysite.com vhost, enrolled exact `/v1/services` TLS route, strict existing upstream CA/name verification, active housemysite-services and free loopback18444. Unknown layouts stop before changes. No package install, new user, firewall, DNS, certificate issuance, provider mutation, mail, quota or customer content change.

It backs up the current Apache vhost under `/root/hms-dynadot-relay-<UUID>`, adds only the exact relay route, configtests and gracefully reloads. Signed health makes a TLS connection to Dynadot without a domain API request. Acceptance checks replay, invalid signature, GET rejection and unchanged root HTTP status/redirect. The output's `connection_source_ipv4` is the provider socket's local source address. On a directly addressed VPS this is the allowlist candidate; it is not an external NAT measurement or successful provider authentication. Verify it matches the expected assigned VPS public IPv4 before allowing it. Do not use a Vercel inbound DNS address or the owner's home IP.

On failure it restores the original Apache configuration unless a concurrent edit prevents safe restoration, then stops/disables only the relay. Source/state/backups are preserved. A partial install must be reviewed; never overwrite it or delete its replay ledger to retry.

After `installed:true`: add the verified VPS IPv4 alongside existing Dynadot IPs, click Set IP Address and allow at least ten minutes for propagation. Only then set `DYNADOT_RELAY_ENABLED=approved` in Vercel Production and redeploy the reviewed source. Do not enable Preview implicitly. Test and save the new Production credentials through the secure owner panel. Successful authentication and domain sync remain unverified until that test succeeds; no renewal or DNS edit is part of connection testing.

## Rollback

First remove the portal relay flag and redeploy the reviewed portal (direct connections may again be blocked by Dynadot). Preserve unresolved domain operation states; never repeat a possibly accepted provider mutation. Stop the relay only after its requests have settled.

```
python3 -I /root/REVIEWED-STAGE/install.py --rollback /root/hms-dynadot-relay-EXACT_UUID
```

Rollback requires the exact backup and exact current candidate hash. Later Apache edits block automatic rollback. It restores only the original vhost and disables/stops only the relay. Source, SQLite state, keys, original services unit and backup remain. The existing internal certificate renewal and portal-key rotation procedures must keep the relay in sync.

Official references: https://www.dynadot.com/help/question/find-API-settings and https://vercel.com/kb/guide/how-to-allowlist-deployment-ip-address.
