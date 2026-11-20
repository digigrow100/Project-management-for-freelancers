'use server';
import { redirect } from 'next/navigation';
import { agentCall, agentConfigured } from '@/lib/hosting/agent-client';
import { revalidatePath } from 'next/cache';
import { requireHostingAdmin } from '@/lib/hosting/auth';
import { getSupabase } from '@/lib/supabaseClient';
import { rateLimit } from '@/lib/security/rateLimit';
export async function reviewWebsitePayment(form: FormData) {
    const admin = await requireHostingAdmin();
    await rateLimit('website-review', admin.id, 30, 600);
    const id = String(form.get('request_id') ?? ''), decision = String(form.get('decision') ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(id) || !['approve', 'reject'].includes(decision))
        throw new Error('Invalid payment review.');
    if (decision === 'approve' && form.get('bank_verified') !== 'yes')
        throw new Error('Check the bank receipt before approving.');
    const { error } = await getSupabase().rpc('freelance_hq_website_review_payment', { p_actor: admin.id, p_id: id, p_approve: decision === 'approve', p_note: String(form.get('note') ?? '').trim().slice(0, 500) });
    if (error)
        throw new Error('Payment could not be reviewed. Refresh the pending list.');
    revalidatePath('/hosting/website-payments');
    revalidatePath('/hosting');
    revalidatePath('/client');
}
export async function saveWebsiteSettings(form: FormData) {
    const admin = await requireHostingAdmin();
    await rateLimit('website-settings', admin.id, 15, 600);
    const currency = String(form.get('currency') ?? '').trim().toUpperCase(), bank = String(form.get('bank_details') ?? '').trim();
    const site = Number(form.get('website_price_minor')), gb = Number(form.get('extra_gb_month_minor')), max = Number(form.get('max_extra_gb')), revision = Number(form.get('revision'));
    if (!['GBP', 'USD', 'EUR', 'PKR'].includes(currency) || ![site, gb, max, revision].every(Number.isSafeInteger) || site < 0 || site > 100000000 || gb < 0 || gb > 100000000 || max < 0 || max > Math.min(100, Number(process.env.HOSTING_WEBSITE_MAX_EXTRA_GB ?? 1)) || bank.length > 4000)
        throw new Error('Check the bank details and prices. Prices use minor currency units.');
    const enabled = form.get('enabled') === 'yes';
    if (enabled && (site <= 0 || bank.length < 11))
        throw new Error('Set a website price and real bank details first.');
    if (enabled) {
        let connected = false;
        if (agentConfigured() && (process.env.HOSTING_APP_SECRETS_KEY?.length ?? 0) >= 32) {
            try {
                const ready = await agentCall('GET', '/v1/ready') as {
                    version?: string;
                    uploadLimitBytes?: number;
                    maxSiteBytes?: number;
                };
                connected = ready.version === 'website-checkout-v1' && ready.uploadLimitBytes === 1000000000 && Number(ready.maxSiteBytes) >= (1 + max) * 1000000000;
            }
            catch { /* No money path or deployment is called for this readiness check. */ }
        }
        if (!connected)
            redirect('/hosting/website-payments?setup=agent_missing');
    }
    const r = await getSupabase().from('freelance_hq_website_settings').update({ enabled, currency, website_price_minor: site, extra_gb_month_minor: gb, max_extra_gb: max, bank_details: bank, revision: revision + 1, updated_at: new Date().toISOString(), updated_by: admin.id }).eq('id', true).eq('revision', revision).select('id');
    if (r.error || r.data?.length !== 1)
        throw new Error('Settings changed. Refresh and try again.');
    revalidatePath('/hosting/website-payments');
    revalidatePath('/client');
}
export async function closeWebsiteStorageMonth(form: FormData) {
    const admin = await requireHostingAdmin();
    await rateLimit('website-storage-billing', admin.id, 10, 600);
    const period = String(form.get('period') ?? '');
    if (!/^\d{4}-\d{2}-01$/.test(period))
        throw new Error('Choose the first day of a completed UTC month.');
    const r = await getSupabase().rpc('freelance_hq_website_close_storage_month', { p_actor: admin.id, p_period: period });
    if (r.error)
        throw new Error('Storage records could not be finalized. Use a completed month.');
    revalidatePath('/hosting/website-payments');
    revalidatePath('/client/website-billing');
}
