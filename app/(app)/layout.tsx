import { Sidebar } from "@/components/Sidebar";
import { MobileNav } from "@/components/MobileNav";
import { MobileTopBar } from "@/components/MobileTopBar";
import { AiAssistant } from "@/components/AiAssistant";
import { AdminWorkflowLauncher } from "@/components/AdminWorkflowLauncher";
import { PresenceHeartbeat } from "@/components/PresenceHeartbeat";
import { ExtensionHealthBanner } from "@/components/ExtensionHealthBanner";
import { UserRound } from "lucide-react";
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

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
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
            {profile?.role === "member" && <ExtensionHealthBanner />}
            {children}
          </div>
        </main>
      </div>
      <MobileNav profile={profile} unseenProjects={unseenProjects} unseenNotes={unseenNotes} unseenTasks={unseenTasks} />
      {isAdmin && profile && adminWorkflowSettings && (
        <AdminWorkflowLauncher
          initialItems={adminWorkItems}
          initialSettings={adminWorkflowSettings}
          projects={projects}
        />
      )}
      {profile && <PresenceHeartbeat />}
      {profile && <AiAssistant projects={projects} clients={clients} hasTicker={false} />}
    </div>
  );
}
