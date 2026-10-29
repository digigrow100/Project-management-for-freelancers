"use client";
import {useRef,useState} from 'react';
type Entry={id:string;hostname:string;service:string};
type Job={id:string;digest:string;state:string;operation:'attach'|'ssl';live_verified:false};
type Status={service:string;domain:string;job:Job|null;observation:{dns:string;tls:string;expires:number|null;checked:number;fresh:boolean}|null;live_verified:boolean};
export function PrimaryDomainPanel({domains}:{domains:Entry[]}){
 const [selected,setSelected]=useState(domains[0]?.id??''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [job,setJob]=useState<Job|null>(null),[status,setStatus]=useState<Status|null>(null);
 const pending=useRef(false),keys=useRef(new Map<string,string>());
 async function send(operation:'attach'|'ssl'|'status'){
  const target=domains.find(d=>d.id===selected);if(!target||pending.current)return;
  pending.current=true;setBusy(true);setError('');
  const key=selected+':'+operation;
  if(!keys.current.has(key))keys.current.set(key,crypto.randomUUID());
  try{
   const body=operation==='status'?{action:'hosting.domain.status',service:target.service,domain:target.id}:{action:'hosting.domain.request',service:target.service,domain:target.id,operation,request_key:keys.current.get(key)};
   const response=await fetch('/api/hosting-services?scope=owner',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
   const value=await response.json();if(!response.ok)throw Error();
   if(operation==='status'){
    if(value.service!==target.service||value.domain!==target.hostname||typeof value.live_verified!=='boolean')throw Error();
    setStatus(value);setJob(value.job);
   }else{
    if(typeof value.id!=='string'||value.live_verified!==false)throw Error();
    setJob(value);setStatus(null);
   }
  }catch{setError('Could not confirm the result. Check saved status before requesting again.');}
  finally{pending.current=false;setBusy(false);}
 }
 const blocked=Boolean(job&&['queued','waiting_dns','applying','uncertain'].includes(job.state));
 return <section className="space-y-4 rounded-xl border border-base-700/60 bg-base-850 p-5"><h2 className="font-medium">Primary domain and SSL</h2>
  <p className="text-sm text-neutral-400">Link the saved primary domain to its confirmed VPS website. SSL requests wait for DNS to point to this server and require owner approval. Certificate validity is shown only after a worker verifies trusted TLS.</p>
  {!domains.length?<p className="text-sm text-neutral-400">Save a primary domain linked to its hosting service first. Additional aliases are not managed here.</p>:<>
  <label className="block text-sm">Primary domain<select value={selected} disabled={busy} onChange={e=>{setSelected(e.target.value);setJob(null);setStatus(null);setError('');}} className="mt-2 block w-full rounded border border-base-700 bg-base-900 p-2">{domains.map(d=><option key={d.id} value={d.id}>{d.hostname}</option>)}</select></label>
  <div className="flex flex-wrap gap-3"><button type="button" disabled={busy||blocked} onClick={()=>void send('attach')} className="rounded border border-base-700 px-4 py-2 text-sm disabled:opacity-50">Link primary domain</button><button type="button" disabled={busy||blocked} onClick={()=>void send('ssl')} className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50">Request automatic SSL</button><button type="button" disabled={busy} onClick={()=>void send('status')} className="rounded border border-base-700 px-4 py-2 text-sm disabled:opacity-50">Check saved status</button></div>
  </>}
  <div className="space-y-2 text-sm" aria-live="polite">{busy&&<p>Working…</p>}{error&&<p className="text-red-400">{error}</p>}
   {job&&<><p>{job.state==='queued'?'Awaiting owner approval':job.state==='waiting_dns'?'Waiting for DNS; no certificate write performed':job.state==='uncertain'?'Review required; do not retry automatically':job.state==='provider_confirmed'?'Provider configuration confirmed; check certificate observation':job.state==='applying'?'Processing':'Review required'}</p><details className="text-xs text-neutral-400"><summary>Owner approval details</summary><p className="mt-2 break-all">Request: {job.id}</p><p className="mt-2 break-all">Digest: {job.digest}</p></details></>}
   {status&&<>{status.observation?<><p>DNS: {status.observation.dns}. SSL: {status.live_verified?'Verified on the registered server':status.observation.fresh?'Not verified':'Observation expired; worker check required'}.</p><p className="text-xs text-neutral-400">Checked: {new Date(status.observation.checked*1000).toLocaleString()}{status.observation.expires?` · Certificate expiry: ${new Date(status.observation.expires*1000).toLocaleDateString()}`:''}</p></>:<p>No certificate observation yet. A worker check is required.</p>}</>}
  </div><p className="text-xs text-neutral-500">These controls do not buy a domain or change DNS. Certificate issuance and renewal are managed by ISPConfig; scheduled renewal acceptance remains a deployment check.</p>
 </section>;
}
