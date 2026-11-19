import { clientCheckout } from "@/lib/hosting/websites/store";
import { AddWebsiteDialog } from "@/components/hosting/dashboard/AddWebsiteDialog";
import { requireHostingClient } from "@/lib/hosting/auth";
import { hostingMessage } from "@/lib/hosting/apps/messages";
import { listApps, listDomains } from "@/lib/hosting/apps/store";
import type { HostingApp } from "@/lib/hosting/apps/types";
import { AppsList, message } from "@/components/hosting/dashboard/present";
export const dynamic = "force-dynamic";
export default async function ClientAppsPage({ searchParams }: {
    searchParams: Promise<{
        error?: string;
    }>;
}) {
    const session = await requireHostingClient();
    const query = await searchParams;
    const checkout = await clientCheckout(session.clientId);
    let apps: HostingApp[] = [];
    let domains: Record<string, string> = {};
    let note = "";
    try {
        apps = await listApps(session.clientId);
        const rows = await Promise.all(apps.map(async (app) => {
            const found = await listDomains(app.id);
            return [app.id, found.find((domain) => domain.is_primary)?.hostname ?? found[0]?.hostname ?? ""] as const;
        }));
        domains = Object.fromEntries(rows);
    }
    catch (error) {
        note = hostingMessage(error instanceof Error ? error.message : "storage_unavailable");
    }
    return <div>{note || query.error ? <p className="hms-banner">{note || message(query.error)}</p> : null}<AppsList base="/client/apps" apps={apps} domains={domains} action={<AddWebsiteDialog settings={checkout.settings} credits={checkout.credits.length} pending={checkout.requests.some(r => r.status === "pending")} readOnly={session.adminView || session.client.status !== "active"}/>}/></div>;
}
