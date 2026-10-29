"use client";
import {useRef,useState} from 'react';
import {sourceStatus,sourceRepositories,sourceJob,sourceTreeSummary,sourceUploadTicket,buildVariables,SOURCE_UPLOAD_MAX_BYTES,type SourceStatus,type SourceRepositories} from '@/lib/hosting/managedSchema';
const button='rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50';
const quiet='rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-50';
const input='mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-900';
const operations:Record<string,string>={deploy:'Stage from GitHub or ZIP',export:'Export to GitHub',publish:'Publish',rollback:'Roll back',recover:'Recovery',build:'Isolated Next.js build'};
const labels:Record<string,string>={queued:'Awaiting owner approval',applying:'In progress',done:'Finished',failed:'Not applied — nothing is left half-changed',uncertain:'Review required — do not retry automatically',cancelled:'Cancelled because the repository changed'};
const runtimes:Record<string,string>={static:'Static website',php:'PHP website',nextjs:'Next.js — built in an isolated environment, then activated after owner approval',node:'Node.js app — not supported (only Next.js standalone builds)',unknown:'No index page found'};
// Plain-language Next.js stages, taken only from what the private service reported.
export const nextjsStates:Record<string,{label:string;tone:string}>={none:{label:'Not built',tone:'text-slate-700'},queued:{label:'Build queued',tone:'text-blue-700'},building:{label:'Building in an isolated environment',tone:'text-blue-700'},
 built:{label:'Built — ready to request activation',tone:'text-slate-700'},awaiting_approval:{label:'Awaiting owner approval to activate',tone:'text-blue-700'},starting:{label:'Starting the new release',tone:'text-blue-700'},
 live:{label:'Live on the server',tone:'text-green-700'},failed:{label:'Failed — nothing was changed on the live site',tone:'text-red-700'},rolled_back:{label:'Rolled back — the previous release is still live',tone:'text-amber-700'},uncertain:{label:'Uncertain — review required',tone:'text-amber-700'}};
type Job=SourceStatus['jobs'][number];
// One plain-language state for the whole website, derived only from what the private service reported.
export function lifecycle(status:SourceStatus){
 const jobs=status.jobs,publishing=(j:Job)=>['publish','rollback','recover'].includes(j.operation);
 if(status.publication.state==='uncertain'||jobs.some(j=>j.state==='uncertain'))return {label:'Uncertain — review required',tone:'text-amber-700'};
 if(status.nextjs.state!=='none'){
  // 'live' is only ever shown when the publication record carries health evidence (also enforced by the schema).
  const stage=status.nextjs.state==='live'&&!(status.publication.live_verified&&status.nextjs.live)?'failed':status.nextjs.state;
  return nextjsStates[stage];
 }
 const running=jobs.find(j=>j.state==='applying');
 if(running)return {label:publishing(running)?'Publishing':'Staging files',tone:'text-blue-700'};
 if(jobs.some(j=>j.state==='queued'))return {label:'Awaiting owner approval',tone:'text-blue-700'};
 if(status.publication.state==='live'&&status.publication.live_verified)return {label:'Live on the server',tone:'text-green-700'};
 const latest=jobs.find(publishing);
 if(latest&&latest.state==='failed')return {label:'Failed — the previous site was restored',tone:'text-red-700'};
 if(status.trees.some(t=>t.state==='released'))return {label:'Staged — not published',tone:'text-slate-700'};
 if(status.trees.some(t=>t.state==='staged'))return {label:'Uploaded — not published',tone:'text-slate-700'};
 return {label:'Not published',tone:'text-slate-700'};
}
export function WebsiteSourcePanel({scope,services,readOnly=false,uploadEnabled=false,publishingEnabled=false,nextjsEnabled=false}:{scope:'owner'|'client';services:{id:string;name:string}[];readOnly?:boolean;uploadEnabled?:boolean;publishingEnabled?:boolean;nextjsEnabled?:boolean}){
 const [service,setService]=useState(''),[status,setStatus]=useState<SourceStatus|null>(null),[repos,setRepos]=useState<SourceRepositories|null>(null);
 const [variables,setVariables]=useState<Record<string,string>>({});
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
 // Keep the key only while a submission is unresolved; it is bound to the binding version and the live release so a retry after a change cannot hit an idempotency conflict.
 function keyFor(parts:(string|number|null)[]){const k=parts.join(':');if(!keys.current.has(k))keys.current.set(k,crypto.randomUUID());return {k,key:keys.current.get(k)!};}
 async function request(operation:'deploy'|'export'|'publish'|'rollback',tree:string|null){
  const {k,key}=keyFor([service,status?.version??0,status?.publication.live_tree??null,operation,tree??'github']);
  const job=sourceJob.parse(await call({action:'source.request',service,operation,request_key:key,tree}));
  keys.current.delete(k);
  setMessage('Request recorded ('+job.id+'). It needs separate owner approval. Nothing has changed on the website yet.');await load();
 }
 // One NAME=value per line. These are plain build settings, not secrets: they can appear in the website's public code.
 function parseVariables(text:string){
  const entries:Record<string,string>={};
  for(const line of text.split('\n')){if(!line.trim())continue;const at=line.indexOf('=');if(at<1)throw Error();entries[line.slice(0,at).trim()]=line.slice(at+1);}
  return buildVariables.parse(entries);
 }
 async function build(tree:string){
  let parsed:Record<string,string>;
  try{parsed=parseVariables(variables[tree]??'');}catch{setMessage('Build settings must be NAME=value lines using plain, non-secret values. Secrets and reserved names are not allowed in a build.');return;}
  const {k,key}=keyFor([service,status?.version??0,'build',tree,JSON.stringify(parsed)]);
  const job=sourceJob.parse(await call({action:'source.build',service,tree,request_key:key,variables:parsed}));
  if(job.operation!=='build'||job.tree!==tree)throw Error();
  keys.current.delete(k);setMessage('Build requested ('+job.id+'). It runs in an isolated environment and changes nothing on the live website. Activation needs separate owner approval.');await load();
 }
 async function recover(jobId:string){
  const {k,key}=keyFor([service,'recover',jobId]);
  const job=sourceJob.parse(await call({action:'source.recover',service,job:jobId,request_key:key}));
  keys.current.delete(k);setMessage('Recovery requested ('+job.id+'). It needs owner approval; the website is left as it is until then.');await load();
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
 const interrupted=status?.jobs.find(j=>j.state==='uncertain'&&['publish','rollback'].includes(j.operation));
 const state=status?lifecycle(status):null;
 return <section className="space-y-5 rounded-xl border border-blue-200 bg-white p-5 text-slate-900"><h2 className="text-lg font-semibold">Website source</h2>
  <p className="text-sm text-slate-600">Connect a GitHub repository, or upload a ZIP of your website. Staging, publishing, rollback and exports are checked on the server and need separate owner approval. A site is shown as live only after the server has written the files and answered a health check.</p>
  <form onSubmit={e=>{e.preventDefault();void run(()=>load());}} className="space-y-3"><label className="block text-sm">Hosting service<select className={input} required value={service} disabled={busy} onChange={e=>{setService(e.target.value);setStatus(null);setRepos(null);setMessage('');}}><option value="">Choose a service</option>{services.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><button className={button} disabled={busy||!service}>Load source status</button></form>
  {status&&state?<>
   <div className="rounded-lg border p-3 text-sm"><p className={'font-medium '+state.tone} aria-live="polite">Website status: {state.label}</p>
    {status.publication.state==='live'&&status.publication.health?<p className="mt-1 text-xs text-slate-500">Served by this server · {runtimes[status.publication.runtime??'unknown']} · health checked {new Date(status.publication.health.checked*1000).toLocaleString()}. DNS and SSL are shown on the Domains page.</p>:null}
    {status.repository?<p className="mt-2">{status.repository.full_name} · branch {status.repository.branch}<span className="block text-xs text-slate-500">{status.repository.write?'Read and write access':'Read-only access: export is unavailable'}</span></p>:<p className="mt-2">No repository connected.</p>}</div>
   {!readOnly&&repos?<div className="space-y-3 border-t pt-4"><label className="block text-sm">{status.repository?'Switch to repository':'Repository'}<select className={input} value={repo} disabled={busy} onChange={e=>setRepo(e.target.value)}><option value="">Choose an authorized repository</option>{repos.available.map(r=><option key={r.repository_id} value={String(r.repository_id)}>{r.full_name}{r.write?'':' (read-only)'}</option>)}</select>{!repos.available.length?<span className="text-xs text-slate-500">No repositories are authorized for your account yet. Ask support to enroll your GitHub installation.</span>:null}</label>
    <label className="block text-sm">Branch<input className={input} value={branch} onChange={e=>setBranch(e.target.value)} maxLength={200} disabled={busy}/></label>
    <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirm} disabled={busy} onChange={e=>setConfirm(e.target.checked)}/>I understand this changes where future deploys and exports use code from. Existing website files are not deleted.</label>
    <div className="flex flex-wrap gap-3">{status.repository?<><button type="button" className={button} disabled={busy||!confirm||!repo||running} onClick={()=>void run(()=>change('source.switch'))}>Switch repository</button><button type="button" className={quiet} disabled={busy||!confirm||running} onClick={()=>void run(()=>change('source.disconnect'))}>Disconnect</button></>:<button type="button" className={button} disabled={busy||!confirm||!repo} onClick={()=>void run(()=>change('source.connect'))}>Connect repository</button>}</div></div>:null}
   {!readOnly?<div className="space-y-3 border-t pt-4"><div className="flex flex-wrap gap-3"><button type="button" className={button} disabled={busy||!status.repository||active} onClick={()=>void run(()=>request('deploy',null))}>Stage latest from GitHub</button>
    {publishingEnabled&&status.publication.rollback_available?<button type="button" className={quiet} disabled={busy||active} onClick={()=>void run(()=>request('rollback',null))}>Request rollback to the previous release</button>:null}
    {publishingEnabled&&interrupted?<button type="button" className={button} disabled={busy||status.jobs.some(j=>j.state!=='uncertain'&&['queued','applying'].includes(j.state))} onClick={()=>void run(()=>recover(interrupted.id))}>Request recovery of the interrupted publication</button>:null}</div>
    {uploadEnabled?<label className="block text-sm">Upload website ZIP (max 64 MB)<input className={input} type="file" accept=".zip,application/zip" disabled={busy} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void run(()=>upload(file));}}/></label>:<p className="text-xs text-slate-500">ZIP upload is not enabled yet.</p>}</div>:null}
   {status.trees.length?<div className="space-y-2 border-t pt-4"><h3 className="text-sm font-medium">Stored website files</h3><ul className="space-y-2">{status.trees.map(t=>{
    const live=status.publication.state==='live'&&status.publication.live_verified&&status.publication.live_tree===t.id;
    return <li key={t.id} className="rounded-lg border p-3 text-sm"><p>{t.kind==='zip'?'ZIP upload':'GitHub fetch'} · {t.files} files · {live?<strong className="text-green-700">live on the server</strong>:t.state==='staged'?'uploaded, not published':'staged, not published'}</p>
     <p className="text-xs text-slate-500">{runtimes[t.runtime]}{!t.publishable&&t.state==='released'?(t.buildable?' · not built yet':' · staged only; it will not be published by copying files'):''}</p><p className="break-all text-xs text-slate-500">Manifest {t.manifest_sha256}</p>
     {status.nextjs.builds.filter(b=>b.tree===t.id).map(b=><div key={b.id} className="mt-2 rounded border border-slate-200 p-2 text-xs"><p className={b.state==='failed'?'text-red-700':b.state==='built'?'text-green-700':'text-blue-700'}>Build {b.id.slice(0,8)} · {b.state==='built'?'built and verified':b.state==='failed'?'failed':'in progress'}{b.next_version?' · Next.js '+b.next_version:''}{b.files!==null?' · '+b.files+' files':''}</p>
      {b.message?<p className="text-red-700">{b.message}</p>:null}{b.artifact_sha256?<p className="break-all text-slate-500">Artifact {b.artifact_sha256}</p>:null}{b.variable_names.length?<p className="text-slate-500">Build settings: {b.variable_names.join(', ')} (plain values, not secrets)</p>:null}
      {b.summary?<details><summary className="cursor-pointer text-slate-600">Build log (secrets are removed)</summary><pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2">{b.summary}</pre></details>:null}</div>)}
     {!readOnly&&nextjsEnabled&&publishingEnabled&&t.buildable?<div className="mt-2 space-y-2"><label className="block text-xs">Build settings (optional, one NAME=value per line — plain values only, never passwords or keys)<textarea className={input+' font-mono text-xs'} rows={3} maxLength={4000} disabled={busy} value={variables[t.id]??''} onChange={e=>setVariables({...variables,[t.id]:e.target.value})}/></label>
      <button type="button" className={quiet} disabled={busy||active} onClick={()=>void run(()=>build(t.id))}>Build in isolated environment</button></div>:null}
     {!readOnly?<div className="mt-2 flex flex-wrap gap-2">{t.kind==='zip'&&t.state==='staged'?<button type="button" className={quiet} disabled={busy||active} onClick={()=>void run(()=>request('deploy',t.id))}>Request staging</button>:null}
      {publishingEnabled&&t.state==='released'&&t.publishable&&!live&&(t.runtime!=='nextjs'||nextjsEnabled)?<button type="button" className={button} disabled={busy||active} onClick={()=>void run(()=>request('publish',t.id))}>{t.runtime==='nextjs'?'Request activation (needs owner approval)':'Request publish'}</button>:null}
      {status.repository?.write?<button type="button" className={quiet} disabled={busy||active} onClick={()=>void run(()=>request('export',t.id))}>Request export to GitHub</button>:null}{t.state==='staged'?<button type="button" className={quiet} disabled={busy||active} onClick={()=>void run(()=>discard(t.id))}>Remove</button>:null}</div>:null}</li>;})}</ul></div>:null}
   {status.jobs.length?<div className="space-y-2 border-t pt-4"><h3 className="text-sm font-medium">Recent requests</h3><ul className="space-y-2">{status.jobs.map(j=><li key={j.id} className="rounded-lg border p-3 text-sm"><p>{operations[j.operation]} · {j.state==='done'&&['publish','rollback'].includes(j.operation)?'Live on the server — health checked':j.state==='done'&&j.operation==='build'?'Built and verified — not live':j.state==='queued'&&j.operation==='build'?'Waiting for the isolated builder':labels[j.state]}</p>
    {j.result&&j.result.error?<p className="text-xs text-red-600">Reason: {String(j.result.error).replaceAll('_',' ')}{j.result.rolled_back?' · the previous release was restored':''}</p>:null}{j.result&&Array.isArray(j.result.paths)?<p className="text-xs text-red-600">Files involved: {j.result.paths.join(', ')}. Nothing was changed.</p>:null}
    <details className="text-xs text-slate-500"><summary>Owner approval details</summary><p className="mt-2 break-all">Request: {j.id}</p><p className="mt-1 break-all">Digest: {j.digest}</p></details></li>)}</ul></div>:null}
  </>:null}
  <div aria-live="polite">{busy?<p className="text-sm">Working…</p>:null}{message?<p className="text-sm text-slate-700">{message}</p>:null}</div>
 </section>;
}
