const assert=require('node:assert/strict'),http=require('node:http'),https=require('node:https'),path=require('node:path'),{spawn}=require('node:child_process');
let child,proxy,context;
async function start({tls,certPath,IDS}){
 child=spawn('python3',[path.join(__dirname,'services-provider.py')],{stdio:['pipe','pipe','pipe']});child.stdin.end(JSON.stringify(IDS)+'\n');
 context=await new Promise((resolve,reject)=>{let text='';child.stdout.on('data',chunk=>{text+=chunk;if(text.includes('\n')){try{resolve(JSON.parse(text.split('\n')[0]))}catch(e){reject(e)}}});child.once('exit',()=>reject(Error('Isolated service fixture stopped')));child.stderr.on('data',d=>process.stderr.write(d));});
 proxy=https.createServer(tls,(req,res)=>{const upstream=http.request('http://127.0.0.1:39553'+req.url,{method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res)});upstream.on('error',()=>{res.writeHead(502);res.end()});req.pipe(upstream)});await new Promise((resolve,reject)=>{proxy.once('error',reject);proxy.listen(39552,'127.0.0.1',resolve)});
 return {HOSTING_CLIENT_FEATURES:'email,databases,forms',HOSTING_SERVICES_ENABLED:'approved',HOSTING_SERVICES_ORIGIN:'https://127.0.0.1:39552',HOSTING_SERVICES_PORTAL_KEY:'isolated-service-gateway-key-only-0000',HOSTING_FORMS_ORIGIN:'https://127.0.0.1:39552',HOSTING_FORMS_PORTAL_KEY:'isolated-service-gateway-key-only-0000',NODE_EXTRA_CA_CERTS:certPath,NO_PROXY:(process.env.NO_PROXY||'')+',127.0.0.2'};
}
async function check({browser,sessionCookies,origin,request,IDS,ok}){
 const inventory={action:'inventory',service:IDS.service,kind:'email'};
 assert.equal((await request('a','/api/hosting-services?scope=client',{...inventory,service:IDS.serviceB})).status,403);
 assert.equal((await request('member','/api/hosting-services?scope=owner',inventory)).status,503);
 assert.equal((await request('a','/api/hosting-services?scope=client',inventory)).status,200);
 const ui=await browser.newContext({ignoreHTTPSErrors:true});await ui.addCookies(await sessionCookies('a'));const page=await ui.newPage();
 await page.goto(origin+'/client/email');await page.locator('select').first().selectOption(IDS.service);await page.getByRole('button',{name:'Load accounts'}).click();await page.getByLabel('Account name',{exact:false}).fill('contact');
 await page.getByLabel('Independently verified server fingerprint').fill(context.fingerprint);await page.getByLabel('New password',{exact:false}).fill('synthetic-password-ONLY-123');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Submit for owner approval'}).click();await page.getByRole('status').filter({hasText:'Request recorded'}).waitFor();assert.equal(await page.getByLabel('New password',{exact:false}).inputValue(),'');
 await page.goto(origin+'/client/databases');await page.locator('select').first().selectOption(IDS.service);await page.getByRole('button',{name:'Load accounts'}).click();await page.getByLabel('Account name',{exact:false}).fill('appdb');await page.getByLabel('Independently verified server fingerprint').fill(context.fingerprint);await page.getByLabel('New password',{exact:false}).fill('synthetic-password-ONLY-123');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Submit for owner approval'}).click();await page.getByRole('status').filter({hasText:'Request recorded'}).waitFor();
 ok('actual client Email and Database pages queue encrypted requests for the same owned hosting service');
 const inspected=await (await fetch('http://127.0.0.1:39553/__fixture/inspect')).json();assert.equal(inspected.jobs,2);assert.equal(inspected.password_roundtrip,true);assert.equal(inspected.plaintext_saved,false);
 await page.goto(origin+'/client/forms');await page.getByRole('button',{name:'Load Forms accounts'}).click();await page.getByRole('heading',{name:'Fixture Forms A'}).waitFor();assert.equal(await page.getByText('Fixture Forms B',{exact:true}).count(),0);
 page.on('dialog',d=>d.accept());await page.getByRole('button',{name:'Generate or rotate API key'}).click();const keyInput=page.getByLabel('New Forms API key');await keyInput.waitFor();const key=await keyInput.inputValue();assert.ok(key.startsWith('hmsf_'));
 const response=await fetch('http://127.0.0.1:39553/v1/forms/submit',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','Idempotency-Key':'synthetic-browser-submit'},body:JSON.stringify({fields:{message:'synthetic contact form'}})});assert.equal(response.status,202);
 await page.getByRole('button',{name:'Hide and clear key'}).click();assert.equal(await page.getByLabel('New Forms API key').count(),0);await page.getByRole('button',{name:'Revoke API keys',exact:true}).click();await page.getByRole('status').filter({hasText:'API keys revoked'}).waitFor();
 const revoked=await fetch('http://127.0.0.1:39553/v1/forms/submit',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','Idempotency-Key':'revoked-submit'},body:JSON.stringify({fields:{message:'blocked'}})});assert.equal(revoked.status,403);ok('actual paid Forms portal scoping, one-time key rotation, standalone submit, key clearing and revocation');
 await ui.close();
}
async function stop(){if(proxy)await new Promise(r=>proxy.close(r));if(child){child.kill('SIGTERM');await new Promise(r=>child.exitCode!==null?r():child.once('exit',r));}}
module.exports={start,check,stop};
