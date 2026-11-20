'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {Home,Globe,CreditCard,CircleHelp,UserRound,Server,Archive,Mail,Database,Send,FolderGit2} from 'lucide-react';
import type {ClientReleaseFeature} from '@/lib/hosting/clientRelease';
const primary=[{href:'/client',label:'Overview',icon:Home},{href:'/client/apps',label:'Websites',icon:Globe},{href:'/client/deployments',label:'Deployments',icon:FolderGit2},{href:'/client/website-domains',label:'Domains',icon:Globe},{href:'/client/website-billing',label:'Website billing',icon:CreditCard}];
const existing=[{href:'/client/services',label:'Hosting services',icon:Server},{href:'/client/plans',label:'Plans & limits',icon:Server},{href:'/client/domains',label:'Service domains',icon:Globe},{href:'/client/invoices',label:'Invoices & payments',icon:CreditCard},{href:'/client/email',label:'Email',icon:Mail},{href:'/client/databases',label:'Databases',icon:Database},{href:'/client/forms',label:'Form API',icon:Send},{href:'/client/backups',label:'Backups',icon:Archive},{href:'/client/sources',label:'Website files',icon:FolderGit2}];
export function ClientNavigation({features=[]}:{features?:ClientReleaseFeature[]}){
 const path=usePathname(),items=existing.filter(i=>{const f=i.href.slice(8);return !['email','databases','forms','backups','sources'].includes(f)||features.includes(f as ClientReleaseFeature);});
 function item({href,label,icon:Icon}:typeof primary[number]){const active=href==='/client'?path===href:path===href||path.startsWith(href+'/');return <Link key={href} href={href} aria-current={active?'page':undefined}><Icon size={17} strokeWidth={1.6} aria-hidden="true"/><span>{label}</span></Link>;}
 return <nav aria-label="Client navigation" className="client-navigation">{primary.map(item)}<details className="website-existing-links" open={items.some(i=>path===i.href||path.startsWith(i.href+'/'))}><summary>Existing services</summary>{items.map(item)}</details>{[{href:'/client/tickets',label:'Help',icon:CircleHelp},{href:'/client/account',label:'Account',icon:UserRound}].map(item)}</nav>;
}
