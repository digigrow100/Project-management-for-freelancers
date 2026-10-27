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
 | {action:"limit";site:string;copies:number};
export function backupCommand(raw:unknown,context:BackupContext):BackupCommand {
 const value=object(raw);const action=value.action;
 if(action==="list"){exact(value,["action"]);return {action};}
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
