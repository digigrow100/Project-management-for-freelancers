import { NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import { boundedBody } from '@/lib/hosting/websites/body';
import { syncWebsite } from '@/lib/hosting/websites/deployments';
export async function POST(request: Request) {
    try {
        const body = JSON.parse(Buffer.from(await boundedBody(request, 2000)).toString());
        return NextResponse.json(await syncWebsite(String(body.base), String(body.app)), { headers: { 'Cache-Control': 'private, no-store' } });
    }
    catch (e) {
        unstable_rethrow(e);
        return NextResponse.json({ error: 'The server report is not available yet. Your last website has been kept.' }, { status: 400, headers: { 'Cache-Control': 'private, no-store' } });
    }
}
