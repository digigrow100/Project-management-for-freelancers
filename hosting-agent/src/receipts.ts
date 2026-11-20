import { createHash, createHmac } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { appDir, type AppState } from './state.ts';
export async function deliverReceipt(dataDir: string, state: AppState, token: string) {
    const path = join(appDir(dataDir, state.name), 'pending-receipt.json');
    const payload = { appId: state.appId, clientId: state.clientId, deploymentId: state.deploymentId, status: state.status, usedBytes: state.usedBytes, deployedAt: state.deployedAt };
    writeFileSync(path, JSON.stringify(payload), { mode: 0o600 });
    await retryReceipt(path, token);
}
async function retryReceipt(path: string, token: string) {
    const endpoint = process.env.PORTAL_RECEIPT_URL;
    if (!endpoint)
        return;
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' || url.username || url.password)
        return;
    const body = readFileSync(path), time = String(Date.now()), signature = createHmac('sha256', token).update(`HMS-WEBSITE-RECEIPT-v1\n${time}\n${createHash('sha256').update(body).digest('hex')}`).digest('hex');
    try {
        const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hms-time': time, 'x-hms-receipt': signature }, body, redirect: 'error', signal: AbortSignal.timeout(10000) });
        await r.body?.cancel();
        if (r.ok && readFileSync(path).equals(body))
            rmSync(path, { force: true });
    }
    catch { /* Durable file is retried. Never print credentials or receipt payloads. */ }
}
export async function retryReceipts(dataDir: string, token: string) {
    for (const name of readdirSync(dataDir)) {
        const file = join(dataDir, name, 'pending-receipt.json');
        try {
            readFileSync(file);
            await retryReceipt(file, token);
        }
        catch { /* Not an app or no pending receipt. */ }
    }
}
