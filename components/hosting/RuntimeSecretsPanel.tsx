"use client";
import {useRef,useState} from 'react';
import {secretKey,secretList,secretName,type SecretList} from '@/lib/hosting/managedSchema';
import {sealSecret,SecretRefused} from '@/lib/hosting/secretSeal';
const button='rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50';
const quiet='rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-50';
const input='mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-900';
// Values are encrypted in this browser to the server's key and can never be read back: the list shows names only. Changes apply at the next activation.
export function RuntimeSecretsPanel({scope,services,readOnly=false,keyFingerprint}:{scope:'owner'|'client';services:{id:string;name:string}[];readOnly?:boolean;keyFingerprint:string|null}){
 const [service,setService]=useState(services[0]?.id??''),[list,setList]=useState<SecretList|null>(null),[name,setName]=useState(''),[value,setValue]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const lock=useRef(false);
 async function call(command:unknown){
  const response=await fetch('/api/hosting-services?scope='+scope,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(command),redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error();return response.json();
 }
 async function run(work:()=>Promise<void>){
  if(lock.current)return;lock.current=true;setBusy(true);setMessage('');
  try{await work();}catch(error){setMessage(error instanceof SecretRefused?error.message:'Could not confirm this step. Reload the list before trying again.');}
  finally{lock.current=false;setBusy(false);}
 }
 async function load(){const next=secretList.parse(await call({action:'source.secret_list',service}));if(next.service!==service)throw Error();setList(next);}
 async function save(){
  if(!secretName.safeParse(name).success)throw new SecretRefused('Use capital letters, digits and underscores (for example DATABASE_URL). Reserved names are not allowed.');
  const key=secretKey.parse(await call({action:'source.secret_key',service}));if(key.service!==service)throw Error();
  const blob=await sealSecret({publicKeyPem:key.public_key,pinnedFingerprint:keyFingerprint,service,name,value});
  const next=secretList.parse(await call({action:'source.secret_put',service,name,blob}));setList(next);setValue('');setName('');
  setMessage('Saved. The value is stored encrypted and cannot be shown again. It reaches the website the next time you activate a release.');
 }
 async function remove(target:string){const next=secretList.parse(await call({action:'source.secret_delete',service,name:target}));setList(next);setMessage('Removed. This applies at the next activation.');}
 return <section className="space-y-3 rounded-xl border border-slate-200 p-4" aria-labelledby="runtime-secrets">
  <h2 id="runtime-secrets" className="text-lg font-semibold">Runtime secrets</h2>
  <p className="text-sm text-slate-600">Private settings such as API keys or database URLs for a Next.js website. They are encrypted in your browser, never shown again, never used in builds and never written to logs.</p>
  {!keyFingerprint?<p className="text-sm text-amber-700">Not available yet: the server key fingerprint has not been configured by the operator.</p>:<>
  <label className="block text-sm">Website<select className={input} value={service} onChange={e=>{setService(e.target.value);setList(null);}}>{services.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
  <button type="button" className={quiet} disabled={busy||!service} onClick={()=>void run(load)}>Show variable names</button>
  {message?<p role="status" className="text-sm text-slate-700">{message}</p>:null}
  {list?<ul className="divide-y divide-slate-100 text-sm">{list.secrets.length===0?<li className="py-1 text-slate-600">No runtime variables.</li>:list.secrets.map(s=><li key={s.name} className="flex items-center justify-between py-1"><span className="font-mono">{s.name}</span>
   {readOnly?null:<button type="button" className={quiet} disabled={busy} onClick={()=>void run(()=>remove(s.name))}>Remove</button>}</li>)}</ul>:null}
  {!readOnly?<form className="space-y-2" autoComplete="off" onSubmit={e=>{e.preventDefault();void run(save);}}>
   <label className="block text-sm">Name<input className={input+' font-mono'} value={name} onChange={e=>setName(e.target.value.toUpperCase())} placeholder="DATABASE_URL" autoComplete="off" spellCheck={false}/></label>
   <label className="block text-sm">Value<input type="password" className={input} value={value} onChange={e=>setValue(e.target.value)} autoComplete="new-password" spellCheck={false}/></label>
   <button type="submit" className={button} disabled={busy||!name||!value}>Encrypt and save</button></form>:null}
  </>}
 </section>;
}
