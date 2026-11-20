import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { createPublicKey, timingSafeEqual, verify, type KeyObject } from "node:crypto";
import { canonicalRequest } from "./canonical.ts";
export class NonceStore {
    private seen = new Map<string, number>();
    private file?: string;
    constructor(file?: string) {
        this.file = file;
        if (file)
            try {
                const rows = JSON.parse(readFileSync(file, "utf8"));
                if (Array.isArray(rows) && rows.length <= 5000)
                    this.seen = new Map(rows);
            }
            catch { /* first start */ }
    }
    remember(nonce: string, expiresAt: number, now: number) {
        for (const [key, expiry] of this.seen) {
            if (expiry <= now)
                this.seen.delete(key);
        }
        if (this.seen.has(nonce))
            return false;
        if (this.seen.size >= 5000)
            return false;
        this.seen.set(nonce, expiresAt);
        if (this.file) {
            writeFileSync(this.file + ".tmp", JSON.stringify([...this.seen]), { mode: 0o600 });
            renameSync(this.file + ".tmp", this.file);
        }
        return true;
    }
}
export function publicKeyFromDer(value: string) {
    return createPublicKey({ key: Buffer.from(value, "base64"), format: "der", type: "spki" });
}
export function tokensMatch(expected: string, presented: string) {
    const left = Buffer.from(expected);
    const right = Buffer.from(presented);
    if (left.length < 32 || left.length !== right.length)
        return false;
    return timingSafeEqual(left, right);
}
export type AuthDecision = {
    ok: true;
} | {
    ok: false;
    status: number;
    code: string;
};
export function authorize(input: {
    headers: Record<string, string | string[] | undefined>;
    method: string;
    path: string;
    body: Buffer;
    token: string;
    publicKey: KeyObject;
    now: number;
    nonces: NonceStore;
}): AuthDecision {
    const header = (name: string) => {
        const value = input.headers[name];
        return typeof value === "string" ? value : "";
    };
    const presented = header("authorization");
    const match = /^Bearer ([!-~]{32,256})$/.exec(presented);
    if (!match || !tokensMatch(input.token, match[1] ?? ""))
        return { ok: false, status: 401, code: "unauthorized" };
    const timestamp = header("x-hms-timestamp");
    const nonce = header("x-hms-nonce");
    const signature = header("x-hms-signature");
    if (!/^\d{10,16}$/.test(timestamp) || !/^[A-Za-z0-9_-]{16,128}$/.test(nonce))
        return { ok: false, status: 401, code: "unauthorized" };
    const sent = Number(timestamp);
    if (!Number.isSafeInteger(sent) || Math.abs(input.now - sent) > 60000)
        return { ok: false, status: 401, code: "stale" };
    const raw = Buffer.from(signature, "base64");
    if (raw.length !== 64 || signature !== raw.toString("base64"))
        return { ok: false, status: 401, code: "unauthorized" };
    const payload = Buffer.from(canonicalRequest(input.method, input.path, timestamp, nonce, input.body));
    const signed = verify(null, payload, input.publicKey, raw);
    if (!signed)
        return { ok: false, status: 401, code: "unauthorized" };
    if (!input.nonces.remember(nonce, sent + 60000, input.now))
        return { ok: false, status: 401, code: "replay" };
    return { ok: true };
}
