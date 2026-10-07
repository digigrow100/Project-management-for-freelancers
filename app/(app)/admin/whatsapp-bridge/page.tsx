import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { listClients, listTeamMembers } from "@/lib/store";
import { getWhatsAppBridgeHealth, listWhatsAppClientLinks } from "@/lib/whatsappBridge";
import { listAdminSavedWhatsAppChats } from "@/lib/whatsappBridgeRequests";
import { WhatsAppBridgeManager } from "@/components/WhatsAppBridgeManager";

export const dynamic = "force-dynamic";

export default async function WhatsAppBridgePage() {
  const profile = await getCurrentProfile();
  if (profile?.role !== "admin") notFound();

  const [clients, members, links, health, savedChats] = await Promise.all([
    listClients(),
    listTeamMembers(),
    listWhatsAppClientLinks(),
    getWhatsAppBridgeHealth(),
    listAdminSavedWhatsAppChats(profile.id),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-50">WhatsApp Bridge</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Connect your admin-controlled WhatsApp Web and give selected team members controlled access to selected client chats.
        </p>
      </div>
      <WhatsAppBridgeManager clients={clients} members={members} initialLinks={links} initialHealth={health} initialSavedChats={savedChats} />
    </div>
  );
}
