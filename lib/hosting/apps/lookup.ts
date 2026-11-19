import 'server-only';
import { Resolver } from 'node:dns/promises';
import { connect } from 'node:tls';
import { ORIGIN_IPV4 } from './validate';
const resolver = new Resolver({ timeout: 3000, tries: 1 });
resolver.setServers(['1.1.1.1', '8.8.8.8']);
export async function lookupHostname(hostname: string) { const [addresses, ipv6, txt] = await Promise.all([resolver.resolve4(hostname).catch(() => [] as string[]), resolver.resolve6(hostname).catch(() => [] as string[]), resolver.resolveTxt(`_hms-verify.${hostname}`).catch(() => [] as string[][])]); return { addresses, ipv6, txt: txt.map(p => p.join('')) }; }
export function certificateReady(hostname: string) {
    return new Promise<{
        ok: boolean;
        issuer: string;
    }>(resolve => {
        // Pin the connection to our VPS; hostname is SNI/certificate identity only.
        const socket = connect({ host: ORIGIN_IPV4, port: 443, servername: hostname, timeout: 8000 });
        let done = false;
        function finish(ok: boolean, issuer = '') {
            if (done)
                return;
            done = true;
            socket.destroy();
            resolve({ ok, issuer });
        }
        socket.once('secureConnect', () => { const cert = socket.getPeerCertificate(); finish(socket.authorized, String(cert.issuer?.O ?? '')); });
        socket.once('timeout', () => finish(false));
        socket.once('error', () => finish(false));
    });
}
