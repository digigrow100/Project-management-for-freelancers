import { requireHostingAdmin } from "@/lib/hosting/auth";
import { agentAlerts, agentConfigured, agentDecisions } from "@/lib/hosting/agent-client";
import { hostingMessage } from "@/lib/hosting/apps/messages";
import { unbanHostingAddress } from "@/lib/hosting/apps/actions";
import { SecurityView } from "@/components/hosting/dashboard/present";

export const dynamic = "force-dynamic";

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  await requireHostingAdmin();
  const query = await searchParams;
  let note = query.error ? hostingMessage(query.error) : agentConfigured() ? "" : hostingMessage("agent_not_configured");
  let decisions: { id: string; value: string; type: string; scenario: string; duration: string }[] = [];
  let alerts: { id: string; scenario: string; message: string }[] = [];
  if (agentConfigured()) {
    try {
      const decisionBody = await agentDecisions() as { available?: boolean; reason?: string; decisions?: typeof decisions };
      const alertBody = await agentAlerts() as { available?: boolean; alerts?: typeof alerts };
      if (decisionBody.available === false) note = decisionBody.reason === "lapi_not_configured" ? "CrowdSec is not configured on the agent yet." : "CrowdSec could not be read.";
      decisions = decisionBody.decisions ?? [];
      alerts = alertBody.alerts ?? [];
    } catch (error) { note = hostingMessage(error instanceof Error ? error.message : "agent_unreachable"); }
  }
  return <div><SecurityView decisions={decisions} alerts={alerts} note={note} />{decisions.length ? <div className="hms-form-stack">{decisions.map((item) => <form key={item.id} action={unbanHostingAddress}><input type="hidden" name="decision" value={item.id} /><button className="hms-dash-secondary" type="submit">Unban {item.value}</button></form>)}</div> : null}{query.saved ? <p className="hms-banner">The decision was removed.</p> : null}</div>;
}
