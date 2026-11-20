import 'server-only';
import { requireHostingClient, requireHostingAdmin } from '@/lib/hosting/auth';
import { getSupabase } from '@/lib/supabaseClient';
import { getApp } from '@/lib/hosting/apps/store';
import { rateLimit } from '@/lib/security/rateLimit';
export async function websiteActor(base: string, write = false) {
    if (base === '/client/apps') {
        const session = await requireHostingClient();
        if (write && (session.adminView || session.client.status !== 'active'))
            throw new Error('This account is read only.');
        if (write)
            await rateLimit('website-write', session.userId, 30, 600);
        return { actor: session.userId, clientId: session.clientId, admin: false, readOnly: session.adminView, base: '/client/apps' as const };
    }
    if (base !== '/hosting/apps')
        throw new Error('Invalid website workspace.');
    const admin = await requireHostingAdmin();
    if (write)
        await rateLimit('website-write', admin.id, 30, 600);
    return { actor: admin.id, clientId: null, admin: true, readOnly: false, base: '/hosting/apps' as const };
}
export async function websiteAccess(base: string, id: string, write = false) {
    const actor = await websiteActor(base, write);
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id))
        throw new Error('Website not found.');
    const app = await getApp(id, actor.clientId);
    if (!app || !app.website_credit_id)
        throw new Error('Website not found.');
    if (write) {
        const c = await getSupabase().from('freelance_hq_hosting_clients').select('status').eq('id', app.client_id).single();
        if (c.error || c.data?.status !== 'active')
            throw new Error('This client account is read only.');
    }
    return { actor, app };
}
