import "server-only";
import { decryptApiKey } from "./dynadotCrypto";

/**
 * Server-only client for the Dynadot reseller API (https://www.dynadot.com/domain/api-commands).
 *
 * IMPORTANT: this app's sandbox could not reach dynadot.com to verify the current
 * command/parameter names against the live docs, so the command strings below are
 * built from Dynadot's documented v3 API shape but have not been exercised against
 * a real account. Before relying on sync/DNS/lock actions, test each one against a
 * throwaway domain and adjust `DYNADOT_COMMANDS` below if a command name has changed.
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

/**
 * Pushes a full DNS record set to Dynadot. set_dns2 replaces the whole record
 * set rather than adding incrementally, so this always sends every record
 * this app has stored for the domain (main "@" record plus up to 10 subdomain
 * slots — Dynadot's documented limit for this command).
 */
export async function setDynadotDnsRecords(
  domain: string,
  records: { host: string; recordType: string; value: string }[],
): Promise<void> {
  const apiKey = await getApiKey();
  const params: Record<string, string> = { domain };

  const mainRecord = records.find((r) => r.host === "@" || r.host === "");
  if (mainRecord) {
    params.main_record_type0 = mainRecord.recordType;
    params.main_record0 = mainRecord.value;
  }

  const subRecords = records.filter((r) => r !== mainRecord).slice(0, 10);
  subRecords.forEach((record, i) => {
    params[`subdomain${i}`] = record.host;
    params[`sub_record_type${i}`] = record.recordType;
    params[`sub_record${i}`] = record.value;
  });

  await callDynadot(apiKey, DYNADOT_COMMANDS.setDns, params);
}
