import { getCurrentProfile } from "@/lib/auth";
import { listAccessibleWhatsAppClients } from "@/lib/whatsappBridge";
import { ClientChatPanel } from "@/components/ClientChatPanel";

export const dynamic = "force-dynamic";

export default async function ClientChatPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;
  const clients = await listAccessibleWhatsAppClients(profile);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-50">Client Chat</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Talk to approved clients through the company WhatsApp bridge without sharing the WhatsApp account.
        </p>
      </div>
      <ClientChatPanel initialClients={clients} />
    </div>
  );
}
