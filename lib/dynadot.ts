import "server-only";
import { decryptApiKey } from "./dynadotCrypto";

/**
 * Server-only client for the Dynadot reseller API (https://www.dynadot.com/domain/api-commands).
 *
 * New client website DNS uses the guarded REST v2 registrar integration.
 * This legacy helper appends supported records only; it never replaces a zone.
 * Append parameters were checked against Dynadot's current published docs.
 * No live provider write acceptance is claimed by these source changes.
 */

const API_BASE = "https://api.dynadot.com/api3.json";

const DYNADOT_COMMANDS = {
  listDomains: "list_domain",
  domainInfo: "domain_info",
  setDns: "set_dns2",
  setNameservers: "set_ns",
  lockDomain: "lock_domain",
  unlockDomain: "unlock_domain",
  setRenewOption: "set_renew_option",
} as const;

export type DynadotDomainSummary = {
  name: string;
  expiration: string | null;
  locked: boolean;
  autoRenew: boolean;
  nameservers: string[];
};

async function callDynadot(apiKey: string, command: string, params: Record<string, string>): Promise<any> {
  const url = new URL(API_BASE);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("command", command);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), { method: "GET", cache: "no-store", signal: AbortSignal.timeout(15000), redirect: "error" });
  if (!res.ok) throw new Error(`Dynadot API HTTP ${res.status}`);

  const json = await res.json();
  const topKey = Object.keys(json)[0];
  const body = topKey ? json[topKey] : json;
  const status = body?.Status ?? body?.ResponseCode;
  if (status && String(status).toLowerCase() !== "success" && String(status) !== "0") {
    throw new Error("Dynadot rejected the request. Check the account settings.");
  }
  return body;
}

async function getApiKey(): Promise<string> {
  const { getDomainSettings } = await import("./store");
  const settings = await getDomainSettings();
  if (!settings.dynadotApiKeyEncrypted) {
    throw new Error("NO_DYNADOT_KEY");
  }
  return decryptApiKey(settings.dynadotApiKeyEncrypted);
}

/** Lists every domain name in the connected Dynadot account. */
export async function listDynadotDomains(): Promise<string[]> {
  const apiKey = await getApiKey();
  const body = await callDynadot(apiKey, DYNADOT_COMMANDS.listDomains, {});
  const list = body?.MainDomains ?? body?.Domains ?? [];
  return (Array.isArray(list) ? list : [])
    .map((entry: any) => entry?.Domain?.Name ?? entry?.Name)
    .filter((name: unknown): name is string => typeof name === "string" && name.length > 0);
}

/** Fetches live details (expiry, lock, nameservers, auto-renew) for one domain. */
export async function getDynadotDomainInfo(domain: string): Promise<DynadotDomainSummary> {
  const apiKey = await getApiKey();
  const body = await callDynadot(apiKey, DYNADOT_COMMANDS.domainInfo, { domain });
  const info = body?.DomainInfo ?? body;
  return {
    name: domain,
    expiration: info?.Expiration ?? info?.ExpirationDate ?? null,
    locked: Boolean(info?.Locked ?? info?.RegistrantStatus === "locked"),
    autoRenew: Boolean(info?.RenewOption === "auto" || info?.AutoRenew),
    nameservers: Array.isArray(info?.NameServers) ? info.NameServers : [],
  };
}

export async function lockDynadotDomain(domain: string): Promise<void> {
  const apiKey = await getApiKey();
  await callDynadot(apiKey, DYNADOT_COMMANDS.lockDomain, { domain });
}

export async function unlockDynadotDomain(domain: string): Promise<void> {
  const apiKey = await getApiKey();
  await callDynadot(apiKey, DYNADOT_COMMANDS.unlockDomain, { domain });
}

export async function setDynadotAutoRenew(domain: string, enabled: boolean): Promise<void> {
  const apiKey = await getApiKey();
  await callDynadot(apiKey, DYNADOT_COMMANDS.setRenewOption, {
    domain,
    renew_option: enabled ? "auto" : "donot",
  });
}

export async function setDynadotNameservers(domain: string, nameservers: string[]): Promise<void> {
  const apiKey = await getApiKey();
  const params: Record<string, string> = { domain };
  nameservers.slice(0, 13).forEach((ns, i) => {
    params[`ns${i}`] = ns;
  });
  await callDynadot(apiKey, DYNADOT_COMMANDS.setNameservers, params);
}

/** Append records only. Never replace a zone or silently truncate input.
 * Legacy callers needing remove/edit must use the reviewed REST v2 registrar UI.
 */
export async function setDynadotDnsRecords(
  domain: string,
  records: { host: string; recordType: string; value: string }[],
): Promise<void> {
  if (domain === 'housemysite.com' || domain.endsWith('.housemysite.com') || !/^(?:[a-z0-9-]+\.)+[a-z]{2,63}$/.test(domain) || !records.length) throw Error('Invalid DNS additions.');
  const main = records.filter(r => r.host === '@' || r.host === '');
  const sub = records.filter(r => r.host !== '@' && r.host !== '');
  if (main.length > 20 || sub.length > 100) throw Error('Too many records. Use the REST v2 DNS editor.');
  // This legacy shape has no priority metadata; do not submit lossy MX/SRV/forward records.
  if (records.some(r => !['a','aaaa','cname','txt'].includes(r.recordType.toLowerCase()) || !r.value || r.value.length > 4096 || /[\r\n\0]/.test(r.value) || !/^(?:@|[_a-z0-9*-]+(?:\.[_a-z0-9-]+)*|)$/.test(r.host))) throw Error('Use the REST v2 DNS editor for this record.');
  const params: Record<string, string> = {domain, add_dns_to_current_setting: '1'};
  main.forEach((r,i) => { params[`main_record_type${i}`]=r.recordType.toLowerCase(); params[`main_record${i}`]=r.value; });
  sub.forEach((r,i) => { params[`subdomain${i}`]=r.host; params[`sub_record_type${i}`]=r.recordType.toLowerCase(); params[`sub_record${i}`]=r.value; });
  await callDynadot(await getApiKey(), DYNADOT_COMMANDS.setDns, params);
}
