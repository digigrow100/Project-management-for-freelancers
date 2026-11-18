import { ORIGIN_IPV4, domainOk } from "./validate";

const CLOUDFLARE_V4 = [
  "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22",
  "141.101.64.0/18", "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20",
  "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
  "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
];

function ipv4Number(value: string) {
  const parts = value.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return (((parts[0] ?? 0) * 256 + (parts[1] ?? 0)) * 256 + (parts[2] ?? 0)) * 256 + (parts[3] ?? 0);
}

export function isCloudflareIp(value: string) {
  const address = ipv4Number(value);
  if (address === null) return false;
  return CLOUDFLARE_V4.some((range) => {
    const [base, bitsText] = range.split("/");
    const baseNumber = ipv4Number(base ?? "");
    const bits = Number(bitsText);
    if (baseNumber === null || !Number.isInteger(bits)) return false;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (address & mask) === (baseNumber & mask);
  });
}

export type DnsRecord = { type: "A" | "CNAME" | "TXT"; host: string; name: string; value: string; note: string };

export function dnsPlan(hostname: string, token: string): { records: DnsRecord[] } | null {
  if (!domainOk(hostname)) return null;
  const labels = hostname.split(".");
  const relative = labels.length <= 2 ? "@" : labels[0] ?? "@";
  const www = hostname.startsWith("www.") && domainOk(hostname.slice(4));
  const records: DnsRecord[] = www
    ? [{ type: "CNAME", host: "www", name: hostname, value: hostname.slice(4), note: "Point www at the apex. Proxied Cloudflare is fine." }]
    : [{ type: "A", host: relative, name: hostname, value: ORIGIN_IPV4, note: "Point this name at the VPS. Proxied Cloudflare is fine." }];
  const txtHost = hostname.startsWith("www.") ? "_hms-verify.www" : labels.length <= 2 ? "_hms-verify" : `_hms-verify.${labels[0]}`;
  records.push({
    type: "TXT",
    host: txtHost,
    name: `_hms-verify.${hostname}`,
    value: token,
    note: "Required when Cloudflare proxies this name. Optional when an A record already shows 62.171.130.156.",
  });
  return { records };
}

export type DnsAssessment = { proven: boolean; method: "a" | "txt" | "http" | null; cloudflare: boolean; detail: string };

export function assessDns(input: { addresses: string[]; txt: string[]; token: string; httpVerified: boolean }): DnsAssessment {
  const cloudflare = input.addresses.some(isCloudflareIp);
  const origin = input.addresses.includes(ORIGIN_IPV4);
  const txt = input.txt.some((value) => value.trim() === input.token);
  if (input.httpVerified) return { proven: true, method: "http", cloudflare, detail: "The HTTP verification token was served for this hostname." };
  if (origin) return { proven: true, method: "a", cloudflare, detail: "The A record points at 62.171.130.156." };
  if (txt && cloudflare) return { proven: true, method: "txt", cloudflare, detail: "Cloudflare is proxying this name and the TXT token matches." };
  if (txt) return { proven: false, method: null, cloudflare, detail: "The TXT token matches. Add the A or CNAME record so visitors reach the server." };
  if (cloudflare) return { proven: false, method: null, cloudflare: true, detail: "Cloudflare is hiding the origin address. Add the TXT token so the panel can confirm the name points here." };
  if (!input.addresses.length) return { proven: false, method: null, cloudflare: false, detail: "No A record was found yet." };
  return { proven: false, method: null, cloudflare: false, detail: "The A record does not point at 62.171.130.156." };
}

export function domainStatusAfterProof(proven: boolean, attached: boolean, certificateReady: boolean) {
  if (!proven) return "pending_dns" as const;
  if (!attached) return "verifying" as const;
  if (!certificateReady) return "issuing_ssl" as const;
  return "active" as const;
}
