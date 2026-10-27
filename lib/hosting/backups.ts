import "server-only";
import { createHmac, randomUUID } from "node:crypto";
import { requireHostingAdmin, requireHostingClient } from "./auth";
import { getSupabase } from "@/lib/supabaseClient";
import { backupCommand, backupSites, BackupDenied, type BackupContext } from "./backupProtocol";

export async function backupContext(ownerMode:boolean):Promise<BackupContext>{
 let actor:string,clientId:string|undefined,readOnly=false;
 if(ownerMode){const profile=await requireHostingAdmin();if(profile.id!==process.env.HOSTING_BACKUP_OWNER_ID)throw new BackupDenied();actor=profile.id;}
 else{const session=await requireHostingClient();actor=session.userId;clientId=session.clientId;readOnly=session.adminView||session.client.status!=="active";}
 let query=getSupabase().from("freelance_hq_hosting_services").select("id,client_id,name").order("id").limit(101);
 if(clientId)query=query.eq("client_id",clientId);
 const rows=await query;if(rows.error||!rows.data||rows.data.length>100)throw new Error("Backup service scope unavailable.");
 return {actor,owner:ownerMode,readOnly,sites:new Map(rows.data.map(s=>[String(s.id),{clientId:String(s.client_id),name:String(s.name)}]))};
}

export async function backupRequest(context:BackupContext,raw:unknown){
 const command=backupCommand(raw,context);
 if(process.env.HOSTING_BACKUP_PORTAL_ENABLED!=="true")throw new Error("Backup service is not enrolled.");
 const configured=process.env.HOSTING_BACKUP_ORIGIN,key=process.env.HOSTING_BACKUP_PORTAL_KEY;
 if(!configured||!key||key.length<32)throw new Error("Backup service is not enrolled.");
 const origin=new URL(configured);
 if(origin.protocol!=="https:"||origin.username||origin.password||origin.search||origin.hash||origin.pathname!=="/"||origin.hostname==="localhost")throw new Error("Backup origin unavailable.");
 const packet={schema:1,actor:context.actor,nonce:randomUUID(),expires:Math.floor(Date.now()/1000)+120,
  bindings:[...context.sites].map(([service,b])=>({service,client:b.clientId})),command};
 const body=JSON.stringify(packet),signature=createHmac("sha256",key).update("hms:recovery-portal:v1:"+body).digest("hex");
 if(Buffer.byteLength(body,"utf8")>32768)throw new BackupDenied();
 const response=await fetch(new URL("/v1/recovery",origin),{method:"POST",body,headers:{"Content-Type":"application/json","X-HMS-Recovery-Signature":signature},cache:"no-store",redirect:"error",signal:AbortSignal.timeout(15000)});
 if(!response.ok||!response.body)throw new Error("Backup service unavailable.");
 const reader=response.body.getReader(),decoder=new TextDecoder();let text="",bytes=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.length;if(bytes>1024*1024)throw new Error("Backup response too large.");text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}
 finally{await reader.cancel();reader.releaseLock();}
 const result:unknown=JSON.parse(text);
 if(command.action==="list")return {sites:backupSites(result,context),readOnly:context.readOnly,owner:context.owner};
 if(!result||typeof result!=="object"||Array.isArray(result))throw new BackupDenied();
 const record=result as Record<string,unknown>;
 if(command.action==="plan"){
  if(Object.keys(record).sort().join()!=="digest,job,sites"||typeof record.job!=="string"||!/^[a-f0-9]{32}$/.test(record.job)||typeof record.digest!=="string"||!/^[a-f0-9]{64}$/.test(record.digest)||!Array.isArray(record.sites)||record.sites.length!==command.selections.length)throw new BackupDenied();
  const sites=record.sites.map(raw=>{if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new BackupDenied();const item=raw as Record<string,unknown>;if(Object.keys(item).sort().join()!=="captured,components,point,site"||!Number.isSafeInteger(item.captured)||Number(item.captured)<0||Number(item.captured)>Math.floor(Date.now()/1000))throw new BackupDenied();const selected=command.selections.find(s=>s.site===item.site);if(!selected||selected.point!==item.point||JSON.stringify([...selected.components].sort())!==JSON.stringify(item.components))throw new BackupDenied();return {site:selected.site,point:selected.point,components:selected.components,captured:Number(item.captured)};});
  if(new Set(sites.map(s=>s.site)).size!==sites.length)throw new BackupDenied();return {job:record.job,digest:record.digest,sites};
 }
 if(command.action==="stage"||command.action==="status"){
  if(Object.keys(record).sort().join()!=="activated,job,sites,state"||record.job!==command.job||record.activated!==false||typeof record.state!=="string"||!["planned","claimed","staging","staged","staging_failed"].includes(record.state)||!Array.isArray(record.sites)||record.sites.length>100)throw new BackupDenied();
  const sites=record.sites.map(raw=>{const item=raw as Record<string,unknown>;if(!item||typeof item!=="object"||Object.keys(item).sort().join()!=="point,site,state"||typeof item.site!=="string"||!context.sites.has(item.site)||typeof item.point!=="string"||!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(item.point)||typeof item.state!=="string"||!["pending","validated","recovery_required","skipped"].includes(item.state))throw new BackupDenied();return {site:item.site,point:item.point,state:item.state};});
  if(new Set(sites.map(s=>s.site)).size!==sites.length)throw new BackupDenied();return {job:record.job,state:record.state,sites,activated:false};
 }
 if(Object.keys(record).join()!=="accepted"||record.accepted!==true)throw new BackupDenied();return {accepted:true};
}
