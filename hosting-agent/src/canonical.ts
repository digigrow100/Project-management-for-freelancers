import { createHash } from "node:crypto";

/** Bytes the panel signs and the agent verifies. Do not reorder the lines. */
export function canonicalRequest(method: string, path: string, timestamp: string, nonce: string, body: Buffer) {
  const hash = createHash("sha256").update(body).digest("hex");
  return `hms-agent-v1\n${timestamp}\n${nonce}\n${method.toUpperCase()}\n${path}\n${hash}`;
}
