import Link from "next/link";
import { randomUUID } from "node:crypto";
import { hostingAdminAction, hostingClientAction } from "@/lib/hosting/actions";
import { SubmitButton } from "./SubmitButton";
export const inputClass="w-full rounded-lg border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100 focus:border-accent-400 focus:outline-none";
export const cardClass="rounded-xl border border-base-700/60 bg-base-850 p-5";
export function Field({label,name,value,type="text",required=false,min,step,placeholder}:{label:string;name:string;value?:string|number|null;type?:string;required?:boolean;min?:number;step?:string;placeholder?:string}) {
 return <label className="flex flex-col gap-1 text-xs text-neutral-400">{label}<input className={inputClass} name={name} type={type} defaultValue={value??''} required={required} min={min} step={step} placeholder={placeholder}/></label>;
}
export function Select({label,name,value,options,optional=false}:{label:string;name:string;value?:string|null;options:{value:string;label:string}[];optional?:boolean}) {
 return <label className="flex flex-col gap-1 text-xs text-neutral-400">{label}<select className={inputClass} name={name} defaultValue={value??''} required={!optional}>{optional&&<option value="">None / not assigned</option>}{!optional&&!value&&<option value="" disabled>Choose…</option>}{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>;
}
export function Area({label,name,value}:{label:string;name:string;value?:string}) {return <label className="flex flex-col gap-1 text-xs text-neutral-400">{label}<textarea name={name} defaultValue={value??''} rows={3} className={inputClass}/></label>;}
export function Check({label,name,checked=false,value}:{label:string;name:string;checked?:boolean;value?:string}) {return <label className="flex items-start gap-2 text-sm text-neutral-300"><input type="checkbox" name={name} value={value??'on'} defaultChecked={checked} className="mt-1"/>{label}</label>;}
export function HostingForm({action,returnPath,children,client=false,label="Save",danger=false,className=""}:{action:string;returnPath:string;children?:React.ReactNode;client?:boolean;label?:string;danger?:boolean;className?:string}) {
 return <form action={client?hostingClientAction:hostingAdminAction} className={`space-y-4 ${className}`}><input type="hidden" name="action" value={action}/><input type="hidden" name="return_path" value={returnPath}/><input type="hidden" name="request_key" value={randomUUID()}/>{children}<SubmitButton danger={danger}>{label}</SubmitButton></form>;
}
export function Hidden({name,value}:{name:string;value:string}) {return <input type="hidden" name={name} value={value}/>;}
export function Notice({error,saved}:{error?:string;saved?:string}) {return <>{error&&<p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-400">{error}</p>}{saved&&<p role="status" className="rounded-lg border border-accent-500/30 bg-accent-500/10 p-3 text-sm text-accent-300">Saved successfully.</p>}</>;}
export function PageTitle({title,description}:{title:string;description?:string}) {return <header className="hms-page-title"><h1 className="text-2xl font-semibold text-neutral-100">{title}</h1>{description&&<p className="mt-2 max-w-3xl text-sm text-neutral-400">{description}</p>}</header>;}
export function StatusBadge({value}:{value:string}){
 const lower=value.toLowerCase();
 const tone=['active','available','paid','resolved','valid','matched','provider_confirmed','enabled'].includes(lower)?'success':['pending','awaiting_connection','queued','applying','pending_customer','awaiting_approval','not_requested'].includes(lower)?'pending':['failed','error','expired','suspended','uncertain','mismatch','rejected'].includes(lower)?'danger':'neutral';
 return <span className={`hms-status hms-status-${tone}`}><span aria-hidden="true"/>{value.replaceAll('_',' ')}</span>;
}
export function Pagination({path,page,total}:{path:string;page:number;total:number}) {return <nav aria-label="Pagination" className="flex items-center justify-between text-sm text-neutral-400"><span>{total} records · Page {page}</span><div className="flex gap-4">{page>1&&<Link href={`${path}?page=${page-1}`} className="text-accent-300">Previous</Link>}{page*25<total&&<Link href={`${path}?page=${page+1}`} className="text-accent-300">Next</Link>}</div></nav>;}
export const choices=(...values:string[])=>values.map(value=>({value,label:value.replaceAll('_',' ')}));

