import { createHash } from "node:crypto";
const ownerId=110416445;
export type BridgeReport={operation:string;status:string;at:string;issue:number;warnings:number;errors:number;stale:boolean};
export function parseBridgeReport(issue:unknown,comment:unknown,now=Date.now()):BridgeReport|null{
 try{
  const i=issue as {number:number;body:string;user:{id:number};pull_request?:unknown;created_at:string;labels:{name:string}[]};
  const c=comment as {body:string;user:{id:number};created_at:string};
  if(i.pull_request||i.user.id!==ownerId||c.user.id!==ownerId||!Number.isSafeInteger(i.number)||i.number<1||!i.labels.some(l=>l.name==='hms-operation')||i.body.length>400||c.body.length>20000)return null;
  const request=JSON.parse(i.body);
  if(Object.keys(request).sort().join(',')!=='operation,request_id,schema_version'||request.schema_version!==1||!['audit.health','audit.services'].includes(request.operation)||!/^[-a-zA-Z0-9_]{1,120}$/.test(request.request_id))return null;
  const match=/^HouseMySite operation result\s+```json\s+([\s\S]*?)\s+```\s*$/.exec(c.body);if(!match?.[1])return null;
  const r=JSON.parse(match[1]);
  if(r.issue!==i.number||r.operation!==request.operation||r.request_id!==request.request_id||r.body_sha256!==createHash('sha256').update(i.body).digest('hex')||!['ok','error','ssh_failed','denied','failed'].includes(r.status)||!Array.isArray(r.findings)||r.findings.length>100)return null;
  const at=Date.parse(r.at),created=Date.parse(i.created_at),published=Date.parse(c.created_at);
  if(!Number.isFinite(at)||!Number.isFinite(created)||!Number.isFinite(published)||at<created-300000||at>published+300000||published>now+300000||at>now+300000)return null;
  return {operation:r.operation,status:r.status,at:new Date(at).toISOString(),issue:i.number,warnings:r.findings.filter((f:{severity?:string})=>f?.severity==='warning').length,errors:r.findings.filter((f:{severity?:string})=>f?.severity==='critical'||f?.severity==='error').length,stale:now-at>86400000};
 }catch{return null;}
}
