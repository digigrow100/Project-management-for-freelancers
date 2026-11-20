# HouseMySite website agent

This directory is part of the client website checkout PR. **It is not installed by opening the PR.** No live VPS, DNS, Supabase or Vercel change has been made.

Read [the full release and operator runbook](../docs/client-websites.md) before installing. It includes database order, private credential setup, network/firewall enrollment, exact VPS commands, limitations and the PR #268 review.

The agent accepts an allowlist of signed website operations. Browsers receive one upload-scoped token, never the portal bearer/signing key. Uploads stream directly here and are capped at 1,000,000,000 bytes total. Source extraction and the final artifact must fit the site's signed approved quota. Application roots are read-only, with bounded temporary caches; build and fetch jobs use separate, bounded containers. Clients cannot supply a Dockerfile, Docker image, shell command or filesystem path.

GitHub URLs are supported, including fine-grained read-only tokens for private repositories. GitLab, arbitrary Git hosts, Docker images and monorepos/workspaces are not enabled. Supported presets are static, React/Vite, Vue/Vite, Next.js, Nuxt and npm-based Node. Each Node project needs package-lock.json and the appropriate build/start scripts. User data needs an external database/object store; there is no writable persistent application volume in this release.

The agent uses Docker's provider and health checks for Traefik routing. It does not edit existing Traefik static files or CrowdSec settings. A ready replacement gets a newer router priority; the previous container is kept until the replacement passes readiness. Ownership of every new domain must first be established by the portal's per-website TXT proof.

Tests use fake Docker operations and disposable fixtures:

```sh
npm test
```

A passing fixture suite is not proof that a particular VPS, Traefik resolver, npm project or HTTPS certificate works. Live acceptance is a separate operator step after the app release is approved.
