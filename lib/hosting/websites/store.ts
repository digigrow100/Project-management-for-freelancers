import 'server-only';
import { getSupabase } from '@/lib/supabaseClient';
import type { PaymentRequest, StorageBill, WebsiteCredit, WebsiteSettings } from './types';
const PAYMENT_COLUMNS = 'id,client_id,status,currency,amount_minor,extra_gb_month_minor,reference,proof_path,created_at,reviewed_at,review_note';
function check(error: unknown) {
    if (error)
        throw new Error('Website data is unavailable. Apply the website migrations before enabling checkout.');
}
export async function websiteSettings() { const r = await getSupabase().from('freelance_hq_website_settings').select('id,enabled,currency,website_price_minor,extra_gb_month_minor,bank_details,max_extra_gb,revision').eq('id', true).single(); check(r.error); return r.data as WebsiteSettings; }
export async function clientCheckout(clientId: string) {
    const [settings, credits, requests, bills] = await Promise.all([websiteSettings(), getSupabase().from('freelance_hq_website_credits').select('id,client_id,currency,extra_gb_month_minor,max_extra_gb,app_id').eq('client_id', clientId).is('app_id', null), getSupabase().from('freelance_hq_website_payment_requests').select(PAYMENT_COLUMNS).eq('client_id', clientId).order('created_at', { ascending: false }).limit(30), getSupabase().from('freelance_hq_website_storage_bills').select('id,client_id,period,currency,amount_minor,gb_seconds').eq('client_id', clientId).order('period', { ascending: false }).limit(24)]);
    for (const r of [credits, requests, bills])
        check(r.error);
    return { settings, credits: (credits.data ?? []) as WebsiteCredit[], requests: (requests.data ?? []) as PaymentRequest[], bills: (bills.data ?? []) as StorageBill[] };
}
export async function adminWebsitePayments(page = 1) {
    const offset = (Math.max(1, Math.floor(page)) - 1) * 25;
    const [settings, pending, history, bills] = await Promise.all([
        websiteSettings(), getSupabase().from('freelance_hq_website_payment_requests').select(PAYMENT_COLUMNS + ',client:freelance_hq_hosting_clients(name)', { count: 'exact' }).eq('status', 'pending').order('created_at').range(offset, offset + 24),
        getSupabase().from('freelance_hq_website_payment_requests').select(PAYMENT_COLUMNS + ',client:freelance_hq_hosting_clients(name)').neq('status', 'pending').order('created_at', { ascending: false }).limit(30),
        getSupabase().from('freelance_hq_website_storage_bills').select('id,client_id,period,currency,amount_minor,gb_seconds').order('period', { ascending: false }).limit(100)
    ]);
    for (const r of [pending, history, bills])
        check(r.error);
    const raw = [...(pending.data ?? []), ...(history.data ?? [])] as unknown as Array<PaymentRequest & {
        client: {
            name: string;
        } | null;
    }>;
    return { settings, requests: raw.map(r => ({ ...r, client_name: r.client?.name ?? 'Client' })), pendingTotal: pending.count ?? 0, bills: (bills.data ?? []) as StorageBill[] };
}
export async function pendingWebsitePayments() { const r = await getSupabase().from('freelance_hq_website_payment_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'); check(r.error); return r.count ?? 0; }
