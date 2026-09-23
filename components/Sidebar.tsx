import Link from "next/link";
import { LayoutDashboard, ListChecks, ListTodo, FolderKanban, Archive, Settings, Plus, Leaf, LogOut, Shield, Wallet, Building2, Globe, FileText, Receipt, Package } from "lucide-react";
import type { Profile, Project } from "@/lib/types";
import { SidebarProjectGroups } from "./SidebarProjectGroups";
import { InstallAppButton } from "./InstallAppButton";
import { NotificationBadge } from "./NotificationBadge";
import { RefreshButton } from "./RefreshButton";
import { logoutAction } from "@/app/login/actions";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/today", label: "Today", icon: ListChecks },
  { href: "/my-tasks", label: "My Tasks", icon: ListTodo },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/projects/closed", label: "Closed Projects", icon: Archive },
  { href: "/notes", label: "Notes", icon: FileText },
];

export function Sidebar({
  projects,
  profile,
  unseenProjects = 0,
  unseenNotes = 0,
  unseenTasks = 0,
}: {
  projects: Project[];
  profile: Profile | null;
  unseenProjects?: number;
  unseenNotes?: number;
  unseenTasks?: number;
}) {
  const isAdmin = profile?.role === "admin";
  const canAccessRenewals = isAdmin || Boolean(profile?.canAccessRenewals);
  const canAccessFinance = isAdmin || Boolean(profile?.canAccessFinance);
  const badgeByHref: Record<string, number> = {
    "/projects": unseenProjects,
    "/notes": unseenNotes,
    "/my-tasks": unseenTasks,
  };
  return (
    <aside className="hidden md:flex md:h-screen md:w-64 md:flex-col border-r border-base-700/60 bg-base-900/60 backdrop-blur-sm px-4 py-6 gap-6">
      <div className="flex items-center gap-2 px-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-500/15 text-accent-400">
          <Leaf size={18} />
        </span>
        <span className="text-sm font-semibold tracking-wide text-neutral-100">
          Freelance HQ
        </span>
        <RefreshButton className="ml-auto" />
      </div>

      <nav className="flex flex-col gap-1">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-neutral-300 hover:bg-base-800 hover:text-accent-300 transition-colors"
          >
            <Icon size={17} className="text-neutral-500 group-hover:text-accent-400" />
            <span className="flex-1">{label}</span>
            <NotificationBadge count={badgeByHref[href] ?? 0} />
          </Link>
        ))}
        {canAccessRenewals && (
          <Link
            href="/domains"
            className="group flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-neutral-300 hover:bg-base-800 hover:text-accent-300 transition-colors"
          >
            <Globe size={17} className="text-neutral-500 group-hover:text-accent-400" />
            Domains
          </Link>
        )}
        {canAccessFinance && (
          <Link
            href="/invoices"
            className="group flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-neutral-300 hover:bg-base-800 hover:text-accent-300 transition-colors"
          >
            <Receipt size={17} className="text-neutral-500 group-hover:text-accent-400" />
            Invoices
          </Link>
        )}
        {isAdmin && (
          <>
            <Link
              href="/clients"
              className="group flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-neutral-300 hover:bg-base-800 hover:text-accent-300 transition-colors"
            >
              <Building2 size={17} className="text-neutral-500 group-hover:text-accent-400" />
              Clients
            </Link>
            <Link
              href="/finance"
              className="group flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-neutral-300 hover:bg-base-800 hover:text-accent-300 transition-colors"
            >
              <Wallet size={17} className="text-neutral-500 group-hover:text-accent-400" />
              Finance
            </Link>
            <Link
              href="/services"
              className="group flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-neutral-300 hover:bg-base-800 hover:text-accent-300 transition-colors"
            >
              <Package size={17} className="text-neutral-500 group-hover:text-accent-400" />
              Services
            </Link>
            <Link
              href="/settings"
              className="group flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-neutral-300 hover:bg-base-800 hover:text-accent-300 transition-colors"
            >
              <Settings size={17} className="text-neutral-500 group-hover:text-accent-400" />
              Settings
            </Link>
            <Link
              href="/admin"
              className="group flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-neutral-300 hover:bg-base-800 hover:text-accent-300 transition-colors"
            >
              <Shield size={17} className="text-neutral-500 group-hover:text-accent-400" />
              Admin
            </Link>
          </>
        )}
      </nav>

      {isAdmin && (
        <Link
          href="/projects/new"
          className="flex items-center justify-center gap-2 rounded-lg bg-accent-500 px-3 py-2 text-sm font-medium text-base-950 hover:bg-accent-400 transition-colors shadow-glow"
        >
          <Plus size={16} />
          New Project
        </Link>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
          Your Projects
        </p>
        <SidebarProjectGroups projects={projects} />
      </div>

      <div className="flex flex-col gap-3">
        <InstallAppButton />
        <form action={logoutAction}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-neutral-400 hover:bg-base-800 hover:text-rose-400 transition-colors"
          >
            <LogOut size={17} />
            Log out
          </button>
        </form>
      </div>
    </aside>
  );
}
