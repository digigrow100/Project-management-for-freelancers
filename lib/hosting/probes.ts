import "server-only";
import { isIP } from "node:net";
import { Resolver } from "node:dns/promises";
import { connect, checkServerIdentity } from "node:tls";
/** Probe only an explicitly registered public address. Never follow redirects. */
export function isPublicAddress(ip: string): boolean {
  if (isIP(ip)===4) {
    const [a=0,b=0,c=0]=ip.split('.').map(Number);
    return a>0 && a<224 && a!==10 && a!==127 && !(a===100&&b>=64&&b<=127) && !(a===169&&b===254) && !(a===172&&b>=16&&b<=31) && !(a===192&&(b===168||b===0||(b===88&&c===99))) && !(a===198&&(b===18||b===19||(b===51&&c===100))) && !(a===203&&b===0&&c===113);
  }
  return isIP(ip)===6 && /^[23]/i.test(ip) && !/^2001:(?:0*:|0?db8:)/i.test(ip);
}
export async function probeDns(hostname: string, ipv4: string, ipv6: string) {
  const resolver=new Resolver({timeout:3000,tries:1});
  const results=await Promise.allSettled([resolver.resolve4(hostname),resolver.resolve6(hostname)]);
  const normalize=(a:string)=>isIP(a)===6?new URL(`http://[${a}]/`).hostname:a;
  const addresses=results.flatMap(r=>r.status==='fulfilled'?r.value:[]).map(normalize);
  const expected=[ipv4,ipv6].filter(Boolean).map(normalize);
  // Require every advertised address to belong to this service's server.
  return {matched:addresses.length>0 && expected.length>0 && addresses.every(a=>expected.includes(a)) && expected.some(a=>addresses.includes(a))};
}
export async function probeTls(hostname: string, ip: string): Promise<string> {
  if(!isPublicAddress(ip)) throw new Error('A registered public server address is required.');
  return new Promise((resolve,reject)=>{
    const socket=connect({host:ip,port:443,servername:hostname,rejectUnauthorized:true,checkServerIdentity:(_host,cert)=>checkServerIdentity(hostname,cert)},()=>{
      const expires=Date.parse(socket.getPeerCertificate().valid_to);
      socket.end();
      if(!socket.authorized || !Number.isFinite(expires) || expires<=Date.now()) reject(new Error('Certificate verification failed.'));
      else resolve(new Date(expires).toISOString());
    });
    socket.setTimeout(8000,()=>socket.destroy(new Error('Certificate check timed out.')));
    socket.once('error',()=>{socket.destroy();reject(new Error('Could not verify the certificate on the registered server.'));});
  });
}
