import { ORIGIN_IPV4, domainOk } from "./validate";
const CLOUDFLARE_V4 = [
    "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22",
    "141.101.64.0/18", "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20",
    "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
    "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
];
function ipv4Number(value: string) {
    const parts = value.split(".").map((part) => Number(part));
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255))
        return null;
    return (((parts[0] ?? 0) * 256 + (parts[1] ?? 0)) * 256 + (parts[2] ?? 0)) * 256 + (parts[3] ?? 0);
}
export function isCloudflareIp(value: string) {
    const address = ipv4Number(value);
    if (address === null)
        return false;
    return CLOUDFLARE_V4.some((range) => {
        const [base, bitsText] = range.split("/");
        const baseNumber = ipv4Number(base ?? "");
        const bits = Number(bitsText);
        if (baseNumber === null || !Number.isInteger(bits))
            return false;
        const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
        return (address & mask) === (baseNumber & mask);
    });
}
const CLOUDFLARE_V6 = ["2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32", "2405:8100::/32", "2a06:98c0::/29", "2c0f:f248::/32"];
function ipv6Number(value: string) {
    if (!/^[a-fA-F0-9:]+$/.test(value))
        return null;
    const halves = value.split('::');
    if (halves.length > 2)
        return null;
    const left = (halves[0] ?? '').split(':').filter(Boolean), right = (halves[1] ?? '').split(':').filter(Boolean), missing = 8 - left.length - right.length;
    if (missing < 0 || (halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1))
        return null;
    const groups = [...left, ...Array(missing).fill('0'), ...right];
    if (groups.some(g => g.length > 4))
        return null;
    return groups.reduce((n, g) => (n << 16n) + BigInt(parseInt(g, 16)), 0n);
}
export function isCloudflareIpv6(value: string) {
    const n = ipv6Number(value);
    if (n === null)
        return false;
    return CLOUDFLARE_V6.some(cidr => { const [prefix, bits] = cidr.split('/'), base = ipv6Number(prefix ?? ''); return base !== null && (n >> BigInt(128 - Number(bits))) === (base >> BigInt(128 - Number(bits))); });
}
export type DnsRecord = {
    type: "A" | "CNAME" | "TXT";
    host: string;
    name: string;
    value: string;
    note: string;
};
export function dnsPlan(hostname: string, token: string): {
    records: DnsRecord[];
} | null {
    if (!domainOk(hostname))
        return null;
    const www = hostname.startsWith("www.") && domainOk(hostname.slice(4));
    const records: DnsRecord[] = [
        { type: www ? "CNAME" : "A", host: hostname, name: hostname, value: www ? hostname.slice(4) : ORIGIN_IPV4, note: "Full hostname shown. Your DNS panel may ask for @ or the relative subdomain." },
        { type: "TXT", host: `_hms-verify.${hostname}`, name: `_hms-verify.${hostname}`, value: token, note: "Required ownership proof for this website, including when the A record already points at our VPS." },
    ];
    return { records };
}
export type DnsAssessment = {
    proven: boolean;
    method: "a" | "txt" | "http" | null;
    cloudflare: boolean;
    detail: string;
};
export function assessDns(input: {
    addresses: string[];
    ipv6?: string[];
    txt: string[];
    token: string;
    httpVerified: boolean;
}): DnsAssessment {
    const cloudflare = input.addresses.some(isCloudflareIp);
    const origin = input.addresses.includes(ORIGIN_IPV4);
    const txt = input.txt.some((value) => value.trim() === input.token);
    if ((input.ipv6 ?? []).some(address => !isCloudflareIpv6(address)))
        return { proven: false, method: null, cloudflare, detail: "An AAAA record points to IPv6 that is not enrolled for this VPS. Remove or correct it before verification." };
    const allTrusted = input.addresses.length > 0 && input.addresses.every(address => address === ORIGIN_IPV4 || isCloudflareIp(address));
    if (txt && allTrusted && (origin || cloudflare))
        return { proven: true, method: "txt", cloudflare, detail: "This website's TXT token matches and the hostname resolves to the VPS or Cloudflare." };
    if (txt)
        return { proven: false, method: null, cloudflare, detail: "The TXT token matches. Add the A or CNAME record so visitors reach the server." };
    if (cloudflare)
        return { proven: false, method: null, cloudflare: true, detail: "Cloudflare is hiding the origin address. Add the TXT token so the panel can confirm the name points here." };
    if (!input.addresses.length)
        return { proven: false, method: null, cloudflare: false, detail: "No A record was found yet." };
    return { proven: false, method: null, cloudflare: false, detail: "The A record does not point at 62.171.130.156." };
}
export function domainStatusAfterProof(proven: boolean, attached: boolean, certificateReady: boolean) {
    if (!proven)
        return "pending_dns" as const;
    if (!attached)
        return "verifying" as const;
    if (!certificateReady)
        return "issuing_ssl" as const;
    return "active" as const;
}
