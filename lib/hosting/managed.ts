import 'server-only';
import {createHmac,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {requireHostingAdmin,requireHostingClient} from './auth';
import {getSupabase} from '@/lib/supabaseClient';
import {serviceCommand,managedInventory,formProject} from './managedSchema';
export class ServiceDenied extends Error{}
export type ServiceScope={actor:string;readOnly:boolean;sites:Map<string,{client:string;name:string}>};
export async function serviceScope(owner:boolean):Promise<ServiceScope>{
 let actor:string,client:string|undefined,readOnly=false;
 if(owner){actor=(await requireHostingAdmin()).id;}else{const session=await requireHostingClient();actor=session.userId;client=session.clientId;readOnly=session.adminView||session.client.status!=='active';}
 let query=getSupabase().from('freelance_hq_hosting_services').select('id,client_id,name').order('id').limit(101);if(client)query=query.eq('client_id',client);
 const result=await query;if(result.error||!result.data||result.data.length>100)throw Error('Service scope unavailable');
 return {actor,readOnly,sites:new Map(result.data.map(row=>[String(row.id),{client:String(row.client_id),name:String(row.name)}]))};
}
export async function serviceRequest(scope:ServiceScope,raw:unknown){
 const result=serviceCommand.safeParse(raw);if(!result.success)throw new ServiceDenied();const command=result.data;
 if(scope.readOnly&&!['inventory','forms.list','forms.status'].includes(command.action))throw new ServiceDenied();
 const service='service'in command?command.service:'project'in command?command.project:null;if(service&&!scope.sites.has(service))throw new ServiceDenied();
 if(process.env.HOSTING_SERVICES_ENABLED!=='approved')throw Error('Service not enrolled');
 const separateForms=command.action.startsWith('forms.')&&process.env.HOSTING_FORMS_ORIGIN;
 const origin=separateForms||process.env.HOSTING_SERVICES_ORIGIN,key=separateForms?process.env.HOSTING_FORMS_PORTAL_KEY:process.env.HOSTING_SERVICES_PORTAL_KEY;
 if(!origin||!key||key.length<32)throw Error('Service not enrolled');const url=new URL(origin);
 if(url.protocol!=='https:'||!url.hostname||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('Invalid private origin');
 const body=JSON.stringify({schema:1,actor:scope.actor,nonce:randomUUID(),expires:Math.floor(Date.now()/1000)+120,command});
 if(Buffer.byteLength(body)>32768)throw new ServiceDenied();
 const response=await fetch(new URL('/v1/services',url),{method:'POST',body,headers:{'Content-Type':'application/json','X-HMS-Services-Signature':createHmac('sha256',key).update('hms:services-portal:v1:'+body).digest('hex')},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
 if(!response.ok||!response.body)throw Error('Service outcome unavailable');const reader=response.body.getReader();let bytes=0,text='';const decoder=new TextDecoder();
 try{for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.length;if(bytes>1024*1024)throw Error('Response exceeds budget');text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}finally{await reader.cancel();reader.releaseLock();}
 const value:unknown=JSON.parse(text);
 if(command.action==='inventory'){const inventory=managedInventory.parse(value);if(inventory.service!==command.service)throw new ServiceDenied();return inventory;}
 if(command.action==='forms.list'){
  const result=z.object({projects:z.array(formProject).max(1000)}).strict().parse(value);
  // The private service can contain other purchased accounts not visible to this portal.
  // Bind every returned project to its current local client, then expose owned entries only.
  const projects=result.projects.filter(p=>scope.sites.has(p.id));if(projects.some(p=>scope.sites.get(p.id)?.client!==p.client))throw new ServiceDenied();return {projects};
 }
 if(command.action==='forms.rotate')return z.object({key:z.string().regex(/^hmsf_[A-Za-z0-9_-]{43}$/)}).strict().parse(value);
 if(command.action==='forms.revoke')return z.object({accepted:z.literal(true)}).strict().parse(value);
 if(command.action==='forms.status')return z.object({id:z.literal(command.job),state:z.enum(['queued','sending','uncertain','restore_review','smtp_accepted']),created:z.number().int().nonnegative()}).strict().parse(value);
 return z.object({id:z.string().regex(/^[a-f0-9]{32}$/),digest:z.string().regex(/^[a-f0-9]{64}$/),state:z.enum(['queued','applying','uncertain','restore_review','provider_confirmed'])}).strict().parse(value);
}
