"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Server, Globe, CreditCard, CircleHelp, UserRound, Archive, Mail, Database, Send } from "lucide-react";
import type { ClientReleaseFeature } from '@/lib/hosting/clientRelease';
const items = [
 {href:"/client",label:"Overview",icon:Home},
 {href:"/client/services",label:"Hosting",icon:Server},
 {href:"/client/email",label:"Email",icon:Mail},
 {href:"/client/databases",label:"Databases",icon:Database},
 {href:"/client/forms",label:"Form API",icon:Send},
 {href:"/client/backups",label:"Backups",icon:Archive},
 {href:"/client/domains",label:"Domains",icon:Globe},
 {href:"/client/invoices",label:"Billing",icon:CreditCard},
 {href:"/client/tickets",label:"Help",icon:CircleHelp},
 {href:"/client/account",label:"Account",icon:UserRound},
];
export function ClientNavigation({features=[]}:{features?:ClientReleaseFeature[]}) {
 const path=usePathname();
 return <nav aria-label="Client navigation" className="client-navigation">{items.filter(item=>{
 const feature=item.href.slice('/client/'.length);
 return !['email','databases','forms','backups'].includes(feature)||features.includes(feature as ClientReleaseFeature);
 }).map(({href,label,icon:Icon})=>{
 const active=href==="/client"?path===href:path.startsWith(href)||(href==="/client/invoices"&&path.startsWith("/client/payments"));
 return <Link key={href} href={href} aria-current={active?"page":undefined}><Icon size={19} strokeWidth={1.6} aria-hidden="true"/><span>{label}</span></Link>;
 })}</nav>;
}

