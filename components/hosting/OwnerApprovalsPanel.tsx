"use client";
import {useRef,useState} from 'react';
import {approvalsPending,approvalView,githubStatus,sourceStatus,signedApproval,signedPolicy,signature,managedApprovalsPending,managedApprovalView,type ApprovalView,type ManagedApprovalView} from '@/lib/hosting/managedSchema';
import {signerHello,signApproval,signManaged,signPolicy,SignerError} from '@/lib/hosting/signerClient';
import {z} from 'zod';
const button='rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50';
const quiet='rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-50';
const input='mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-900';
const operations:Record<string,string>={deploy:'Stage the repository',export:'Export to GitHub',publish:'Publish to the live website',rollback:'Roll back the live website',recover:'Recover an uncertain publication'};
const managedOperations:Record<string,string>={create:'Create',password:'Change the password of',quota:'Change the quota of',enable:'Enable',disable:'Disable',delete:'Delete',domain_create:'Create the mail domain'};
const pastedApproval=z.object({approval:signedApproval}).strict(),pastedPolicy=z.object({policy:signedPolicy,signature}).strict();
// Owner decisions are signed on the owner's own computer. This page only carries the request there and the signed answer back; it holds no key.
export function OwnerApprovalsPanel({services,signerFingerprint,autodeployEnabled}:{services:{id:string;name:string}[];signerFingerprint:string|null;autodeployEnabled:boolean}){
 const [service,setService]=useState(services[0]?.id??''),[items,setItems]=useState<ApprovalView[]|null>(null),[token,setToken]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [origin,setOrigin]=useState(''),[paste,setPaste]=useState(''),[offline,setOffline]=useState<{kind:string;payload:unknown}|null>(null);
 const [policy,setPolicy]=useState({branch:'main',allow_activation:false,runtimes:['static'] as string[],max_per_day:2,days:7}),[repo,setRepo]=useState<number|null>(null),[active,setActive]=useState<boolean|null>(null);
 const lock=useRef(false);
 const [managed,setManaged]=useState<{kind:'email'|'database';item:ManagedApprovalView}[]|null>(null);
 async function call(command:unknown){
  const response=await fetch('/api/hosting-services?scope=owner',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(command),redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error();return response.json();
 }
 async function run(work:()=>Promise<void>){
  if(lock.current)return;lock.current=true;setBusy(true);setMessage('');
  try{await work();}catch(error){setMessage(error instanceof SignerError?error.message:'Could not confirm this step. Reload before trying again; nothing is submitted twice automatically.');}
  finally{lock.current=false;setBusy(false);}
 }
 async function load(){
  const list=approvalsPending.parse(await call({action:'source.approvals_pending',service}));if(list.service!==service)throw Error();setItems(list.pending);
  const status=sourceStatus.parse(await call({action:'source.status',service}));setRepo(status.repository?.repository_id??null);if(status.repository)setPolicy(p=>({...p,branch:status.repository!.branch}));
  try{const g=githubStatus.parse(await call({action:'source.github_status',service}));setActive(g.auto.policy?['active','paused'].includes(g.auto.policy.state):false);}catch{setActive(null);}
  const found:{kind:'email'|'database';item:ManagedApprovalView}[]=[];
  for(const kind of ['email','database'] as const){
   try{const m=managedApprovalsPending.parse(await call({action:'managed.approvals_pending',service,kind}));if(m.service!==service||m.kind!==kind)throw Error();for(const item of m.pending)found.push({kind,item});}catch{/* this service has no such management enrolled */}
  }
  setManaged(found);
  const context=await fetch('/api/hosting-approvals/context',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({service}),redirect:'error'});
  if(context.ok){const value=await context.json();if(typeof value.origin==='string')setOrigin(value.origin);}
 }
 const request=(item:ApprovalView)=>({job:item.job.id,digest:item.digest,intent:(item.intent??{}) as Record<string,unknown>,plan:item.plan?item.plan.digest:null,seconds:300});
 async function approve(item:ApprovalView){
  const body=request(item);
  try{await signerHello(signerFingerprint);}catch(error){setOffline({kind:'source-approval',payload:body});throw error;}
  const approval=await signApproval(body,token,undefined);
  const view=approvalView.parse(await call({action:'source.approve',service,job:item.job.id,approval}));
  setItems(list=>(list??[]).map(i=>i.job.id===view.job.id?view:i));setMessage('Your signed approval was received. The server will check it again and run the request.');
 }
 async function approveManaged(kind:'email'|'database',item:ManagedApprovalView){
  try{await signerHello(signerFingerprint);}catch(error){throw error;}
  const approval=await signManaged({job:item.job.id,digest:item.digest,intent:item.intent,target:item.job.target,seconds:300},token);
  const view=managedApprovalView.parse(await call({action:'managed.approve',service,kind,job:item.job.id,approval}));
  setManaged(list=>(list??[]).map(m=>m.item.job.id===view.job.id?{kind:m.kind,item:view}:m));setMessage('Your signed approval was received. The server will check it again and apply it.');
 }
 async function withdrawManaged(kind:'email'|'database',item:ManagedApprovalView){
  const view=managedApprovalView.parse(await call({action:'managed.approval_withdraw',service,kind,job:item.job.id}));setManaged(list=>(list??[]).map(m=>m.item.job.id===view.job.id?{kind:m.kind,item:view}:m));
 }
 async function withdraw(item:ApprovalView){
  const view=approvalView.parse(await call({action:'source.approval_withdraw',service,job:item.job.id}));setItems(list=>(list??[]).map(i=>i.job.id===view.job.id?view:i));
 }
 async function submitPasted(item?:ApprovalView){
  let value:unknown;try{value=JSON.parse(paste);}catch{throw new SignerError('That is not the signer output.');}
  if(item){
   const {approval}=pastedApproval.parse(value);if(approval.job!==item.job.id||approval.digest!==item.digest)throw new SignerError('That approval is for a different request.');
   const view=approvalView.parse(await call({action:'source.approve',service,job:item.job.id,approval}));setItems(list=>(list??[]).map(i=>i.job.id===view.job.id?view:i));
  }else{
   const {policy:document,signature:signed}=pastedPolicy.parse(value);
   await call({action:'source.auto_install',service,policy:document,signature:signed});await load();
  }
  setPaste('');setOffline(null);setMessage('Your signed document was received.');
 }
 async function install(){
  if(repo===null)throw Error();
  const context=await (await fetch('/api/hosting-approvals/context',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({service}),redirect:'error'})).json();
  const proposal={service:context.service,client:context.client,actor:context.actor,repository_id:repo,branch:policy.branch,allow_activation:policy.allow_activation,runtimes:policy.runtimes as ('static'|'php'|'nextjs')[],max_per_day:policy.max_per_day,days:policy.days};
  try{await signerHello(signerFingerprint);}catch(error){setOffline({kind:'autodeploy-policy',payload:proposal});throw error;}
  const signed=await signPolicy(proposal,token);
  await call({action:'source.auto_install',service,policy:signed.policy,signature:signed.signature});await load();setMessage('Automatic deployment policy installed.');
 }
 return <section className="space-y-4 rounded-xl border border-slate-200 p-4" aria-labelledby="owner-approvals">
  <h2 id="owner-approvals" className="text-lg font-semibold">Owner approvals</h2>
  <p className="text-sm text-slate-600">Approvals are signed by you on your own computer with the HouseMySite signer. The server never has your private key.{origin?<> Start it with <code>python3 hms_signer.py serve --key owner.key --origin {origin}</code> and enter the pairing code it prints.</>:null}</p>
  <label className="block text-sm">Website<select className={input} value={service} onChange={e=>{setService(e.target.value);setItems(null);}}>{services.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
  <div className="flex flex-wrap items-end gap-3"><label className="block text-sm">Signer pairing code<input className={input} autoComplete="off" value={token} onChange={e=>setToken(e.target.value.trim())} placeholder="printed by the signer"/></label>
   <button type="button" className={quiet} disabled={busy||!service} onClick={()=>void run(load)}>Load requests</button></div>
  {message?<p role="status" className="text-sm text-slate-700">{message}</p>:null}
  {items?items.length===0?<p className="text-sm text-slate-600">No requests are waiting for you.</p>:items.map(item=><div key={item.job.id} className="rounded-lg border border-slate-200 p-3 text-sm">
   <div className="font-medium">{operations[item.job.operation]??item.job.operation}</div>
   <dl className="mt-1 grid grid-cols-2 gap-1 text-slate-600">{Object.entries(item.summary).filter(([,v])=>['string','number','boolean'].includes(typeof v)).slice(0,10).map(([k,v])=><div key={k} className="contents"><dt>{k}</dt><dd className="break-all">{String(v)}</dd></div>)}</dl>
   {item.needs_plan?<p className="mt-1 text-slate-600">{item.plan?.digest?'A plan was prepared for your review; your approval covers exactly that plan.':item.plan?.error?'The plan could not be prepared ('+item.plan.error+').':'The server is preparing the plan…'}</p>:null}
   <div className="mt-2 flex gap-2"><button type="button" className={button} disabled={busy||!item.approvable||item.approval_received||!token} onClick={()=>void run(()=>approve(item))}>Sign on my computer</button>
    {item.approval_received?<button type="button" className={quiet} disabled={busy} onClick={()=>void run(()=>withdraw(item))}>Withdraw approval</button>:null}</div>
   {item.approval_received?<p className="mt-1 text-slate-600">Approval received — waiting for the server to run it.</p>:null}
   {offline?.kind==='source-approval'&&offline.payload&&(offline.payload as {job:string}).job===item.job.id?<div className="mt-2 space-y-1"><p className="text-slate-600">The signer was not reachable from this page. Save this as request.json, run <code>hms_signer.py sign-file request.json --key owner.key</code>, and paste its output.</p>
    <textarea readOnly className={input+' font-mono text-xs'} rows={4} value={JSON.stringify(offline)}/><textarea className={input+' font-mono text-xs'} rows={4} value={paste} onChange={e=>setPaste(e.target.value)} aria-label="Signer output"/>
    <button type="button" className={quiet} disabled={busy||!paste} onClick={()=>void run(()=>submitPasted(item))}>Submit signed approval</button></div>:null}
  </div>):null}
  {managed&&managed.length?<div className="space-y-2 rounded-lg border border-slate-200 p-3 text-sm"><h3 className="font-medium">Email and database requests</h3>
   {managed.map(({kind,item})=><div key={item.job.id} className="flex flex-wrap items-center justify-between gap-2"><span>{managedOperations[item.job.operation]??item.job.operation} <span className="font-mono">{item.job.target??'(unknown)'}</span> · {kind}</span>
    <span className="flex gap-2"><button type="button" className={button} disabled={busy||!item.approvable||item.approval_received||!token} onClick={()=>void run(()=>approveManaged(kind,item))}>Sign on my computer</button>
    {item.approval_received?<button type="button" className={quiet} disabled={busy} onClick={()=>void run(()=>withdrawManaged(kind,item))}>Withdraw</button>:null}</span></div>)}
   <p className="text-slate-600">The signer shows the full request and recomputes its digest; a new password stays sealed and is never shown to anyone.</p></div>:null}
  {autodeployEnabled?<div className="rounded-lg border border-slate-200 p-3 text-sm">
   <h3 className="font-medium">Automatic deployment policy</h3>
   <p className="text-slate-600">Allows pushes to one branch to be staged automatically within the limits you sign. It never rolls back, exports or recovers by itself and stops after failures, uncertainty or revoked access.</p>
   {active?<p className="mt-1 text-green-700">A policy is already in place (see the GitHub section above to stop it).</p>:repo===null?<p className="mt-1 text-slate-600">Connect a repository first.</p>:<div className="mt-2 space-y-2">
    <label className="block">Branch<input className={input} value={policy.branch} onChange={e=>setPolicy({...policy,branch:e.target.value})}/></label>
    <fieldset><legend>Website types</legend>{['static','php','nextjs'].map(r=><label key={r} className="mr-3"><input type="checkbox" checked={policy.runtimes.includes(r)} onChange={e=>setPolicy({...policy,runtimes:e.target.checked?[...policy.runtimes,r]:policy.runtimes.filter(x=>x!==r)})}/> {r}</label>)}</fieldset>
    <label className="block"><input type="checkbox" checked={policy.allow_activation} onChange={e=>setPolicy({...policy,allow_activation:e.target.checked})}/> Also activate on the live website (otherwise activation stays manual and needs your signature)</label>
    <div className="flex gap-3"><label>Max per day<input type="number" min={1} max={10} className={input} value={policy.max_per_day} onChange={e=>setPolicy({...policy,max_per_day:Number(e.target.value)})}/></label><label>Valid for (days, max 30)<input type="number" min={1} max={30} className={input} value={policy.days} onChange={e=>setPolicy({...policy,days:Number(e.target.value)})}/></label></div>
    <button type="button" className={button} disabled={busy||!token||policy.runtimes.length===0} onClick={()=>void run(install)}>Sign policy on my computer</button>
    {offline?.kind==='autodeploy-policy'?<div className="space-y-1"><p className="text-slate-600">The signer was not reachable from this page. Save this as request.json, run <code>hms_signer.py sign-file request.json --key owner.key</code>, and paste its output.</p>
     <textarea readOnly className={input+' font-mono text-xs'} rows={4} value={JSON.stringify(offline)}/><textarea className={input+' font-mono text-xs'} rows={4} value={paste} onChange={e=>setPaste(e.target.value)} aria-label="Signer output"/>
     <button type="button" className={quiet} disabled={busy||!paste} onClick={()=>void run(()=>submitPasted())}>Submit signed policy</button></div>:null}
   </div>}
  </div>:null}
 </section>;
}
