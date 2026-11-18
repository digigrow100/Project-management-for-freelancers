import { requireHostingClient } from "@/lib/hosting/auth";
import { hostingMessage } from "@/lib/hosting/apps/messages";
import { renderApp } from "@/lib/hosting/apps/screen";

export const dynamic = "force-dynamic";

export default async function ClientAppPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; error?: string }> }) {
  const session = await requireHostingClient();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return renderApp("/client/apps", id, query.tab ?? "overview", {
    clientId: session.clientId,
    readOnly: session.adminView,
    notice: query.error ? hostingMessage(query.error) : undefined,
  });
}
