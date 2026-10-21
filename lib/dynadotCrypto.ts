import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * Server-only. Never import this from a "use client" component — it pulls in
 * node:crypto and handles the raw encryption key.
 */
function getEncryptionKey(): Buffer {
  const secret = process.env.DYNADOT_SECRET;
  if (!secret) {
    throw new Error("DYNADOT_SECRET is not set. Add it to your environment before saving a Dynadot API key.");
  }
  return scryptSync(secret, "freelance-hq-dynadot", 32);
}

/** Encrypts the Dynadot API key for storage. */
export function encryptApiKey(plain: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

/** Reverses encryptApiKey. Throws if the payload is malformed or the key is wrong. */
export function decryptApiKey(payload: string): string {
  const key = getEncryptionKey();
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
