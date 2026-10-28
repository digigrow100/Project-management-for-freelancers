// Pure policy shared by middleware and server authorization. No browser exports.
type NetworkEnvironment = Record<string,string|undefined>;
type RequestHeaders = { get(name: string): string | null };
function canonicalIpv4(value: string): string | null {
  const raw=value.trim().replace(/^::ffff:/i, '');
  const parts=raw.split('.');
  if(parts.length!==4 || parts.some(p=>! /^(0|[1-9][0-9]{0,2})$/.test(p) || Number(p)>255)) return null;
  return parts.join('.');
}
export function adminNetworkAllowed(requestHeaders:RequestHeaders, env:NetworkEnvironment):boolean {
  // Only the Vercel-managed client address is trusted. Never fall back to a
  // client-supplied X-Forwarded-For, X-Real-IP, cookie, query or form value.
  if(env.VERCEL!=='1')return false;
  const configured=(env.ADMIN_ALLOWED_IPS??'').split(',').map(value=>value.trim());
  if(!configured.length || configured.some(value=>!canonicalIpv4(value)))return false;
  const allowed=new Set(configured.map(value=>canonicalIpv4(value)));
  const raw=requestHeaders.get('x-vercel-forwarded-for');
  if(!raw || raw.includes(','))return false;
  const address=canonicalIpv4(raw);
  return address!==null && allowed.has(address);
}
export function isAdminOnlyPath(path:string):boolean {
  return ['/admin','/hosting','/team','/api/admin','/api/presence/team',
    '/api/hosting-operator/context','/api/hosting-operator/dispatch']
    .some(prefix=>path===prefix || path.startsWith(prefix+'/'));
}
