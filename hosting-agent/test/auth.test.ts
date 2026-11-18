import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { test } from "node:test";
import { canonicalRequest } from "../src/canonical.ts";
import { createAgentServer } from "../src/server.ts";
import type { DockerClient } from "../src/docker.ts";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const token = "agent-token-value-with-enough-entropy-32";

function signature(method: string, path: string, body: string, timestamp: string, nonce: string, key: KeyObject = privateKey) {
  const payload = Buffer.from(canonicalRequest(method, path, timestamp, nonce, Buffer.from(body)));
  return sign(null, payload, key).toString("base64");
}

async function withServer(run: (base: string, calls: string[]) => Promise<void>) {
  const root = mkdtempSync(join(tmpdir(), "hms-agent-"));
  const calls: string[] = [];
  const docker = {
    async build() { calls.push("build"); },
    async pull() { calls.push("pull"); },
    async run() { calls.push("run"); },
    async action() { calls.push("action"); },
    async logs() { return "runtime"; },
    async listManaged() { return []; },
    async remove() { calls.push("remove"); },
    async removeImage() { calls.push("remove-image"); },
  } as Pick<DockerClient, "build" | "pull" | "run" | "action" | "logs" | "listManaged" | "remove" | "removeImage">;
  const server = createAgentServer({
    token, publicKey, sitesDir: join(root, "sites"), dataDir: join(root, "data"),
    auditFile: join(root, "audit.log"), inline: true, now: () => 1_700_000_000_000, docker,
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  const port = address && typeof address === "object" ? address.port : 0;
  try { await run(`http://127.0.0.1:${port}`, calls); }
  finally { server.close(); rmSync(root, { recursive: true, force: true }); }
}

function headers(method: string, path: string, body = "", extra: Record<string, string> = {}) {
  const timestamp = "1700000000000";
  const nonce = extra.nonce ?? "nonce-1234567890abcd";
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "x-hms-timestamp": extra.timestamp ?? timestamp,
    "x-hms-nonce": nonce,
    "x-hms-signature": extra.signature ?? signature(method, path, body, extra.timestamp ?? timestamp, nonce),
  };
}

test("health is public and unsigned mutations are refused", async () => {
  await withServer(async (base) => {
    assert.equal((await fetch(base + "/health")).status, 200);
    const denied = await fetch(base + "/v1/host");
    assert.equal(denied.status, 401);
    const body = JSON.stringify({ name: "bad_name" });
    const rejected = await fetch(base + "/v1/apps", { method: "POST", headers: headers("POST", "/v1/apps", body), body });
    assert.equal(rejected.status, 400);
  });
});

test("a signed image deploy is accepted and a replay is refused", async () => {
  await withServer(async (base, calls) => {
    const path = "/v1/apps";
    const body = JSON.stringify({ name: "demo", framework: "image", source: { kind: "image", image: "nginx:1.27-alpine" } });
    const ok = await fetch(base + path, { method: "POST", headers: headers("POST", path, body), body });
    assert.equal(ok.status, 202);
    assert.deepEqual(calls, ["pull", "run"]);
    const replay = await fetch(base + path, { method: "POST", headers: headers("POST", path, body), body });
    assert.equal(replay.status, 401);
    const stale = await fetch(base + path, { method: "POST", headers: headers("POST", path, body, { timestamp: "1600000000000", nonce: "another-nonce-123456" }), body });
    assert.equal(stale.status, 401);
  });
});

test("a tampered body does not match the signature", async () => {
  await withServer(async (base, calls) => {
    const path = "/v1/apps";
    const signed = JSON.stringify({ name: "demo", framework: "image", source: { kind: "image", image: "nginx:1.27-alpine" } });
    const sent = JSON.stringify({ name: "other", framework: "image", source: { kind: "image", image: "nginx:1.27-alpine" } });
    const response = await fetch(base + path, { method: "POST", headers: headers("POST", path, signed), body: sent });
    assert.equal(response.status, 401);
    assert.deepEqual(calls, []);
  });
});
