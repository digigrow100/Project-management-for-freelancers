import { NextResponse } from 'next/server';
import { requireHostingAdmin } from '@/lib/hosting/auth';
import { getSupabase } from '@/lib/supabaseClient';
import { PROOF_BUCKET } from '@/lib/hosting/websites/types';
export async function GET(_request: Request, { params }: {
    params: Promise<{
        id: string;
    }>;
}) {
    await requireHostingAdmin();
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id))
        return new NextResponse('Not found', { status: 404 });
    const r = await getSupabase().from('freelance_hq_website_payment_requests').select('proof_path').eq('id', id).maybeSingle();
    if (r.error || !r.data?.proof_path)
        return new NextResponse('Not found', { status: 404 });
    const file = await getSupabase().storage.from(PROOF_BUCKET).createSignedUrl(r.data.proof_path, 60);
    if (file.error || !file.data)
        return new NextResponse('Unavailable', { status: 503 });
    return NextResponse.redirect(file.data.signedUrl, { headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } });
}
