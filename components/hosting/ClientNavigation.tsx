"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Server, Globe, CreditCard, CircleHelp, UserRound, Archive, Mail, Database, Send, FolderGit2 } from "lucide-react";
import type { ClientReleaseFeature } from "@/lib/hosting/clientRelease";

const product = [
  { href: "/client", label: "Overview", icon: Home },
  { href: "/client/apps", label: "Apps", icon: Server },
  { href: "/client/products/email", label: "Email Server", icon: Mail },
  { href: "/client/products/databases", label: "Databases", icon: Database },
  { href: "/client/products/wordpress", label: "WordPress", icon: Globe },
];
const account = [
  { href: "/client/services", label: "Hosting", icon: Server },
  { href: "/client/plans", label: "Plans & limits", icon: Server },
  { href: "/client/domains", label: "Domains", icon: Globe },
  { href: "/client/invoices", label: "Billing", icon: CreditCard },
  { href: "/client/tickets", label: "Help", icon: CircleHelp },
  { href: "/client/account", label: "Account", icon: UserRound },
];
const gated = [
  { href: "/client/email", label: "Mailboxes", icon: Mail, feature: "email" },
  { href: "/client/databases", label: "Managed databases", icon: Database, feature: "databases" },
  { href: "/client/forms", label: "Form API", icon: Send, feature: "forms" },
  { href: "/client/backups", label: "Backups", icon: Archive, feature: "backups" },
  { href: "/client/sources", label: "Website files", icon: FolderGit2, feature: "sources" },
];

export function ClientNavigation({ features = [] }: { features?: ClientReleaseFeature[] }) {
  const path = usePathname();
  const items = [...product, ...account, ...gated.filter((item) => features.includes(item.feature as ClientReleaseFeature))];
  return <nav aria-label="Client navigation" className="client-navigation">{items.map(({ href, label, icon: Icon }) => {
    const active = href === "/client" ? path === href : path === href || path.startsWith(`${href}/`) || (href === "/client/invoices" && path.startsWith("/client/payments"));
    return <Link key={href} href={href} aria-current={active ? "page" : undefined}><Icon size={19} strokeWidth={1.6} aria-hidden="true" /><span>{label}</span></Link>;
  })}</nav>;
}
