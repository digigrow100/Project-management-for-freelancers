"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Server, Package, Globe, Building2, Receipt, Settings, Layers, Wallet, MessageCircle, Activity, ListChecks, CreditCard, Archive, Mail, Database, Send, FolderGit2, ChevronDown, Shield } from "lucide-react";
import { HOSTING_SECTIONS } from "@/lib/hostingWorkspace";
import { cn } from "@/lib/utils";

const icons = {
  backups: Archive, email: Mail, databases: Database, forms: Send,
  servers: Server, packages: Package, services: Layers, clients: Building2,
  billing: Receipt, sources: FolderGit2, domains: Globe, settings: Settings,
  invoices: Receipt, payments: CreditCard, expenses: Wallet, submissions: ListChecks,
  tickets: MessageCircle, operations: Server, activity: Activity,
};

const primary = [
  { href: "/hosting", label: "Overview", icon: LayoutDashboard },
  { href: "/hosting/apps", label: "Apps & Websites", icon: Layers },
  { href: "/hosting/products/email", label: "Email Server", icon: Mail },
  { href: "/hosting/products/databases", label: "Databases", icon: Database },
  { href: "/hosting/products/wordpress", label: "WordPress", icon: Globe },
  { href: "/hosting/security", label: "Security", icon: Shield },
  { href: "/hosting/server", label: "Server", icon: Server },
];

export const HOSTING_NAV = [
  ...primary,
  { href: "/hosting/registrar", label: "Registrar", icon: Globe },
  ...HOSTING_SECTIONS.map(({ key, label }) => ({ href: `/hosting/${key}`, label, icon: icons[key] })),
];

export function hostingLinkActive(pathname: string, href: string) {
  return pathname === href || (href !== "/hosting" && pathname.startsWith(href + "/"));
}

export function HostingNavigation() {
  const pathname = usePathname();
  const manage = ["/hosting/registrar", "/hosting/servers", "/hosting/packages", "/hosting/services", "/hosting/clients", "/hosting/domains", "/hosting/sources", "/hosting/email", "/hosting/databases", "/hosting/forms", "/hosting/backups", "/hosting/operations"];
  const billing = ["/hosting/billing", "/hosting/invoices", "/hosting/payments", "/hosting/expenses", "/hosting/submissions"];
  const renderLink = (item: typeof HOSTING_NAV[number], nested = false) => <Link key={item.href} href={item.href} prefetch={false} aria-current={hostingLinkActive(pathname, item.href) ? "page" : undefined} className={cn("hms-nav-link", nested && "hms-nav-child", hostingLinkActive(pathname, item.href) && "hms-nav-active")}><item.icon size={18} className="shrink-0" aria-hidden="true" /><span>{item.label}</span></Link>;
  const group = (label: string, hrefs: string[], Icon: typeof Server) => <details key={label} className="hms-nav-group shrink-0" open={hrefs.some((href) => hostingLinkActive(pathname, href))}><summary className="hms-nav-link"><Icon size={19} aria-hidden="true" /><span className="flex-1">{label}</span><ChevronDown size={15} className="hms-group-chevron" aria-hidden="true" /></summary><div className="space-y-1 pb-2">{HOSTING_NAV.filter((item) => hrefs.includes(item.href)).map((item) => renderLink(item, true))}</div></details>;
  return <nav aria-label="Hosting navigation" className="flex min-h-0 flex-1 flex-col gap-1 sidebar-scroll overflow-x-hidden overflow-y-auto">
    {primary.map((item) => renderLink(item))}
    {group("Records", manage, Server)}
    {group("Billing", billing, Receipt)}
    {HOSTING_NAV.filter((item) => ["/hosting/tickets", "/hosting/activity", "/hosting/settings"].includes(item.href)).map((item) => renderLink(item))}
  </nav>;
}
