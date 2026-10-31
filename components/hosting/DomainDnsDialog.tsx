'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {Globe,X,RefreshCw,Pencil,Trash2} from 'lucide-react';
import type {DomainInfo,Intent} from '@/lib/hosting/registrar/schema';
type RecordValue=Extract<Intent,{kind:'dns_add'}>['record'];
export type ConfirmedChange={id:string;domain:string;intent:Intent};
const types=['a','aaaa','cname','mx','txt','caa','srv','ns'] as const;
const empty:RecordValue={host:'@',type:'a',value:'',priority:0};
export function editableDnsRecord(raw:Record<string,unknown>):RecordValue|null{
 const allowed=new Set(['record_type','record_value1','record_value2','sub_host']);
 if(Object.entries(raw).some(([key,value])=>!allowed.has(key)&&value!==null&&value!==''&&value!==undefined))return null;
 const type=String(raw.record_type??'').toLowerCase();
 if(!types.includes(type as typeof types[number])||typeof raw.record_value1!=='string'||!raw.record_value1)return null;
 const extra=String(raw.record_value2??'');
 if(type!=='mx'&&extra!=='')return null;
 if(type==='mx'&&extra!==''&&!/^\d+$/.test(extra))return null;
 const priority=Number(extra)||0;if(priority<0||priority>65535)return null;
 if(raw.sub_host!==undefined&&typeof raw.sub_host!=='string')return null;
 return {host:typeof raw.sub_host==='string'?raw.sub_host:'@',type:type as RecordValue['type'],value:raw.record_value1,priority};
}
function equal(a:RecordValue,b:RecordValue){return a.host===b.host&&a.type===b.type&&a.value===b.value&&a.priority===b.priority;}
export function DomainDnsDialog(p:{open:boolean;domain:DomainInfo;busy:boolean;reviewing:boolean;confirmed:ConfirmedChange|null;message:string;failed:boolean;onClose:()=>void;onRefresh:()=>void;onPrepare:(intent:Intent)=>void;children?:ReactNode}){
 const dialog=useRef<HTMLDialogElement>(null),form=useRef<HTMLFormElement>(null),seen=useRef('');
 const [editing,setEditing]=useState<RecordValue|null>(null),[draft,setDraft]=useState<RecordValue>(empty),[step,setStep]=useState<'remove'|'add'>('remove');
 const disabled=p.busy||p.reviewing,available=p.domain.glue.glue_type.toLowerCase()==='dns';
 const records=[...(p.domain.glue.dns_main_list??[]),...(p.domain.glue.dns_sub_list??[])];
 useEffect(()=>{const node=dialog.current;if(!node)return;if(p.open&&!node.open)node.showModal();if(!p.open&&node.open)node.close();},[p.open]);
 useEffect(()=>{
  const change=p.confirmed;if(!change||seen.current===change.id)return;seen.current=change.id;if(change.domain!==p.domain.name)return;
  if(editing&&step==='remove'&&change.intent.kind==='dns_remove'&&equal(editing,change.intent.record))setStep('add');
  if(change.intent.kind==='dns_add'&&equal(draft,change.intent.record)){setEditing(null);setDraft(empty);setStep('remove');}
 },[p.confirmed,p.domain.name,editing,draft,step]);
 return <dialog ref={dialog} className="hms-dns-dialog" aria-labelledby="dns-dialog-title" onCancel={e=>{e.preventDefault();if(!p.busy)p.onClose();}} onClose={p.onClose} onClick={e=>{if(!p.busy&&e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)p.onClose();}}}>
 <header className="hms-dns-heading"><div className="hms-dns-title"><span><Globe size={22}/></span><div><h2 id="dns-dialog-title">DNS records</h2><p>{p.domain.name}</p></div></div><div className="hms-domain-button-row"><button className="hms-domain-secondary" disabled={p.busy||p.reviewing} onClick={p.onRefresh}><RefreshCw size={15}/>Refresh</button><button className="hms-icon-button" disabled={p.busy} aria-label="Close DNS editor" onClick={p.onClose}><X size={20}/></button></div></header>
 <div className="hms-dns-body" aria-busy={p.busy}>
 <div className="hms-dns-context"><span className="hms-domain-pill muted">{p.domain.glue.glue_type}</span>{p.domain.glue.ttl!==undefined&&<span>Zone TTL: {p.domain.glue.ttl}</span>}<p>Review each change before saving it to your registrar.</p></div>
 {!available&&<p className="hms-domain-notice">This domain uses external DNS. Manage its records at the current DNS provider.</p>}
 {p.message&&<p role={p.failed?'alert':'status'} className={'hms-domain-message '+(p.failed?'is-error':'')}>{p.message}</p>}
 <div className="hms-dns-records"><table><thead><tr><th>Type</th><th>Host</th><th>Value</th><th>Priority</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{records.map((raw,i)=>{const record=editableDnsRecord(raw);return <tr key={i}><td><span className="hms-domain-pill blue">{String(raw.record_type??'').toUpperCase()}</span></td><td>{String(raw.sub_host??'@')}</td><td className="hms-dns-value">{String(raw.record_value1??'')}{raw.record_value2&&String(raw.record_type).toLowerCase()!=='mx'?<small>{String(raw.record_value2)}</small>:null}</td><td>{String(raw.record_type).toLowerCase()==='mx'?String(raw.record_value2??0):'—'}</td><td>{record?<div className="hms-domain-button-row"><button className="hms-icon-button" aria-label={'Edit '+record.host+' '+record.type.toUpperCase()+' record'} disabled={disabled||!available||Boolean(editing)} onClick={()=>{setEditing(record);setDraft(record);setStep('remove');form.current?.scrollIntoView({block:'nearest',behavior:'smooth'});}}><Pencil size={15}/></button><button className="hms-icon-button" aria-label={'Remove '+record.host+' '+record.type.toUpperCase()+' record'} disabled={disabled||!available||Boolean(editing)} onClick={()=>p.onPrepare({kind:'dns_remove',record})}><Trash2 size={15}/></button></div>:<small>Manage in Dynadot</small>}</td></tr>;})}</tbody></table>{!records.length&&<p className="hms-dns-no-records">No DNS records were returned.</p>}</div>
 {available&&<form ref={form} className="hms-domain-form hms-dns-form" onSubmit={e=>{e.preventDefault();if(editing&&step==='remove')p.onPrepare({kind:'dns_remove',record:editing});else p.onPrepare({kind:'dns_add',record:draft});}}>
 <h3>{editing?'Edit DNS record':'Add DNS record'}</h3>
 {editing&&<p className="hms-domain-notice">{step==='remove'?'Step 1 of 2: review removal of the original record. The replacement requires a separate review. Keep this editor open until both steps are complete.':'Step 2 of 2: the original record was removed. Review and add your replacement now.'}</p>}
 <div className="hms-dns-fields"><label>Type<select aria-label="DNS record type" value={draft.type} disabled={disabled} onChange={e=>setDraft({...draft,type:e.target.value as RecordValue['type']})}>{types.map(t=><option key={t} value={t}>{t.toUpperCase()}</option>)}</select></label><label>Host<input aria-label="DNS record host" value={draft.host} required maxLength={253} disabled={disabled} onChange={e=>setDraft({...draft,host:e.target.value.toLowerCase()})}/></label><label>Value<input aria-label="DNS record value" value={draft.value} required maxLength={4096} disabled={disabled} onChange={e=>setDraft({...draft,value:e.target.value})}/></label>{draft.type==='mx'&&<label>Priority<input aria-label="DNS record priority" type="number" min={0} max={65535} value={draft.priority} disabled={disabled} onChange={e=>setDraft({...draft,priority:Number(e.target.value)})}/></label>}</div>
 <div className="hms-domain-button-row"><button className="hms-primary" disabled={disabled}>{editing?(step==='remove'?'Review original removal':'Review replacement'):'Review new record'}</button>{editing&&<button className="hms-domain-secondary" type="button" disabled={disabled} onClick={()=>{setEditing(null);setDraft(empty);setStep('remove');}}>{step==='add'?'Clear draft':'Cancel edit'}</button>}</div>
 {editing&&step==='add'&&<p>Clearing the draft does not restore the removed record.</p>}
 </form>}
 {p.children}
 </div></dialog>;
}
