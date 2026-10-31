'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {Globe,RefreshCw,Settings,History} from 'lucide-react';
import {registrarAction} from '@/lib/hosting/registrar/actions';
import type {DomainInfo,Intent} from '@/lib/hosting/registrar/schema';
import type {InventoryFilter,InventoryRow,InventorySummary} from '@/lib/hosting/registrar/presentation';
import {DomainInventory,DomainSummaryCards} from './DomainInventory';
import {DomainDetailsPanel,type DetailTab} from './DomainDetailsPanel';
import {DomainDnsDialog,type ConfirmedChange} from './DomainDnsDialog';
import {DomainReview,type DomainReviewData} from './DomainReview';
import {DomainHistory,type DomainOperation} from './DomainHistory';

type Inventory={rows:InventoryRow[];summary:InventorySummary|null;total:number;pageSize:number;asOf:number;syncAt:string|null;needsReconcile:boolean};
const empty:Inventory={rows:[],summary:null,total:0,pageSize:25,asOf:0,syncAt:null,needsReconcile:false};
export function RegistrarPanel({connected,initialMode,lastSync}:{connected:boolean;initialMode:string;lastSync:string|null}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[failed,setFailed]=useState(false),[mode,setMode]=useState(initialMode);
 const [inventory,setInventory]=useState<Inventory>(empty),[page,setPage]=useState(1),[search,setSearch]=useState(''),[filter,setFilter]=useState<InventoryFilter>('all');
 const [domain,setDomain]=useState<DomainInfo|null>(null),[tab,setTab]=useState<DetailTab>('overview'),[dnsOpen,setDnsOpen]=useState(false);
 const [review,setReview]=useState<DomainReviewData|null>(null),[submitted,setSubmitted]=useState(false),[confirmed,setConfirmed]=useState<ConfirmedChange|null>(null);
 const [operations,setOperations]=useState<DomainOperation[]>([]),[historyOpen,setHistoryOpen]=useState(false);
 const lock=useRef(false);
 async function request(action:string,values:Record<string,string>={}){const f=new FormData();f.set('action',action);for(const [k,v]of Object.entries(values))f.set(k,v);return registrarAction(f);}
 async function run(work:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setMessage('');setFailed(false);try{await work();}catch{setFailed(true);setMessage('Could not confirm the answer. Check operation status before trying again.');}finally{lock.current=false;setBusy(false);}}
 function result(r:Awaited<ReturnType<typeof registrarAction>>){if(!r.ok){setFailed(true);setMessage(r.error);return false;}return true;}
 async function load(target=page,term=search,view=filter){const r=await request('list',{page:String(target),search:term,filter:view});if(result(r)&&r.ok&&'rows'in r){setInventory({rows:r.rows as InventoryRow[],summary:r.summary,total:r.total,pageSize:r.pageSize,asOf:r.asOf,syncAt:r.syncAt,needsReconcile:r.needsReconcile});setMode(r.mode);setPage(target);}}
 async function history(silent=false){const r=await request('history');if(r.ok&&'operations'in r)setOperations(r.operations as DomainOperation[]);else if(!silent)result(r);}
 useEffect(()=>{if(connected)void run(()=>load(1,''));
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[connected]);
 async function prepare(change:Intent){if(!domain)return;await run(async()=>{setReview(null);const r=await request('prepare',{domain:domain.name,intent:JSON.stringify(change)});if(result(r)&&r.ok&&'review'in r){setReview(r.review as DomainReviewData);setSubmitted(false);}});}
 function recordConfirmation(r:Awaited<ReturnType<typeof registrarAction>>,active:DomainReviewData|null){
  if(r.ok&&'domain'in r&&r.domain&&domain?.name===r.domain.name)setDomain(r.domain);
  if(active){setConfirmed({id:active.id,domain:active.domain,intent:active.intent});setReview(null);setSubmitted(false);}
 }
 async function check(id:string){await run(async()=>{const r=await request('reconcile',{id});if(result(r)&&r.ok&&'message'in r){recordConfirmation(r,review?.id===id?review:null);setMessage(r.message??'Checked');}await history(true);await load();});}
 async function apply(confirmation:string){if(!review||submitted||lock.current)return;const active=review;setSubmitted(true);await run(async()=>{const r=await request('apply',{id:active.id,confirmation});if(result(r)&&r.ok&&'message'in r){recordConfirmation(r,active);setMessage(r.message??'Change confirmed');}await history(true);setHistoryOpen(true);await load();});}
 async function manage(name:string){await run(async()=>{const r=await request('details',{domain:name});if(result(r)&&r.ok&&'domain'in r){setDomain(r.domain!);setTab('overview');setDnsOpen(false);setReview(null);setSubmitted(false);}});}
 async function sync(){await run(async()=>{const start=await request('sync_start');if(!result(start)||!start.ok||!('run'in start)||typeof start.run!=='string')return;let next=1,count=0;while(next<=100000){const r=await request('sync',{page:String(next),run:start.run});if(!result(r)||!r.ok||!('hasNext'in r))return;count+=r.count??0;setMessage('Synced '+count+' of '+r.total+' domains.');if(!r.hasNext){await load(1);setMessage('Sync complete. All '+count+' domains checked.');return;}next=r.nextPage??next+1;await new Promise(resolve=>setTimeout(resolve,1100));}setFailed(true);setMessage('Sync stopped at the page limit. Contact the operator.');});}
 const reviewNode=review?<DomainReview review={review} busy={busy} submitted={submitted} onApply={value=>void apply(value)} onCancel={()=>setReview(null)} onCheck={()=>void check(review.id)}/>:null;
 const synced=inventory.syncAt??lastSync;
 return <div className="hms-domains">
 <div className="hms-domain-heading"><div><span className="hms-domain-connection"><span/>{connected?'Dynadot connected':'Registrar connection'}</span>{connected&&<p>{mode==='sandbox'?'Sandbox account':'Live account'}{synced?' · Last sync '+new Date(synced).toISOString().slice(0,16).replace('T',' ')+' UTC':''}</p>}</div><div className="hms-domain-button-row"><Link href="/hosting/settings/domains" className="hms-domain-settings"><Settings size={17}/>Domain settings</Link>{connected&&<><button className="hms-domain-secondary" disabled={busy} onClick={()=>void run(async()=>{await history();setHistoryOpen(value=>!value);})}><History size={16}/>History</button><button className="hms-primary" disabled={busy} onClick={()=>void sync()}><RefreshCw size={16} className={busy?'animate-spin':''}/>Sync domains</button></>}</div></div>
 {!connected?<section className="hms-domain-setup"><Globe size={32}/><h2>Connect your domain account</h2><p>Set up your registrar in Domain Settings to sync and manage your domains here.</p><Link className="hms-primary" href="/hosting/settings/domains">Open domain settings</Link></section>:<>
 <DomainSummaryCards summary={inventory.summary}/>
 <p className="hms-domain-summary-note">Summary covers all synced domains. Expiring soon means within 30 days.</p>
 {inventory.needsReconcile&&<div className="hms-domain-notice">A domain operation needs a status check before another change can start. <button disabled={busy} onClick={()=>void run(async()=>{await history();setHistoryOpen(true);})}>Open operation history</button></div>}
 {message&&<p role={failed?'alert':'status'} className={'hms-domain-message '+(failed?'is-error':'')}>{busy?'Working… ':''}{message}</p>}
 <div aria-busy={busy} className={'hms-domain-workspace '+(domain?'is-split':'')}>
 <DomainInventory rows={inventory.rows} summary={inventory.summary} total={inventory.total} pageSize={inventory.pageSize} asOf={inventory.asOf} page={page} search={search} filter={filter} busy={busy} selected={domain?.name??null} onSearch={setSearch} onLoad={(target,view)=>void run(()=>load(target,search,view??filter))} onFilter={view=>void run(async()=>{setFilter(view);await load(1,search,view);})} onManage={name=>void manage(name)} onClear={()=>void run(async()=>{setSearch('');setFilter('all');await load(1,'','all');})}/>
 {domain&&<DomainDetailsPanel domain={domain} busy={busy} reviewing={Boolean(review)} tab={tab} operations={operations} onClose={()=>{setDomain(null);setDnsOpen(false);setReview(null);}} onTab={next=>{setTab(next);if(next==='history')void run(()=>history());}} onDns={()=>setDnsOpen(true)} onPrepare={change=>void prepare(change)} onCheck={id=>void check(id)}>{!dnsOpen&&reviewNode}</DomainDetailsPanel>}
 </div>
 {historyOpen&&<section className="hms-domain-history-card"><div className="hms-domain-history-heading"><h2>Recent domain operations</h2><button className="hms-domain-secondary" disabled={busy} onClick={()=>setHistoryOpen(false)}>Close history</button></div><DomainHistory operations={operations} busy={busy} onCheck={id=>void check(id)}/></section>}
 {domain&&<DomainDnsDialog key={domain.name} open={dnsOpen} domain={domain} busy={busy} reviewing={Boolean(review)} confirmed={confirmed} message={message} failed={failed} onClose={()=>setDnsOpen(false)} onRefresh={()=>void run(async()=>{const r=await request('details',{domain:domain.name});if(result(r)&&r.ok&&'domain'in r)setDomain(r.domain!);})} onPrepare={change=>void prepare(change)}>{dnsOpen&&reviewNode}</DomainDnsDialog>}
 </>}
 </div>;
}
