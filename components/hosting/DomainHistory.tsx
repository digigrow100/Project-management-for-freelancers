'use client';
export type DomainOperation={id:string;domain:string;kind:string;state:string;created_at:string};
export const operationLabel:Record<string,string>={lock:'Transfer lock',renew_option:'Automatic renewal',nameservers:'Nameservers',dns_add:'Add DNS record',dns_remove:'Remove DNS record',renew:'Renew domain'};
const stateLabel:Record<string,string>={prepared:'Waiting for confirmation',executing:'Checking result',confirmed:'Confirmed',uncertain:'Needs a status check',failed:'Stopped before a change was sent'};
export function DomainHistory({operations,busy,onCheck}:{operations:DomainOperation[];busy:boolean;onCheck:(id:string)=>void}){
 return <div className="hms-domain-history">{!operations.length?<p>No recent operations to show.</p>:operations.map(op=><div key={op.id}><strong>{op.domain}</strong><p>{operationLabel[op.kind]??op.kind}</p><span className={'hms-domain-pill '+(op.state==='confirmed'?'green':op.state==='uncertain'?'amber':'muted')}>{stateLabel[op.state]??op.state}</span>{['executing','uncertain','confirmed'].includes(op.state)&&<button disabled={busy} onClick={()=>onCheck(op.id)}>Check status</button>}</div>)}</div>;
}
