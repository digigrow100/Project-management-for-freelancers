"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Server, Package, Globe, Building2, Receipt, Settings, Layers, Wallet, MessageCircle, Activity, ListChecks, CreditCard, Archive, Mail, Database, Send, FolderGit2, ChevronDown } from "lucide-react";
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
  { href: "/hosting/registrar", label: "Domains", icon: Globe },
  ...HOSTING_SECTIONS.map(({ key, label }) => ({
    href: `/hosting/${key}`, label, icon: icons[key],
  })),
];

export function hostingLinkActive(pathname: string, href: string) {
  return pathname === href || (href !== "/hosting" && pathname.startsWith(href + "/"));
}

export function HostingNavigation() {
  const pathname = usePathname();
  const groups=[
    {label:'Hosting',icon:Server,keys:['servers','packages','services','clients']},
    {label:'Websites',icon:Globe,keys:['registrar','domains','sources','email','databases','forms','backups']},
    {label:'Billing',icon:Receipt,keys:['billing','invoices','payments','expenses','submissions']},
  ];
  const renderLink=({href,label,icon:Icon}:typeof HOSTING_NAV[number],nested=false)=><Link key={href} href={href} prefetch={false} aria-current={hostingLinkActive(pathname,href)?'page':undefined} className={cn('hms-nav-link',nested&&'hms-nav-child',hostingLinkActive(pathname,href)&&'hms-nav-active')}><Icon size={18} className="shrink-0" aria-hidden="true"/><span>{label}</span></Link>;
  return (
    <nav aria-label="Hosting navigation" className="flex min-h-0 flex-1 flex-col gap-1 sidebar-scroll overflow-x-hidden overflow-y-auto">
      {renderLink(HOSTING_NAV[0]!)}
      {groups.map(({label,icon:Icon,keys})=><details key={label} className="hms-nav-group shrink-0" open={keys.some(key=>hostingLinkActive(pathname,`/hosting/${key}`))}><summary className="hms-nav-link"><Icon size={19} aria-hidden="true"/><span className="flex-1">{label}</span><ChevronDown size={15} className="hms-group-chevron" aria-hidden="true"/></summary><div className="space-y-1 pb-2">{HOSTING_NAV.filter(item=>keys.includes(item.href.slice('/hosting/'.length))).map(item=>renderLink(item,true))}</div></details>)}
      {HOSTING_NAV.filter(item=>['tickets','operations','activity','settings'].includes(item.href.slice('/hosting/'.length))).map(item=>renderLink(item))}
    </nav>
  );
}

