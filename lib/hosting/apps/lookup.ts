import "server-only";
import { Resolver } from "node:dns/promises";
import { connect } from "node:tls";

const resolver = new Resolver();
resolver.setServers(["1.1.1.1", "8.8.8.8"]);

export async function lookupHostname(hostname: string) {
  const [addresses, txt] = await Promise.all([
    resolver.resolve4(hostname).catch(() => [] as string[]),
    resolver.resolveTxt(`_hms-verify.${hostname}`).catch(() => [] as string[][]),
  ]);
  return { addresses, txt: txt.map((parts) => parts.join("")) };
}

export function certificateReady(hostname: string) {
  return new Promise<{ ok: boolean; issuer: string }>((resolve) => {
    const socket = connect({ host: hostname, port: 443, servername: hostname, timeout: 8000 });
    const finish = (ok: boolean, issuer = "") => { socket.destroy(); resolve({ ok, issuer }); };
    socket.once("secureConnect", () => {
      const certificate = socket.getPeerCertificate();
      const names = `${certificate.subjectaltname ?? ""},${certificate.subject?.CN ?? ""}`;
      const matches = names.toLowerCase().split(",").some((entry) => entry.replace("dns:", "").trim() === hostname);
      finish(Boolean(socket.authorized && matches), String(certificate.issuer?.O ?? ""));
    });
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

export async function httpTokenReady(hostname: string, token: string) {
  try {
    const response = await fetch(`https://${hostname}/.well-known/hms-verify/${token}`, { redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (response.status !== 200) return false;
    const text = (await response.text()).slice(0, 200).trim();
    return text === token;
  } catch { return false; }
}
