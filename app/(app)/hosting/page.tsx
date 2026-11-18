import { requireHostingAdmin } from "@/lib/hosting/auth";
import { agentConfigured, agentDecisions, agentHost } from "@/lib/hosting/agent-client";
import { hostingMessage } from "@/lib/hosting/apps/messages";
import { listApps, recentDeployments, rememberAgent } from "@/lib/hosting/apps/store";
import { adminOverview } from "@/lib/hosting/store";
import { Overview } from "@/components/hosting/dashboard/present";
import type { HostingApp, HostingDeployment } from "@/lib/hosting/apps/types";

function asHost(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const row = value as { cpuPercent?: number | null; memory?: { used?: number; total?: number }; disk?: { used?: number; total?: number }; source?: string };
  if (!row.memory || !row.disk) return null;
  return {
    cpuPercent: typeof row.cpuPercent === "number" ? row.cpuPercent : null,
    memory: { used: Number(row.memory.used ?? 0), total: Number(row.memory.total ?? 0) },
    disk: { used: Number(row.disk.used ?? 0), total: Number(row.disk.total ?? 0) },
    source: row.source === "host" ? "host" : "container",
  };
}

export default async function HostingOverviewPage() {
  const admin = await requireHostingAdmin();
  let apps: HostingApp[] = [];
  let deployments: HostingDeployment[] = [];
  let setup = "";
  try {
    apps = await listApps(null);
    deployments = await recentDeployments(null);
    await rememberAgent(admin.id);
  } catch (error) {
    setup = hostingMessage(error instanceof Error ? error.message : "storage_unavailable");
  }
  let host = null;
  let attacks: { id: string; value: string; scenario: string; duration: string }[] | undefined;
  let agentNote = agentConfigured() ? "" : hostingMessage("agent_not_configured");
  if (agentConfigured()) {
    try {
      host = asHost(await agentHost());
      const security = await agentDecisions() as { available?: boolean; decisions?: { id: string; value: string; scenario: string; duration: string }[] };
      attacks = security.available === false ? undefined : security.decisions ?? [];
    } catch (error) {
      agentNote = hostingMessage(error instanceof Error ? error.message : "agent_unreachable");
    }
  }
  let legacy: { services: number; tickets: number } | undefined;
  try {
    const summary = await adminOverview();
    legacy = { services: summary.counts.services ?? 0, tickets: summary.counts.tickets ?? 0 };
  } catch { legacy = undefined; }
  return <div className="space-y-4">{setup ? <p className="hms-banner">{setup}</p> : null}<Overview base="/hosting/apps" apps={apps} deployments={deployments} host={host} attacks={attacks} agentNote={agentNote} legacy={legacy} /></div>;
}

export const dynamic = "force-dynamic";
