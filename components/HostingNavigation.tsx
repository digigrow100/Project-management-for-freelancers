"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Server, Package, Globe, Building2, Receipt, Settings, Layers, Wallet, MessageCircle, Activity, ListChecks, CreditCard, Archive, Mail, Database, Send, FolderGit2 } from "lucide-react";
import { HOSTING_SECTIONS } from "@/lib/hostingWorkspace";
import { cn } from "@/lib/utils";

const icons = {
  backups: Archive, email: Mail, databases: Database, forms: Send,
  servers: Server,
  packages: Package,
  services: Layers,
  clients: Building2,
  billing: Receipt,
  sources: FolderGit2,
  domains: Globe,
  settings: Settings,
  invoices: Receipt, payments: CreditCard, expenses: Wallet, submissions: ListChecks, tickets: MessageCircle, operations: Server, activity: Activity,
};

export const HOSTING_NAV = [
  { href: "/hosting", label: "Overview", icon: LayoutDashboard },
  ...HOSTING_SECTIONS.map(({ key, label }) => ({
    href: `/hosting/${key}`, label, icon: icons[key],
  })),
];

export function hostingLinkActive(pathname: string, href: string) {
  return pathname === href || (href !== "/hosting" && pathname.startsWith(href + "/"));
}

export function HostingNavigation() {
  const pathname = usePathname();
  return (
    <nav aria-label="Hosting navigation" className="flex min-h-0 flex-1 flex-col gap-1 sidebar-scroll overflow-x-hidden overflow-y-auto">
      {HOSTING_NAV.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} prefetch={false}
          aria-current={hostingLinkActive(pathname, href) ? "page" : undefined}
          className={cn(
            "group flex min-h-10 shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
            hostingLinkActive(pathname, href)
              ? "bg-accent-500/10 text-accent-300"
              : "text-neutral-300 hover:bg-base-800 hover:text-accent-300",
          )}>
          <Icon size={17} className="shrink-0" aria-hidden="true" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
