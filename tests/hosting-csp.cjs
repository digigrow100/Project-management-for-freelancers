// Exactly one Content-Security-Policy applies to every path; only the owner's Website source page may reach the local signer.
const assert=require('node:assert/strict');
(async()=>{
 const {pathToRegexp}=require('next/dist/compiled/path-to-regexp');
 const config=(await import('../next.config.mjs')).default;
 const rules=await config.headers();
 const policy=pathname=>rules.filter(r=>pathToRegexp(r.source).test(pathname)).flatMap(r=>r.headers.filter(h=>h.key==='Content-Security-Policy').map(h=>h.value));
 for(const pathname of ['/','/login','/client','/client/sources','/hosting','/hosting/sources/x','/api/hosting-services','/hosting/sourcesx']){
  const found=policy(pathname);assert.equal(found.length,1,pathname+' must match exactly one policy');
  assert.ok(!found[0].includes('127.0.0.1'),pathname);assert.match(found[0],/connect-src 'self' https:\/\/\*\.supabase\.co wss:\/\/\*\.supabase\.co;/);
 }
 for(const page of ['/hosting/backups','/hosting/email']){const found=policy(page);assert.equal(found.length,1,page);assert.match(found[0],/http:\/\/127\.0\.0\.1:47419;/);}
 for(const page of ['/client/backups','/client/sources','/hosting/backups/x'])assert.ok(!policy(page)[0].includes('127.0.0.1'),page);
 const sources=policy('/hosting/sources');
 assert.equal(sources.length,1);
 assert.match(sources[0],/connect-src 'self' https:\/\/\*\.supabase\.co wss:\/\/\*\.supabase\.co http:\/\/127\.0\.0\.1:47419;/);
 assert.ok(!sources[0].includes('*.supabase.co http://*')&&!/connect-src[^;]*\*;/.test(sources[0]));
 // every other directive is identical, so the exception widens only connect-src
 const strip=v=>v.replace(/connect-src[^;]*;/,'');assert.equal(strip(sources[0]),strip(policy('/')[0]));
 console.log('PASS CSP: one policy per path, signer loopback allowed only on owner source, backup and email pages');
})().catch(e=>{console.error(e);process.exitCode=1});
