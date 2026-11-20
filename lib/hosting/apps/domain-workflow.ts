import 'server-only';
import {getSupabase} from '@/lib/supabaseClient';
import {agentCall,agentDomains} from '@/lib/hosting/agent-client';
import {getApp,listDomains} from './store';
import {assessDns,domainStatusAfterProof} from './dns';
import {certificateReady,lookupHostname} from './lookup';
import type {HostingApp,HostingAppDomain} from './types';
const table='freelance_hq_hosting_app_domains';
async function save(domain:HostingAppDomain,value:Record<string,unknown>){
 const r=await getSupabase().from(table).update({...value,last_checked_at:new Date().toISOString()}).eq('id',domain.id).eq('app_id',domain.app_id);
 if(r.error)throw Error('Domain check could not be saved.');
}
export async function verifyDomainGroup(app:HostingApp,group:string){
 const domains=(await listDomains(app.id)).filter(d=>(d.group_host??d.hostname)===group);
 if(!domains.length)throw Error('Domain not found.');
 await Promise.all(domains.map(d=>save(d,{status:'verifying',detail:'Checking DNS ownership and routing.'})));
 await Promise.all(domains.map(async d=>{
  const result=await lookupHostname(d.hostname,d.group_host??d.hostname);
  const assessment=assessDns({...result,token:d.verification_token,httpVerified:false});
  // Default previews are allocated by the database and pinned to this app on the agent.
  const proven=d.is_preview?result.addresses.length>0&&result.addresses.every(ip=>ip==='62.171.130.156')&&!result.ipv6.length:assessment.proven;
  await save(d,{status:domainStatusAfterProof(proven,false,false),dns_verified_at:proven?new Date().toISOString():null,detail:proven?'DNS verified. Routing will be enabled after a successful deployment.':d.is_preview?'The operator needs to configure the preview wildcard A record.':assessment.detail});
 }));
 if(app.status==='running')await activateWebsiteDomains(app.id);
}
// Called after a signed successful receipt and by the explicit Verify/Refresh actions.
// No provider DNS mutation occurs here; only saved ownership proofs can create routes.
export async function activateWebsiteDomains(appId:string){
 const app=await getApp(appId,null);
 if(!app||app.status!=='running')return;
 const domains=(await listDomains(app.id)).filter(d=>d.is_preview||d.dns_verified_at||['active','issuing_ssl'].includes(d.status));
 if(!domains.length)return;
 const remote=await agentCall('GET',`/v1/apps/${app.name}`) as {appId?:string;clientId?:string;deploymentId?:string;domains?:{host:string}[]};
 if(remote.appId!==app.id||remote.clientId!==app.client_id||remote.deploymentId!==app.active_deployment_id)throw Error('Server deployment changed. Refresh before connecting domains.');
 const hosts=domains.map(d=>d.hostname).sort();
 if(JSON.stringify(hosts)!==JSON.stringify((remote.domains??[]).map(d=>d.host).sort())){
  await agentDomains(app.name,{domains:domains.map(d=>({host:d.hostname,token:d.verification_token})),redirect:'none'});
 }
 await Promise.all(domains.map(async d=>{
  await save(d,{status:'issuing_ssl',detail:'DNS verified. Waiting for the VPS HTTPS certificate.'});
  const cert=await certificateReady(d.hostname);
  await save(d,{status:cert.ok?'active':'issuing_ssl',detail:cert.ok?'DNS and HTTPS certificate checked.':'Routing enabled. Traefik is issuing the HTTPS certificate. Choose Verify again shortly.'});
 }));
}
