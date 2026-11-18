import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { AddDomainDialog } from "../components/hosting/dashboard/controls";
import { NewAppWizard } from "../components/hosting/dashboard/NewAppWizard";
import { AppDetail, AppsList, ComingSoon, Overview } from "../components/hosting/dashboard/present";
import type { HostingApp, HostingAppDomain, HostingDeployment } from "../lib/hosting/apps/types";

const token = "a".repeat(48);
const now = "2026-11-18T06:00:00.000Z";

const running: HostingApp = {
  id: "11111111-1111-4111-8111-111111111111", name: "acme-web", display_name: "Acme website", client_id: null,
  framework: "nextjs", source_kind: "git", source_url: "https://github.com/acme/web", git_ref: "main", dockerfile_path: null,
  port: 3000, cpu: 1, memory_mb: 512, www_redirect: "none", status: "running", last_error: null, created_at: now, updated_at: now,
};
const notes: HostingApp = { ...running, id: "22222222-2222-4222-8222-222222222222", name: "field-notes", display_name: "Field notes", framework: "react", status: "stopped", source_url: "https://github.com/acme/notes" };
const domains: HostingAppDomain[] = [{
  id: "33333333-3333-4333-8333-333333333333", app_id: running.id, hostname: "acme.example.com", verification_token: token,
  is_primary: true, status: "pending_dns", detail: "No A record was found yet.", last_checked_at: null, created_at: now,
}];
const deployments: HostingDeployment[] = [{
  id: "44444444-4444-4444-8444-444444444444", app_id: running.id, status: "succeeded", trigger: "manual",
  image_ref: "hms/acme-web:latest", log_excerpt: null, error: null, created_at: now, finished_at: now,
}];
const host = { cpuPercent: 18.4, memory: { used: 2_400_000_000, total: 8_000_000_000 }, disk: { used: 41_000_000_000, total: 150_000_000_000 }, source: "host" };

function page(node: ReactNode) {
  return renderToStaticMarkup(node);
}

export const previews = [
  { name: "admin-overview", shell: "admin", html: page(<Overview base="/hosting/apps" apps={[running, notes]} deployments={deployments} host={host} attacks={[{ id: "1", value: "203.0.113.10", scenario: "http-probing", duration: "3h" }]} legacy={{ services: 4, tickets: 1 }} />) },
  { name: "admin-apps", shell: "admin", html: page(<AppsList base="/hosting/apps" apps={[running, notes]} domains={{ [running.id]: "acme.example.com", [notes.id]: "" }} />) },
  { name: "admin-wizard", shell: "admin", html: page(<NewAppWizard action={() => undefined} base="/hosting/apps" clients={[{ id: "55555555-5555-4555-8555-555555555555", name: "Acme Co" }]} />) },
  { name: "admin-domains", shell: "admin", html: page(<AppDetail base="/hosting/apps" app={running} tab="domains" domains={domains} deployments={deployments} envNames={[]}>{null}</AppDetail>) },
  { name: "admin-add-domain", shell: "admin", html: page(<><AppDetail base="/hosting/apps" app={running} tab="domains" domains={domains} deployments={deployments} envNames={[]}>{null}</AppDetail><AddDomainDialog action={() => undefined} base="/hosting/apps" appId={running.id} open /></>) },
  { name: "client-overview", shell: "client", html: page(<Overview base="/client/apps" apps={[running]} deployments={deployments} />) },
  { name: "coming-soon", shell: "admin", html: page(<ComingSoon title="Email Server" body="Mailboxes, aliases and webmail will be set up on this server. This page does not create an account or send mail." />) },
];
