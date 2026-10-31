'use client';
import {useRef,useState} from 'react';
import {registrarAction} from '@/lib/hosting/registrar/actions';
import {DomainReview,type DomainReviewData} from './DomainReview';
export function EmailDnsAssist({hostname,token,record}:{hostname:string;token:string;record?:{host:string;type:'mx'|'txt';value:string;priority?:number}}){
 const [review,setReview]=useState<DomainReviewData|null>(null),[busy,setBusy]=useState(false),[submitted,setSubmitted]=useState(false),[message,setMessage]=useState('');const lock=useRef(false);
 async function run(work:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setMessage('');try{await work();}catch{setMessage('Could not confirm the result. Check the operation before repeating it.');}finally{lock.current=false;setBusy(false);}}
 async function call(action:string,values:Record<string,string>){const f=new FormData();f.set('action',action);Object.entries(values).forEach(([k,v])=>f.set(k,v));return registrarAction(f);}
 return <div className="hms-email-dns-assist"><p>If this domain uses the connected Dynadot account and Dynadot DNS, {record?'review this email DNS record here. Existing records are preserved. Review migration before adding an MX record.':'add the verification TXT record here. Other DNS records are preserved.'}</p>
 {!review&&<button className="hms-domain-secondary" disabled={busy} onClick={()=>void run(async()=>{const r=await call('prepare',{domain:hostname,intent:JSON.stringify({kind:'dns_add',record:record??{host:'_housemysite-verification',type:'txt',value:'housemysite-verification='+token}})});if(!r.ok){setMessage(r.error);return;}if(!('review' in r))throw Error();setReview(r.review as DomainReviewData);setSubmitted(false);})}>{record?'Review email DNS record':'Review verification record in Dynadot'}</button>}
 {review&&<DomainReview review={review} busy={busy} submitted={submitted} onCancel={()=>{if(!busy&&!submitted)setReview(null);}} onApply={confirmation=>void run(async()=>{setSubmitted(true);const r=await call('apply',{id:review.id,confirmation});if(r.ok){setMessage(r.message??'Status checked.');setReview(null);}else setMessage(r.error);})} onCheck={()=>void run(async()=>{const r=await call('reconcile',{id:review.id});if(r.ok){setMessage(r.message??'Status checked.');setReview(null);}else setMessage(r.error);})}/>}
 {message&&<p role="status">{message}</p>}</div>;
}
