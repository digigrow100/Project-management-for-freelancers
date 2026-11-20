'use server';

import { redirect, unstable_rethrow } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getSupabase } from '@/lib/supabaseClient';
import { websiteActor, websiteAccess } from '@/lib/hosting/websites/access';
import { encryptAppSecret } from './secrets';
import { appNameOk, domainOk, frameworkOk, gitUrlOk, gitRefOk, parseEnvText } from './validate';
import { listDomains, loadEnvValues, loadGitToken } from './store';
import { agentConfigured, agentCall, agentDomains, agentLifecycle } from '@/lib/hosting/agent-client';
import { verifyDomainGroup } from './domain-workflow';
import { configureWebsiteDns } from '@/lib/hosting/registrar/website-dns';
import { deploymentSpec, syncWebsite } from '@/lib/hosting/websites/deployments';
const uuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);
function back(base: string, id: string, tab: string) { return `${base}/${id}?tab=${tab}`; }
export async function createHostingApp(form: FormData) {
    const actor = await websiteActor('/client/apps', true);
    if (!actor.clientId)
        throw new Error('Client access required.');
    const label = String(form.get('display_name') ?? '').trim(), kind = String(form.get('source_kind') ?? ''), framework = String(form.get('framework') ?? ''), url = String(form.get('source_url') ?? '').trim(), ref = String(form.get('git_ref') ?? '').trim(), token = String(form.get('git_token') ?? '');
    const credit = String(form.get('credit_id') ?? ''), key = String(form.get('request_key') ?? ''), extra = Number(form.get('extra_gb') ?? 0);
    if (!label || label.length > 80 || /[\x00-\x1f]/.test(label) || !frameworkOk(framework) || !['git', 'upload'].includes(kind) || !uuid(credit) || !uuid(key) || !Number.isSafeInteger(extra))
        throw new Error('Check website details and your approved credit.');
    if (kind === 'git' && (!gitUrlOk(url) || (ref && !gitRefOk(ref)) || token.length > 300 || /[\r\n\0]/.test(token)))
        throw new Error('Use a GitHub repository URL and valid branch.');
    const r = await getSupabase().rpc('freelance_hq_website_create', { p_actor: actor.actor, p_client: actor.clientId, p_credit: credit, p_key: key, p_label: label, p_framework: framework, p_kind: kind, p_url: url, p_ref: ref, p_token: kind === 'git' && token ? encryptAppSecret(token) : null, p_extra_gb: extra, p_consent: form.get('storage_consent') === 'yes' });
    if (r.error)
        redirect('/client/apps/new?error=setup_failed');
    redirect(`/client/apps/${r.data}?tab=deployments`);
}
export async function deployHostingApp(form: FormData) {
    const base = String(form.get('return_base') ?? ''), { actor, app } = await websiteAccess(base, String(form.get('app_id') ?? ''), true);
    if (!agentConfigured())
        throw new Error('The VPS agent is not connected yet. Your credit is safe.');
    const key = String(form.get('request_key') ?? '');
    if (!uuid(key) || app.source_kind !== 'git')
        throw new Error('Use Upload for this website.');
    const r = await getSupabase().rpc('freelance_hq_website_begin_deploy', { p_actor: actor.actor, p_app: app.id, p_key: key, p_upload: false, p_admin: actor.admin });
    if (r.error)
        throw new Error('A deployment may already be pending. Refresh its status first.');
    try {
        await agentCall('POST', '/v1/apps', { ...await deploymentSpec(app, r.data), source: { kind: 'git', url: app.source_url, ref: app.git_ref || 'main', token: await loadGitToken(app.id) } });
    }
    catch (error) {
        unstable_rethrow(error);
        throw new Error('The agent did not confirm this request. Refresh its status before retrying. Your website credit was kept.');
    }
    revalidatePath(`${base}/${app.id}`);
    redirect(back(base, app.id, 'deployments'));
}
export async function refreshHostingApp(form: FormData) { const base = String(form.get('return_base') ?? ''); await syncWebsite(base, String(form.get('app_id') ?? '')); revalidatePath(`${base}/${form.get('app_id')}`); }
export async function cancelHostingUpload(form: FormData) {
    const base = String(form.get('return_base') ?? ''), { actor, app } = await websiteAccess(base, String(form.get('app_id') ?? ''), true);
    if (app.status !== 'uploading' || !app.active_deployment_id)
        throw new Error('No pending upload to cancel.');
    const r = await agentCall('POST', `/v1/apps/${app.name}/cancel-upload`, { deploymentId: app.active_deployment_id }) as {
        cancelled?: boolean;
    };
    if (!r.cancelled)
        throw new Error('Upload was already submitted. Refresh deployment status instead.');
    const saved = await getSupabase().rpc('freelance_hq_website_record_deploy', { p_actor: actor.actor, p_app: app.id, p_deployment: app.active_deployment_id, p_status: 'failed', p_bytes: null, p_reported_at: new Date().toISOString(), p_admin: actor.admin });
    if (saved.error)
        throw new Error('Refresh status before uploading again.');
    revalidatePath(`${base}/${app.id}`);
}
export async function controlHostingApp(form: FormData) {
    const base = String(form.get('return_base') ?? ''), { app } = await websiteAccess(base, String(form.get('app_id') ?? ''), true), action = String(form.get('control') ?? '');
    if (!['start', 'stop', 'restart'].includes(action) || !appNameOk(app.name))
        throw new Error('Invalid website action.');
    if (['building', 'uploading', 'uncertain'].includes(app.status))
        throw new Error('Resolve the pending deployment first.');
    const remote = await agentLifecycle(app.name, action as 'start' | 'stop' | 'restart') as {
        name?: string;
        status?: string;
    };
    if (remote.name !== app.name || !['running', 'stopped', 'failed'].includes(remote.status ?? ''))
        throw new Error('Invalid server status.');
    const saved = await getSupabase().from('freelance_hq_hosting_apps').update({ status: remote.status, updated_at: new Date().toISOString() }).eq('id', app.id);
    if (saved.error)
        throw new Error('Server changed state; refresh before retrying.');
    revalidatePath(`${base}/${app.id}`);
    redirect(back(base, app.id, 'settings'));
}
export async function saveHostingEnv(form: FormData) {
    const base = String(form.get('return_base') ?? ''), { app } = await websiteAccess(base, String(form.get('app_id') ?? ''), true), rows = parseEnvText(String(form.get('env_text') ?? ''));
    if (!rows?.length)
        throw new Error('Use NAME=value. Reserved process and agent variables are blocked.');
    const r = await getSupabase().from('freelance_hq_hosting_app_env').upsert(rows.map(row => ({ app_id: app.id, name: row.name, value_encrypted: encryptAppSecret(row.value), updated_at: new Date().toISOString() })), { onConflict: 'app_id,name' });
    if (r.error)
        throw new Error('Environment could not be saved.');
    revalidatePath(`${base}/${app.id}`);
}
export async function deleteHostingEnv(form: FormData) {
    const base = String(form.get('return_base') ?? ''), { app } = await websiteAccess(base, String(form.get('app_id') ?? ''), true);
    const r = await getSupabase().from('freelance_hq_hosting_app_env').delete().eq('app_id', app.id).eq('name', String(form.get('name') ?? ''));
    if (r.error)
        throw new Error('Environment variable could not be removed.');
    revalidatePath(`${base}/${app.id}`);
}
export async function addHostingDomain(form: FormData) {
    const base=String(form.get('return_base')??''),{actor,app}=await websiteAccess(base,String(form.get('app_id')??''),true);
    const hostname=String(form.get('hostname')??'').trim().toLowerCase().replace(/^www[.]/,'');
    if(!domainOk(hostname)||hostname.endsWith('.housemysite.com')||hostname==='housemysite.com'||!domainOk('www.'+hostname)) throw Error('Use your own public domain. HouseMySite infrastructure names are reserved.');
    const r=await getSupabase().rpc('freelance_hq_website_domain_pair',{p_actor:actor.actor,p_app:app.id,p_host:hostname,p_admin:actor.admin});
    if(r.error)throw Error('Domain could not be saved. It may already be assigned or the ten-hostname allowance is full.');
    const domain=(await listDomains(app.id)).find(d=>d.hostname===hostname)!;
    let detail:string;
    try{detail=await configureWebsiteDns(actor,app,domain);}catch{detail='Domain saved. Automatic DNS could not be confirmed. Check the registrar operation history before retrying. You can add the records manually.';}
    const saved=await getSupabase().from('freelance_hq_hosting_app_domains').update({dns_setup_detail:detail}).eq('app_id',app.id).eq('group_host',hostname);
    if(saved.error)throw Error('Domain saved. Reload to check its DNS instructions.');
    await verifyDomainGroup(app,hostname);
    revalidatePath(`${base}/${app.id}`);revalidatePath('/client/website-domains');
}
export async function verifyHostingDomain(form: FormData) {
    const base=String(form.get('return_base')??''),{app}=await websiteAccess(base,String(form.get('app_id')??''),true);
    const domain=(await listDomains(app.id)).find(d=>d.hostname===String(form.get('hostname')??''));
    if(!domain||!domainOk(domain.hostname))throw Error('Domain not found.');
    await verifyDomainGroup(app,domain.group_host??domain.hostname);
    revalidatePath(`${base}/${app.id}`);revalidatePath('/client/website-domains');
}
export async function removeHostingDomain(form: FormData) {
    const base=String(form.get('return_base')??''),{app}=await websiteAccess(base,String(form.get('app_id')??''),true),domains=await listDomains(app.id);
    const domain=domains.find(d=>d.hostname===String(form.get('hostname')??''));
    if(!domain||domain.is_preview)throw Error('The default preview URL stays with this website.');
    if(['building','uploading','uncertain'].includes(app.status))throw Error('Wait for the deployment to finish.');
    const group=domain.group_host??domain.hostname,remaining=domains.filter(d=>(d.group_host??d.hostname)!==group);
    if(app.status==='running')await agentDomains(app.name,{domains:remaining.filter(d=>d.is_preview||d.dns_verified_at||['active','issuing_ssl'].includes(d.status)).map(d=>({host:d.hostname,token:d.verification_token})),redirect:'none'});
    const r=await getSupabase().from('freelance_hq_hosting_app_domains').delete().eq('app_id',app.id).eq('group_host',group).eq('is_preview',false);
    if(r.error)throw Error('Domain could not be disconnected.');
    revalidatePath(`${base}/${app.id}`);revalidatePath('/client/website-domains');
}
export async function saveHostingSource(form: FormData) {
    const base = String(form.get('return_base') ?? ''), { app } = await websiteAccess(base, String(form.get('app_id') ?? ''), true);
    if (['building', 'uploading', 'uncertain'].includes(app.status))
        throw new Error('Resolve the pending deployment first.');
    const kind = String(form.get('source_kind') ?? ''), framework = String(form.get('framework') ?? ''), url = String(form.get('source_url') ?? '').trim(), ref = String(form.get('git_ref') ?? '').trim(), token = String(form.get('git_token') ?? '');
    if (!['upload', 'git'].includes(kind) || !frameworkOk(framework) || token.length > 300 || /[\r\n\0]/.test(token) || (kind === 'git' && (!gitUrlOk(url) || (ref && !gitRefOk(ref)))))
        throw new Error('Check the source, branch and build preset.');
    const encrypted = kind === 'upload' || form.get('clear_token') === 'yes' ? { git_token_encrypted: null } : token ? { git_token_encrypted: encryptAppSecret(token) } : url !== app.source_url ? { git_token_encrypted: null } : {};
    const saved = await getSupabase().from('freelance_hq_hosting_apps').update({ source_kind: kind, source_url: kind === 'git' ? url : '', git_ref: kind === 'git' ? ref || 'main' : null, framework, port: ['static', 'react', 'vue'].includes(framework) ? 8080 : 3000, ...encrypted, updated_at: new Date().toISOString() }).eq('id', app.id).eq('updated_at', app.updated_at).in('status', ['pending', 'running', 'stopped', 'failed']).select('id');
    if (saved.error || saved.data?.length !== 1)
        throw new Error('Source changed or a deployment started. Refresh and try again.');
    revalidatePath(`${base}/${app.id}`);
}

// Return a safe status to the domain form; do not expose provider/SQL exceptions.
export async function changeHostingDomain(form:FormData):Promise<{ok:boolean;error?:string}>{
    try{
        const action=String(form.get('domain_action')??'');
        if(action==='add')await addHostingDomain(form);
        else if(action==='verify')await verifyHostingDomain(form);
        else if(action==='remove')await removeHostingDomain(form);
        else return {ok:false,error:'Choose a valid domain action.'};
        return {ok:true};
    }catch(error){
        unstable_rethrow(error);
        const safe=new Set(['Use your own public domain. HouseMySite infrastructure names are reserved.','Domain could not be saved. It may already be assigned or the ten-hostname allowance is full.','Wait for the deployment to finish.','This account is read only.','This client account is read only.']);
        return {ok:false,error:error instanceof Error&&safe.has(error.message)?error.message:'This change could not be confirmed. Reload the domain list and check any pending registrar operation before retrying.'};
    }
}
