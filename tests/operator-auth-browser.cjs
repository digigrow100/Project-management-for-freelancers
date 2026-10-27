// Actual Chromium + built Next app, synthetic Auth/PostgREST protocol fixture only.
// No production credentials, customer content, worker, email or external HTTP calls.
const assert=require('node:assert/strict'),http=require('node:http'),https=require('node:https'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {generateKeyPairSync,createHash,createHmac}=require('node:crypto');
const {spawn,spawnSync}=require('node:child_process');
const {buildSync}=require('esbuild'),{chromium}=require('playwright');
const servicesExtension=process.env.HMS_SERVICES_BROWSER_TEST==='1'?require('./fixtures/services-browser-extension.cjs'):null;
const {fixture,IDS,API_KEY,ANON,totp}=require('./fixtures/auth-provider.cjs');
const root=path.resolve(__dirname,'..'),full=path.resolve(process.env.HMS_PORTAL_APP_ROOT||(fs.existsSync(path.join(root,'app/layout.tsx'))?root:path.resolve(root,'../portal-full-local'))),automation=path.resolve(process.env.HMS_AUTOMATION_SOURCE||path.resolve(root,'../retention-work')),origin='https://127.0.0.1:39549',backend='http://127.0.0.1:39551';
const {createServerClient}=require(path.join(full,'node_modules/@supabase/ssr'));
const test=fixture(),host=generateKeyPairSync('x25519'),hostJwk=host.privateKey.export({format:'jwk'});
const hostKey=hostJwk.x+'=',pin=createHash('sha256').update(Buffer.from(hostKey,'base64url')).digest('hex');
const base={schema:1,job_id:IDS.job,idempotency_key:IDS.request,actor_id:IDS.owner,service_id:IDS.service,client_id:IDS.clientA,server_id:IDS.server,tenant:'acme',subject:'olivia',project:'c12345678',kind:'configure',host_key:hostKey,member_key:null,server_time:Math.floor(Date.now()/1000),expires:Math.floor(Date.now()/1000)+300};
let browser,child,bootstrap,proxy,tlsDir;let log='',passed=0;
const ok=label=>{passed++;console.log('PASS '+label);};
const listen=(server,port)=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
const close=server=>server?new Promise(resolve=>server.close(resolve)):Promise.resolve();
async function sessionCookies(name){
 const jar=new Map();const auth=createServerClient('http://127.0.0.1:39550',ANON,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:items=>items.forEach(c=>jar.set(c.name,c.value))}});
 const result=await auth.auth.setSession({access_token:test.token(name),refresh_token:'fixture-refresh-'+name});assert.equal(result.error,null);
 return [...jar].map(([name,value])=>({name,value,url:origin,httpOnly:true,sameSite:'Lax'}));
}
async function request(name,route,body,extraCookies=[]){
 const cookies=[...await sessionCookies(name),...extraCookies];
 return fetch(backend+route,{method:body===undefined?'GET':'POST',redirect:'manual',headers:{cookie:cookies.map(c=>c.name+'='+c.value).join('; '),origin,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
}
async function waitForApp(){for(let i=0;i<150;i++){if(child.exitCode!==null)throw Error('Isolated Next app stopped');try{const r=await fetch(backend+'/login');if(r.status===200)return;}catch{}await new Promise(r=>setTimeout(r,200));}throw Error('Isolated Next app did not start');}
async function main(){
 await listen(test.server,39550);
 const bundle=buildSync({entryPoints:[path.join(root,'lib/hosting/operatorSigning.ts')],bundle:true,format:'iife',globalName:'signer',write:false,platform:'browser'}).outputFiles[0].text;
 tlsDir=fs.mkdtempSync(path.join(os.tmpdir(),'hms-isolated-tls-'));const certPath=path.join(tlsDir,'cert.pem'),keyPath=path.join(tlsDir,'key.pem');assert.equal(spawnSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',keyPath,'-out',certPath,'-days','1','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1,IP:127.0.0.2'],{stdio:'ignore'}).status,0);const tls={key:fs.readFileSync(keyPath),cert:fs.readFileSync(certPath)};bootstrap=https.createServer(tls,(req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Isolated signing fixture</title><script>'+bundle+'</script>');});await listen(bootstrap,39549);
 const runtime=path.resolve(process.env.HMS_BROWSER_RUNTIME_ROOT||path.resolve(root,'../browser-runtime'));
 browser=await chromium.launch({executablePath:path.join(runtime,'chromium'),headless:true,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--disable-dev-shm-usage','--no-zygote'],env:{...process.env,FONTCONFIG_PATH:'/etc/fonts',FONTCONFIG_FILE:'/etc/fonts/fonts.conf',LD_LIBRARY_PATH:path.join(runtime,'al2023/lib')}});
 const device=await browser.newContext({acceptDownloads:true,ignoreHTTPSErrors:true}),page=await device.newPage();page.on('pageerror',e=>console.log('Browser error',e.message));await page.goto(origin);
 const publicKey=await page.evaluate(async({context,pin})=>{
  let refused=false;try{await signer.createDeviceKey(context,'0'.repeat(64));}catch{refused=true;}if(!refused)throw Error('Wrong pin accepted');
  const key=await signer.createDeviceKey(context,pin);if(key.privateKey.extractable)throw Error('Extractable device key');
  refused=false;try{await crypto.subtle.exportKey('pkcs8',key.privateKey);}catch{refused=true;}if(!refused)throw Error('Private key export accepted');
  if(await signer.readDeviceKey({...context,actor_id:'20000000-0000-4000-8000-000000000001'}))throw Error('Cross-actor key');
  refused=false;try{await signer.prepareOnDevice(context,'domain.release',{},undefined,context.server_time);}catch{refused=true;}if(!refused)throw Error('Unenrolled device signed');
  return key.publicKey;
 },{context:base,pin});ok('independent pin, non-extractable IndexedDB key, actor scope and enrollment gate');
 const signed=await page.evaluate(async({context})=>{
  const enrolled={...context,member_key:(await signer.readDeviceKey(context)).publicKey};
  for(const [c,fields,issued] of [[{...enrolled,host_key:'A'.repeat(43)+'='},{},enrolled.server_time],[enrolled,{},enrolled.expires+1],[enrolled,{project:'cffffffff'},enrolled.server_time]]){
   let refused=false;try{await signer.prepareOnDevice(c,'domain.release',fields,undefined,issued);}catch{refused=true;}if(!refused)throw Error('Unsafe context accepted');
  }
  const unicode=signer.canonicalASCII({z:'اردو 😀',a:'\u007f'});
  const env=await signer.prepareOnDevice(enrolled,'env.set',{scope:'preview'},'SYNTHETIC_SECRET=fixture-only-اردو',enrolled.server_time);
  return {env,unicode};
 },{context:base});
 assert.ok(!signed.env.includes('fixture-only'));const packet=JSON.parse(signed.env);
 const python=spawnSync('python3',['-c',`import sys,json,base64
from controlplane.signing import verify
from controlplane.sealed import unseal
d=json.load(sys.stdin);r=d['packet']['request'];p=r['payload'];a=r['auth']
assert verify(base64.urlsafe_b64decode(d['public']),a['signature'],'acme','olivia',r['operation'],r['idempotency_key'],p,a['issued'],a['issued'])
assert json.loads(unseal(base64.urlsafe_b64decode(d['private']+'='),p['sealed'],('|'.join(['hms-env-v1','acme',p['project'],p['scope'],r['idempotency_key']])).encode()))=={'SYNTHETIC_SECRET':'fixture-only-اردو'}
assert d['unicode']==json.dumps({'z':'اردو 😀','a':chr(127)},sort_keys=True,separators=(',',':'))
print('verified')`],{cwd:automation,input:JSON.stringify({packet,public:publicKey,private:hostJwk.d,unicode:signed.unicode}),encoding:'utf8'});
 assert.equal(python.status,0,python.stderr);ok('Chromium Ed25519 and encrypted Unicode environment verified by real Python host modules');
 await close(bootstrap);bootstrap=null;
 const enrollment={[IDS.service]:{server_id:IDS.server,client_id:IDS.clientA,actor_id:IDS.owner,tenant:'acme',subject:'olivia',host_key:hostKey,member_key:publicKey}};
 const env={...process.env,NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',APP_URL:origin,NEXT_PUBLIC_SITE_URL:origin,SUPABASE_URL:'http://127.0.0.1:39550',SUPABASE_ANON_KEY:ANON,SUPABASE_SERVICE_ROLE_KEY:API_KEY,OPENAI_API_KEY:'sk-isolated-only',HOSTING_BACKUP_OWNER_ID:IDS.owner,HOSTING_BACKUP_PORTAL_ENABLED:'false',HOSTING_OPERATOR_EXTENDED_CONTROLS:'approved',HOSTING_OPERATOR_BROWSER_SIGNING:'approved',HOSTING_OPERATOR_TRUSTED_KEYS:JSON.stringify(enrollment)};
 for(const key of ['HOSTING_OPERATOR_TRANSPORT','HOSTING_BACKUP_ORIGIN','HOSTING_BACKUP_PORTAL_KEY','HOSTING_BRIDGE_GITHUB_TOKEN','VERCEL'])delete env[key];
 if(servicesExtension)Object.assign(env,await servicesExtension.start({tls,certPath,IDS}));
 child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','39551','-H','127.0.0.1'],{cwd:full,env,stdio:['ignore','pipe','pipe']});child.stdout.on('data',d=>log+=d);child.stderr.on('data',d=>log+=d);await waitForApp();proxy=https.createServer(tls,(req,res)=>{const upstream=http.request(backend+req.url,{method:req.method,headers:req.headers},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);});upstream.on('error',()=>{res.writeHead(502);res.end();});req.pipe(upstream);});await listen(proxy,39549);
 const body={job_id:IDS.job};
 assert.equal((await request('owner','/api/hosting-operator/context',body)).status,200);ok('built Next context route accepts verified owner AAL2');
 for(const name of ['aal1','noFactor','member','a','b','unverified'])assert.equal((await request(name,'/api/hosting-operator/context',body)).status,403,name);
 ok('AAL1, missing factor, metadata-spoofed member and both clients denied operator access');
 for(const name of ['aal1','noFactor']){const r=await request(name,'/hosting/operations');assert.ok([303,307].includes(r.status),name+' '+r.status);assert.ok(r.headers.get('location').includes('/login/security'));}ok('hosting layout preserves mandatory MFA redirect');
 test.state.sessionActive=false;assert.equal((await request('owner','/api/hosting-operator/context',body)).status,403);test.state.sessionActive=true;
 test.state.rateAllowed=false;assert.equal((await request('owner','/api/hosting-operator/context',body)).status,403);test.state.rateAllowed=true;ok('revoked session and unavailable rate-limit gate fail closed');
 for(const [actor,own,foreign]of [['a','Website A','Website B'],['b','Website B','Website A']]){const response=await request(actor,'/client/services');assert.equal(response.status,200);const html=await response.text();assert.ok(html.includes(own));assert.ok(!html.includes(foreign));}test.state.accessEnabled=false;assert.equal((await request('a','/client/services')).status,404);test.state.accessEnabled=true;ok('actual client pages show owned services only and revoked access is denied');
 const selection=site=>({action:'plan',selections:[{site,point:'fixture-point',components:['website']}]});
 assert.equal((await request('a','/api/hosting-backups?scope=client',selection(IDS.serviceB))).status,404);
 assert.equal((await request('b','/api/hosting-backups?scope=client',selection(IDS.service))).status,404);
 assert.equal((await request('a','/api/hosting-backups?scope=client',selection(IDS.service))).status,404);
 const viewPayload=IDS.owner+':'+IDS.clientA+':'+(Date.now()+600000),view=viewPayload+':'+createHmac('sha256',API_KEY).update('fhq:hosting:read-only-client-view:v1:'+viewPayload).digest('hex');
 assert.equal((await request('owner','/api/hosting-backups?scope=client',selection(IDS.service),[{name:'fhq_hosting_client_view',value:view}])).status,404);ok('unreleased recovery API denies both clients and admin inspection before transport');
 assert.equal((await request('a','/client/backups')).status,404);const clientHTML=await (await request('a','/client/services')).text();assert.ok(!clientHTML.includes('href="/client/backups"'));assert.ok(!clientHTML.includes('Testing · admin only'));ok('unreleased client page and navigation are hidden without admin testing labels');
 await device.addCookies(await sessionCookies('owner'));await page.goto(origin+'/hosting/operations');
 await page.waitForLoadState('networkidle');await page.getByRole('heading',{name:'Prepare a request on this device'}).waitFor();
 const signerPanel=page.locator('section').filter({has:page.getByRole('heading',{name:'Prepare a request on this device'})});await signerPanel.locator('select').nth(0).selectOption(IDS.job);await page.getByRole('button',{name:'Load request',exact:true}).click();
 await page.getByRole('button',{name:'Download signed request'}).waitFor();await signerPanel.locator('select').nth(1).selectOption('env.set');await page.getByLabel('Environment values (NAME=value)').fill('SYNTHETIC_SECRET=isolated-browser-value');
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Download signed request'}).click();const download=await downloadPromise;const stream=await download.createReadStream();let bytes='';for await(const c of stream)bytes+=c;assert.ok(!bytes.includes('isolated-browser-value'));assert.equal(await page.getByLabel('Environment values (NAME=value)').inputValue(),'');
 const exported=JSON.parse(bytes);ok('actual Operations UI loads scoped job, signs, downloads and clears plaintext');
 // UI upload uses the actual dispatch endpoint. An interrupted insert must not auto-retry.
 await page.getByText('Already have a signed request file?',{exact:false}).click();
 await page.getByLabel('Signed request file').setInputFiles({name:'isolated.json',mimeType:'application/json',buffer:Buffer.from(bytes)});
 test.state.dropNextInsert=true;await page.getByRole('button',{name:'Prepare delivery',exact:true}).click();
 await page.getByRole('status').filter({hasText:'Delivery could not be confirmed'}).waitFor();
 assert.equal(test.state.deliveries.length,1);assert.ok(await page.getByRole('button',{name:'Prepare delivery',exact:true}).isDisabled());
 const insertCount=test.state.requests.filter(r=>r.path.endsWith('_deliveries')&&r.method==='POST').length;assert.equal(insertCount,1);
 assert.equal((await request('owner','/api/hosting-operator/dispatch',exported)).status,200);assert.equal(test.state.deliveries.length,1);ok('interrupted delivery stops; explicit identical retry returns the existing receipt without duplicate');
 const tampered=structuredClone(exported);tampered.request.payload.sealed=tampered.request.payload.sealed.replace(/^./,tampered.request.payload.sealed[0]==='A'?'B':'A');
 assert.equal((await request('owner','/api/hosting-operator/dispatch',tampered)).status,403);
 const stale=structuredClone(exported);stale.request.auth.issued-=301;assert.equal((await request('owner','/api/hosting-operator/dispatch',stale)).status,403);
 const wrongProject=structuredClone(exported);wrongProject.request.payload.project='cffffffff';assert.equal((await request('owner','/api/hosting-operator/dispatch',wrongProject)).status,403);ok('tampered ciphertext, stale signature and foreign project rejected before delivery');
 const mfaContext=await browser.newContext({ignoreHTTPSErrors:true});await mfaContext.addCookies(await sessionCookies('aal1'));const mfaPage=await mfaContext.newPage();await mfaPage.goto(origin+'/login/security');await mfaPage.getByLabel('Verification code',{exact:true}).fill('000000');await mfaPage.getByRole('button',{name:'Verify and continue'}).click();await mfaPage.getByRole('alert').filter({hasText:'could not be verified'}).waitFor();
 await mfaPage.getByLabel('Verification code',{exact:true}).fill(totp());await mfaPage.getByRole('button',{name:'Verify and continue'}).click();await mfaPage.waitForURL(url=>url.pathname!=='/login/security');
 const upgraded=await mfaPage.evaluate(async body=>(await fetch('/api/hosting-operator/context',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).status,body);assert.equal(upgraded,200);await mfaPage.goto(origin+'/hosting/operations');await mfaPage.getByRole('heading',{name:'Prepare a request on this device'}).waitFor();ok('actual MFA form rejects bad TOTP; browser fetch and page reload retain upgraded AAL with Secure cookies');
 await page.addScriptTag({content:bundle});assert.equal(await page.evaluate(async context=>{await signer.removeDeviceKey(context);return await signer.readDeviceKey(context)},base),null);ok('explicit device-key removal persists; no automatic key recreation');
 if(servicesExtension)await servicesExtension.check({browser,sessionCookies,origin,request,IDS,ok});
 const result={status:'passed',groups:passed,browser:browser.version(),production_ready:false,auth_scope:'synthetic protocol fixture; not live GoTrue acceptance',external_mutations:0};fs.writeFileSync(path.join(root,'AUTH_BROWSER_RESULTS.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
main().catch(error=>{console.error(error.stack);console.error('Isolated app log tail:',log.slice(-3000));process.exitCode=1;}).finally(async()=>{if(servicesExtension)await servicesExtension.stop();if(browser)await browser.close();if(child){child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);});}await close(bootstrap);await close(proxy);await close(test.server);if(tlsDir)fs.rmSync(tlsDir,{recursive:true,force:true});});
