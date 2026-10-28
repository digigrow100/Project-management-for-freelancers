const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {build}=require('esbuild');
const {NextRequest}=require('next/server');
const state={host:'web.housemysite.com',user:null,authCalls:0,requests:0};
global.__hostingDomainFixture=state;
const fixture=`const s=globalThis.__hostingDomainFixture;
export const headers=()=>new Headers({'host':s.host,'x-forwarded-host':'web.housemysite.com'});
export const createServerClient=()=>({auth:{getUser:async()=>{s.authCalls++;return {data:{user:s.user}}}}});
export const serviceScope=async()=>({actor:'owner',readOnly:false,sites:new Map()});
export const serviceRequest=async()=>{s.requests++;return {projects:[]}};
export class ServiceDenied extends Error{};
export const rateLimit=async()=>{};`;
async function load(file){
 const result=await build({entryPoints:[path.join(__dirname,'..',file)],bundle:true,platform:'node',format:'cjs',write:false,packages:'external',tsconfig:path.join(__dirname,'../tsconfig.json'),plugins:[{name:'domain-fixture',setup(b){
  b.onResolve({filter:/^(next\/headers|@supabase\/ssr|@\/lib\/hosting\/managed|@\/lib\/security\/rateLimit)$/},()=>({path:'fixture',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:fixture,loader:'ts'}));
 }}]});
 const mod={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(require,mod,mod.exports);return mod.exports;
}
function req(url,host='web.housemysite.com'){return new NextRequest('https://'+host+url,{headers:{host,'x-forwarded-for':'192.0.2.10'}});}
process.env.VERCEL='1';process.env.ADMIN_ALLOWED_IPS='192.0.2.10';
process.env.SUPABASE_URL='https://fixture.supabase.co';process.env.SUPABASE_ANON_KEY='fixture';process.env.APP_URL='https://hqproject.com';

test('robots and exploit probes reject cheaply, with noindex and no auth/database call',async()=>{
 const {middleware}=await load('middleware.ts');state.authCalls=0;
 const robots=await middleware(req('/robots.txt'));assert.equal(robots.status,200);assert.equal(await robots.text(),'User-agent: *\nDisallow: /\n');
 for(const url of ['/sitemap.xml','/.env','/.env.local','/.git/config','/wp-login.php','/wp-admin/setup-config.php','/xmlrpc.php','/phpmyadmin/']){
  const response=await middleware(req(url));assert.equal(response.status,404,url);assert.match(response.headers.get('x-robots-tag'),/noindex/);assert.match(response.headers.get('cache-control'),/no-store/);
 }
 assert.equal(state.authCalls,0);
});
test('hosting protected pages still require auth; machine protocol and legacy host behavior stay intact',async()=>{
 const {middleware}=await load('middleware.ts');state.user=null;
 const blocked=await middleware(req('/hosting'));assert.equal(blocked.status,307);assert.equal(new URL(blocked.headers.get('location')).pathname,'/login');assert.match(blocked.headers.get('x-robots-tag'),/noindex/);
 const machine=await middleware(req('/api/hosting-operator'));assert.equal(machine.status,200);assert.equal(machine.headers.get('x-middleware-next'),'1');
 const legacy=await middleware(req('/robots.txt','hqproject.com'));assert.equal(legacy.status,307);assert.equal(legacy.headers.get('x-robots-tag'),null);
 state.user={id:'fixture-owner'};const login=await middleware(req('/login'));assert.equal(new URL(login.headers.get('location')).pathname,'/');assert.match(login.headers.get('x-robots-tag'),/noindex/);state.user=null;
 const anon=process.env.SUPABASE_ANON_KEY;delete process.env.SUPABASE_ANON_KEY;
 try{assert.equal((await middleware(req('/hosting'))).status,503);}finally{process.env.SUPABASE_ANON_KEY=anon;}
});
test('only exact hosting host selects its origin; service requests reject foreign origins',async()=>{
 const {getSiteOrigin}=await load('lib/site.ts');
 for(const host of ['web.housemysite.com','WEB.HOUSEMYSITE.COM','web.housemysite.com:443']){state.host=host;assert.equal(getSiteOrigin(),'https://web.housemysite.com');}
 for(const host of ['hqproject.com','web.housemysite.com.attacker.invalid','attacker.invalid','web.housemysite.com:8443']){state.host=host;assert.equal(getSiteOrigin(),'https://hqproject.com');}
 state.host='web.housemysite.com';const {POST}=await load('app/api/hosting-services/route.ts');state.requests=0;
 const make=origin=>new Request('https://web.housemysite.com/api/hosting-services?scope=owner',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({action:'forms.list'})});
 assert.equal((await POST(make('https://hqproject.com'))).status,403);assert.equal(state.requests,0);
 assert.equal((await POST(make('https://web.housemysite.com'))).status,200);assert.equal(state.requests,1);
});
test('static assets also receive host-scoped noindex without affecting other hosts',async()=>{
 const {default:config}=await import('../next.config.mjs');const rules=await config.headers();const selected=rules.find(r=>r.has?.some(c=>c.type==='host'));
 assert(selected);const matcher=new RegExp('^'+selected.has[0].value+'$');assert(matcher.test('web.housemysite.com'));assert(!matcher.test('webXhousemysiteXcom'));assert(!matcher.test('hqproject.com'));
 assert.match(selected.headers.find(h=>h.key==='X-Robots-Tag').value,/noindex/);
});
