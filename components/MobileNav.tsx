"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ListChecks, ListTodo, FolderKanban, Archive, Settings, Plus, Shield, Wallet, Building2, Globe, FileText, MoreHorizontal, X, Receipt, Package } from "lucide-react";
import type { Profile } from "@/lib/types";
import { InstallAppButton } from "./InstallAppButton";
import { NotificationBadge } from "./NotificationBadge";
import { cn } from "@/lib/utils";

const PRIMARY_NAV = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/today", label: "Today", icon: ListChecks },
  { href: "/projects", label: "Projects", icon: FolderKanban },
];

const COMMON_MORE_NAV = [
  { href: "/my-tasks", label: "My Tasks", icon: ListTodo },
  { href: "/projects/closed", label: "Closed Projects", icon: Archive },
  { href: "/notes", label: "Notes", icon: FileText },
];

const MORE_NAV = [
  { href: "/projects/new", label: "New Project", icon: Plus },
  { href: "/clients", label: "Clients", icon: Building2 },
  { href: "/finance", label: "Finance", icon: Wallet },
  { href: "/invoices", label: "Invoices", icon: Receipt },
  { href: "/services", label: "Services", icon: Package },
  { href: "/domains", label: "Domains", icon: Globe },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/admin", label: "Admin", icon: Shield },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

export function MobileNav({
  profile,
  unseenProjects = 0,
  unseenNotes = 0,
  unseenTasks = 0,
}: {
  profile: Profile | null;
  unseenProjects?: number;
  unseenNotes?: number;
  unseenTasks?: number;
}) {
  const pathname = usePathname();
  const isAdmin = profile?.role === "admin";
  const canAccessRenewals = isAdmin || Boolean(profile?.canAccessRenewals);
  const canAccessFinance = isAdmin || Boolean(profile?.canAccessFinance);
  const [moreOpen, setMoreOpen] = useState(false);
  const badgeByHref: Record<string, number> = {
    "/projects": unseenProjects,
    "/notes": unseenNotes,
    "/my-tasks": unseenTasks,
  };

  const financeItem = isAdmin ? MORE_NAV.find((item) => item.href === "/finance") : undefined;
  const domainsItem = MORE_NAV.find((item) => item.href === "/domains");
  const invoicesItem = MORE_NAV.find((item) => item.href === "/invoices");
  const extraItems = isAdmin
    ? MORE_NAV.filter((item) => item.href !== "/finance")
    : [
        ...(canAccessRenewals && domainsItem ? [domainsItem] : []),
        ...(canAccessFinance && invoicesItem ? [invoicesItem] : []),
      ];
  const sheetItems = [...COMMON_MORE_NAV, ...extraItems];

  return (
    <>
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-30 bg-black/50" onClick={() => setMoreOpen(false)}>
          <div
            className="absolute bottom-0 left-0 right-0 rounded-t-2xl border-t border-base-700/60 bg-base-900 p-4 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-neutral-200">More</p>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-400 hover:bg-base-800 hover:text-neutral-200"
              >
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {sheetItems.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    "relative flex flex-col items-center gap-2 rounded-xl border border-base-700/60 bg-base-850 px-2 py-4 text-xs",
                    isActive(pathname, href) ? "text-accent-300" : "text-neutral-300",
                  )}
                >
                  <span className="relative">
                    <Icon size={22} />
                    {(badgeByHref[href] ?? 0) > 0 && (
                      <span className="absolute -right-1.5 -top-1.5">
                        <NotificationBadge count={badgeByHref[href] ?? 0} />
                      </span>
                    )}
                  </span>
                  {label}
                </Link>
              ))}
              <InstallAppButton variant="sheet" />
            </div>
          </div>
        </div>
      )}

      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-20 flex items-stretch justify-around border-t border-base-700/60 bg-base-900/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        {PRIMARY_NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex min-w-[64px] flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                active ? "text-accent-400" : "text-neutral-400",
              )}
            >
              <span className="relative">
                <Icon size={22} />
                {(badgeByHref[href] ?? 0) > 0 && (
                  <span className="absolute -right-1.5 -top-1.5">
                    <NotificationBadge count={badgeByHref[href] ?? 0} />
                  </span>
                )}
              </span>
              {label}
            </Link>
          );
        })}
        {financeItem && (
          <Link
            href={financeItem.href}
            className={cn(
              "flex min-w-[64px] flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
              isActive(pathname, financeItem.href) ? "text-accent-400" : "text-neutral-400",
            )}
          >
            <financeItem.icon size={22} />
            {financeItem.label}
          </Link>
        )}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className="flex min-w-[64px] flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium text-neutral-400"
        >
          <MoreHorizontal size={22} />
          More
        </button>
      </nav>
    </>
  );
}
