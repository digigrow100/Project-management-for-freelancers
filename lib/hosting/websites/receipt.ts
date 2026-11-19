import 'server-only';
import { createHmac, timingSafeEqual, createHash } from 'node:crypto';
import { getSupabase } from '@/lib/supabaseClient';
export function receiptSignature(body: Uint8Array, timestamp: string, key: string) { return createHmac('sha256', key).update(`HMS-WEBSITE-RECEIPT-v1\n${timestamp}\n${createHash('sha256').update(body).digest('hex')}`).digest('hex'); }
export function receiptAuthorized(body: Uint8Array, headers: Headers, key: string, now = Date.now()) {
    const time = headers.get('x-hms-time') ?? '', signature = headers.get('x-hms-receipt') ?? '';
    if (key.length < 32 || !/^\d{13}$/.test(time) || Math.abs(now - Number(time)) > 300000 || !/^[a-f0-9]{64}$/.test(signature))
        return false;
    return timingSafeEqual(Buffer.from(signature), Buffer.from(receiptSignature(body, time, key)));
}
export async function recordReceipt(raw: unknown) {
    const r = raw as {
        appId?: string;
        clientId?: string;
        deploymentId?: string;
        status?: string;
        usedBytes?: number | null;
        deployedAt?: string | null;
    };
    if (!r || ![r.appId, r.clientId, r.deploymentId].every(s => typeof s === 'string' && /^[a-f0-9-]{36}$/.test(s)) || !['running', 'failed', 'uncertain'].includes(r.status ?? ''))
        throw new Error('Invalid receipt.');
    const app = await getSupabase().from('freelance_hq_hosting_apps').select('id,client_id,active_deployment_id,storage_limit_bytes').eq('id', r.appId).eq('client_id', r.clientId).maybeSingle();
    if (app.error)
        throw new Error('Receipt storage unavailable.');
    if (!app.data || app.data.active_deployment_id !== r.deploymentId)
        return;
    if (r.status === 'running' && (!Number.isSafeInteger(r.usedBytes) || Number(r.usedBytes) < 0 || Number(r.usedBytes) > Number(app.data.storage_limit_bytes) || !r.deployedAt || !Number.isFinite(Date.parse(r.deployedAt))))
        throw new Error('Invalid storage receipt.');
    const deployment = await getSupabase().from('freelance_hq_hosting_deployments').select('requested_by,requested_as_admin').eq('id', r.deploymentId).eq('app_id', r.appId).single();
    if (deployment.error || !deployment.data?.requested_by)
        throw new Error('Deployment actor unavailable.');
    const saved = await getSupabase().rpc('freelance_hq_website_record_deploy', { p_actor: deployment.data.requested_by, p_app: r.appId, p_deployment: r.deploymentId, p_status: r.status, p_bytes: r.status === 'running' ? r.usedBytes : null, p_reported_at: r.deployedAt ?? new Date().toISOString(), p_admin: deployment.data.requested_as_admin });
    if (saved.error)
        throw new Error('Receipt could not be saved.');
}
