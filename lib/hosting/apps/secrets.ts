import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
function key() {
    const secret = process.env.HOSTING_APP_SECRETS_KEY;
    if (!secret || secret.length < 32)
        throw new Error("secrets_key_missing");
    return scryptSync(secret, "freelance-hq-hosting-apps", 32);
}
export function encryptAppSecret(plain: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key(), iv);
    const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}
export function decryptAppSecret(payload: string) {
    const raw = Buffer.from(payload, "base64");
    const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}
