"use client";

import {useState,type ReactNode} from 'react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {House,Leaf,Search} from 'lucide-react';
import {useWorkspace} from '@/components/WorkspaceProvider';
import {HOSTING_SECTIONS} from '@/lib/hostingWorkspace';

export function WorkspaceFrame({theme,children}:{theme:string;children:ReactNode}){
 const hosting=useWorkspace().workspace==='hosting';
 return <div data-theme={hosting?'dark':theme} data-workspace={hosting?'hosting':'team'} className={`app-theme flex min-h-screen md:h-screen md:overflow-hidden${hosting?' hosting-shell':''}`}>{children}</div>;
}

export function WorkspaceBrand(){
 const hosting=useWorkspace().workspace==='hosting';
 return <><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${hosting?'text-white':'bg-accent-500/15 text-accent-400'}`}>{hosting?<House size={28} strokeWidth={2.6}/>:<Leaf size={18}/>}</span><span className={hosting?'whitespace-nowrap text-lg font-bold tracking-tight text-white':'text-sm font-semibold tracking-wide text-neutral-100'}>{hosting?'House My Site':'Freelance HQ'}</span></>;
}

export function HostingTopBar({name}:{name:string}){
 const pathname=usePathname();
 const current=pathname==='/hosting/registrar'?{key:'registrar',label:'Domains'}:HOSTING_SECTIONS.find(s=>pathname===`/hosting/${s.key}`||pathname.startsWith(`/hosting/${s.key}/`));
 const [query,setQuery]=useState('');
 const pages=[{key:'',label:'Overview'},{key:'registrar',label:'Domains'},...HOSTING_SECTIONS];
 const matches=query.trim()?pages.filter(p=>p.label.toLowerCase().includes(query.trim().toLowerCase())).slice(0,8):[];
 const initials=name.trim().split(/\s+/).slice(0,2).map(p=>p[0]).join('').toUpperCase()||'HM';
 return <header className="hms-topbar hidden md:flex"><nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm"><Link href="/hosting" className="text-slate-500 hover:text-blue-600">Hosting</Link>{current?<><span className="text-slate-300" aria-hidden="true">/</span><span className="font-medium text-slate-700">{current.label}</span></>:null}</nav><div className="flex items-center gap-6"><div className="relative" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setQuery('');}}><label className="hms-search"><Search size={17} aria-hidden="true"/><input type="search" placeholder="Find a hosting page…" aria-label="Find a hosting page" value={query} maxLength={100} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Escape')setQuery('');}}/></label>{query.trim()?<div className="hms-search-results"><p className="px-3 py-2 text-xs text-slate-500">Pages</p>{matches.length?matches.map(p=><Link prefetch={false} key={p.key} href={p.key?`/hosting/${p.key}`:'/hosting'} onClick={()=>setQuery('')} className="block rounded-lg px-3 py-2 text-sm hover:bg-blue-50">{p.label}</Link>):<p className="px-3 py-2 text-sm text-slate-500">No matching page.</p>}</div>:null}</div><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-blue-600 text-xs font-semibold text-white">{initials}</span><span className="max-w-40 truncate text-sm font-semibold text-slate-800">{name}</span></div></div></header>;
}
