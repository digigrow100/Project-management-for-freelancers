"use client";
import {useRef,useState} from 'react';
import {HostingForm,Field,Hidden} from './ui';
import type {AppAccountView} from '@/lib/hosting/store';

const stateLabel:Record<string,string>={requested:'Waiting for setup request',provisioning:'Being set up (owner approval and VPS worker)',uncertain:'Outcome uncertain: review before retrying',provider_confirmed:'Provider objects created; storage control not yet verified',enforced:'Controls verified on the server',suspended:'Suspended'};
const levelLabel:Record<string,string>={unknown:'Unknown',disabled:'Not provided',ok:'OK',warn80:'80% or more used',warn90:'90% or more used',exceeded:'Limit reached'};
export function AppAccountPanel({accounts,needAccount}:{accounts:AppAccountView[];needAccount:{id:string;name:string}[]}){
 const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);const pending=useRef(false);const keys=useRef(new Map<string,string>());
 async function send(body:Record<string,unknown>,keyFor?:string){
  if(pending.current)return;pending.current=true;setBusy(true);setMessage('');
  // The same request key is kept after an uncertain answer, so a retry cannot queue a second job.
  if(keyFor&&!keys.current.has(keyFor))keys.current.set(keyFor,crypto.randomUUID());
  try{
   const response=await fetch('/api/hosting-services?scope=owner',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(keyFor?{...body,request_key:keys.current.get(keyFor)}:body),signal:AbortSignal.timeout(20000)});
   const value=await response.json();
   if(!response.ok||!value||value.live_verified!==false)throw Error('unavailable');
   setMessage(typeof value.state==='string'?'Server answer: '+(stateLabel[value.state]??value.state)+'. Refresh the page to see the recorded state.':'Recorded. Refresh the page to see it.');
  }catch{setMessage('Could not confirm the answer. Check the status before submitting again.');}
  finally{pending.current=false;setBusy(false);}
 }
 return <section className="space-y-5 rounded-xl border border-base-700/60 bg-base-850 p-5" aria-label="App Hosting accounts">
  <h2 className="font-medium">App Hosting accounts</h2>
  <p className="text-sm text-neutral-400">One account per assigned contract. All of its websites share the package limits. Nothing is Active until the server returns a verified receipt for this contract.</p>
  {needAccount.map(s=><div key={s.id} className="flex flex-wrap items-center gap-3"><span className="text-sm">{s.name}</span><HostingForm action="app_open_account" returnPath="/hosting/services" label="Open account"><Hidden name="service_id" value={s.id}/></HostingForm></div>)}
  {accounts.map(a=><article key={a.id} className="space-y-3 border-t border-base-700/60 pt-4">
   <h3 className="font-medium">{a.service_name}</h3>
   <p className="text-sm">{stateLabel[a.status]??a.status}{a.receipt_digest&&<span className="ml-2 break-all text-xs text-neutral-500">receipt {a.receipt_digest.slice(0,16)}…</span>}</p>
   {a.blocked_features.length>0&&<p className="text-sm text-amber-400">Not available for this account yet: {a.blocked_features.join(', ')}. These stay blocked until their enforcement control exists.</p>}
   <ul className="space-y-1 text-sm">{a.sites.map(s=><li key={s.id} className="flex flex-wrap items-center gap-3"><span>{s.hostname}{s.is_primary?' (primary)':''} — {s.status}</span>
    {(s.status==='reserved'&&(s.is_primary?['requested','provisioning'].includes(a.status):a.status==='enforced'))&&<button type="button" disabled={busy} onClick={()=>void send({action:'hosting.app.provision',service:a.service_id,site:s.id},s.id)} className="rounded bg-blue-600 px-3 py-1 text-xs text-white disabled:opacity-50">Request setup</button>}</li>)}</ul>
   <div className="flex flex-wrap gap-3"><button type="button" disabled={busy} onClick={()=>void send({action:'hosting.app.status',service:a.service_id})} className="rounded border border-base-700 px-3 py-1 text-sm disabled:opacity-50">Check status</button>
    <button type="button" disabled={busy||a.status!=='enforced'} onClick={()=>void send({action:'hosting.app.usage',service:a.service_id})} className="rounded border border-base-700 px-3 py-1 text-sm disabled:opacity-50">Refresh usage</button></div>
   {a.status==='enforced'&&<HostingForm action="app_add_site" returnPath="/hosting/services" label="Reserve website"><Hidden name="account_id" value={a.id}/><Field label="Hostname of an additional website" name="hostname" required placeholder="shop.example.com"/></HostingForm>}
   {a.usage&&<UsageTable usage={a.usage} at={a.usage_at}/>}
  </article>)}
  <p aria-live="polite" className="text-sm">{message}</p>
 </section>;
}
export function UsageTable({usage,at}:{usage:NonNullable<AppAccountView['usage']>;at:string|null}){
 const rows=Object.entries(usage).filter(([,v])=>v.level!=='disabled'||v.limit>0);
 return <details><summary className="cursor-pointer text-sm">Usage as last reported{at?' ('+new Date(at).toISOString().slice(0,16).replace('T',' ')+' UTC)':''}</summary>
  <table className="mt-3 w-full text-left text-xs"><thead><tr><th>Limit</th><th>Used</th><th>Of</th><th>Status</th><th>Source</th></tr></thead><tbody>{rows.map(([key,v])=><tr key={key}><td>{key}</td><td>{v.used??'—'}</td><td>{v.effective}</td><td>{levelLabel[v.level]??v.level}</td><td>{v.basis}</td></tr>)}</tbody></table>
  <p className="mt-2 text-xs text-neutral-500">Unknown means nothing measured this value; it is never shown as zero.</p></details>;
}
