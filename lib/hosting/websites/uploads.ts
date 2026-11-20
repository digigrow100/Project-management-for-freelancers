import 'server-only';
import { uploadManifest } from '../../../hosting-agent/shared/uploadPolicy';
import { websiteAccess } from './access';
import { deploymentSpec } from './deployments';
import { getSupabase } from '@/lib/supabaseClient';
import { agentConfigured, agentCall } from '@/lib/hosting/agent-client';
export async function prepareUpload(base: string, id: string, key: string, kind: string, files: unknown) {
    const { actor, app } = await websiteAccess(base, id, true);
    if (!/^[0-9a-f-]{36}$/i.test(key) || !['zip', 'files'].includes(kind))
        throw new Error('Invalid upload.');
    if (!agentConfigured())
        throw new Error('The VPS agent is not connected yet.');
    const manifest = uploadManifest(files);
    if (kind === 'zip' && (manifest.files.length !== 1 || !manifest.files[0]?.path.toLowerCase().endsWith('.zip')))
        throw new Error('Choose one ZIP archive.');
    const d = await getSupabase().rpc('freelance_hq_website_begin_deploy', { p_actor: actor.actor, p_app: app.id, p_key: key, p_upload: true, p_admin: actor.admin });
    if (d.error)
        throw new Error('Another deployment may be pending. Refresh or cancel the previous upload.');
    const result = await agentCall('POST', '/v1/uploads', { ...await deploymentSpec(app, d.data), kind, files: manifest.files }) as {
        id?: string;
        token?: string;
        expiresAt?: number;
    };
    if (result.id !== d.data || typeof result.token !== 'string' || result.token.length > 400 || !Number.isFinite(result.expiresAt))
        throw new Error('The upload service returned an invalid ticket.');
    const origin = new URL(process.env.HOSTING_AGENT_URL ?? '');
    return { id: result.id, token: result.token, expiresAt: result.expiresAt, origin: origin.origin };
}
