import { NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import { boundedBody } from '@/lib/hosting/websites/body';
import { prepareUpload } from '@/lib/hosting/websites/uploads';
export async function POST(request: Request) {
    try {
        const body = JSON.parse(Buffer.from(await boundedBody(request, 300000)).toString()) as Record<string, unknown>;
        const result = await prepareUpload(String(body.base), String(body.app), String(body.key), String(body.kind), body.files);
        return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    catch (e) {
        unstable_rethrow(e);
        return NextResponse.json({ error: 'Upload could not be prepared. Check the 1 GB limit and website status, or contact support.' }, { status: 400 });
    }
}
