export const GB = 1000000000;
export const MAX_UPLOAD = GB;
export type UploadFile = {
    path: string;
    size: number;
};
export function safeUploadPath(path: string) {
    if (!path || path.length > 240 || path.startsWith('/') || /[\x00-\x1f\x7f\\:]/.test(path) || path !== path.normalize('NFC'))
        return false;
    const parts = path.split('/');
    return parts.every(p => p !== '.' && p !== '..' && p !== '' && !/^(?:\.git|\.env(?:\..*)?|node_modules|\.next|\.npm|id_rsa|id_ed25519)$/i.test(p));
}
export function uploadManifest(value: unknown) {
    if (!Array.isArray(value) || value.length < 1 || value.length > 1000)
        throw new Error('invalid_upload_manifest');
    const files: UploadFile[] = [], seen = new Set<string>();
    let total = 0;
    for (const raw of value) {
        const r = raw as Record<string, unknown>;
        if (!r || typeof r.path !== 'string' || !safeUploadPath(r.path) || !Number.isSafeInteger(r.size) || Number(r.size) < 0 || seen.has(r.path))
            throw new Error('invalid_upload_manifest');
        total += Number(r.size);
        if (total > MAX_UPLOAD)
            throw new Error('upload_limit_exceeded');
        seen.add(r.path);
        files.push({ path: r.path, size: Number(r.size) });
    }
    return { files, total };
}
