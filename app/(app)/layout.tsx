import { redirect } from "next/navigation";
import { AdminScreenSharePopup } from "@/components/AdminScreenSharePopup";
import { Sidebar } from "@/components/Sidebar";
import { MobileNav } from "@/components/MobileNav";
import { MobileTopBar } from "@/components/MobileTopBar";
import { WhatsAppChatWidget } from "@/components/WhatsAppChatWidget";
import { AdminWorkflowLauncher } from "@/components/AdminWorkflowLauncher";
import { PresenceHeartbeat } from "@/components/PresenceHeartbeat";
import { ExtensionHealthBanner } from "@/components/ExtensionHealthBanner";
import { getCurrentProfile } from "@/lib/auth";
import {
  countUnseenNotes,
  countUnseenProjects,
  countUnseenTasks,
  ensureDomainExpiryAdminWorkItems,
  ensureMonthlyInvoiceAdminWorkItems,
  getAdminWorkflowSettings,
  getProjectsForProfile,
  listAdminWorkItems,
  listClients,
  listDomainClients,
  listDomains,
  listRenewals,
} from "@/lib/store";
import { listAccessibleWhatsAppClients } from "@/lib/whatsappBridge";
import { WorkspaceProvider, WorkspaceOnly } from "@/components/WorkspaceProvider";
import {WorkspaceFrame,HostingTopBar} from "@/components/hosting/WorkspaceChrome";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/seo-bots/login");
  const isAdmin = profile?.role === "admin";
  const canSeeClients = isAdmin || !!profile?.canAccessFinance;

  const [
    projects,
    unseenProjects,
    unseenNotes,
    unseenTasks,
    domains,
    domainClients,
    renewals,
    clients,
    adminWorkflowSettings,
    whatsappClients,
  ] = await Promise.all([
    profile ? getProjectsForProfile(profile) : Promise.resolve([]),
    profile ? countUnseenProjects(profile.id, isAdmin) : Promise.resolve(0),
    profile ? countUnseenNotes(profile.id) : Promise.resolve(0),
    profile ? countUnseenTasks(profile.id) : Promise.resolve(0),
    isAdmin ? listDomains() : Promise.resolve([]),
    isAdmin ? listDomainClients() : Promise.resolve([]),
    isAdmin ? listRenewals() : Promise.resolve([]),
    canSeeClients ? listClients() : Promise.resolve([]),
    isAdmin && profile ? getAdminWorkflowSettings(profile.id) : Promise.resolve(null),
    profile ? listAccessibleWhatsAppClients(profile) : Promise.resolve([]),
  ]);

  if (isAdmin && profile) {
    await Promise.all([
      ensureDomainExpiryAdminWorkItems(profile.id, domains, domainClients, renewals),
      ensureMonthlyInvoiceAdminWorkItems(profile.id, clients),
    ]);
  }

  const adminWorkItems =
    isAdmin && profile ? await listAdminWorkItems(profile.id) : [];

  return (
    <WorkspaceProvider canAccessHosting={isAdmin}>
    <WorkspaceFrame theme={profile?.themePreference ?? "dark"}>
      <Sidebar
        profile={profile}
        unseenProjects={unseenProjects}
        unseenNotes={unseenNotes}
        unseenTasks={unseenTasks}
      />
      <div className="flex-1 md:h-screen md:overflow-y-auto">
        <MobileTopBar />
        <WorkspaceOnly name="hosting"><HostingTopBar name={profile?.name||profile?.email||'Owner'}/></WorkspaceOnly>
        <main className="theme-main min-h-full pb-24 md:pb-0">
          <div className="mx-auto max-w-6xl px-4 py-5 md:px-8 md:py-8">
            <WorkspaceOnly name="team">{profile && <ExtensionHealthBanner />}</WorkspaceOnly>
            {children}
          </div>
        </main>
      </div>
      <WorkspaceOnly name="team">{isAdmin && <AdminScreenSharePopup />}</WorkspaceOnly>
      <MobileNav profile={profile} unseenProjects={unseenProjects} unseenNotes={unseenNotes} unseenTasks={unseenTasks} />
      <WorkspaceOnly name="team">{isAdmin && profile && adminWorkflowSettings && (
        <AdminWorkflowLauncher
          initialItems={adminWorkItems}
          initialSettings={adminWorkflowSettings}
          projects={projects}
        />
      )}</WorkspaceOnly>
      {profile && <PresenceHeartbeat />}
      <WorkspaceOnly name="team">{profile && <WhatsAppChatWidget initialClients={whatsappClients} isAdmin={isAdmin} />}</WorkspaceOnly>
    </WorkspaceFrame>
    </WorkspaceProvider>
  );
}

