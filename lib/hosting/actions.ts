"use server";
import { serviceStatusError } from "./serviceStatus";
import { rateLimit } from "@/lib/security/rateLimit";
import { isIP } from "node:net";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSupabase } from "@/lib/supabaseClient";
import { getSiteOrigin } from "@/lib/site";
import { requireHostingAdmin, requireHostingClient } from "./auth";
import { checked, hostingTable } from "./store";
import { currency, cycle, date, domainName, hostingToday, moneyMinor, optionalText, safeReturnPath, text, uuid } from "./validation";
import { isPublicAddress, probeDns, probeTls } from "./probes";
import type { HostingAccess, HostingClient, HostingDomain, HostingInvoice, HostingServer, HostingService } from "./types";

const str=(form:FormData,name:string)=>String(form.get(name)??'').trim();
const flag=(form:FormData,name:string)=>form.get(name)==='on';
const integer=(form:FormData,name:string,max=1000000000)=>z.coerce.number().int().min(0).max(max).parse(str(form,name)||'0');
const optionalId=(form:FormData,name:string)=>str(form,name)?uuid.parse(str(form,name)):null;
async function audit(actor:string,event:string,entity:string,id:string|null) { checked(await getSupabase().from(hostingTable('audit_logs')).insert({actor_id:actor,event,entity,entity_id:id})); }
async function rpc<T>(name:string,args:Record<string,unknown>):Promise<T> {
  const result=await getSupabase().rpc('freelance_hq_hosting_'+name,args);
  if(result.error) {
    const message=String(result.error.message);
    const allowed=['App Hosting server enforcement is not verified','Website allowance of this account is used','Additional websites need an enforced account','Only an assigned App Hosting contract has an account','The contract must be pending and have a server','Contract limits do not match their digest','App Hosting server enforcement is not enrolled','App Hosting is not ready for billing','Assigned package contract is immutable','Payment exceeds outstanding balance','Refund exceeds refundable amount','Only issued invoices accept payments','An invoice with payment history cannot be cancelled','Submission already reviewed','Invalid original payment','Service invoice ownership, currency or period mismatch','Idempotency key reused with different data'];
    throw new Error(serviceStatusError(message) || allowed.find(s=>message.includes(s)) || 'The operation could not be completed. Check the record, currency and amount.');
  }
  return result.data as T;
}
async function save(table:string,values:Record<string,unknown>,id:string|null) {
  const db=getSupabase().from(hostingTable(table));
  const result=id ? await db.update(values).eq('id',id).select('id').single() : await db.insert(values).select('id').single();
  if(table==='services'&&result.error){const message=serviceStatusError(String(result.error.message));if(message)throw new Error(message);}
  return checked<{id:string}>(result).id;
}
async function requireClientActive(clientId:string) {
  const r=checked<{id:string;status:string}>(await getSupabase().from(hostingTable('clients')).select('id,status').eq('id',clientId).single());
  if(r.status!=='active') throw new Error('The hosting client must be active.');
}
async function saveEntity(form:FormData,actor:string) {
  const entity=z.enum(['servers','packages','clients','services','domains','expenses','settings']).parse(str(form,'entity'));
  const id=optionalId(form,'id'); let values:Record<string,unknown>;
  if(entity==='servers') {
    const ipv4=optionalText(64).parse(str(form,'ipv4')),ipv6=optionalText(64).parse(str(form,'ipv6'));
    if((ipv4&&(!isPublicAddress(ipv4)||isIP(ipv4)!==4)) || (ipv6&&(!isPublicAddress(ipv6)||isIP(ipv6)!==6))) throw new Error('Enter public server IP addresses only.');
    values={name:text(120).parse(str(form,'name')),hostname:domainName(str(form,'hostname')),ipv4,ipv6,provider:optionalText(120).parse(str(form,'provider')),region:optionalText(120).parse(str(form,'region')),status:z.enum(['draft','available','maintenance','disabled']).parse(str(form,'status')),disk_mb:integer(form,'disk_mb'),memory_mb:integer(form,'memory_mb'),notes:optionalText().parse(str(form,'notes'))};
  } else if(entity==='packages') {
    values={name:text(120).parse(str(form,'name')),description:optionalText().parse(str(form,'description')),price_minor:moneyMinor(str(form,'price')),currency:currency.parse(str(form,'currency')),billing_cycle:cycle.parse(str(form,'billing_cycle')),disk_mb:integer(form,'disk_mb'),inode_limit:str(form,'inode_limit')?z.coerce.number().int().positive().max(1000000000).parse(str(form,'inode_limit')):null,memory_mb:integer(form,'memory_mb'),cpu_percent:integer(form,'cpu_percent',10000),domain_limit:integer(form,'domain_limit',10000),email_limit:integer(form,'email_limit',100000),is_active:flag(form,'is_active')};
    if(str(form,'product_kind')==='app_hosting'){
      const {limitsFromForm}=await import('./packageLimits');
      const limits=limitsFromForm(form);
      Object.assign(values,{product_kind:'app_hosting',resource_limits:limits,pricing_ready:flag(form,'pricing_ready'),disk_mb:limits.disk_mb,inode_limit:limits.inode_limit,memory_mb:limits.memory_mb,cpu_percent:limits.cpu_percent,domain_limit:limits.website_limit,email_limit:limits.email_limit});
    }
    const serverIds=z.array(uuid).max(100).parse(form.getAll('server_ids'));
    return rpc<string>('save_package',{p_actor:actor,p_id:id??randomUUID(),p_data:values,p_servers:serverIds});
  } else if(entity==='clients') {
    values={name:text(120).parse(str(form,'name')),company:optionalText(120).parse(str(form,'company')),email:z.string().email().max(254).parse(str(form,'email').toLowerCase()),phone:optionalText(60).parse(str(form,'phone')),address:optionalText(1000).parse(str(form,'address')),status:z.enum(['active','suspended','closed']).parse(str(form,'status')),notes:optionalText().parse(str(form,'notes')),agency_client_id:optionalId(form,'agency_client_id')};
    if(id) {
      const access=await getSupabase().from(hostingTable('client_access')).select('id',{count:'exact',head:true}).eq('client_id',id);checked(access);
      if(access.count) { const old=checked<HostingClient>(await getSupabase().from(hostingTable('clients')).select('email').eq('id',id).single());if(old.email!==values.email)throw new Error('This email is bound to portal access. Contact the administrator before changing its identity.'); }
    }
  } else if(entity==='services') {
    if(id) {
      // Invoice snapshots and client ownership cannot be reassigned by an edit.
      values={status:z.enum(['pending','active','suspended','cancelled']).parse(str(form,'status')),next_due_date:date.parse(str(form,'next_due_date')),auto_invoice:flag(form,'auto_invoice'),notes:optionalText().parse(str(form,'notes'))};
    } else {
      const clientId=uuid.parse(str(form,'client_id'));await requireClientActive(clientId);
      const packageId=uuid.parse(str(form,'package_id'));
      const pkg=checked<{price_minor:number;currency:string;billing_cycle:string;is_active:boolean}>(await getSupabase().from(hostingTable('packages')).select('price_minor,currency,billing_cycle,is_active').eq('id',packageId).single());
      if(!pkg.is_active) throw new Error('Choose an active package.');
      const serverId=optionalId(form,'server_id');
      if(serverId) { const server=checked<{status:string}>(await getSupabase().from(hostingTable('servers')).select('status').eq('id',serverId).single()); if(server.status!=='available')throw new Error('Choose a server accepting new services.'); }
      values={status:z.enum(['active','pending']).parse(str(form,'status')||'pending'),client_id:clientId,package_id:packageId,server_id:serverId,name:text(120).parse(str(form,'name')),primary_domain:str(form,'primary_domain')?domainName(str(form,'primary_domain')):'',price_minor:pkg.price_minor,currency:pkg.currency,billing_cycle:pkg.billing_cycle,next_due_date:date.parse(str(form,'next_due_date')),auto_invoice:flag(form,'auto_invoice'),notes:optionalText().parse(str(form,'notes'))};
      return rpc<string>('assign_service',{p_actor:actor,p_key:uuid.parse(str(form,'request_key')),p_data:Object.fromEntries(Object.entries(values).filter(([key])=>!['price_minor','currency','billing_cycle'].includes(key)))});
    }
  } else if(entity==='domains') {
    values={client_id:uuid.parse(str(form,'client_id')),service_id:optionalId(form,'service_id'),hostname:domainName(str(form,'hostname')),expires_on:str(form,'expires_on')?date.parse(str(form,'expires_on')):null,auto_renew:flag(form,'auto_renew'),notes:optionalText().parse(str(form,'notes'))};
    if(id) Object.assign(values,{dns_status:'unchecked',dns_checked_at:null,ssl_status:'unchecked',ssl_checked_at:null,ssl_expires_at:null});
  } else if(entity==='expenses') {
    if(id) throw new Error('Expense records are immutable. Record a correcting entry through your accountant.');
    values={server_id:optionalId(form,'server_id'),vendor:text(200).parse(str(form,'vendor')),category:text(100).parse(str(form,'category')),amount_minor:moneyMinor(str(form,'amount')),currency:currency.parse(str(form,'currency')),incurred_on:date.parse(str(form,'incurred_on')),notes:optionalText().parse(str(form,'notes')),idempotency_key:uuid.parse(str(form,'request_key'))};
  } else {
    if(flag(form,'renewal_automation')&&!process.env.CRON_SECRET)throw new Error('Configure CRON_SECRET on Vercel before enabling scheduled renewals.');
    values={portal_name:text(120).parse(str(form,'portal_name')),business_name:optionalText(200).parse(str(form,'business_name')),business_email:str(form,'business_email')?z.string().email().parse(str(form,'business_email')):'',business_address:optionalText(1000).parse(str(form,'business_address')),default_currency:currency.parse(str(form,'default_currency')),invoice_prefix:z.string().regex(/^[A-Z0-9-]{1,12}$/).parse(str(form,'invoice_prefix')),payment_instructions:optionalText(4000).parse(str(form,'payment_instructions')),invoice_terms:optionalText(4000).parse(str(form,'invoice_terms')),renewal_lead_days:integer(form,'renewal_lead_days',90),invoice_due_days:integer(form,'invoice_due_days',90),renewal_automation:flag(form,'renewal_automation'),automation_actor:flag(form,'renewal_automation')?actor:null,updated_at:new Date().toISOString()};
    checked(await getSupabase().from(hostingTable('settings')).update(values).eq('id',true));await audit(actor,'settings_saved','settings',null);return null;
  }
  const recordId=await save(entity,values,id);await audit(actor,id?'record_updated':'record_created',entity,recordId);return recordId;
}
async function inviteClient(form:FormData,actor:string) {
  const clientId=uuid.parse(str(form,'client_id'));await requireClientActive(clientId);
  const client=checked<HostingClient>(await getSupabase().from(hostingTable('clients')).select('*').eq('id',clientId).single());
  const staff=await getSupabase().from('freelance_hq_profiles').select('id',{count:'exact',head:true}).ilike('email',client.email);checked(staff);
  if(staff.count) throw new Error('This email belongs to a team account. Use a separate client email.');
  const existing=checked<HostingAccess|null>(await getSupabase().from(hostingTable('client_access')).select('*').eq('email',client.email).maybeSingle());
  if(existing&&existing.client_id!==clientId) throw new Error('This email already belongs to another hosting client.');
  // Reserve access first so a fast invitation callback cannot become a team account.
  const accessId=existing?.id ?? checked<{id:string}>(await getSupabase().from(hostingTable('client_access')).insert({client_id:clientId,email:client.email}).select('id').single()).id;
  const result=await getSupabase().auth.admin.inviteUserByEmail(client.email,{redirectTo:getSiteOrigin()+'/auth/invite'});
  if(result.error || !result.data.user) throw new Error('Invitation could not be sent. If the account already exists, use Link existing account with its user ID.');
  checked(await getSupabase().from(hostingTable('client_access')).update({auth_user_id:result.data.user.id,enabled:true,invited_at:new Date().toISOString()}).eq('id',accessId));
  await audit(actor,'client_invited','clients',clientId);
}
async function linkAccount(form:FormData,actor:string) {
  const clientId=uuid.parse(str(form,'client_id')),userId=uuid.parse(str(form,'auth_user_id'));await requireClientActive(clientId);
  const client=checked<HostingClient>(await getSupabase().from(hostingTable('clients')).select('*').eq('id',clientId).single());
  const staff=await getSupabase().from('freelance_hq_profiles').select('id',{count:'exact',head:true}).eq('id',userId);checked(staff);
  if(staff.count)throw new Error('A team account cannot be used as a client login.');
  const user=await getSupabase().auth.admin.getUserById(userId);
  if(user.error || !user.data.user?.email_confirmed_at || user.data.user.email?.toLowerCase()!==client.email) throw new Error('The verified account email must match the client email.');
  const existing=checked<HostingAccess|null>(await getSupabase().from(hostingTable('client_access')).select('*').eq('email',client.email).maybeSingle());
  if(existing&&existing.client_id!==clientId)throw new Error('This account is linked to another client.');
  if(existing) checked(await getSupabase().from(hostingTable('client_access')).update({auth_user_id:userId,enabled:true}).eq('id',existing.id));
  else checked(await getSupabase().from(hostingTable('client_access')).insert({client_id:clientId,auth_user_id:userId,email:client.email}));
  await audit(actor,'client_account_linked','clients',clientId);
}
async function verifyDomain(form:FormData,actor:string) {
  const id=uuid.parse(str(form,'id'));
  const domain=checked<HostingDomain>(await getSupabase().from(hostingTable('domains')).select('*').eq('id',id).single());
  if(!domain.service_id)throw new Error('Link a hosting service before checking DNS or SSL.');
  const service=checked<HostingService>(await getSupabase().from(hostingTable('services')).select('*').eq('id',domain.service_id).eq('client_id',domain.client_id).single());
  if(!service.server_id)throw new Error('Assign a registered server to this service first.');
  const server=checked<HostingServer>(await getSupabase().from(hostingTable('servers')).select('*').eq('id',service.server_id).single());
  const now=new Date().toISOString();
  if(str(form,'action')==='check_dns') {
    let status='error';try {status=(await probeDns(domain.hostname,server.ipv4,server.ipv6)).matched?'matched':'mismatch';}catch { /* observed failure */ }
    checked(await getSupabase().from(hostingTable('domains')).update({dns_status:status,dns_checked_at:now}).eq('id',id));
  } else {
    let expires:string|null=null;try {expires=await probeTls(domain.hostname,server.ipv4||server.ipv6);}catch { /* store observed failure without leaking network internals */ }
    checked(await getSupabase().from(hostingTable('domains')).update({ssl_status:expires?'valid':'error',ssl_checked_at:now,ssl_expires_at:expires}).eq('id',id));
  }
  await audit(actor,str(form,'action'),'domains',id);
}
export async function changeHostingServiceStatus(id:string,status:string,expectedStatus:string):Promise<{ok:true;status:string}|{ok:false;error:string}> {
  const actor=await requireHostingAdmin();
  try {
    await rateLimit("hosting-write",actor.id,60,60);
    const statuses=z.enum(['active','pending','suspended','cancelled']);
    const saved=await rpc<string>('set_service_status',{p_actor:actor.id,p_service:uuid.parse(id),p_status:statuses.parse(status),p_expected_status:statuses.parse(expectedStatus)});
    revalidatePath('/hosting','layout');revalidatePath('/client','layout');
    return {ok:true,status:saved};
  } catch(error) {
    return {ok:false,error:error instanceof z.ZodError?'Choose a valid service status.':error instanceof Error?error.message:'Could not save the service status.'};
  }
}
export async function hostingAdminAction(form:FormData) {
  const actor=await requireHostingAdmin();
  const returnPath=safeReturnPath(str(form,'return_path'));let target=returnPath;
  try {
    await rateLimit("hosting-write",actor.id,60,60);
    const action=z.enum(['save','invoice','payment','review_submission','cancel_invoice','renewals','invite','link_account','access','job','cancel_job','check_dns','check_ssl','ticket_reply','ticket_status','app_open_account','app_add_site']).parse(str(form,'action'));
    if(action==='save') await saveEntity(form,actor.id);
    else if(action==='invoice') {
      const raw=form.getAll('line_description').map((description,i)=>({description,i})).filter(({description,i})=>String(description).trim()||String(form.getAll('line_price')[i]??'').trim()).map(({description,i})=>({description:text(1000).parse(description),quantity:z.coerce.number().int().min(1).max(100000).parse(form.getAll('line_quantity')[i]),unit_minor:moneyMinor(String(form.getAll('line_price')[i]??''))}));
      const id=await rpc<string>('create_invoice',{p_actor:actor.id,p_data:{client_id:uuid.parse(str(form,'client_id')),service_id:optionalId(form,'service_id'),currency:currency.parse(str(form,'currency')),issued_on:date.parse(str(form,'issued_on')),due_on:date.parse(str(form,'due_on')),period_start:str(form,'period_start')?date.parse(str(form,'period_start')):null,tax_minor:moneyMinor(str(form,'tax')||'0'),notes:optionalText(4000).parse(str(form,'notes')),idempotency_key:uuid.parse(str(form,'request_key'))},p_items:raw});target='/hosting/invoices/'+id;
    } else if(action==='payment') {
      await rpc('record_payment',{p_actor:actor.id,p_data:{invoice_id:uuid.parse(str(form,'invoice_id')),amount_minor:moneyMinor(str(form,'amount')),currency:currency.parse(str(form,'currency')),direction:z.enum(['incoming','refund']).parse(str(form,'direction')),refund_of:optionalId(form,'refund_of'),method:z.enum(['bank_transfer','cash','card','other']).parse(str(form,'method')),reference:text(120).parse(str(form,'reference')),paid_on:date.parse(str(form,'paid_on')),idempotency_key:uuid.parse(str(form,'request_key'))}});
    } else if(action==='cancel_invoice') await rpc('cancel_invoice',{p_actor:actor.id,p_id:uuid.parse(str(form,'invoice_id'))});
    else if(action==='review_submission') await rpc('review_submission',{p_actor:actor.id,p_id:uuid.parse(str(form,'id')),p_approve:str(form,'decision')==='approve'});
    else if(action==='renewals') await rpc('run_renewals',{p_actor:actor.id});
    else if(action==='invite') await inviteClient(form,actor.id);
    else if(action==='link_account') await linkAccount(form,actor.id);
    else if(action==='access') {const id=uuid.parse(str(form,'id'));checked(await getSupabase().from(hostingTable('client_access')).update({enabled:flag(form,'enabled')}).eq('id',id));await audit(actor.id,'client_access_changed','client_access',id);}
    else if(action==='check_dns'||action==='check_ssl') await verifyDomain(form,actor.id);
    else if(action==='job') {const id=await save('jobs',{service_id:uuid.parse(str(form,'service_id')),kind:z.enum(['provision','suspend','resume','cancel','deploy','rollback','configure']).parse(str(form,'kind')),note:optionalText().parse(str(form,'note')),requested_by:actor.id,idempotency_key:uuid.parse(str(form,'request_key'))},null);await audit(actor.id,'operation_requested','jobs',id);}
    else if(action==='app_open_account') await rpc('open_account',{p_actor:actor.id,p_service:uuid.parse(str(form,'service_id'))});
    else if(action==='app_add_site') await rpc('add_site',{p_actor:actor.id,p_account:uuid.parse(str(form,'account_id')),p_hostname:domainName(str(form,'hostname'))});
    else if(action==='cancel_job') {const id=uuid.parse(str(form,'id'));checked(await getSupabase().from(hostingTable('jobs')).update({status:'cancelled'}).eq('id',id).eq('status','awaiting_connection'));await audit(actor.id,'operation_cancelled','jobs',id);}
    else if(action==='ticket_reply') {
      const id=uuid.parse(str(form,'ticket_id'));checked(await getSupabase().from(hostingTable('tickets')).select('id').eq('id',id).single());
      checked(await getSupabase().from(hostingTable('ticket_messages')).insert({ticket_id:id,body:text(10000).parse(str(form,'body')),is_internal:flag(form,'is_internal'),author_role:'admin',author_id:actor.id,idempotency_key:uuid.parse(str(form,'request_key'))}));await audit(actor.id,'ticket_reply','tickets',id);
    } else if(action==='ticket_status') {const id=uuid.parse(str(form,'ticket_id'));checked(await getSupabase().from(hostingTable('tickets')).update({status:z.enum(['open','pending_customer','resolved','closed']).parse(str(form,'status'))}).eq('id',id));await audit(actor.id,'ticket_status_changed','tickets',id);}
    revalidatePath('/hosting','layout');revalidatePath('/client','layout');
  } catch(error) {
    const message=error instanceof z.ZodError?error.issues[0]?.message:error instanceof Error?error.message:'Could not save changes.';
    redirect(returnPath+'?error='+encodeURIComponent(message??'Check the form values.'));
  }
  redirect(target+'?saved=1');
}
export async function hostingClientAction(form:FormData) {
  const session=await requireHostingClient();
  if(session.adminView)throw new Error("Admin client view is read-only. Return to Hosting to make changes.");
  const returnPath=safeReturnPath(str(form,'return_path'),true);let target=returnPath;
  try {
    await rateLimit("client-write",session.userId,30,60);
    const action=z.enum(['payment_submission','new_ticket','ticket_reply']).parse(str(form,'action'));
    const key=uuid.parse(str(form,'request_key'));
    if(action==='payment_submission') {
      const invoice=checked<HostingInvoice>(await getSupabase().from(hostingTable('invoices')).select('id,status,total_minor').eq('id',uuid.parse(str(form,'invoice_id'))).eq('client_id',session.clientId).single());
      if(invoice.status!=='issued')throw new Error('This invoice is not accepting payment references.');
      const amount=moneyMinor(str(form,'amount'));if(amount<=0||amount>Number(invoice.total_minor))throw new Error('Check the payment amount.');
      const recent=await getSupabase().from(hostingTable('payment_submissions')).select('id',{count:'exact',head:true}).eq('client_id',session.clientId).gte('created_at',new Date(Date.now()-3600000).toISOString());checked(recent);
      if((recent.count??0)>=10)throw new Error('Please wait before submitting more payment references.');
      checked(await getSupabase().from(hostingTable('payment_submissions')).insert({client_id:session.clientId,invoice_id:invoice.id,amount_minor:amount,reference:text(120).parse(str(form,'reference')),notes:optionalText().parse(str(form,'notes')),idempotency_key:key}));
    } else if(action==='new_ticket') {
      const recent=await getSupabase().from(hostingTable('tickets')).select('id',{count:'exact',head:true}).eq('client_id',session.clientId).gte('created_at',new Date(Date.now()-3600000).toISOString());checked(recent);
      if((recent.count??0)>=10)throw new Error('Please wait before opening more tickets.');
      const serviceId=optionalId(form,'service_id');
      if(serviceId)checked(await getSupabase().from(hostingTable('services')).select('id').eq('id',serviceId).eq('client_id',session.clientId).single());
      const subject=text(200).parse(str(form,'subject')),body=text(10000).parse(str(form,'body')),priority=z.enum(['low','normal','high']).parse(str(form,'priority'));
      const id=await rpc<string>('client_ticket',{p_user:session.userId,p_client:session.clientId,p_service:serviceId,p_subject:subject,p_body:body,p_priority:priority,p_key:key});target='/client/tickets/'+id;
    } else {
      const ticket=checked<{id:string;status:string}>(await getSupabase().from(hostingTable('tickets')).select('id,status').eq('id',uuid.parse(str(form,'ticket_id'))).eq('client_id',session.clientId).single());
      if(ticket.status==='closed')throw new Error('This ticket is closed. Open a new ticket if you need help.');
      const recent=await getSupabase().from(hostingTable('ticket_messages')).select('id',{count:'exact',head:true}).eq('author_id',session.userId).gte('created_at',new Date(Date.now()-3600000).toISOString());checked(recent);
      if((recent.count??0)>=60)throw new Error('Please wait before sending more replies.');
      checked(await getSupabase().from(hostingTable('ticket_messages')).insert({ticket_id:ticket.id,body:text(10000).parse(str(form,'body')),author_role:'client',author_id:session.userId,is_internal:false,idempotency_key:key}));
    }
    revalidatePath('/client','layout');revalidatePath('/hosting','layout');
  } catch(error) {const message=error instanceof z.ZodError?error.issues[0]?.message:error instanceof Error?error.message:'Could not save changes.';redirect(returnPath+'?error='+encodeURIComponent(message??'Check the form values.'));}
  redirect(target+'?saved=1');
}

