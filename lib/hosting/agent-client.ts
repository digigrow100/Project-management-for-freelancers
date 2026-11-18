import "server-only";
import { createHash, createPrivateKey, createPublicKey, randomBytes, sign } from "node:crypto";
import { canonicalRequest } from "./apps/agentProtocol";

export class AgentError extends Error {
  constructor(public code: string) { super(code); }
}

export function agentConfigured() {
  return Boolean(process.env.HOSTING_AGENT_URL && (process.env.HOSTING_AGENT_TOKEN?.length ?? 0) >= 32 && process.env.HOSTING_AGENT_SIGNING_KEY);
}

function settings() {
  const urlValue = process.env.HOSTING_AGENT_URL;
  const token = process.env.HOSTING_AGENT_TOKEN;
  const encoded = process.env.HOSTING_AGENT_SIGNING_KEY;
  if (!urlValue || !token || token.length < 32 || !encoded) throw new AgentError("agent_not_configured");
  let url: URL;
  try { url = new URL(urlValue); } catch { throw new AgentError("agent_url_invalid"); }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.username || url.password || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && local))) throw new AgentError("agent_url_invalid");
  let privateKey;
  try { privateKey = createPrivateKey({ key: Buffer.from(encoded, "base64"), format: "der", type: "pkcs8" }); }
  catch { throw new AgentError("agent_not_configured"); }
  return { url, token, privateKey };
}

export function agentFingerprint() {
  if (!agentConfigured()) return null;
  const token = process.env.HOSTING_AGENT_TOKEN ?? "";
  let signingPublicKey: string | null = null;
  try { signingPublicKey = createPublicKey(settings().privateKey).export({ type: "spki", format: "der" }).toString("base64"); } catch { signingPublicKey = null; }
  let host: string | null = null;
  try { host = new URL(process.env.HOSTING_AGENT_URL ?? "").host; } catch { host = null; }
  return { tokenSha256: createHash("sha256").update(token).digest("hex"), signingPublicKey, host };
}

async function call(method: string, path: string, body?: unknown) {
  const { url, token, privateKey } = settings();
  const payload = body === undefined ? "" : JSON.stringify(body);
  const timestamp = String(Date.now());
  const nonce = randomBytes(16).toString("hex");
  const signature = sign(null, Buffer.from(canonicalRequest(method, path, timestamp, nonce, Buffer.from(payload))), privateKey).toString("base64");
  let response: Response;
  try {
    response = await fetch(new URL(path, url), {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-hms-timestamp": timestamp, "x-hms-nonce": nonce, "x-hms-signature": signature },
      body: payload || undefined,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch { throw new AgentError("agent_unreachable"); }
  const text = await response.text();
  if (text.length > 200_000) throw new AgentError("agent_invalid");
  let parsed: unknown = {};
  if (text) {
    try { parsed = JSON.parse(text); } catch { throw new AgentError("agent_invalid"); }
  }
  if (!response.ok) {
    const code = parsed && typeof parsed === "object" && "error" in parsed ? String((parsed as { error: unknown }).error) : "agent_rejected";
    throw new AgentError(/^[a-z0-9_]{1,40}$/.test(code) ? code : "agent_rejected");
  }
  return parsed;
}

export const agentHost = () => call("GET", "/v1/host");
export const agentDecisions = () => call("GET", "/v1/security/decisions");
export const agentAlerts = () => call("GET", "/v1/security/alerts");
export const agentUnban = (id: string) => call("DELETE", `/v1/security/decisions/${encodeURIComponent(id)}`);
export const agentDeploy = (body: unknown) => call("POST", "/v1/apps", body);
export const agentApp = (name: string) => call("GET", `/v1/apps/${encodeURIComponent(name)}`);
export const agentLogs = (name: string) => call("GET", `/v1/apps/${encodeURIComponent(name)}/logs`);
export const agentLifecycle = (name: string, action: "start" | "stop" | "restart" | "redeploy", body?: unknown) => call("POST", `/v1/apps/${encodeURIComponent(name)}/${action}`, body ?? {});
export const agentDomains = (name: string, body: unknown) => call("POST", `/v1/apps/${encodeURIComponent(name)}/domains`, body);
export const agentRemove = (name: string) => call("DELETE", `/v1/apps/${encodeURIComponent(name)}`);
