import { notFound } from "next/navigation";
import { requireHostingAdmin } from "@/lib/hosting/auth";
import { agentApp, agentConfigured, agentLogs } from "@/lib/hosting/agent-client";
import { hostingMessage } from "@/lib/hosting/apps/messages";
import { getApp, listDeployments, listDomains, listEnvNames } from "@/lib/hosting/apps/store";
import type { HostingApp } from "@/lib/hosting/apps/types";
import { getSupabase } from "@/lib/supabaseClient";
import { AppForms } from "@/components/hosting/dashboard/AppForms";
import { ReloadWhileBuilding } from "@/components/hosting/dashboard/controls";
import { AppDetail, message } from "@/components/hosting/dashboard/present";

const TABS = new Set(["overview", "deployments", "logs", "domains", "env", "settings"]);

export async function renderApp(base: "/hosting/apps" | "/client/apps", id: string, tab: string, options: { clientId: string | null; readOnly: boolean; clients?: { id: string; name: string }[]; notice?: string }) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  let app: HostingApp | null;
  try { app = await getApp(id, options.clientId); }
  catch (error) { return <p className="hms-banner">{message(error instanceof Error ? error.message : "storage_unavailable")}</p>; }
  if (!app) notFound();
  if (agentConfigured()) {
    try {
      const remote = await agentApp(app.name) as { status?: string; error?: string | null };
      if (remote.status && remote.status !== app.status) {
        app = { ...app, status: remote.status, last_error: remote.error ?? null };
        await getSupabase().from("freelance_hq_hosting_apps").update({ status: app.status, last_error: app.last_error, updated_at: new Date().toISOString() }).eq("id", app.id);
      }
    } catch { /* the saved status stays on screen */ }
  }
  const current = TABS.has(tab) ? tab : "overview";
  const [domains, deployments, envNames] = await Promise.all([listDomains(app.id), listDeployments(app.id), listEnvNames(app.id)]);
  let logs: { build?: string; runtime?: string } | undefined;
  if (agentConfigured() && (current === "logs" || current === "deployments")) {
    try { logs = await agentLogs(app.name) as { build?: string; runtime?: string }; } catch { logs = undefined; }
  }
  return <AppDetail base={base} app={app} tab={current} domains={domains} deployments={deployments} envNames={envNames} logs={logs} notice={options.notice}>
    <ReloadWhileBuilding active={app.status === "building"} />
    <AppForms base={base} app={app} tab={current} domains={domains} envNames={envNames} clients={options.clients} readOnly={options.readOnly} />
  </AppDetail>;
}

export async function adminActor() {
  return requireHostingAdmin();
}

export function notice(code?: string) {
  return code ? hostingMessage(code) : undefined;
}
