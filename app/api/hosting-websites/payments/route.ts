import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import { requireHostingClient } from '@/lib/hosting/auth';
import { getSupabase } from '@/lib/supabaseClient';
import { rateLimit } from '@/lib/security/rateLimit';
import { boundedBody, safeProof } from '@/lib/hosting/websites/body';
import { PROOF_BUCKET, PROOF_MAX_BYTES } from '@/lib/hosting/websites/types';
export async function POST(request: Request) {
    let uploaded: string | null = null;
    try {
        const session = await requireHostingClient();
        if (session.adminView || session.client.status !== 'active')
            return NextResponse.json({ error: 'This account is read only.' }, { status: 403 });
        await rateLimit('website-bank-request', session.userId, 5, 600);
        const bytes = await boundedBody(request, PROOF_MAX_BYTES + 20000);
        const data = await new Request(request.url, { method: 'POST', headers: { 'content-type': request.headers.get('content-type') ?? '' }, body: Buffer.from(bytes) }).formData();
        const key = String(data.get('request_key') ?? '');
        if (!/^[0-9a-f-]{36}$/i.test(key))
            throw new Error('Invalid request.');
        const reference = String(data.get('reference') ?? '').trim();
        if (reference.length > 200)
            throw new Error('Reference is too long.');
        if (data.get('bank_sent') !== 'yes')
            throw new Error('Confirm that you sent the bank transfer.');
        // A client retry returns the original claim before uploading another optional proof.
        const prior = await getSupabase().from('freelance_hq_website_payment_requests').select('id').eq('client_id', session.clientId).eq('request_key', key).maybeSingle();
        if (prior.error)
            throw new Error('Checkout is unavailable.');
        if (prior.data)
            return NextResponse.json({ ok: true, id: prior.data.id });
        const revision = Number(data.get('revision'));
        if (!Number.isSafeInteger(revision) || revision < 1)
            throw new Error('Refresh checkout and try again.');
        const id = randomUUID(), proof = data.get('proof');
        if (proof instanceof File && proof.size) {
            const content = new Uint8Array(await proof.arrayBuffer());
            if (content.length > PROOF_MAX_BYTES || !safeProof(content, proof.type))
                throw new Error('Use a PNG or JPEG screenshot up to 2 MB.');
            uploaded = `${session.clientId}/${id}/proof`;
            const up = await getSupabase().storage.from(PROOF_BUCKET).upload(uploaded, content, { contentType: proof.type, upsert: false });
            if (up.error) {
                uploaded = null;
                throw new Error('Screenshot could not be uploaded. Try without it or contact support.');
            }
        }
        const r = await getSupabase().rpc('freelance_hq_website_request_payment', { p_actor: session.userId, p_client: session.clientId, p_id: id, p_key: key, p_revision: revision, p_reference: reference, p_proof: uploaded });
        if (r.error)
            throw new Error('Payment could not be submitted. You may already have a pending request, or prices changed. Refresh and check your payment list.');
        if (uploaded && r.data !== id)
            await getSupabase().storage.from(PROOF_BUCKET).remove([uploaded]);
        uploaded = null;
        return NextResponse.json({ ok: true, id: r.data });
    }
    catch (error) {
        unstable_rethrow(error);
        if (uploaded)
            await getSupabase().storage.from(PROOF_BUCKET).remove([uploaded]);
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Payment request failed.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }
}
