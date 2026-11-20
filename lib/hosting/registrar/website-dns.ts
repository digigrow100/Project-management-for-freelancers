import 'server-only';
import { getSupabase } from '@/lib/supabaseClient';
import { rateLimit } from '@/lib/security/rateLimit';
import { Dynadot, RegistrarError } from './api';
import { checked, connection, remember, table } from './store';
import { type DomainInfo, type Intent } from './schema';
import { observed, validateChange } from './workflow';
import { dnsPlan } from '@/lib/hosting/apps/dns';
import type { HostingApp, HostingAppDomain } from '@/lib/hosting/apps/types';
export function websiteDnsRecords(zone: string, host: string, token: string): Extract<Intent,{kind:'dns_add'}>[] {
 const plan=dnsPlan(host,token);
 if(!plan || host==='housemysite.com' || host.endsWith('.housemysite.com') || !(host===zone||host.endsWith('.'+zone))) throw new RegistrarError('invalid_request');
 return plan.records.map(r=>({kind:'dns_add',record:{host:r.name===zone?'@':r.name.slice(0,-zone.length-1),type:r.type.toLowerCase() as 'a'|'cname'|'txt',value:r.value,priority:0}}));
}
function sameRecord(before:DomainInfo,change:Extract<Intent,{kind:'dns_add'}>){
 const r=change.record,rows=r.host==='@'?before.glue.dns_main_list:before.glue.dns_sub_list;
 return (rows??[]).some(v=>(r.host==='@'||v.sub_host===r.host)&&v.record_type===r.type&&v.record_value1===r.value);
}
// Kept injectable so fixture tests exercise provider writes, readback and ambiguous failures.
export async function appendWebsiteRecords(provider:Pick<Dynadot,'info'|'change'>,zone:string,changes:Extract<Intent,{kind:'dns_add'}>[],journal:{claim:(before:DomainInfo,change:Intent)=>Promise<string>;finish:(id:string,state:'confirmed'|'uncertain'|'failed')=>Promise<void>}){
 let before=await provider.info(zone);
 for(const change of changes){
  if(sameRecord(before,change)) continue;
  validateChange(before,change);
  const rows=change.record.host==='@'?before.glue.dns_main_list:before.glue.dns_sub_list;
  // Preserve old routing as well as mail. Do not create competing A/CNAME records.
  if(['a','cname'].includes(change.record.type)&&(rows??[]).some(r=>(change.record.host==='@'||r.sub_host===change.record.host)&&['a','aaaa','cname'].includes(String(r.record_type)))) throw new RegistrarError('record_conflict');
  const id=await journal.claim(before,change);
  let sent=false;
  try{
   sent=true;await provider.change(zone,change,id);
   const after=await provider.info(zone);
   if(!observed(before,after,change)) throw new RegistrarError('answer_unknown');
   await journal.finish(id,'confirmed'); before=after;
  }catch(error){await journal.finish(id,sent?'uncertain':'failed');throw error;}
 }
 return before;
}
export async function configureWebsiteDns(actor:{actor:string;admin:boolean},app:HostingApp,domain:HostingAppDomain):Promise<string>{
 const host=domain.group_host??domain.hostname;
 if(domain.is_preview||host==='housemysite.com'||host.endsWith('.housemysite.com')) return 'Default preview DNS is managed by HouseMySite.';
 // Read saved metadata without loading credentials for manual/unconnected domains.
 const meta=checked(await getSupabase().from(table('connection')).select('version,mode').eq('id',true).maybeSingle());
 if(!meta||meta.mode!=='production') return 'Add these records at your DNS provider, then choose Verify.';
 const labels=host.split('.'),candidates=labels.slice(0,-1).map((_,i)=>labels.slice(i).join('.'));
 const owned=checked(await getSupabase().from(table('domains')).select('name,details').eq('connection_version',meta.version).in('name',candidates));
 const saved=(owned??[]).sort((a,b)=>b.name.length-a.name.length)[0];
 if(!saved) return 'Add these records at your DNS provider, then choose Verify.';
 if(String(saved.details?.glue?.glue_type).toLowerCase()!=='dns') return 'This domain is in our Dynadot account but uses external DNS. Add these records at its current provider (for example Cloudflare).';
 if(!actor.admin){
  const assignment=checked(await getSupabase().from('freelance_hq_hosting_domains').select('id').eq('client_id',app.client_id).eq('hostname',saved.name).maybeSingle());
  if(!assignment) return 'Automatic DNS needs an admin to assign this account domain to you in Service domains. You can also add the displayed records manually.';
 }
 const c=await connection();
 if(c.version!==meta.version||c.credentials.mode!=='production') throw new RegistrarError('review_expired');
 const provider=new Dynadot(c.credentials,fetch,async()=>{await rateLimit('dynadot-provider','production',1,1);});
 const after=await appendWebsiteRecords(provider,saved.name,websiteDnsRecords(saved.name,host,domain.verification_token),{
  claim:async(before,change)=>{const op=checked(await getSupabase().rpc('freelance_hq_website_dns_claim',{p_actor:actor.actor,p_app:app.id,p_version:c.version,p_zone:saved.name,p_intent:change,p_before:before,p_admin:actor.admin}));return op.id;},
  finish:async(id,state)=>{checked(await getSupabase().rpc('freelance_hq_website_dns_finish',{p_actor:actor.actor,p_id:id,p_state:state,p_admin:actor.admin}));},
 });
 await remember(c.version,[after]);
 return 'Dynadot DNS records added and checked. Existing mail and other records were preserved. DNS propagation may take a few minutes.';
}
