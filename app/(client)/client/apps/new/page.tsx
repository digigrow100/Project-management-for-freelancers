import { requireHostingClient } from "@/lib/hosting/auth";
import { hostingMessage } from "@/lib/hosting/apps/messages";
import { createHostingApp } from "@/lib/hosting/apps/actions";
import { NewAppWizard } from "@/components/hosting/dashboard/NewAppWizard";

export const dynamic = "force-dynamic";

export default async function ClientNewAppPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await requireHostingClient();
  const query = await searchParams;
  if (session.adminView) return <p className="hms-banner">{hostingMessage("read_only")}</p>;
  return <div>{query.error ? <p className="hms-banner">{hostingMessage(query.error)}</p> : null}<NewAppWizard action={createHostingApp} base="/client/apps" /></div>;
}
