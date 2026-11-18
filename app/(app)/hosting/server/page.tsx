import { requireHostingAdmin } from "@/lib/hosting/auth";
import { agentConfigured, agentHost } from "@/lib/hosting/agent-client";
import { hostingMessage } from "@/lib/hosting/apps/messages";
import { ServerView } from "@/components/hosting/dashboard/present";

export const dynamic = "force-dynamic";

export default async function ServerPage() {
  await requireHostingAdmin();
  let note = agentConfigured() ? "" : hostingMessage("agent_not_configured");
  let host: { cpuPercent: number | null; memory: { used: number; total: number }; disk: { used: number; total: number }; source: string } | null = null;
  if (agentConfigured()) {
    try {
      const report = await agentHost() as { cpuPercent?: number | null; memory?: { used?: number; total?: number }; disk?: { used?: number; total?: number }; source?: string };
      if (report.memory && report.disk) host = { cpuPercent: report.cpuPercent ?? null, memory: { used: Number(report.memory.used ?? 0), total: Number(report.memory.total ?? 0) }, disk: { used: Number(report.disk.used ?? 0), total: Number(report.disk.total ?? 0) }, source: report.source === "host" ? "host" : "container" };
    } catch (error) { note = hostingMessage(error instanceof Error ? error.message : "agent_unreachable"); }
  }
  return <ServerView host={host} note={note} />;
}
