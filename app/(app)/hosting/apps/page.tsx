import { requireHostingAdmin } from "@/lib/hosting/auth";
import { hostingMessage } from "@/lib/hosting/apps/messages";
import { listApps, listDomains } from "@/lib/hosting/apps/store";
import type { HostingApp } from "@/lib/hosting/apps/types";
import { AppsList, message } from "@/components/hosting/dashboard/present";

export const dynamic = "force-dynamic";

export default async function AppsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireHostingAdmin();
  const query = await searchParams;
  let apps: HostingApp[] = [];
  let domains: Record<string, string> = {};
  let note = "";
  try {
    apps = await listApps(null);
    const rows = await Promise.all(apps.map(async (app) => {
      const found = await listDomains(app.id);
      return [app.id, found.find((domain) => domain.is_primary)?.hostname ?? found[0]?.hostname ?? ""] as const;
    }));
    domains = Object.fromEntries(rows);
  } catch (error) { note = hostingMessage(error instanceof Error ? error.message : "storage_unavailable"); }
  return <div>{note ? <p className="hms-banner">{note}</p> : null}{query.error ? <p className="hms-banner">{message(query.error)}</p> : null}<AppsList base="/hosting/apps" apps={apps} domains={domains} /></div>;
}
