import 'server-only';
import {createHmac,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {requireHostingAdmin,requireHostingClient} from './auth';
import {getSupabase} from '@/lib/supabaseClient';
import {serviceCommand,githubLinkCommand,managedInventory,formProject,sourceStatus,sourceRepositories,sourceJob,sourceTreeSummary,githubStatus,sourceUploadTicket,approvalView,approvalsPending,secretKey,secretList,SOURCE_UPLOAD_MAX_BYTES} from './managedSchema';
import {clientFeatureEnabled} from './clientRelease';
export class ServiceDenied extends Error{}
export type ServiceScope={actor:string;readOnly:boolean;owner?:boolean;sites:Map<string,{client:string;name:string}>};
export async function serviceScope(owner:boolean):Promise<ServiceScope>{
 let actor:string,client:string|undefined,readOnly=false;
 if(owner){actor=(await requireHostingAdmin()).id;}else{const session=await requireHostingClient();actor=session.userId;client=session.clientId;readOnly=session.adminView||session.client.status!=='active';}
 let query=getSupabase().from('freelance_hq_hosting_services').select('id,client_id,name').order('id').limit(101);if(client)query=query.eq('client_id',client);
 const result=await query;if(result.error||!result.data||result.data.length>100)throw Error('Service scope unavailable');
 return {actor,readOnly,owner,sites:new Map(result.data.map(row=>[String(row.id),{client:String(row.client_id),name:String(row.name)}]))};
}
const SOURCE_ACTIONS=['source.status','source.repositories','source.connect','source.switch','source.disconnect','source.request','source.build','source.discard','source.recover','source.github_status','source.github_link','source.auto_revoke','source.auto_resume','source.upload_ticket','source.approvals_pending','source.approval_view','source.approve','source.approval_withdraw','source.auto_install','source.secret_key','source.secret_list','source.secret_put','source.secret_delete'] as const;
type Command=z.infer<typeof serviceCommand>|z.infer<typeof githubLinkCommand>;
type SourceCommand=Extract<Command,{action:typeof SOURCE_ACTIONS[number]}>;
function isSourceCommand(command:Command):command is SourceCommand{return (SOURCE_ACTIONS as readonly string[]).includes(command.action);}
export async function serviceRequest(scope:ServiceScope,raw:unknown,options:{internal?:boolean}={}){
 const result=(options.internal===true?z.union([serviceCommand,githubLinkCommand]):serviceCommand).safeParse(raw);if(!result.success)throw new ServiceDenied();const command=result.data;
 if(scope.readOnly&&!['inventory','forms.list','forms.status','source.status','source.repositories','source.github_status','source.secret_list'].includes(command.action))throw new ServiceDenied();
 const service='service'in command?command.service:'project'in command?command.project:null;if(service&&!scope.sites.has(service))throw new ServiceDenied();
 let wireCommand:unknown=command;
 if(command.action==='hosting.domain.request'||command.action==='hosting.domain.status'){
  if(scope.owner!==true||process.env.HOSTING_DOMAIN_AUTOMATION_ENABLED!=='approved')throw new ServiceDenied();
  const [site,domain]=await Promise.all([
   getSupabase().from('freelance_hq_hosting_services').select('id,client_id,primary_domain,status').eq('id',command.service).single(),
   getSupabase().from('freelance_hq_hosting_domains').select('id,service_id,client_id,hostname').eq('id',command.domain).single()
  ]);
  if(site.error||domain.error||!site.data||!domain.data||site.data.client_id!==scope.sites.get(command.service)?.client||domain.data.client_id!==site.data.client_id||domain.data.service_id!==site.data.id||domain.data.hostname!==site.data.primary_domain||!['pending','active'].includes(site.data.status))throw new ServiceDenied();
  if(command.action==='hosting.domain.request'){
   const client=await getSupabase().from('freelance_hq_hosting_clients').select('status').eq('id',site.data.client_id).single();
   if(client.error||client.data?.status!=='active')throw new ServiceDenied();
  }
  wireCommand={action:command.action,service:site.data.id,client:site.data.client_id,domain:domain.data.hostname,...(command.action==='hosting.domain.request'?{operation:command.operation,request_key:command.request_key}:{})};
 }
 if(command.action==='hosting.provision'||command.action==='hosting.status'){
  if(scope.owner!==true||process.env.HOSTING_PROVISIONING_ENABLED!=='approved')throw new ServiceDenied();
  const found=await getSupabase().from('freelance_hq_hosting_services').select('id,client_id,server_id,package_id,primary_domain,status').eq('id',command.service).single();
  if(found.error||!found.data||found.data.client_id!==scope.sites.get(command.service)?.client)throw new ServiceDenied();
  const row=found.data;
  if(command.action==='hosting.status')wireCommand={...command,client:row.client_id};
  else{
   if(!row.server_id||!row.package_id||!row.primary_domain||row.status!=='pending')throw new ServiceDenied();
   const [client,pkg,server,allowed]=await Promise.all([
    getSupabase().from('freelance_hq_hosting_clients').select('status').eq('id',row.client_id).single(),
    getSupabase().from('freelance_hq_hosting_packages').select('is_active').eq('id',row.package_id).single(),
    getSupabase().from('freelance_hq_hosting_servers').select('status').eq('id',row.server_id).single(),
    getSupabase().from('freelance_hq_hosting_package_servers').select('server_id').eq('package_id',row.package_id).eq('server_id',row.server_id).single()
   ]);
   if(client.error||client.data?.status!=='active'||pkg.error||pkg.data?.is_active!==true||server.error||server.data?.status!=='available'||allowed.error||!allowed.data)throw new ServiceDenied();
   wireCommand={action:command.action,service:row.id,client:row.client_id,server:row.server_id,package:row.package_id,domain:row.primary_domain,request_key:command.request_key};
  }
 }
 if(isSourceCommand(command)){
  // Client or owner scope; ownership is the saved service→client relation, never a browser field.
  if(process.env.HOSTING_SOURCES_ENABLED!=='approved'||(scope.owner!==true&&!clientFeatureEnabled('sources',process.env)))throw new ServiceDenied();
  const found=await getSupabase().from('freelance_hq_hosting_services').select('id,client_id,status').eq('id',command.service).single();
  if(found.error||!found.data||found.data.client_id!==scope.sites.get(command.service)?.client||!['pending','active'].includes(found.data.status))throw new ServiceDenied();
  // Writing to a customer's website root is a separate release switch from staging and GitHub work.
  if((command.action==='source.recover'||command.action==='source.build'||(command.action==='source.request'&&(command.operation==='publish'||command.operation==='rollback')))&&process.env.HOSTING_PUBLISHING_ENABLED!=='approved')throw new ServiceDenied();
  // Building customer code runs in the private isolated builder; it has its own release switch.
  if(command.action==='source.build'&&process.env.HOSTING_NEXTJS_ENABLED!=='approved')throw new ServiceDenied();
  // Linking GitHub and resuming automatic deployment each have their own release switch; stopping automation is always allowed.
  if(command.action==='source.github_link'&&(options.internal!==true||process.env.HOSTING_GITHUB_ENABLED!=='approved'))throw new ServiceDenied();
  // Approvals and the automatic-deployment policy are the owner's decisions: the owner signs them on their own computer, and only an owner session may relay them.
  if(['source.approvals_pending','source.approval_view','source.approve','source.approval_withdraw','source.auto_install'].includes(command.action)&&scope.owner!==true)throw new ServiceDenied();
  if(command.action==='source.auto_install'&&(process.env.HOSTING_AUTODEPLOY_ENABLED!=='approved'||process.env.HOSTING_PUBLISHING_ENABLED!=='approved'||process.env.HOSTING_GITHUB_ENABLED!=='approved'))throw new ServiceDenied();
  // Runtime secrets exist only for Next.js websites; listing names stays available while the switch is off so nothing is hidden.
  if(['source.secret_key','source.secret_put','source.secret_delete'].includes(command.action)&&process.env.HOSTING_NEXTJS_ENABLED!=='approved')throw new ServiceDenied();
  if(command.action==='source.auto_resume'&&(process.env.HOSTING_AUTODEPLOY_ENABLED!=='approved'||process.env.HOSTING_PUBLISHING_ENABLED!=='approved'))throw new ServiceDenied();
  if(!['source.status','source.repositories','source.github_status','source.secret_list'].includes(command.action)){
   const client=await getSupabase().from('freelance_hq_hosting_clients').select('status').eq('id',found.data.client_id).single();
   if(client.error||client.data?.status!=='active')throw new ServiceDenied();
  }
  wireCommand={...command,client:found.data.client_id};
 }
 if(process.env.HOSTING_SERVICES_ENABLED!=='approved')throw Error('Service not enrolled');
 const separateForms=command.action.startsWith('forms.')&&process.env.HOSTING_FORMS_ORIGIN;
 const origin=separateForms||process.env.HOSTING_SERVICES_ORIGIN,key=separateForms?process.env.HOSTING_FORMS_PORTAL_KEY:process.env.HOSTING_SERVICES_PORTAL_KEY;
 if(!origin||!key||key.length<32)throw Error('Service not enrolled');const url=new URL(origin);
 if(url.protocol!=='https:'||!url.hostname||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('Invalid private origin');
 if(command.action==='source.upload_ticket'){
  // The browser sends only ZIP bytes to the private service; this short ticket binds actor, service, size and digest.
  if(process.env.HOSTING_SOURCES_UPLOAD_ENABLED!=='approved')throw new ServiceDenied();
  const expires=Math.floor(Date.now()/1000)+300;
  const ticket=Buffer.from(JSON.stringify({schema:1,actor:scope.actor,client:(wireCommand as {client:string}).client,service:command.service,sha256:command.sha256,size:command.size,nonce:randomUUID(),expires})).toString('base64url');
  return sourceUploadTicket.parse({url:new URL('/v1/uploads',url).toString(),ticket,signature:createHmac('sha256',key).update('hms:upload-ticket:v1:'+ticket).digest('hex'),expires,max_bytes:SOURCE_UPLOAD_MAX_BYTES});
 }
 const body=JSON.stringify({schema:1,actor:scope.actor,nonce:randomUUID(),expires:Math.floor(Date.now()/1000)+120,command:wireCommand});
 if(Buffer.byteLength(body)>32768)throw new ServiceDenied();
 const response=await fetch(new URL('/v1/services',url),{method:'POST',body,headers:{'Content-Type':'application/json','X-HMS-Services-Signature':createHmac('sha256',key).update('hms:services-portal:v1:'+body).digest('hex')},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
 if(!response.ok||!response.body)throw Error('Service outcome unavailable');const reader=response.body.getReader();let bytes=0,text='';const decoder=new TextDecoder();
 try{for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.length;if(bytes>1024*1024)throw Error('Response exceeds budget');text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}finally{await reader.cancel();reader.releaseLock();}
 const value:unknown=JSON.parse(text);
 const domainJob=z.object({id:z.string().regex(/^[a-f0-9]{32}$/),digest:z.string().regex(/^[a-f0-9]{64}$/),state:z.enum(['queued','waiting_dns','applying','uncertain','provider_confirmed']),operation:z.enum(['attach','ssl']),live_verified:z.literal(false)}).strict();
 if(command.action==='hosting.domain.request')return domainJob.parse(value);
 if(command.action==='hosting.domain.status'){
  const expected=wireCommand as {domain:string};
  const status=z.object({service:z.literal(command.service),domain:z.literal(expected.domain),job:domainJob.nullable(),
   observation:z.object({dns:z.enum(['matched','mismatch','unavailable']),tls:z.enum(['valid','not_verified']),expires:z.number().int().positive().nullable(),checked:z.number().int().nonnegative(),fresh:z.boolean()}).strict().nullable(),live_verified:z.boolean()}).strict().parse(value);
  const observation=status.observation,now=Math.floor(Date.now()/1000);
  // Recheck freshness/expiry here; never accept an inconsistent remote green flag.
  if(observation&&(observation.checked>now||observation.fresh!==(now-observation.checked<=900)))throw new ServiceDenied();
  const valid=Boolean(observation&&observation.fresh&&observation.dns==='matched'&&observation.tls==='valid'&&observation.expires&&observation.expires>now);
  if(status.live_verified!==valid)throw new ServiceDenied();return status;
 }
 if(command.action==='hosting.provision')return z.object({id:z.string().regex(/^[a-f0-9]{32}$/),digest:z.string().regex(/^[a-f0-9]{64}$/),state:z.enum(['queued','applying','uncertain','provider_confirmed']),live_verified:z.literal(false)}).strict().parse(value);
 if(command.action==='hosting.status'){
  const status=z.union([
   z.object({service:z.literal(command.service),state:z.literal('not_requested'),live_verified:z.literal(false)}).strict(),
   z.object({service:z.literal(command.service),id:z.string().regex(/^[a-f0-9]{32}$/),digest:z.string().regex(/^[a-f0-9]{64}$/),state:z.enum(['queued','applying','uncertain','provider_confirmed']),live_verified:z.literal(false)}).strict()
  ]).parse(value);return status;
 }
 if(isSourceCommand(command)){
  if(command.action==='source.request'||command.action==='source.recover'||command.action==='source.build'){
   const job=sourceJob.parse(value);
   // The private service must have queued exactly the operation that was requested.
   if(command.action==='source.build'?job.operation!=='build'||job.tree!==command.tree:command.action==='source.recover'?job.operation!=='recover':job.operation!==command.operation||(command.operation==='publish'&&job.tree!==command.tree)||(command.operation==='export'&&job.tree!==command.tree))throw new ServiceDenied();
   return job;
  }
  if(command.action==='source.approvals_pending'){const list=approvalsPending.parse(value);if(list.service!==command.service)throw new ServiceDenied();return list;}
  if(command.action==='source.approval_view'||command.action==='source.approve'||command.action==='source.approval_withdraw'){
   const view=approvalView.parse(value);
   // The view must be about the job asked for, on this website, and show exactly the state the request implies.
   if(view.job.id!==command.job)throw new ServiceDenied();
   if(command.action==='source.approve'&&(!view.approval_received||view.job.digest!==command.approval.digest||view.plan?.digest!==command.approval.plan&&view.needs_plan))throw new ServiceDenied();
   if(command.action==='source.approval_withdraw'&&view.approval_received)throw new ServiceDenied();
   return view;
  }
  if(command.action==='source.secret_key'){const key=secretKey.parse(value);if(key.service!==command.service)throw new ServiceDenied();return key;}
  if(command.action.startsWith('source.secret_')){
   const list=secretList.parse(value);if(list.service!==command.service)throw new ServiceDenied();
   const present=(name:string)=>list.secrets.some(s=>s.name===name);
   // The service must report that exactly this variable now exists or no longer exists; values are never part of any answer.
   if(command.action==='source.secret_put'&&!present(command.name))throw new ServiceDenied();
   if(command.action==='source.secret_delete'&&present(command.name))throw new ServiceDenied();
   return list;
  }
  if(command.action==='source.github_status'||command.action==='source.github_link'||command.action==='source.auto_install'||command.action==='source.auto_revoke'||command.action==='source.auto_resume'){
   const github=githubStatus.parse(value);if(github.service!==command.service)throw new ServiceDenied();
   // The private service must have applied exactly the requested change to the policy.
   if(command.action==='source.github_link'&&!github.installations.some(i=>i.installation_id===command.installation_id&&i.state==='active'))throw new ServiceDenied();
   if(command.action==='source.auto_revoke'&&github.auto.policy&&github.auto.policy.state!=='revoked')throw new ServiceDenied();
   if(command.action==='source.auto_resume'&&(!github.auto.policy||github.auto.policy.state!=='active'))throw new ServiceDenied();
   if(command.action==='source.auto_install'&&(github.auto.policy?.id!==command.policy.id||github.auto.policy.state!=='active'||github.auto.policy.repository_id!==command.policy.repository_id||github.auto.policy.branch!==command.policy.branch||github.auto.policy.allow_activation!==command.policy.allow_activation))throw new ServiceDenied();
   return github;
  }
  if(command.action==='source.repositories'){const list=sourceRepositories.parse(value);if(list.service!==command.service)throw new ServiceDenied();return list;}
  const status=sourceStatus.parse(value);if(status.service!==command.service)throw new ServiceDenied();
  // Recheck that the private service applied exactly the requested repository change.
  if((command.action==='source.connect'||command.action==='source.switch')&&(status.repository?.repository_id!==command.repository_id||status.repository.installation_id!==command.installation_id||status.repository.branch!==command.branch||status.version!==command.expected_version+1))throw new ServiceDenied();
  if(command.action==='source.disconnect'&&(status.repository!==null||status.version!==command.expected_version+1))throw new ServiceDenied();
  return status;
 }
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


// What the owner's local signer must be shown for an automatic-deployment policy: only values the server derived from the saved service,
// never a browser field. The signer displays them and the private service checks them again against its own provisioning record.
export async function signerContext(scope:ServiceScope,rawService:unknown){
 const service=z.string().uuid().safeParse(rawService);
 if(!service.success||scope.owner!==true||scope.readOnly||!scope.sites.has(service.data))throw new ServiceDenied();
 if(process.env.HOSTING_SOURCES_ENABLED!=='approved')throw new ServiceDenied();
 const found=await getSupabase().from('freelance_hq_hosting_services').select('id,client_id,status').eq('id',service.data).single();
 if(found.error||!found.data||found.data.client_id!==scope.sites.get(service.data)?.client||!['pending','active'].includes(found.data.status))throw new ServiceDenied();
 return {service:found.data.id as string,client:found.data.client_id as string,actor:scope.actor};
}
