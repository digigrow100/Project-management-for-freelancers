import { requireHostingClient } from "@/lib/hosting/auth";
import { hostingMessage } from "@/lib/hosting/apps/messages";
import { listApps, recentDeployments } from "@/lib/hosting/apps/store";
import { clientOverview } from "@/lib/hosting/store";
import { money } from "@/lib/hosting/validation";
import type { HostingApp, HostingDeployment } from "@/lib/hosting/apps/types";
import { Overview } from "@/components/hosting/dashboard/present";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ClientHome() {
  const session = await requireHostingClient();
  let apps: HostingApp[] = [];
  let deployments: HostingDeployment[] = [];
  let note = "";
  try {
    apps = await listApps(session.clientId);
    deployments = await recentDeployments(session.clientId);
  } catch (error) { note = hostingMessage(error instanceof Error ? error.message : "storage_unavailable"); }
  let billing = "";
  try {
    const summary = await clientOverview();
    billing = summary.outstanding.length ? summary.outstanding.map((row) => money(row.outstanding_minor, row.currency)).join(", ") : "Nothing due";
  } catch { billing = ""; }
  return <div>{note ? <p className="hms-banner">{note}</p> : null}<Overview base="/client/apps" apps={apps} deployments={deployments} />{billing ? <section className="hms-panel hms-secondary"><h2>Billing</h2><p>{billing}</p><Link href="/client/invoices">View invoices</Link></section> : null}</div>;
}
