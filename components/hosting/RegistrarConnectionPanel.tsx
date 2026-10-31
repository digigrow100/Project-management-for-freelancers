'use client';
import {useRef,useState} from 'react';
import Link from 'next/link';
import {registrarAction} from '@/lib/hosting/registrar/actions';

const field='mt-2 w-full rounded-lg border border-base-600 bg-base-900 px-3 py-2 text-sm';
const button='rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50';
export function RegistrarConnectionPanel({connected,initialMode,verifiedAt}:{connected:boolean;initialMode:string;verifiedAt:string|null}){
 const [ready,setReady]=useState(connected),[mode,setMode]=useState(initialMode),[lastTest,setLastTest]=useState(verifiedAt),[editing,setEditing]=useState(!connected),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[failed,setFailed]=useState(false);
 const lock=useRef(false),form=useRef<HTMLFormElement>(null);
 async function connect(values:FormData){
  if(lock.current)return;
  lock.current=true;setBusy(true);setMessage('');setFailed(false);
  try{
   const result=await registrarAction(values);
   if(!result.ok){setFailed(true);setMessage(result.error);return;}
   if('mode'in result){setReady(true);setMode(result.mode??'production');setLastTest(null);form.current?.reset();setEditing(false);setMessage('Connection tested and saved. Open Domains to sync your account.');}
  }catch{setFailed(true);setMessage('The connection could not be confirmed. Please try again.');}
  finally{lock.current=false;setBusy(false);}
 }
 return <section className="space-y-6 rounded-xl border border-base-700 bg-base-850 p-6">
 <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-semibold">Dynadot connection</h2><p className="mt-2 text-sm text-neutral-500">Connect your registrar account once, then manage its domains from the Domains page.</p></div><span className={'rounded-full px-3 py-1 text-sm font-medium '+(ready?'bg-emerald-50 text-emerald-700':'bg-amber-50 text-amber-800')}>{ready?'Connected':'Not connected'}</span></div>
 {ready&&<div className="flex flex-wrap items-center gap-3 rounded-lg border border-base-700 p-4"><div className="mr-auto text-sm"><p className="font-medium">{mode==='sandbox'?'Sandbox account':'Live account'}</p>{lastTest&&<p className="mt-1 text-neutral-500">Last saved connection test: {new Date(lastTest).toISOString().slice(0,16).replace('T',' ')+' UTC'}</p>}</div><Link href="/hosting/registrar" className="font-medium text-blue-600 hover:underline">Open domains</Link>{!editing&&<button className="rounded-lg border border-base-600 px-4 py-2 text-sm" onClick={()=>setEditing(true)}>Update connection</button>}</div>}
 {editing&&<div className="space-y-5 border-t border-base-700 pt-5"><div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-900"><p>Get your Production or Sandbox key and matching secret from <a className="font-medium underline" href="https://www.dynadot.com/account/domain/setting/api.html" target="_blank" rel="noreferrer">Dynadot → Tools → API</a>.</p><p className="mt-2">Both values are encrypted when saved and never displayed again. If your account restricts API access by IP, allow the server’s outgoing IP in Dynadot.</p></div>
 <form ref={form} className="grid gap-5 sm:grid-cols-2" action={values=>void connect(values)}>
 <input type="hidden" name="action" value="connect"/>
 <label className="text-sm font-medium">API key<input className={field} name="key" type="password" required autoComplete="off" maxLength={512} disabled={busy}/></label>
 <label className="text-sm font-medium">API secret<input className={field} name="secret" type="password" required autoComplete="new-password" maxLength={512} disabled={busy}/></label>
 <label className="text-sm font-medium">Account mode<select className={field} name="mode" defaultValue={mode} disabled={busy}><option value="production">Live account</option><option value="sandbox">Sandbox account</option></select></label>
 <div className="flex flex-wrap items-end gap-3"><button className={button} disabled={busy}>{busy?'Testing connection…':'Test and save connection'}</button>{ready&&<button type="button" className="rounded-lg border border-base-600 px-4 py-2 text-sm" disabled={busy} onClick={()=>{form.current?.reset();setEditing(false);setMessage('');}}>Cancel</button>}</div>
 </form></div>}
 {message&&<p role={failed?'alert':'status'} className={'text-sm '+(failed?'text-red-700':'text-blue-700')}>{message}</p>}
 </section>;
}
