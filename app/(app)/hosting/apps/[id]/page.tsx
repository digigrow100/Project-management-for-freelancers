import { adminLookups } from "@/lib/hosting/store";
import { hostingMessage } from "@/lib/hosting/apps/messages";
import { renderApp } from "@/lib/hosting/apps/screen";
export const dynamic = "force-dynamic";
export default async function AppPage({ params, searchParams }: {
    params: Promise<{
        id: string;
    }>;
    searchParams: Promise<{
        tab?: string;
        error?: string;
    }>;
}) {
    const [{ id }, query] = await Promise.all([params, searchParams]);
    const lookups = await adminLookups();
    return renderApp("/hosting/apps", id, query.tab ?? "overview", {
        clientId: null,
        readOnly: false,
        clients: lookups.clients.map((client) => ({ id: client.id, name: client.name })),
        notice: query.error ? hostingMessage(query.error) : undefined,
    });
}

export const maxDuration = 60;
