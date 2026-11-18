import { requireHostingAdmin } from "@/lib/hosting/auth";
import { hostingMessage } from "@/lib/hosting/apps/messages";
import { createHostingApp } from "@/lib/hosting/apps/actions";
import { adminLookups } from "@/lib/hosting/store";
import { NewAppWizard } from "@/components/hosting/dashboard/NewAppWizard";

export const dynamic = "force-dynamic";

export default async function NewAppPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireHostingAdmin();
  const query = await searchParams;
  const lookups = await adminLookups();
  return <div>{query.error ? <p className="hms-banner">{hostingMessage(query.error)}</p> : null}<NewAppWizard action={createHostingApp} base="/hosting/apps" clients={lookups.clients.map((client) => ({ id: client.id, name: client.name }))} /></div>;
}
