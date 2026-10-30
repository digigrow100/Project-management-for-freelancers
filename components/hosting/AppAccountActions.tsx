"use client";
import {useRef,useState} from 'react';
const stateLabel:Record<string,string>={requested:'Waiting for setup request',provisioning:'Being set up (owner approval and VPS worker)',uncertain:'Outcome uncertain: review before retrying',provider_confirmed:'Provider objects created; storage control not yet verified',enforced:'Controls verified on the server',suspended:'Suspended'};
export function AppAccountActions({service,status,sites}:{service:string;status:string;sites:{id:string;hostname:string;is_primary:boolean;status:string}[]}){
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
 return <div className="space-y-3"><ul className="space-y-1 text-sm">{sites.map(s=><li key={s.id} className="flex flex-wrap items-center gap-3"><span>{s.hostname}{s.is_primary?' (primary)':''} — {s.status}</span>
  {(s.status==='reserved'&&(s.is_primary?['requested','provisioning'].includes(status):status==='enforced'))&&<button type="button" disabled={busy} onClick={()=>void send({action:'hosting.app.provision',service,site:s.id},s.id)} className="rounded bg-blue-600 px-3 py-1 text-xs text-white disabled:opacity-50">Request setup</button>}</li>)}</ul>
  <div className="flex flex-wrap gap-3"><button type="button" disabled={busy} onClick={()=>void send({action:'hosting.app.status',service})} className="rounded border border-base-700 px-3 py-1 text-sm disabled:opacity-50">Check status</button>
   <button type="button" disabled={busy||status!=='enforced'} onClick={()=>void send({action:'hosting.app.usage',service})} className="rounded border border-base-700 px-3 py-1 text-sm disabled:opacity-50">Refresh usage</button></div>
  <p aria-live="polite" className="text-sm">{message}</p></div>;
}
