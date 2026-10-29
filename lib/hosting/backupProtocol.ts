export const backupKinds = ["website", "database", "email", "configuration"] as const;
export type BackupKind = typeof backupKinds[number];
export type BackupPoint = {id:string;captured:number;default:boolean;components:BackupKind[]};
export type BackupSite = {id:string;clientId:string;name:string;copies:number;points:BackupPoint[]};
export type BackupSelection = {site:string;point:string;components:BackupKind[]};
export type BackupContext = {actor:string;owner:boolean;readOnly:boolean;sites:ReadonlyMap<string,{clientId:string;name:string}>};
export class BackupDenied extends Error {}
const identifier=/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const object=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=="object"||Array.isArray(v))throw new BackupDenied();return v as Record<string,unknown>;};
const exact=(v:Record<string,unknown>,keys:string[])=>{if(Object.keys(v).sort().join()!==keys.sort().join())throw new BackupDenied();};
export function backupId(v:unknown):string {if(typeof v!=="string"||!identifier.test(v))throw new BackupDenied();return v;}
function kinds(v:unknown):BackupKind[]{if(!Array.isArray(v)||!v.length||v.length>4||new Set(v).size!==v.length||v.some(k=>!backupKinds.includes(k)))throw new BackupDenied();return v as BackupKind[];}
export type BackupCommand =
 | {action:"list"}
 | {action:"status";job:string}
 | {action:"stage";job:string;digest:string}
 | {action:"plan";selections:BackupSelection[]}
 | {action:"default";site:string;point:string}
 | {action:"limit";site:string;copies:number}
 | {action:"policy"}
 | {action:"schedule";site:string;interval_days:number}
 | {action:"plan_scope";scope:BackupScope;point:"default"|"latest"|Record<string,string>;components?:BackupKind[];accept_shared:string[]}
 | {action:"apply";job:string;approval:BackupApproval};
export type BackupScope={type:"site";site:string}|{type:"sites";sites:string[]}|{type:"client";client:string};
export type BackupApproval={job:string;digest:string;nonce:string;issued:number;expires:number;signature:string};
export function backupCommand(raw:unknown,context:BackupContext):BackupCommand {
 const value=object(raw);const action=value.action;
 if(action==="list"||action==="policy"){exact(value,["action"]);return {action};}
 if(action==="status"){exact(value,["action","job"]);return {action,job:backupId(value.job)};}
 if(context.readOnly)throw new BackupDenied();
 if(action==="stage"){exact(value,["action","job","digest"]);if(typeof value.digest!=="string"||!/^[a-f0-9]{64}$/.test(value.digest))throw new BackupDenied();return {action,job:backupId(value.job),digest:value.digest};}
 if(action==="plan"){
  exact(value,["action","selections"]);
  if(!Array.isArray(value.selections)||!value.selections.length||value.selections.length>100)throw new BackupDenied();
  const seen=new Set<string>(),clients=new Set<string>();
  const selections=value.selections.map(raw=>{const s=object(raw);exact(s,["site","point","components"]);const site=backupId(s.site);const binding=context.sites.get(site);if(!binding||seen.has(site))throw new BackupDenied();seen.add(site);clients.add(binding.clientId);return {site,point:backupId(s.point),components:kinds(s.components)};});
  if(clients.size>1&&!context.owner)throw new BackupDenied();
  return {action,selections};
 }
 if(action==="default"||action==="limit"){
  if(!context.owner)throw new BackupDenied();
  exact(value,action==="default"?["action","site","point"]:["action","site","copies"]);
  const site=backupId(value.site);if(!context.sites.has(site))throw new BackupDenied();
  if(action==="default")return {action,site,point:backupId(value.point)};
  if(!Number.isInteger(value.copies)||Number(value.copies)<3||Number(value.copies)>1000)throw new BackupDenied();
  return {action,site,copies:Number(value.copies)};
 }
 if(action==="schedule"){
  if(!context.owner)throw new BackupDenied();
  exact(value,["action","site","interval_days"]);
  const site=backupId(value.site);if(!context.sites.has(site)||!Number.isInteger(value.interval_days)||Number(value.interval_days)<1||Number(value.interval_days)>30)throw new BackupDenied();
  return {action,site,interval_days:Number(value.interval_days)};
 }
 if(action==="plan_scope"){
  const keys=Object.keys(value).sort();
  if(!keys.includes("action")||!keys.includes("scope")||keys.some(k=>!["action","scope","point","components","accept_shared"].includes(k)))throw new BackupDenied();
  const scope=object(value.scope);let parsed:BackupScope;
  if(scope.type==="site"){exact(scope,["type","site"]);const site=backupId(scope.site);if(!context.sites.has(site))throw new BackupDenied();parsed={type:"site",site};}
  else if(scope.type==="sites"){
   exact(scope,["type","sites"]);
   if(!Array.isArray(scope.sites)||!scope.sites.length||scope.sites.length>100)throw new BackupDenied();
   const sites=scope.sites.map(backupId);if(new Set(sites).size!==sites.length||sites.some(x=>!context.sites.has(x)))throw new BackupDenied();
   if(new Set(sites.map(x=>context.sites.get(x)!.clientId)).size>1&&!context.owner)throw new BackupDenied();
   parsed={type:"sites",sites};
  }else if(scope.type==="client"){
   exact(scope,["type","client"]);const client=backupId(scope.client);
   if(![...context.sites.values()].some(b=>b.clientId===client))throw new BackupDenied();parsed={type:"client",client};
  }else throw new BackupDenied();
  let point:"default"|"latest"|Record<string,string>="default";
  if(value.point!==undefined){
   if(value.point==="default"||value.point==="latest")point=value.point;
   else{const map=object(value.point);if(Object.keys(map).length>100)throw new BackupDenied();const out:Record<string,string>={};for(const [k,v] of Object.entries(map)){if(!context.sites.has(backupId(k)))throw new BackupDenied();out[k]=backupId(v);}point=out;}
  }
  const shared=value.accept_shared===undefined?[]:value.accept_shared;
  if(!Array.isArray(shared)||shared.length>200||shared.some(x=>typeof x!=="string"||!/^(website|database|email|configuration):[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(x)))throw new BackupDenied();
  return {action,scope:parsed,point,...(value.components===undefined?{}:{components:kinds(value.components)}),accept_shared:shared as string[]};
 }
 if(action==="apply"){
  if(!context.owner)throw new BackupDenied();   // the approval is the owner's own signature, made on the owner's computer
  exact(value,["action","job","approval"]);
  const a=object(value.approval);exact(a,["job","digest","nonce","issued","expires","signature"]);
  const job=backupId(value.job);
  if(a.job!==job||typeof a.digest!=="string"||!/^[a-f0-9]{64}$/.test(a.digest)||typeof a.nonce!=="string"||!identifier.test(a.nonce)||!Number.isSafeInteger(a.issued)||!Number.isSafeInteger(a.expires)||Number(a.expires)<=Number(a.issued)||typeof a.signature!=="string"||!/^[A-Za-z0-9+/]{86}==$/.test(a.signature))throw new BackupDenied();
  return {action,job,approval:{job,digest:a.digest,nonce:a.nonce,issued:Number(a.issued),expires:Number(a.expires),signature:a.signature}};
 }
 // No browser command can activate, import SQL, delete, execute, supply roles or credentials.
 throw new BackupDenied();
}
export function backupSites(raw:unknown,context:BackupContext):BackupSite[]{
 if(!Array.isArray(raw)||raw.length>100)throw new BackupDenied();
 const seen=new Set<string>();
 return raw.map(row=>{
  const s=object(row);exact(s,["id","copies","points"]);const id=backupId(s.id);const binding=context.sites.get(id);
  if(!binding||seen.has(id)||!Number.isInteger(s.copies)||Number(s.copies)<3||Number(s.copies)>1000||!Array.isArray(s.points)||s.points.length>1000)throw new BackupDenied();seen.add(id);
  const ids=new Set<string>();let defaults=0;
  const points=s.points.map(raw=>{const p=object(raw);exact(p,["id","captured","default","components"]);const point=backupId(p.id);if(ids.has(point)||typeof p.default!=="boolean"||!Number.isSafeInteger(p.captured)||Number(p.captured)<0||Number(p.captured)>Math.floor(Date.now()/1000))throw new BackupDenied();ids.add(point);if(p.default)defaults++;return {id:point,captured:Number(p.captured),default:p.default,components:kinds(p.components)};});
  if(defaults>1)throw new BackupDenied();
  return {id,clientId:binding.clientId,name:binding.name,copies:Number(s.copies),points};
 });
}

export type BackupPolicy={id:string;name:string;copies:number;defaultPoint:string|null;schedule:{enabled:boolean;intervalDays:number;nextDue:number}|null;baseline:{due:number;taken:boolean};
 recommended:{intervalDays:number;coversDays:number;rotatingSlots:number;raisedByLock:boolean};conflicts:{code:string;detail:string}[];explanation:string;objectLockDays:number|null;
 points:{id:string;captured:number;default:boolean;components:BackupKind[]}[]};
const integer=(v:unknown,min=0,max=Number.MAX_SAFE_INTEGER)=>{if(!Number.isSafeInteger(v)||Number(v)<min||Number(v)>max)throw new BackupDenied();return Number(v);};
export function backupPolicies(raw:unknown,context:BackupContext):BackupPolicy[]{
 if(!Array.isArray(raw)||raw.length>100)throw new BackupDenied();
 const seen=new Set<string>();
 return raw.map(row=>{
  const s=object(row);exact(s,["id","copies","default_point","schedule","baseline","recommended","conflicts","explanation","object_lock_days","points"]);
  const id=backupId(s.id),binding=context.sites.get(id);if(!binding||seen.has(id))throw new BackupDenied();seen.add(id);
  let schedule:BackupPolicy["schedule"]=null;
  if(s.schedule!==null){const x=object(s.schedule);exact(x,["enabled","interval_days","interval_seconds","next_due"]);if(typeof x.enabled!=="boolean")throw new BackupDenied();schedule={enabled:x.enabled,intervalDays:integer(x.interval_days,1,30),nextDue:integer(x.next_due)};integer(x.interval_seconds,3600,30*86400);}
  const b=object(s.baseline);exact(b,["due","taken"]);if(typeof b.taken!=="boolean")throw new BackupDenied();
  const r=object(s.recommended);exact(r,["copies","rotating_slots","interval_days","covers_days","meets_window","raised_by_lock"]);
  if(typeof r.raised_by_lock!=="boolean"||typeof r.meets_window!=="boolean")throw new BackupDenied();
  if(!Array.isArray(s.conflicts)||s.conflicts.length>10)throw new BackupDenied();
  const conflicts=s.conflicts.map(c=>{const o=object(c);exact(o,["code","detail"]);if(typeof o.code!=="string"||!/^[a-z_]{1,40}$/.test(o.code)||typeof o.detail!=="string"||o.detail.length>400)throw new BackupDenied();return {code:o.code,detail:o.detail};});
  if(typeof s.explanation!=="string"||s.explanation.length>1200)throw new BackupDenied();
  if(s.object_lock_days!==null)integer(s.object_lock_days,30,3000);
  if(!Array.isArray(s.points)||s.points.length>1000)throw new BackupDenied();
  const ids=new Set<string>();let defaults=0;
  const points=s.points.map(raw=>{const p=object(raw);exact(p,["id","captured","default","components"]);const point=backupId(p.id);if(ids.has(point)||typeof p.default!=="boolean")throw new BackupDenied();ids.add(point);if(p.default)defaults++;
   return {id:point,captured:integer(p.captured,0,Math.floor(Date.now()/1000)),default:p.default,components:kinds(p.components)};});
  const defaultPoint=s.default_point===null?null:backupId(s.default_point);
  if(defaults>1||(defaultPoint!==null&&defaults===1&&!points.some(p=>p.default&&p.id===defaultPoint)))throw new BackupDenied();
  return {id,name:binding.name,copies:integer(s.copies,3,1000),defaultPoint,schedule,baseline:{due:integer(b.due),taken:b.taken},
   recommended:{intervalDays:integer(r.interval_days,1,3650),coversDays:integer(r.covers_days,1,100000),rotatingSlots:integer(r.rotating_slots,2,999),raisedByLock:r.raised_by_lock},conflicts,explanation:s.explanation,objectLockDays:s.object_lock_days===null?null:Number(s.object_lock_days),points};
 });
}
export type BackupSharedItem={component:BackupKind;resource:string;affects:{site:string}[];acknowledgement?:string};
export type BackupScopePlan={job:string;digest:string;plan:Record<string,unknown>;sites:{site:string;point:string;captured:number;components:BackupKind[];missing:BackupKind[];skipped:BackupSharedItem[];accepted:BackupSharedItem[];covered:{component:BackupKind;resource:string}[]}[]};
function sharedItems(raw:unknown,context:BackupContext):BackupSharedItem[]{
 if(!Array.isArray(raw)||raw.length>50)throw new BackupDenied();
 return raw.map(r=>{const o=object(r);const keys=Object.keys(o).sort().join();if(keys!=="acknowledgement,affects,component,resource"&&keys!=="affects,component,resource")throw new BackupDenied();
  if(!backupKinds.includes(o.component as BackupKind))throw new BackupDenied();
  if(!Array.isArray(o.affects)||o.affects.length>100)throw new BackupDenied();
  // Other websites are named by their portal service id when the viewer may know them, otherwise only as "another website": never an internal id.
  const affects=o.affects.map(a=>{const x=object(a);if(Object.keys(x).sort().join()!=="site,tenant"&&Object.keys(x).sort().join()!=="site")throw new BackupDenied();if(typeof x.site!=="string"||x.site.length>128)throw new BackupDenied();return {site:context.sites.has(x.site)?x.site:"another website"};});
  return {component:o.component as BackupKind,resource:backupId(o.resource),affects,...(o.acknowledgement===undefined?{}:{acknowledgement:String(o.acknowledgement).slice(0,200)})};});
}
export function backupScopePlan(raw:unknown,context:BackupContext):BackupScopePlan{
 const v=object(raw);exact(v,["job","digest","plan","sites"]);
 if(typeof v.job!=="string"||!/^[a-f0-9]{32}$/.test(v.job)||typeof v.digest!=="string"||!/^[a-f0-9]{64}$/.test(v.digest)||!Array.isArray(v.sites)||!v.sites.length||v.sites.length>100)throw new BackupDenied();
 const plan=object(v.plan);exact(plan,["schema","sites","expires"]);
 const seen=new Set<string>();
 const sites=v.sites.map(r=>{const o=object(r);exact(o,["site","point","captured","components","missing_components","skipped_shared","accepted_shared","covered_by_another_site"]);
  const site=backupId(o.site);if(!context.sites.has(site)||seen.has(site))throw new BackupDenied();seen.add(site);
  const covered=Array.isArray(o.covered_by_another_site)?o.covered_by_another_site.map(c=>{const x=object(c);exact(x,["component","resource"]);if(!backupKinds.includes(x.component as BackupKind))throw new BackupDenied();return {component:x.component as BackupKind,resource:backupId(x.resource)};}):(()=>{throw new BackupDenied();})();
  return {site,point:backupId(o.point),captured:integer(o.captured,0,Math.floor(Date.now()/1000)),components:kinds(o.components),missing:Array.isArray(o.missing_components)?o.missing_components.map(k=>{if(!backupKinds.includes(k as BackupKind))throw new BackupDenied();return k as BackupKind;}):(()=>{throw new BackupDenied();})(),
   skipped:sharedItems(o.skipped_shared,context),accepted:sharedItems(o.accepted_shared,context),covered};});
 return {job:v.job,digest:v.digest,plan,sites};
}
export function backupApplyResult(raw:unknown,context:BackupContext,job:string){
 const v=object(raw);exact(v,["job","state","sites"]);
 if(v.job!==job||typeof v.state!=="string"||!["applied","partially_applied","not_applied","recovery_required"].includes(v.state)||!Array.isArray(v.sites)||v.sites.length>100)throw new BackupDenied();
 const sites=v.sites.map(r=>{const o=object(r);exact(o,["site","point","state","apply"]);const site=backupId(o.site);if(!context.sites.has(site)||typeof o.state!=="string"||typeof o.apply!=="string"||!["applied","reverted","not_applied","skipped","recovery_required"].includes(o.apply))throw new BackupDenied();return {site,point:backupId(o.point),state:o.state,apply:o.apply};});
 if(v.state==="applied"&&sites.some(s=>s.apply!=="applied"))throw new BackupDenied();
 if(v.state!=="recovery_required"&&sites.some(s=>s.apply==="recovery_required"))throw new BackupDenied();
 return {job,state:v.state,sites};
}
