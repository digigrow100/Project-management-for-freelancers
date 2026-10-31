'use server';
import {createHmac,randomUUID} from 'node:crypto';
import {requireHostingAdmin,requireHostingClient} from '../auth';
import {getSupabase} from '@/lib/supabaseClient';
import {rateLimit} from '@/lib/security/rateLimit';
import {emailProduct,mailId,resourceId,mailSnapshot,mailDelivery,mailServiceCommand,type EmailServicesWorkspace,type EmailService} from './servicesSchema';
import {emailSettings,emptyEmailSettings} from './schema';
import {z} from 'zod';
import {registrarAction} from '../registrar/actions';
import {observeEmailDns} from './dns';
function checked<T>(r:{data:T;error:unknown}):T{if(r.error){const m=String((r.error as {message?:string}).message??'');const known:Record<string,string>={'Version conflict':'This record changed. Refresh before saving.','Resolve pending':'Resolve pending server requests before editing this service.','Set a price first':'Set a service or mailbox price first.','Client, price and due date required':'Select an active client and set the billing due date.','Overlapping billing period':'An invoice already covers part of this period.','Invoice changed':'Open the invoice to check its current status.','Refresh mailbox inventory':'Refresh the mailbox inventory before assigning it.'};throw Error(Object.entries(known).find(([k])=>m.includes(k))?.[1]??'Email records could not be saved. Refresh and check the saved state.');}return r.data;}
export async function emailServicesWorkspace():Promise<EmailServicesWorkspace>{
 await requireHostingAdmin();const db=getSupabase();
 const [services,clients,bills,settings]=await Promise.all([
 db.from('freelance_hq_email_services').select('*').order('hostname').limit(501),db.from('freelance_hq_hosting_clients').select('id,name').eq('status','active').order('name').limit(501),
 db.from('freelance_hq_email_billing').select('*').order('created_at',{ascending:false}).limit(501),db.from('freelance_hq_hosting_email_settings').select('settings').eq('id',true).maybeSingle()]);
 const profiles:EmailServicesWorkspace['profiles']=[];
 for(let offset=0;;offset+=500){const page=checked(await db.from('freelance_hq_email_mailbox_profiles').select('*').order('service_id').order('resource').range(offset,offset+499))??[];profiles.push(...page);if(page.length<500)break;if(offset>=25000)throw Error('Mailbox inventory page capacity exceeded');}
 const rows=checked(services)??[];if(rows.length>500)throw Error('Email service page capacity exceeded');
 return {services:rows.map(s=>({...s,snapshot:s.snapshot?mailSnapshot.parse(s.snapshot):null})) as EmailService[],clients:checked(clients)??[],profiles,bills:checked(bills)??[],settings:emailSettings.parse(checked(settings)?.settings??emptyEmailSettings)};
}
export async function emailDomainSearch(search:string){
 const actor=await requireHostingAdmin();await rateLimit('email-domain-search',actor.id,30,60);
 const q=z.string().trim().toLowerCase().max(253).regex(/^[a-z0-9.-]*$/).parse(search),db=getSupabase();
 const connection=checked(await db.from('freelance_hq_hosting_registrar_connection').select('version,mode').eq('id',true).maybeSingle());
 const rows=connection?.mode==='production'?checked(await db.from('freelance_hq_hosting_registrar_domains').select('name').eq('connection_version',connection.version).like('name','%'+q+'%').order('name').limit(50))??[]:[];
 return rows.map(r=>r.name as string);
}
export async function saveEmailService(input:unknown){
 const actor=await requireHostingAdmin();await rateLimit('email-service-save',actor.id,20,60);
 const {id,version,value}=z.object({id:mailId.nullable(),version:z.number().int().nonnegative(),value:emailProduct}).strict().parse(input);
 return checked(await getSupabase().rpc('freelance_hq_email_service_save',{p_actor:actor.id,p_id:id,p_expected:version,p_value:value})) as EmailService;
}
export async function saveMailboxProfile(input:unknown){
 const actor=await requireHostingAdmin();await rateLimit('email-profile-save',actor.id,20,60);
 const v=z.object({service:mailId,resource:resourceId,version:z.number().int().nonnegative(),client:mailId.nullable(),inherit:z.boolean(),price:z.number().int().min(0).max(100000000000).nullable()}).strict().parse(input);
 checked(await getSupabase().rpc('freelance_hq_email_profile',{p_actor:actor.id,p_service:v.service,p_resource:v.resource,p_expected:v.version,p_client:v.client,p_inherit:v.inherit,p_price:v.price}));return {saved:true};
}
export async function emailBillingAction(input:unknown){
 const actor=await requireHostingAdmin();await rateLimit('email-billing',actor.id,20,60);
 const v=z.discriminatedUnion('action',[z.object({action:z.literal('bill'),service:mailId,version:z.number().int().positive(),period:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),client:mailId.nullable().optional()}).strict(),z.object({action:z.literal('paid'),bill:mailId,reference:z.string().trim().min(1).max(120),request_key:mailId}).strict()]).parse(input);
 return v.action==='bill'?checked(await getSupabase().rpc('freelance_hq_email_bill',{p_actor:actor.id,p_service:v.service,p_expected:v.version,p_period:v.period,p_client:v.client??null})):checked(await getSupabase().rpc('freelance_hq_email_payment',{p_actor:actor.id,p_bill:v.bill,p_reference:v.reference,p_key:v.request_key}));
}
export async function emailRemote(input:unknown){
 const actor=await requireHostingAdmin();await rateLimit('email-remote',actor.id,30,60);const c=mailServiceCommand.parse(input),db=getSupabase();
 const service=checked(await db.from('freelance_hq_email_services').select('*').eq('id',c.service).single()) as EmailService;
 if(service.client_id){const client=checked(await db.from('freelance_hq_hosting_clients').select('status').eq('id',service.client_id).single());if(client?.status!=='active'&&c.action!=='snapshot')throw Error('Active client required');}
 if(c.action==='request'&&['enroll','limits'].includes(c.operation.operation)){
  if(c.operation.operation!=='enroll'&&c.operation.operation!=='limits')throw Error('Invalid policy');
  if(JSON.stringify(c.operation.limits)!==JSON.stringify({mailboxes:service.mailboxes,mailbox_mb:service.mailbox_mb,total_mb:service.total_mb}))throw Error('Refresh the saved policy');
 }
 if(c.action==='request'&&c.operation.operation==='enroll'){
  if(c.operation.domain!==service.hostname||JSON.stringify(c.operation.limits)!==JSON.stringify({mailboxes:service.mailboxes,mailbox_mb:service.mailbox_mb,total_mb:service.total_mb}))throw Error('Refresh the saved policy');
  // Registrar ownership is re-read, not supplied by the browser. Other domains need current TXT proof.
  const connection=checked(await db.from('freelance_hq_hosting_registrar_connection').select('version,mode').eq('id',true).maybeSingle());
  const registrar=connection?.mode==='production'?checked(await db.from('freelance_hq_hosting_registrar_domains').select('name').eq('connection_version',connection.version).eq('name',service.hostname).maybeSingle()):null;
  const proof=checked(await db.from('freelance_hq_hosting_email_domains').select('id,verified_at,verification_token').eq('hostname',service.hostname).maybeSingle());
  if(registrar){const f=new FormData();f.set('action','details');f.set('domain',service.hostname);const current=await registrarAction(f);if(!current.ok||!('domain' in current)||current.domain?.name!==service.hostname)throw Error('Domain ownership could not be confirmed with Dynadot');}
  if(!registrar){if(!proof?.verification_token)throw Error('Add the external domain and verify ownership first.');const settings=checked(await db.from('freelance_hq_hosting_email_settings').select('settings').eq('id',true).single());const mx=emailSettings.parse(settings?.settings??emptyEmailSettings).mx_host;const observed=await observeEmailDns(service.hostname,proof.verification_token,mx);if(observed.ownership!=='matched')throw Error('Current TXT ownership could not be verified.');checked(await db.rpc('freelance_hq_hosting_email_domain_check',{p_actor:actor.id,p_domain:proof.id,p_token:proof.verification_token,p_check:observed,p_mx_host:mx}));}
 }
 const origin=process.env.HOSTING_SERVICES_ORIGIN,key=process.env.HOSTING_SERVICES_PORTAL_KEY?.trim();
 if(process.env.HOSTING_EMAIL_SERVICES_ENABLED!=='approved'||!origin||!key||key.length<32)throw Error('Independent email server is not enrolled yet');
 const url=new URL(origin);if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('Invalid mail origin');
 const body=JSON.stringify({schema:1,actor:actor.id,nonce:randomUUID(),expires:Math.floor(Date.now()/1000)+120,command:{...c,domain:service.hostname,client:service.runtime_client}});
 const response=await fetch(new URL('/v1/mail',url),{method:'POST',body,headers:{'Content-Type':'application/json','X-HMS-Mail-Signature':createHmac('sha256',key).update('hms:mail-portal:v1:'+body).digest('hex')},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000)});
 if(!response.ok||!response.body)throw Error('Mail server answer unconfirmed. Refresh status before retrying.');
 const reader=response.body.getReader();let size=0,text='';const decoder=new TextDecoder();try{for(;;){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>524288)throw Error('Mail answer too large');text+=decoder.decode(r.value,{stream:true});}text+=decoder.decode();}finally{await reader.cancel();reader.releaseLock();}
 const result:unknown=JSON.parse(text);
 if(c.action==='delivery'){const report=mailDelivery.parse(result);if(report.service!==service.id||report.domain!==service.hostname)throw Error('Mail scope mismatch');return report;}
 if(c.action==='snapshot'){const s=mailSnapshot.parse(result);if(s.service!==service.id||s.domain!==service.hostname)throw Error('Mail scope mismatch');checked(await db.rpc('freelance_hq_email_observe',{p_actor:actor.id,p_id:service.id,p_expected:service.version,p_snapshot:s}));return s;}
 return z.object({accepted:z.literal(true),job:resourceId}).strict().parse(result);
}
export async function clientEmailServices(){
 const session=await requireHostingClient();
 const result=checked(await getSupabase().rpc('freelance_hq_email_client_inventory',{p_actor:session.userId,p_client:session.clientId}));
 return z.object({services:z.array(z.object({id:mailId,domain:z.string(),webmail_url:z.union([z.literal(''),z.literal('https://server1.housemysite.com/housemysite-webmail/')]),observed_at:z.string().nullable(),mailboxes:z.array(z.object({address:z.string().email(),quota_mb:z.number().int().positive(),used_bytes:z.number().nonnegative().nullable(),sending:z.boolean(),receiving:z.boolean(),login:z.boolean()}).strict())}).strict()),bills:z.array(z.object({id:mailId,invoice_id:mailId.nullable(),service_id:mailId,period_start:z.string(),period_end:z.string(),amount_minor:z.number().int().nonnegative(),currency:z.string(),due_on:z.string(),paid_on:z.string().nullable()}).strict())}).strict().parse(result);
}
