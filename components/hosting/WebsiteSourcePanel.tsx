"use client";
import {useRef,useState} from 'react';
import {sourceStatus,sourceRepositories,sourceJob,sourceTreeSummary,sourceUploadTicket,SOURCE_UPLOAD_MAX_BYTES,type SourceStatus,type SourceRepositories} from '@/lib/hosting/managedSchema';
const button='rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50';
const quiet='rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-50';
const input='mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-900';
const labels:Record<string,string>={queued:'Awaiting owner approval',applying:'Processing',done:'Finished (staged for publishing; not live)',failed:'Rejected — nothing was changed',uncertain:'Review required — do not retry automatically',cancelled:'Cancelled because the repository changed'};
export function WebsiteSourcePanel({scope,services,readOnly=false,uploadEnabled=false}:{scope:'owner'|'client';services:{id:string;name:string}[];readOnly?:boolean;uploadEnabled?:boolean}){
 const [service,setService]=useState(''),[status,setStatus]=useState<SourceStatus|null>(null),[repos,setRepos]=useState<SourceRepositories|null>(null);
 const [repo,setRepo]=useState(''),[branch,setBranch]=useState('main'),[confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const lock=useRef(false),keys=useRef(new Map<string,string>());
 async function call(command:unknown){
  const response=await fetch('/api/hosting-services?scope='+scope,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(command),redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error();return response.json();
 }
 async function run(work:()=>Promise<void>){
  if(lock.current)return;lock.current=true;setBusy(true);setMessage('');
  try{await work();}catch{setMessage('Could not confirm this step. Reload the status before trying again; a submitted request is never repeated automatically.');}
  finally{lock.current=false;setBusy(false);}
 }
 async function load(id=service){
  const next=sourceStatus.parse(await call({action:'source.status',service:id}));if(next.service!==id)throw Error();setStatus(next);
  if(!readOnly){const list=sourceRepositories.parse(await call({action:'source.repositories',service:id}));if(list.service!==id)throw Error();setRepos(list);setRepo('');}
  setConfirm(false);
 }
 async function change(action:'source.connect'|'source.switch'|'source.disconnect'){
  if(!status||(action!=='source.disconnect'&&!repo)||!confirm)throw Error();
  const chosen=repos?.available.find(r=>String(r.repository_id)===repo);
  const body=action==='source.disconnect'?{action,service,expected_version:status.version}:{action,service,installation_id:chosen?.installation_id,repository_id:chosen?.repository_id,branch,expected_version:status.version};
  if(action!=='source.disconnect'&&!chosen)throw Error();
  const next=sourceStatus.parse(await call(body));setStatus(next);setConfirm(false);
  setMessage(action==='source.disconnect'?'Repository disconnected. Website files were not deleted.':'Repository saved. Older queued work was cancelled.');
 }
 async function request(operation:'deploy'|'export',tree:string|null){
  // Keep the key only while a submission is unresolved; it is bound to the binding version so a retry after a repository change cannot hit an idempotency conflict.
  const k=service+':'+(status?.version??0)+':'+operation+':'+(tree??'github');if(!keys.current.has(k))keys.current.set(k,crypto.randomUUID());
  const job=sourceJob.parse(await call({action:'source.request',service,operation,request_key:keys.current.get(k),tree}));
  keys.current.delete(k);
  setMessage('Request recorded ('+job.id+'). It needs separate owner approval. Nothing has changed on the website.');await load();
 }
 async function upload(file:File){
  if(!uploadEnabled||file.size<22||file.size>SOURCE_UPLOAD_MAX_BYTES||!/\.zip$/i.test(file.name))throw Error();
  const bytes=await file.arrayBuffer();
  const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  const ticket=sourceUploadTicket.parse(await call({action:'source.upload_ticket',service,size:file.size,sha256}));
  const response=await fetch(ticket.url,{method:'POST',mode:'cors',credentials:'omit',redirect:'error',headers:{'Content-Type':'application/zip','X-HMS-Upload-Ticket':ticket.ticket,'X-HMS-Upload-Signature':ticket.signature},body:bytes,signal:AbortSignal.timeout(180000)});
  if(!response.ok)throw Error();
  const tree=sourceTreeSummary.parse(await response.json());
  setMessage('ZIP checked and stored privately ('+tree.files+' files). It is not live. Request a deploy or export to use it.');await load();
 }
 async function discard(tree:string){sourceStatus.parse(await call({action:'source.discard',service,tree}));setMessage('Staged files removed.');await load();}
 const active=Boolean(status?.jobs.some(j=>['queued','applying','uncertain'].includes(j.state)));
 // Queued requests await approval and are cancelled by a repository change; running or uncertain work must be reviewed first.
 const running=Boolean(status?.jobs.some(j=>['applying','uncertain'].includes(j.state)));
 return <section className="space-y-5 rounded-xl border border-blue-200 bg-white p-5 text-slate-900"><h2 className="text-lg font-semibold">Website source</h2>
  <p className="text-sm text-slate-600">Connect a GitHub repository, or upload a ZIP of your website. Deploys and exports are checked on the server and need separate owner approval; they never change your live site on their own.</p>
  <form onSubmit={e=>{e.preventDefault();void run(()=>load());}} className="space-y-3"><label className="block text-sm">Hosting service<select className={input} required value={service} disabled={busy} onChange={e=>{setService(e.target.value);setStatus(null);setRepos(null);setMessage('');}}><option value="">Choose a service</option>{services.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><button className={button} disabled={busy||!service}>Load source status</button></form>
  {status?<>
   <div className="rounded-lg border p-3 text-sm">{status.repository?<><p className="font-medium">{status.repository.full_name} · branch {status.repository.branch}</p><p className="text-xs text-slate-500">{status.repository.write?'Read and write access':'Read-only access: export is unavailable'}</p></>:<p>No repository connected.</p>}{status.current?<p className="mt-2 text-xs text-slate-500">Latest staged release: {new Date(status.current.released*1000).toLocaleString()} · not published to your live site yet</p>:null}</div>
   {!readOnly&&repos?<div className="space-y-3 border-t pt-4"><label className="block text-sm">{status.repository?'Switch to repository':'Repository'}<select className={input} value={repo} disabled={busy} onChange={e=>setRepo(e.target.value)}><option value="">Choose an authorized repository</option>{repos.available.map(r=><option key={r.repository_id} value={String(r.repository_id)}>{r.full_name}{r.write?'':' (read-only)'}</option>)}</select>{!repos.available.length?<span className="text-xs text-slate-500">No repositories are authorized for your account yet. Ask support to enroll your GitHub installation.</span>:null}</label>
    <label className="block text-sm">Branch<input className={input} value={branch} onChange={e=>setBranch(e.target.value)} maxLength={200} disabled={busy}/></label>
    <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirm} disabled={busy} onChange={e=>setConfirm(e.target.checked)}/>I understand this changes where future deploys and exports use code from. Existing website files are not deleted.</label>
    <div className="flex flex-wrap gap-3">{status.repository?<><button type="button" className={button} disabled={busy||!confirm||!repo||running} onClick={()=>void run(()=>change('source.switch'))}>Switch repository</button><button type="button" className={quiet} disabled={busy||!confirm||running} onClick={()=>void run(()=>change('source.disconnect'))}>Disconnect</button></>:<button type="button" className={button} disabled={busy||!confirm||!repo} onClick={()=>void run(()=>change('source.connect'))}>Connect repository</button>}</div></div>:null}
   {!readOnly?<div className="space-y-3 border-t pt-4"><div className="flex flex-wrap gap-3"><button type="button" className={button} disabled={busy||!status.repository||active} onClick={()=>void run(()=>request('deploy',null))}>Request deploy from GitHub</button></div>
    {uploadEnabled?<label className="block text-sm">Upload website ZIP (max 64 MB)<input className={input} type="file" accept=".zip,application/zip" disabled={busy} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void run(()=>upload(file));}}/></label>:<p className="text-xs text-slate-500">ZIP upload is not enabled yet.</p>}</div>:null}
   {status.trees.length?<div className="space-y-2 border-t pt-4"><h3 className="text-sm font-medium">Stored website files</h3><ul className="space-y-2">{status.trees.map(t=><li key={t.id} className="rounded-lg border p-3 text-sm"><p>{t.kind==='zip'?'ZIP upload':'GitHub fetch'} · {t.files} files · {t.state==='staged'?'staged, not live':'released, not live'}</p><p className="break-all text-xs text-slate-500">Manifest {t.manifest_sha256}</p>
    {!readOnly?<div className="mt-2 flex flex-wrap gap-2">{t.kind==='zip'&&t.state==='staged'?<button type="button" className={quiet} disabled={busy||active} onClick={()=>void run(()=>request('deploy',t.id))}>Request deploy</button>:null}{status.repository?.write?<button type="button" className={quiet} disabled={busy||active} onClick={()=>void run(()=>request('export',t.id))}>Request export to GitHub</button>:null}{t.state==='staged'?<button type="button" className={quiet} disabled={busy||active} onClick={()=>void run(()=>discard(t.id))}>Remove</button>:null}</div>:null}</li>)}</ul></div>:null}
   {status.jobs.length?<div className="space-y-2 border-t pt-4"><h3 className="text-sm font-medium">Recent requests</h3><ul className="space-y-2">{status.jobs.map(j=><li key={j.id} className="rounded-lg border p-3 text-sm"><p>{j.operation==='deploy'?'Deploy':'Export'} · {labels[j.state]}</p>{j.result&&j.result.error?<p className="text-xs text-red-600">Reason: {String(j.result.error).replaceAll('_',' ')}</p>:null}{j.result&&Array.isArray(j.result.paths)?<p className="text-xs text-red-600">Possible secrets found in: {j.result.paths.join(', ')}. Nothing was sent to GitHub.</p>:null}<details className="text-xs text-slate-500"><summary>Owner approval details</summary><p className="mt-2 break-all">Request: {j.id}</p><p className="mt-1 break-all">Digest: {j.digest}</p></details></li>)}</ul></div>:null}
  </>:null}
  <div aria-live="polite">{busy?<p className="text-sm">Working…</p>:null}{message?<p className="text-sm text-slate-700">{message}</p>:null}</div>
 </section>;
}
