import 'server-only';
export async function boundedBody(request: Request, limit: number) {
    if (Number(request.headers.get('content-length') ?? 0) > limit)
        throw new Error('Request is too large.');
    const reader = request.body?.getReader();
    if (!reader)
        return new Uint8Array();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            size += value.length;
            if (size > limit) {
                await reader.cancel();
                throw new Error('Request is too large.');
            }
            chunks.push(value);
        }
    }
    finally {
        reader.releaseLock();
    }
    const all = new Uint8Array(size);
    let offset = 0;
    for (const c of chunks) {
        all.set(c, offset);
        offset += c.length;
    }
    return all;
}
export function safeProof(bytes: Uint8Array, type: string) {
    if (type === 'image/png')
        return Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (type === 'image/jpeg')
        return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    return false;
}
