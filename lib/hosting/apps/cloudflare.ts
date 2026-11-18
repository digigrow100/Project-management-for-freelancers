import "server-only";
import type { DnsRecord } from "./dns";
import { domainOk } from "./validate";

export function cloudflareEnabled() {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  return Boolean(token && token.length >= 20 && !/\s/.test(token));
}

async function cloudflare(path: string, init?: { method?: string; body?: string }) {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!cloudflareEnabled() || !token) throw new Error("cloudflare_off");
  const response = await fetch(new URL(path, "https://api.cloudflare.com"), {
    method: init?.method ?? "GET",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: init?.body,
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json() as { success?: boolean; result?: unknown };
  if (!response.ok || payload.success !== true) throw new Error("cloudflare_rejected");
  return payload.result;
}

export async function configureCloudflare(hostname: string, records: DnsRecord[]) {
  if (!domainOk(hostname)) throw new Error("invalid_domain");
  const labels = hostname.split(".");
  let zone: { id: string; name: string } | null = null;
  for (let index = 0; index < labels.length - 1; index += 1) {
    const name = labels.slice(index).join(".");
    const result = await cloudflare(`/client/v4/zones?name=${encodeURIComponent(name)}`) as { id?: string; name?: string }[];
    const found = Array.isArray(result) ? result.find((item) => item.id && item.name === name) : undefined;
    if (found?.id && found.name) { zone = { id: found.id, name: found.name }; break; }
  }
  if (!zone) throw new Error("cloudflare_zone_missing");
  for (const record of records) {
    const existing = await cloudflare(`/client/v4/zones/${zone.id}/dns_records?type=${record.type}&name=${encodeURIComponent(record.name)}`) as { id?: string; content?: string }[];
    const current = Array.isArray(existing) ? existing[0] : undefined;
    if (current?.content === record.value) continue;
    if (current?.id) throw new Error("cloudflare_conflict");
    await cloudflare(`/client/v4/zones/${zone.id}/dns_records`, {
      method: "POST",
      body: JSON.stringify({ type: record.type, name: record.name, content: record.value, ttl: 1, proxied: record.type !== "TXT" }),
    });
  }
}
