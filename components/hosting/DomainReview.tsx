'use client';
import type {DomainInfo,Intent} from '@/lib/hosting/registrar/schema';
import {expiryLabel} from '@/lib/hosting/registrar/presentation';
import {operationLabel} from './DomainHistory';
export type DomainReviewData={id:string;domain:string;intent:Intent;before:DomainInfo;quote:{amount:string;currency:string;years:number}|null;expires:string;mode:string};
export function DomainReview({review:r,busy,submitted,onApply,onCancel,onCheck}:{review:DomainReviewData;busy:boolean;submitted:boolean;onApply:(confirmation:string)=>void;onCancel:()=>void;onCheck:()=>void}){
 return <section className="hms-domain-review" aria-labelledby="domain-review-title"><h3 id="domain-review-title">Review domain change</h3><p><strong>{r.domain}</strong> · {r.mode==='sandbox'?'Sandbox test':'Live account'}</p><div className="hms-domain-review-change"><strong>{operationLabel[r.intent.kind]}</strong>
 {r.intent.kind==='lock'&&<p>{r.before.locked?'Locked':'Unlocked'} → {r.intent.locked?'Locked':'Unlocked'}. Unlocking allows a domain transfer to be requested.</p>}
 {r.intent.kind==='renew_option'&&<p>{r.before.renewOption} → {r.intent.enabled?'Auto-renew on. Dynadot may charge future renewal fees automatically.':'Auto-renew off. Renew manually before expiry.'}</p>}
 {r.intent.kind==='nameservers'&&<><p>Current: {r.before.glue.nameserver_list?.map(n=>n.server_name).join(', ')||r.before.glue.glue_type}</p><p>New: {r.intent.nameservers.join(', ')}</p></>}
 {(r.intent.kind==='dns_add'||r.intent.kind==='dns_remove')&&<p>{r.intent.record.host} · {r.intent.record.type.toUpperCase()} · {r.intent.record.value}{r.intent.record.type==='mx'?' · Priority '+r.intent.record.priority:''}</p>}
 {r.intent.kind==='renew'&&<p>Extend registration by {r.intent.years} year(s). Current expiry: {expiryLabel(r.before.expires)}.</p>}
 </div>{r.quote&&<p className="hms-domain-price">{r.quote.amount} {r.quote.currency.toUpperCase()} for {r.quote.years} year(s). Paid from your Dynadot account. Late renewal fees are not accepted.</p>}
 <p>This review expires at {new Date(r.expires).toISOString().slice(11,16)} UTC. Type the domain name to confirm.</p>
 <form className="hms-domain-form" onSubmit={e=>{e.preventDefault();onApply(String(new FormData(e.currentTarget).get('confirmation')));}}><label>Domain name<input autoFocus name="confirmation" aria-label="Type domain to confirm" required pattern={r.domain.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')} disabled={submitted||busy}/></label><div className="hms-domain-button-row"><button className="hms-primary" disabled={busy||submitted}>Confirm this change</button><button className="hms-domain-secondary" type="button" disabled={busy} onClick={onCancel}>{submitted?'Close review':'Cancel review'}</button></div></form>
 {submitted&&<button className="hms-domain-secondary" disabled={busy} onClick={onCheck}>Check operation status</button>}
 </section>;
}
