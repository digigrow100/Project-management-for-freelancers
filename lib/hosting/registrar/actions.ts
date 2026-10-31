'use server';
import {z} from 'zod';
import {revalidatePath} from 'next/cache';
import {requireHostingAdmin} from '@/lib/hosting/auth';
import {rateLimit} from '@/lib/security/rateLimit';
import {getSupabase} from '@/lib/supabaseClient';
import {Dynadot,RegistrarError} from './api';
import {credentials,hostname,intent,type Credentials} from './schema';
import {table,checked,connection,saveConnection,remember,prepare,operation,claim,finish} from './store';
import {observed,validateChange,same} from './workflow';
const messages:Record<string,string>={relay_configuration:'The fixed-IP connection is not configured. Contact the server administrator.',relay_unavailable:'The fixed-IP server could not confirm this request. Check operation status before trying again.',record_conflict:'This record conflicts with an existing DNS record. Review and remove the conflicting record first.',not_connected:'Connect your Dynadot account first.',credentials_rejected:'Dynadot rejected the credentials. Check the key, secret, mode and any API IP restrictions.',provider_rejected:'Dynadot refused this request. Check the domain and its account restrictions in Dynadot.',rate_limited:'Dynadot is busy. Please wait a minute before trying again.',answer_unknown:'The answer could not be confirmed. Check the operation status before trying again.',invalid_response:'Dynadot returned an unexpected answer. No successful result can be confirmed.',price_unavailable:'Dynadot did not return a usable domain-specific renewal price. Renew this domain in Dynadot until its price can be verified here.',storage_unavailable:'Domain records could not be saved. Refresh and check operation status.',review_expired:'This review expired or was already submitted. Refresh its operation status.',reconcile_required:'A previous domain change needs a status check before another change can start.',external_dns:'This domain is not using Dynadot DNS. Manage records at its current DNS provider.',record_changed:'That DNS record has changed or already exists. Reload the current records.',stale_review:'The domain or renewal price changed. Prepare a new review.',configuration_missing:'Secure credential storage is not configured on the server.'};
function api(c:Credentials){return new Dynadot(c,fetch,async()=>{try{await rateLimit('dynadot-provider',c.mode,1,1);}catch{throw new RegistrarError('rate_limited');}});}
function refresh(){revalidatePath('/hosting/domains');revalidatePath('/hosting/registrar');}
export async function registrarAction(form:FormData){
 const actor=await requireHostingAdmin();
 try{
  await rateLimit('registrar-owner',actor.id,60,60);
  const action=z.enum(['connect','sync_start','sync','list','details','prepare','apply','reconcile','history']).parse(form.get('action'));
  if(action==='connect'){
   if(!process.env.DYNADOT_SECRET)throw new RegistrarError('configuration_missing');
   const c=credentials.parse({key:form.get('key'),secret:form.get('secret'),mode:form.get('mode')});
   const first=await api(c).list(1);const version=await saveConnection(actor.id,c);await remember(version,first.domain_info_list);
   refresh();return {ok:true as const,mode:c.mode,count:first.pagination_result.total,message:'Connection tested and saved. Sync all domains to finish importing the account.'};
  }
  const c=await connection(),provider=api(c.credentials);
  if(action==='list'){
   const page=z.coerce.number().int().min(1).max(100000).parse(form.get('page')||1);const search=z.string().trim().toLowerCase().max(253).regex(/^[a-z0-9.*-]*$/).parse(form.get('search')||'');
   let query=getSupabase().from(table('domains')).select('name,details,synced_at',{count:'exact'}).eq('connection_version',c.version).order('name').range((page-1)*50,page*50-1);
   if(search)query=query.ilike('name','%'+search.replaceAll('*','')+'%');
   const r=await query;checked(r);return {ok:true as const,rows:r.data??[],total:r.count??0,mode:c.mode};
  }
  if(action==='sync_start'){const run=checked(await getSupabase().rpc('freelance_hq_hosting_registrar_sync_start',{p_actor:actor.id,p_version:c.version}));return {ok:true as const,run:String(run)};}
  if(action==='sync'){
   const page=z.coerce.number().int().min(1).max(100000).parse(form.get('page')||1);const run=z.string().uuid().parse(form.get('run'));const remote=await provider.list(page);
   checked(await getSupabase().rpc('freelance_hq_hosting_registrar_sync_page',{p_actor:actor.id,p_version:c.version,p_run:run,p_page:page,p_total:remote.pagination_result.total,p_next:remote.pagination_result.has_next_page,p_domains:remote.domain_info_list}));
   refresh();return {ok:true as const,hasNext:remote.pagination_result.has_next_page,nextPage:page+1,total:remote.pagination_result.total,count:remote.domain_info_list.length};
  }
  if(action==='history'){
   const rows=checked(await getSupabase().from(table('operations')).select('id,domain,kind,state,created_at,updated_at').eq('connection_version',c.version).order('created_at',{ascending:false}).limit(100));return {ok:true as const,operations:rows??[]};
  }
  if(action==='apply'||action==='reconcile'){
   const id=z.string().uuid().parse(form.get('id')),op=await operation(id,actor.id);
   if(op.connection_version!==c.version)throw new RegistrarError('review_expired');
   if(action==='reconcile'){
    if(!['executing','uncertain','confirmed'].includes(op.state))throw new RegistrarError('review_expired');
    if(op.state==='executing'&&Date.now()-Date.parse(op.updated_at)<60000)throw new RegistrarError('reconcile_required');
    const after=await provider.info(op.domain);await remember(c.version,[after]);
    if(op.state==='confirmed')return {ok:true as const,message:'This operation was already confirmed.'};
    if(observed(op.before_state,after,intent.parse(op.intent))){await finish(op,'confirmed');refresh();return {ok:true as const,message:'The requested result is now visible in Dynadot.'};}
    if(op.state==='executing')await finish(op,'uncertain');
    return {ok:false as const,error:'The result is still unclear. Further changes remain blocked. Check this operation in Dynadot before an operator resolves it.'};
   }
   if(String(form.get('confirmation'))!==op.domain)throw new RegistrarError('stale_review');
   const change=intent.parse(op.intent);await claim(actor.id,id);
   let sent=false;
   try{
    const current=await provider.info(op.domain);
    if(!same(current,op.before_state))throw new RegistrarError('stale_review');
    validateChange(current,change);
    if(change.kind==='renew'&&!same(await provider.quote(op.domain,change.currency,change.years),op.quote))throw new RegistrarError('stale_review');
    sent=true;await provider.change(op.domain,change,id);
    const after=await provider.info(op.domain);await remember(c.version,[after]);
    const verified=observed(current,after,change);await finish(op,verified?'confirmed':'uncertain');refresh();
    return verified?{ok:true as const,message:'Change confirmed by Dynadot.'}:{ok:false as const,error:'Dynadot accepted the request, but its final state is not visible yet. Use Check operation status.'};
   }catch(e){await finish(op,sent?'uncertain':'failed');throw e;}
  }
  const name=hostname.parse(form.get('domain'));const before=await provider.info(name);await remember(c.version,[before]);
  if(action==='details')return {ok:true as const,domain:before};
  const change=intent.parse(JSON.parse(String(form.get('intent'))));validateChange(before,change);
  const quote=change.kind==='renew'?await provider.quote(name,change.currency,change.years):null;
  const review=await prepare(actor.id,c.version,name,change,before,quote);
  return {ok:true as const,review:{id:review.id,domain:name,intent:change,before,quote,expires:review.expires_at,mode:c.mode}};
 }catch(e){
  return {ok:false as const,error:e instanceof RegistrarError?(messages[e.code]??'The domain operation could not be completed.'):e instanceof z.ZodError?'Check the fields and try again.':'The request could not be completed. Refresh and check operation status.'};
 }
}
