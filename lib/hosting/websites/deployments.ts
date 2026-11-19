import 'server-only';
import { agentCall } from '@/lib/hosting/agent-client';
import { getSupabase } from '@/lib/supabaseClient';
import type { HostingApp } from '@/lib/hosting/apps/types';
import { loadEnvValues, listDomains } from '@/lib/hosting/apps/store';
import { websiteAccess } from './access';
export async function deploymentSpec(app: HostingApp, deploymentId: string) {
    const [env, domains] = await Promise.all([loadEnvValues(app.id), listDomains(app.id)]);
    return { name: app.name, appId: app.id, clientId: app.client_id, deploymentId, framework: app.framework, port: app.port, cpu: 1, memoryMb: 512, storageLimitBytes: Number(app.storage_limit_bytes), env, domains: domains.filter(d => ['active', 'issuing_ssl'].includes(d.status)).map(d => ({ host: d.hostname, token: d.verification_token })), redirect: 'none' };
}
export async function syncWebsite(base: string, id: string) {
    const { actor, app } = await websiteAccess(base, id, true);
    const remote = await agentCall('GET', `/v1/apps/${app.name}`) as {
        name?: string;
        appId?: string;
        clientId?: string;
        deploymentId?: string;
        status?: string;
        usedBytes?: number;
        deployedAt?: string;
    };
    if (remote.name !== app.name || remote.appId !== app.id || remote.clientId !== app.client_id)
        throw new Error('The server returned a different website.');
    if (remote.deploymentId !== app.active_deployment_id)
        return { pending: true };
    if (remote.status === 'stopped') {
        const saved = await getSupabase().from('freelance_hq_hosting_apps').update({ status: 'stopped', updated_at: new Date().toISOString() }).eq('id', app.id).eq('active_deployment_id', app.active_deployment_id);
        if (saved.error)
            throw new Error('Server status could not be saved.');
        return { pending: false };
    }
    if (!['running', 'failed', 'uncertain'].includes(remote.status ?? ''))
        return { pending: true };
    const status = remote.status!;
    if (status === 'running' && (!Number.isSafeInteger(remote.usedBytes) || Number(remote.usedBytes) < 0 || Number(remote.usedBytes) > Number(app.storage_limit_bytes) || !remote.deployedAt || !Number.isFinite(Date.parse(remote.deployedAt))))
        throw new Error('The storage report is invalid.');
    const r = await getSupabase().rpc('freelance_hq_website_record_deploy', { p_actor: actor.actor, p_app: app.id, p_deployment: app.active_deployment_id, p_status: status, p_bytes: status === 'running' ? remote.usedBytes : null, p_reported_at: remote.deployedAt ?? new Date().toISOString(), p_admin: actor.admin });
    if (r.error)
        throw new Error('Deployment receipt could not be recorded. Refresh and try again.');
    return { pending: false };
}
