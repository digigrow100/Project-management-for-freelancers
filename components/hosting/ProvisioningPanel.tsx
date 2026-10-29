"use client";
import {useRef,useState} from 'react';
import type {HostingService} from '@/lib/hosting/types';

type Result={state:string;id?:string;digest?:string;live_verified:false};
const labels:Record<string,string>={not_requested:'Not requested',queued:'Awaiting owner approval',applying:'Processing',uncertain:'Review required',provider_confirmed:'Account created; website and SSL not yet verified'};
export function ProvisioningPanel({services}:{services:Pick<HostingService,'id'|'name'|'status'|'primary_domain'>[]}){
 const [site,setSite]=useState(services[0]?.id??'');
 const [result,setResult]=useState<Result|null>(null);
 const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 const pending=useRef(false);const requestKeys=useRef(new Map<string,string>());
 async function send(action:'hosting.provision'|'hosting.status'){
  if(!site||pending.current)return;pending.current=true;setBusy(true);setError('');
  // Keep the key after an uncertain response. A retry cannot create a second intent.
  if(!requestKeys.current.has(site))requestKeys.current.set(site,crypto.randomUUID());
  try{
   const response=await fetch('/api/hosting-services?scope=owner',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
    body:JSON.stringify(action==='hosting.provision'?{action,service:site,request_key:requestKeys.current.get(site)}:{action,service:site}),signal:AbortSignal.timeout(20000)});
   const value=await response.json();
   if(!response.ok||!value||typeof value.state!=='string'||value.live_verified!==false)throw Error('Hosting response unavailable. Check status before submitting again.');
   setResult(value);
  }catch{setError('Could not confirm the response. Check status before submitting again.');}
  finally{pending.current=false;setBusy(false);}
 }
 const selected=services.find(s=>s.id===site);
 return <section className="space-y-4 rounded-xl border border-base-700/60 bg-base-850 p-5">
  <h2 className="font-medium">Hosting provisioning</h2>
  <p className="text-sm text-neutral-400">Submit a saved hosting service to the VPS. Requests require independent owner approval. Account creation and live website verification are shown separately.</p>
  <label className="block text-sm">Hosting service<select value={site} disabled={busy} onChange={e=>{setSite(e.target.value);setResult(null);setError('');}} className="mt-2 block w-full rounded border border-base-700 bg-base-900 p-2">{services.map(s=><option key={s.id} value={s.id}>{s.name} — {s.primary_domain||'domain required'}</option>)}</select></label>
  <div className="flex flex-wrap gap-3"><button type="button" disabled={busy||!site||selected?.status!=='pending'||!selected?.primary_domain||Boolean(result&&result.state!=='not_requested')} onClick={()=>void send('hosting.provision')} className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50">{busy?'Working…':'Request hosting setup'}</button>
  <button type="button" disabled={busy||!site} onClick={()=>void send('hosting.status')} className="rounded border border-base-700 px-4 py-2 text-sm disabled:opacity-50">Check status</button></div>
  <div aria-live="polite">{error&&<p className="text-sm text-red-400">{error}</p>}{result&&<><p className="text-sm">{labels[result.state]??'Unknown state; review required'}</p>{result.id&&<p className="mt-2 break-all text-xs text-neutral-400">Request: {result.id}</p>}{result.digest&&<details className="mt-2 text-xs text-neutral-400"><summary>Owner approval digest</summary><p className="mt-2 break-all">{result.digest}</p></details>}</>}</div>
 </section>;
}
