'use server';
import {requireHostingAdmin} from '@/lib/hosting/auth';
import {getSupabase} from '@/lib/supabaseClient';
import {rateLimit} from '@/lib/security/rateLimit';
import {randomBytes} from 'node:crypto';
import {revalidatePath} from 'next/cache';
import {z} from 'zod';
import {emailSettings,mailHostname,emptyEmailSettings,type EmailWorkspace,type EmailDomain} from './schema';
import {observeEmailDns} from './dns';
function checked<T>(r:{data:T;error:unknown}):T{if(r.error)throw Error('storage');return r.data;}
export async function emailWorkspace():Promise<EmailWorkspace>{
 const actor=await requireHostingAdmin();
 const data=checked(await getSupabase().rpc('freelance_hq_hosting_email_workspace',{p_actor:actor.id})) as Omit<EmailWorkspace,'servicesEnabled'>;
 return {...data,settings:emailSettings.parse(data.settings??emptyEmailSettings),servicesEnabled:process.env.HOSTING_SERVICES_ENABLED==='approved'};
}
export async function emailAction(form:FormData){
 const actor=await requireHostingAdmin();
 try{
  await rateLimit('email-setup',actor.id,20,60);
  const action=z.enum(['add','check','settings']).parse(form.get('action'));
  if(action==='settings'){
   const settings=emailSettings.parse(Object.fromEntries(Object.keys(emptyEmailSettings).map(k=>[k,String(form.get(k)??'').trim()])));
   checked(await getSupabase().rpc('freelance_hq_hosting_email_settings_save',{p_actor:actor.id,p_settings:settings}));
   revalidatePath('/hosting/email');revalidatePath('/hosting/settings/email');return {ok:true as const,message:'Email settings saved. These settings do not activate a server or verify delivery.'};
  }
  if(action==='add'){
   const name=mailHostname.parse(form.get('hostname'));
   const domain=checked(await getSupabase().rpc('freelance_hq_hosting_email_domain_add',{p_actor:actor.id,p_hostname:name,p_token:randomBytes(32).toString('hex')})) as EmailDomain;
   revalidatePath('/hosting/email');return {ok:true as const,domain,message:'Domain added. Complete the setup checklist before using email.'};
  }
  const id=z.string().uuid().parse(form.get('id'));
  const workspace=await emailWorkspace(),domain=workspace.domains.find(d=>d.id===id);if(!domain)throw Error('scope');
  const observation=await observeEmailDns(domain.hostname,domain.verification_token,workspace.settings.mx_host);
  checked(await getSupabase().rpc('freelance_hq_hosting_email_domain_check',{p_actor:actor.id,p_domain:id,p_token:domain.verification_token,p_check:observation,p_mx_host:workspace.settings.mx_host}));
  revalidatePath('/hosting/email');return {ok:true as const,observation,message:'DNS check finished. DNS checks do not confirm mailbox creation or successful delivery.'};
 }catch(error){return {ok:false as const,error:error instanceof z.ZodError?'Check the domain or settings. Use a hostname without https://, a path or an email address.':'Could not finish this step. Refresh the page and check the saved state before trying again.'};}
}
