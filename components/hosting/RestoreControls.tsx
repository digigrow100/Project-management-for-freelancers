"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {backupKinds,backupApplyResult,type BackupPolicy,type BackupScopePlan,type BackupKind,type BackupContext} from '@/lib/hosting/backupProtocol';
import {policiesView,scopePlanView} from '@/lib/hosting/backupView';
import {signerHello,signRestore,SignerError} from '@/lib/hosting/signerClient';
const button='rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50';
const quiet='rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-50';
const input='mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-900';
const date=(value:number)=>new Date(value*1000).toLocaleDateString('en-GB',{timeZone:'Asia/Karachi',day:'numeric',month:'short',year:'numeric'});
const dateTime=(value:number)=>new Date(value*1000).toLocaleString('en-GB',{timeZone:'Asia/Karachi'})+' PKT';
const applyText:Record<string,string>={applied:'Restored and checked',reverted:'Could not be restored — your previous data was put back',not_applied:'Not restored — nothing was changed',skipped:'Skipped because an earlier website failed',recovery_required:'Needs attention — do not retry; the owner must review'};
// Backup dates, the real schedule, and scoped restores. The browser never holds a key: the owner approves a live restore with the signing program on their own computer.
export function RestoreControls({owner,readOnly,signerFingerprint,clients}:{owner:boolean;readOnly:boolean;signerFingerprint:string|null;clients:{id:string;name:string;client:string}[]}){
 const [policies,setPolicies]=useState<BackupPolicy[]|null>(null),[scopeType,setScopeType]=useState<'site'|'client'|'sites'>('site'),[site,setSite]=useState(''),[client,setClient]=useState(''),[chosen,setChosen]=useState<string[]>([]);
 const [pointMode,setPointMode]=useState<'default'|'latest'>('default'),[kinds,setKinds]=useState<BackupKind[]>([...backupKinds]),[accept,setAccept]=useState<string[]>([]);
 const [plan,setPlan]=useState<BackupScopePlan|null>(null),[staged,setStaged]=useState(false),[token,setToken]=useState(''),[result,setResult]=useState<ReturnType<typeof backupApplyResult>|null>(null);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[uncertain,setUncertain]=useState(false),lock=useRef(false),alive=useRef(true);
 const context:BackupContext={actor:'view',owner,readOnly,sites:new Map(clients.map(c=>[c.id,{clientId:c.client,name:c.name}]))};
 const request=useCallback(async(command:unknown)=>{
  const response=await fetch(`/api/hosting-backups?scope=${owner?'owner':'client'}`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(command),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(60000)});
  if(!response.ok)throw Error();return response.json();
 },[owner]);
 const run=useCallback(async(work:()=>Promise<void>)=>{
  if(lock.current)return;lock.current=true;setBusy(true);setMessage('');
  try{await work();}catch(error){if(alive.current)setMessage(error instanceof SignerError?error.message:'The request could not be verified. Nothing live was changed. Refresh before trying again.');}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 },[]);
 const load=useCallback(async()=>{const data=await request({action:'policy'});if(!alive.current)return;const list=policiesView(data.policies);setPolicies(list);},[request]);   // eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{alive.current=true;void run(load);return()=>{alive.current=false;};},[run,load]);
 const scope=()=>scopeType==='site'?{type:'site',site}:scopeType==='client'?{type:'client',client}:{type:'sites',sites:chosen};
 const ready=scopeType==='site'?!!site:scopeType==='client'?!!client:chosen.length>0;
 async function preview(acknowledged:string[]=accept){
  const body:Record<string,unknown>={action:'plan_scope',scope:scope(),point:pointMode,components:kinds,accept_shared:acknowledged};
  const next=scopePlanView(await request(body));setPlan(next);setStaged(false);setResult(null);
 }
 async function prepare(){
  if(!plan)return;const state=await request({action:'stage',job:plan.job,digest:plan.digest});
  if(state.job!==plan.job||state.activated!==false)throw Error();setStaged(state.state==='staged');
  setMessage(state.state==='staged'?'Prepared and checked in an isolated area. Nothing live has changed yet.':'Preparation did not finish. Nothing live was changed.');
 }
 async function applyLive(){
  if(!plan||!staged||uncertain)throw Error();
  // Everything up to here can fail without any live change. From the moment the apply request leaves, any failure is an UNKNOWN outcome.
  try{await signerHello(signerFingerprint);}catch(error){throw error;}
  const approval=await signRestore({job:plan.job,digest:plan.digest,plan:plan.plan,seconds:300},token);
  setStaged(false);
  try{
   const done=backupApplyResult(await request({action:'apply',job:plan.job,approval}),context,plan.job);
   setResult(done);
  }catch{
   setUncertain(true);setResult(null);
   throw new SignerError('The restore request was sent, but its result could not be confirmed. Live data may have been replaced. Do not try again from this page: reload it, review the backup dates above, and ask the operator to check the restore before anything else is requested.');
  }
 }
 const clientsList=[...new Map(clients.map(c=>[c.client,c.client])).keys()];
 return <section className="space-y-5 text-slate-900" aria-labelledby="restore-controls">
  <h2 id="restore-controls" className="text-xl font-semibold">Backup schedule and restore</h2>
  {message?<p role="status" className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm">{message}</p>:null}
  <div className="grid gap-4 md:grid-cols-2">{(policies??[]).map(p=><article key={p.id} className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-sm">
   <h3 className="font-semibold">{p.name}</h3>
   <p className="text-slate-600">{p.explanation}</p>
   <p>{p.schedule?(p.schedule.enabled?`Backups run about every ${p.schedule.intervalDays} days; the next is due around ${date(p.schedule.nextDue)}.`:'Scheduled backups are switched off.'):'No backup schedule is running yet.'}{!p.baseline.taken?` The first protected backup is due from ${date(p.baseline.due)}.`:''}</p>
   {p.conflicts.map(c=><p key={c.code} role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-amber-900">{c.detail}</p>)}
   <ul className="divide-y divide-slate-100">{p.points.length?p.points.map(pt=><li key={pt.id} className="py-1">{dateTime(pt.captured)}{pt.default?' · protected default':''} <span className="text-slate-500">({pt.components.join(', ')})</span></li>):<li className="py-1 text-slate-500">No restore dates yet.</li>}</ul>
   {owner&&!readOnly?<form className="flex items-end gap-2" onSubmit={e=>{e.preventDefault();const days=Number(new FormData(e.currentTarget).get('days'));void run(async()=>{await request({action:'schedule',site:p.id,interval_days:days});await load();setMessage('Schedule saved.');});}}>
    <label className="text-sm">Backup every (days)<input name="days" type="number" min={1} max={30} defaultValue={p.schedule?.intervalDays??p.recommended.intervalDays} className={input}/></label><button className={quiet} disabled={busy}>Save</button></form>:null}
  </article>)}</div>
  {!readOnly?<div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm">
   <h3 className="font-semibold">Restore</h3>
   <label className="block">What to restore<select className={input} value={scopeType} disabled={busy} onChange={e=>{setScopeType(e.target.value as typeof scopeType);setPlan(null);setAccept([]);}}>
    <option value="site">One website</option><option value="client">All websites of one client</option>{owner?<option value="sites">Chosen websites (any clients)</option>:null}</select></label>
   {scopeType==='site'?<label className="block">Website<select className={input} value={site} onChange={e=>{setSite(e.target.value);setPlan(null);}}><option value="">Choose a website</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>:null}
   {scopeType==='client'?<label className="block">Client<select className={input} value={client} onChange={e=>{setClient(e.target.value);setPlan(null);}}><option value="">Choose a client</option>{clientsList.map(c=><option key={c} value={c}>{c}</option>)}</select></label>:null}
   {scopeType==='sites'?<fieldset><legend>Websites</legend>{clients.map(c=><label key={c.id} className="mr-4 inline-block"><input type="checkbox" checked={chosen.includes(c.id)} onChange={e=>{setChosen(e.target.checked?[...chosen,c.id]:chosen.filter(x=>x!==c.id));setPlan(null);}}/> {c.name}</label>)}</fieldset>:null}
   <label className="block">Which backup<select className={input} value={pointMode} onChange={e=>{setPointMode(e.target.value as typeof pointMode);setPlan(null);}}><option value="default">The protected default</option><option value="latest">The newest backup</option></select></label>
   <fieldset><legend>Include</legend>{backupKinds.map(k=><label key={k} className="mr-4 inline-block capitalize"><input type="checkbox" checked={kinds.includes(k)} onChange={e=>{setKinds(e.target.checked?[...kinds,k]:kinds.filter(x=>x!==k));setPlan(null);}}/> {k}</label>)}</fieldset>
   <button type="button" className={button} disabled={busy||uncertain||!ready||!kinds.length} onClick={()=>void run(()=>preview())}>Review what would be restored</button>
   {plan?<div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
    <p className="font-medium">This will replace the listed parts of these websites with the chosen backup:</p>
    <ul className="space-y-2">{plan.sites.map(s=><li key={s.site}><span className="font-medium">{context.sites.get(s.site)?.name??s.site}</span> · backup of {date(s.captured)} · {s.components.join(', ')||'nothing'}
     {s.missing.length?<span className="block text-slate-600">Not in this backup: {s.missing.join(', ')}</span>:null}
     {s.covered.length?<span className="block text-slate-600">Restored together with another selected website: {s.covered.map(c=>c.component).join(', ')}</span>:null}
     {s.skipped.map(x=><label key={x.acknowledgement} className="block rounded border border-amber-300 bg-amber-50 p-2 text-amber-900"><input type="checkbox" checked={accept.includes(x.acknowledgement??'')} onChange={e=>{const next=e.target.checked?[...accept,x.acknowledgement??'']:accept.filter(a=>a!==x.acknowledgement);setAccept(next);void run(()=>preview(next));}}/> {x.component} is shared with {x.affects.map(a=>context.sites.get(a.site)?.name??a.site).join(', ')} and is left out. Tick to restore it too — that also overwrites it for those websites.</label>)}
     {s.accepted.map(x=><span key={x.resource} className="block text-amber-900">{x.component} is shared and WILL also change for {x.affects.map(a=>context.sites.get(a.site)?.name??a.site).join(', ')}.</span>)}</li>)}</ul>
    <button type="button" className={button} disabled={busy||uncertain||staged} onClick={()=>void run(prepare)}>Prepare and check in an isolated area</button>
   </div>:null}
   {plan&&staged&&owner?<div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
    <p className="font-medium">Apply to the live websites</p>
    <p>Your signing program shows the same list; a safety copy of what is replaced is taken first, and a website that fails is put back.</p>
    <label className="block">Signer pairing code<input className={input} autoComplete="off" value={token} onChange={e=>setToken(e.target.value.trim())}/></label>
    <button type="button" className={button} disabled={busy||uncertain||!token} onClick={()=>void run(applyLive)}>Sign on my computer and restore</button></div>:null}
   {plan&&staged&&!owner?<p className="rounded-lg border border-slate-200 p-3">The preparation succeeded. The owner must approve the final step on their own computer; ask them to open this restore.</p>:null}
   {result?<div role="status" className="rounded-lg border border-slate-200 p-3"><p className="font-medium">{result.state==='applied'?'Restore finished':'Restore finished with problems'}</p><ul>{result.sites.map(s=><li key={s.site}>{context.sites.get(s.site)?.name??s.site}: {applyText[s.apply]??s.apply}</li>)}</ul></div>:null}
  </div>:null}
 </section>;
}
