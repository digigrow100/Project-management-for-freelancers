import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Server-only. Never import this from a "use client" component — it pulls in
 * node:crypto and handles the raw encryption key.
 */
function getEncryptionKey(): Buffer {
  const secret = process.env.BACKLINKS_SECRET;
  if (!secret) {
    throw new Error(
      "BACKLINKS_SECRET is not set. Add it to your environment before saving or revealing backlink passwords.",
    );
  }
  return scryptSync(secret, "freelance-hq-backlinks", 32);
}

/** Encrypts a plaintext secret (e.g. a saved login password) for storage. */
export function encryptSecret(plain: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

/** Reverses encryptSecret. Throws if the payload is malformed or the key is wrong. */
export function decryptSecret(payload: string): string {
  const key = getEncryptionKey();
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/** Hashes a user's security (reveal) password for storage as salt:hash hex. */
export function hashVaultPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

/** Verifies a candidate password against a stored salt:hash hex string. */
export function verifyVaultPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const candidate = scryptSync(password, salt, 64);
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}
