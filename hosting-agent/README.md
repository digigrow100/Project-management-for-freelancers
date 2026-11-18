# House My Site hosting agent

This service runs on the Contabo VPS (`62.171.130.156`). The portal never opens an SSH session and never sends a shell command. It sends a signed JSON request; the agent allows only the routes in `src/server.ts`.

Node.js is used instead of Go so the request signing, name checks and tests stay in the same language as the portal. The process has no npm dependencies. Node 22 runs the TypeScript directly.

## What it will and will not do

It can clone a git repository, build an image from a generated Dockerfile or a repository Dockerfile, pull an image, and run that image on the external Docker network `proxy` with CPU and memory limits, `no-new-privileges`, and Traefik labels for Let's Encrypt (`certresolver=le`). It can read container logs, host CPU/RAM/disk, and CrowdSec decisions, and it can delete one decision.

It will not open a shell in a container, mount the Docker socket into an app, or accept a command string from the portal.

Known frameworks (`nextjs`, `react`, `vue`, `nuxt`, `node`, `static`) get a Dockerfile written by the agent. `dockerfile` builds the file already in the repository. `image` pulls a reference and runs it. If `nixpacks` or `railpack` is later installed on the VPS it is not required; those builders are not invoked.

## Keys

On your own computer:

```bash
openssl rand -hex 32
node --input-type=module -e 'import {generateKeyPairSync} from "node:crypto"; const {publicKey,privateKey}=generateKeyPairSync("ed25519"); process.stdout.write(privateKey.export({type:"pkcs8",format:"der"}).toString("base64")+"\n"+publicKey.export({type:"spki",format:"der"}).toString("base64")+"\n");'
```

- The hex value is `HOSTING_AGENT_TOKEN` on both Vercel and the VPS.
- The first base64 line (PKCS8) is `HOSTING_AGENT_SIGNING_KEY` on Vercel only.
- The second base64 line (SPKI) is `HOSTING_AGENT_SIGNING_PUBLIC_KEY` on the VPS only.
- `HOSTING_APP_SECRETS_KEY` (`openssl rand -hex 32`) stays on Vercel and encrypts environment values in Supabase.

The portal stores `sha256(HOSTING_AGENT_TOKEN)` in `freelance_hq_hosting_agent_config`. It does not store the token or the private key in the database.

## Install

Run this on the VPS as root. Pick the hostname that should serve the agent, for example `agent.housemysite.com`, and point its DNS at `62.171.130.156` before Traefik asks Let's Encrypt for a certificate.

```bash
install -d -m 755 /opt/stacks/sites
install -d -m 700 /opt/stacks/hosting-agent
# Copy this hosting-agent directory to /opt/stacks/hosting-agent
# (git clone of this repository, or scp of the hosting-agent folder).
cd /opt/stacks/hosting-agent
install -m 600 /dev/null .env
cat > .env << 'EOF'
HOSTING_AGENT_TOKEN=paste-the-hex-token
HOSTING_AGENT_SIGNING_PUBLIC_KEY=paste-the-spki-base64
AGENT_HOST=agent.housemysite.com
CROWDSEC_LAPI_URL=http://172.18.0.1:8180
CROWDSEC_LAPI_KEY=paste-a-crowdsec-bouncer-key
EOF
chown -R 1000:1000 /opt/stacks/sites
docker compose up -d --build
docker compose ps
curl -fsS https://agent.housemysite.com/health
```

The container starts as root only to create `/var/lib/hms-agent`, `/var/log/hms-agent` and `/opt/stacks/sites` and give them to the `node` user, then the process drops privileges. A fresh Docker volume is root-owned until that entrypoint runs.

`/health` returns `{"ok":true}` and nothing else. Every other route requires the bearer token and a fresh Ed25519 signature.

CrowdSec is optional. Leave `CROWDSEC_LAPI_URL` and `CROWDSEC_LAPI_KEY` empty until a bouncer key exists; the security page then shows that decisions are not configured. The key only needs to read decisions and alerts and to delete a decision. Create it on the VPS with `cscli bouncers add hms-agent` and put that key in `.env`, then `docker compose up -d`.

The socket proxy allows image build, pull, and container create/start/stop/remove. It does not allow `exec`, swarm, or secrets. That build access is still powerful. Do not publish the proxy port.

## Vercel environment

Set these on the hosting project. Do not print them back into a log or a pull request.

- `HOSTING_AGENT_URL` = `https://agent.housemysite.com`
- `HOSTING_AGENT_TOKEN` = the same hex token as the VPS
- `HOSTING_AGENT_SIGNING_KEY` = the PKCS8 base64 private key
- `HOSTING_APP_SECRETS_KEY` = a separate 32-byte hex secret
- `CLOUDFLARE_API_TOKEN` = optional; DNS automation stays off while this is unset

Apply `supabase/migrations/20261118180000_hosting_apps.sql` before opening the Apps page against the live database. This repository change does not apply it.

## Rollback

```bash
cd /opt/stacks/hosting-agent
docker compose down
```

That stops the agent and the socket proxy. It does not delete `/opt/stacks/sites/<app>` or running site containers. Remove a site only from its page in the portal, or with `docker rm -f hms-<app>` after you have decided the site should go.
