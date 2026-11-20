import { NextResponse } from 'next/server';
import { boundedBody } from '@/lib/hosting/websites/body';
import { receiptAuthorized, recordReceipt } from '@/lib/hosting/websites/receipt';
export async function POST(request: Request) {
    const body = await boundedBody(request, 2000).catch(() => null);
    if (!body || !receiptAuthorized(body, request.headers, process.env.HOSTING_AGENT_TOKEN ?? ''))
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    try {
        await recordReceipt(JSON.parse(Buffer.from(body).toString()));
        return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    }
    catch {
        return NextResponse.json({ error: 'Receipt unavailable' }, { status: 503 });
    }
}

export const maxDuration = 60;
