import { createHash } from "node:crypto";

/** Must stay identical to hosting-agent/src/canonical.ts. */
export function canonicalRequest(method: string, path: string, timestamp: string, nonce: string, body: Buffer) {
  const hash = createHash("sha256").update(body).digest("hex");
  return `hms-agent-v1\n${timestamp}\n${nonce}\n${method.toUpperCase()}\n${path}\n${hash}`;
}
