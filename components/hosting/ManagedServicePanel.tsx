"use client";
import {useRef,useState} from 'react';
import {managedInventory,type ManagedInventory} from '@/lib/hosting/managedSchema';
import {keyFingerprint} from '@/lib/hosting/operatorSigning';
import {sealManagedPassword} from '@/lib/hosting/managedSigning';
const button='rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50';
const input='mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-900';
export function ManagedServicePanel({kind,scope,services,readOnly=false}:{kind:'email'|'database';scope:'owner'|'client';services:{id:string;name:string}[];readOnly?:boolean}){
 const [service,setService]=useState(''),[inventory,setInventory]=useState<ManagedInventory|null>(null),[fingerprint,setFingerprint]=useState(''),[pin,setPin]=useState('');
 const [operation,setOperation]=useState('create'),[resource,setResource]=useState(''),[name,setName]=useState(''),[password,setPassword]=useState(''),[quota,setQuota]=useState('100'),[confirm,setConfirm]=useState(false);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[requestKey,setRequestKey]=useState('');const lock=useRef(false);
 async function call(command:unknown){const r=await fetch('/api/hosting-services?scope='+scope,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(command),redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error();return r.json();}
 async function run(work:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setMessage('');try{await work();}catch{setMessage('Could not confirm this step. Check service enrollment and access. For a submitted request, review its status before creating another.');}finally{lock.current=false;setBusy(false);}}
 async function load(){const row=managedInventory.parse(await call({action:'inventory',service,kind}));if(row.kind!==kind)throw Error();setInventory(row);setFingerprint(await keyFingerprint(row.host_key));setResource('');}
 return <section className="space-y-5 rounded-xl border border-blue-200 bg-white p-5 text-slate-900"><h2 className="text-lg font-semibold">{kind==='email'?'Email accounts':'Databases'}</h2>
 <form onSubmit={e=>{e.preventDefault();void run(load);}} className="space-y-3"><label className="block text-sm">Hosting service<select className={input} required value={service} disabled={busy} onChange={e=>{setService(e.target.value);setInventory(null);setPassword('');setPin('');setConfirm(false);setRequestKey('');}}><option value="">Choose a service</option>{services.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><button className={button} disabled={busy||!service}>Load accounts</button></form>
 {inventory?<><p className="text-sm text-slate-600">{inventory.enabled?'Changes require separate owner approval before the provider is updated.':'This service is not enabled for provider changes.'}</p>
 <ul className="space-y-2">{inventory.resources.map(r=><li className="rounded-lg border p-3 text-sm" key={r.id}>{r.name}</li>)}</ul>{!inventory.resources.length?<p className="text-sm text-slate-500">No enrolled accounts yet.</p>:null}
 {!readOnly?<form className="space-y-3 border-t pt-4" onSubmit={e=>{e.preventDefault();void run(async()=>{
  if(!inventory||!confirm)throw Error();const key=crypto.randomUUID();setRequestKey(key);
  const command:Record<string,unknown>={operation};if(operation==='create')command.name=name;else command.resource=resource;
  if(operation==='create'||operation==='password')command.sealed=await sealManagedPassword(inventory.host_key,pin,service,key,password);
  if(operation==='quota'){if(!/^\d+$/.test(quota))throw Error();command.quota_mb=Number(quota);}
  if(operation==='delete')command.confirm=resource;
  setPassword('');const result=await call({action:'request',service,kind,request_key:key,operation:command});if(typeof result.id!=='string')throw Error();
  setMessage('Request recorded. It needs signed owner approval. This does not confirm a live server change.');setConfirm(false);
 });}}><label className="block text-sm">Change<select className={input} value={operation} disabled={busy} onChange={e=>{setOperation(e.target.value);setPassword('');setConfirm(false);}}>{['create','password',...(kind==='email'?['quota']:[]),'enable','disable','delete'].map(op=><option key={op}>{op}</option>)}</select></label>
 {operation==='create'?<label className="block text-sm">Account name<input className={input} value={name} onChange={e=>setName(e.target.value)} pattern="[a-z][a-z0-9_]{0,15}" required disabled={busy}/><span className="text-xs text-slate-500">The enrolled domain or database prefix is added by the operator.</span></label>:<label className="block text-sm">Account<select className={input} required value={resource} disabled={busy} onChange={e=>setResource(e.target.value)}><option value="">Choose an account</option>{inventory.resources.map(r=><option value={r.id} key={r.id}>{r.name}</option>)}</select></label>}
 {operation==='create'||operation==='password'?<><p className="break-all text-xs text-slate-500">Server fingerprint: {fingerprint}</p><label className="block text-sm">Independently verified server fingerprint<input className={input} value={pin} onChange={e=>setPin(e.target.value)} required autoComplete="off" disabled={busy}/></label><label className="block text-sm">New password<input className={input} type="password" minLength={16} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="new-password" disabled={busy}/><span className="text-xs text-slate-500">Encrypted on this device before submission.</span></label></>:null}
 {operation==='quota'?<label className="block text-sm">Mailbox quota (MiB)<input className={input} value={quota} onChange={e=>setQuota(e.target.value)} inputMode="numeric" required disabled={busy}/></label>:null}
 <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirm} onChange={e=>setConfirm(e.target.checked)} required disabled={busy}/>{operation==='delete'?'Request permanent deletion of the selected account. The owner must review backups before approving.':'I have reviewed this request.'}</label><button className={button} disabled={busy||!confirm}>Submit for owner approval</button></form>:<p className="text-sm text-slate-500">Read-only view.</p>}
 {inventory.jobs.length?<div className="border-t pt-3"><h3 className="font-medium">Recent requests</h3><ul className="space-y-2 text-sm">{inventory.jobs.map(j=><li key={j.id}><code>{j.id}</code> · {j.state.replaceAll('_',' ')}</li>)}</ul></div>:null}
 </>:null}{requestKey?<p className="break-all text-xs text-slate-500">Request reference: {requestKey}</p>:null}{message?<p role="status" className="text-sm">{message}</p>:null}
 </section>;
}
