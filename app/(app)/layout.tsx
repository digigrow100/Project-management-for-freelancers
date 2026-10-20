import { AdminScreenSharePopup } from "@/components/AdminScreenSharePopup";
import { Sidebar } from "@/components/Sidebar";
import { MobileNav } from "@/components/MobileNav";
import { MobileTopBar } from "@/components/MobileTopBar";
import { WhatsAppChatWidget } from "@/components/WhatsAppChatWidget";
import { AdminWorkflowLauncher } from "@/components/AdminWorkflowLauncher";
import { PresenceHeartbeat } from "@/components/PresenceHeartbeat";
import { ExtensionHealthBanner } from "@/components/ExtensionHealthBanner";
import { UserRound } from "lucide-react";
import { stopMemberViewAction } from "@/lib/memberViewActions";
import { getAuthenticatedProfile, getCurrentProfile } from "@/lib/auth";
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

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  const actor = await getAuthenticatedProfile();
  const memberView = actor?.role === "admin" && profile?.role === "member" && actor.id !== profile.id;
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
    <div
      data-theme={profile?.themePreference ?? "dark"}
      className="app-theme flex min-h-screen md:h-screen md:overflow-hidden"
    >
      <Sidebar
        profile={profile}
        unseenProjects={unseenProjects}
        unseenNotes={unseenNotes}
        unseenTasks={unseenTasks}
      />
      <div className="flex-1 md:h-screen md:overflow-y-auto">
        <MobileTopBar />
        <main className="theme-main min-h-full pb-24 md:pb-0">
          <div className="mx-auto max-w-6xl px-4 py-5 md:px-8 md:py-8">
            {memberView && <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
              <div><p className="text-sm font-semibold text-amber-300">Admin viewing as {profile?.name || profile?.email}</p><p className="text-xs text-neutral-400">Actions change this member’s real work. This view lasts up to one hour.</p></div>
              <form action={stopMemberViewAction}><button className="rounded-lg bg-amber-400 px-3 py-2 text-xs font-semibold text-base-950">Return to admin</button></form>
            </div>}
            {profile?.role === "member" && (
              <div className="mb-4 flex items-center gap-3 rounded-xl border border-base-700/60 bg-base-850 px-3 py-2.5 shadow-card">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-500/10 text-accent-300">
                  <UserRound size={16} />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-600">Logged in as</p>
                  <p className="truncate text-sm font-semibold text-neutral-100">
                    {profile.name || profile.email}
                  </p>
                  <p className="truncate text-[10px] text-neutral-600">{profile.email}</p>
                </div>
              </div>
            )}
            <WorkspaceOnly name="team">{profile && <ExtensionHealthBanner />}</WorkspaceOnly>
            {children}
          </div>
        </main>
      </div>
      <WorkspaceOnly name="team">{isAdmin && !memberView && <AdminScreenSharePopup />}</WorkspaceOnly>
      <MobileNav profile={profile} unseenProjects={unseenProjects} unseenNotes={unseenNotes} unseenTasks={unseenTasks} />
      <WorkspaceOnly name="team">{isAdmin && profile && adminWorkflowSettings && (
        <AdminWorkflowLauncher
          initialItems={adminWorkItems}
          initialSettings={adminWorkflowSettings}
          projects={projects}
        />
      )}</WorkspaceOnly>
      {profile && !memberView && <PresenceHeartbeat />}
      <WorkspaceOnly name="team">{profile && <WhatsAppChatWidget initialClients={whatsappClients} isAdmin={isAdmin} />}</WorkspaceOnly>
    </div>
    </WorkspaceProvider>
  );
}
