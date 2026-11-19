const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,mocks={}){const mod={exports:{}};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;vm.runInNewContext(code,{module:mod,exports:mod.exports,Buffer,process,Date,Headers,Request,URL,Uint8Array,require:n=>n==='server-only'?{}:Object.hasOwn(mocks,n)?mocks[n]:require(n)});return mod.exports;}
test('website access scopes every lookup and denies suspended/admin-preview writes before storage/provider work',async()=>{
 let mode='client',lookups=[],rates=0;
 const m=load('lib/hosting/websites/access.ts',{'@/lib/hosting/auth':{requireHostingClient:async()=>({userId:'actor',clientId:'own-client',client:{status:mode==='suspended'?'suspended':'active'},adminView:mode==='preview'}),requireHostingAdmin:async()=>{throw Error('admin denied');}},'@/lib/supabaseClient':{getSupabase:()=>({from:()=>({select:()=>({eq:()=>({single:async()=>({data:{status:'active'}})})})})})},'@/lib/hosting/apps/store':{getApp:async(id,scope)=>{lookups.push(scope);return {id,client_id:scope,website_credit_id:'credit'};}},'@/lib/security/rateLimit':{rateLimit:async()=>{rates++;}}});
 const id='11111111-1111-4111-8111-111111111111';await m.websiteAccess('/client/apps',id,true);assert.deepEqual(lookups,['own-client']);
 mode='preview';await assert.rejects(m.websiteAccess('/client/apps',id,true),/read only/);mode='suspended';await assert.rejects(m.websiteAccess('/client/apps',id,true),/read only/);assert.equal(lookups.length,1);assert.equal(rates,1);await assert.rejects(m.websiteActor('/hosting/apps',true),/admin denied/);
});
test('deployment receipts authenticate their exact body and time before database access',async()=>{
 const helper=load('lib/hosting/websites/receipt.ts',{'@/lib/supabaseClient':{getSupabase:()=>{throw Error('No DB expected');}}});
 const key='fixture-only-random-receipt-key-32-characters',time=String(Date.now()),body=Buffer.from('{"status":"running"}');
 const headers=new Headers({'x-hms-time':time,'x-hms-receipt':helper.receiptSignature(body,time,key)});
 assert(helper.receiptAuthorized(body,headers,key));assert(!helper.receiptAuthorized(Buffer.from('{}'),headers,key));assert(!helper.receiptAuthorized(body,headers,key,Date.now()+600000));assert(!helper.receiptAuthorized(body,headers,''));
 let databaseWork=0;const route=load('app/api/hosting-websites/receipts/route.ts',{'@/lib/hosting/websites/body':{boundedBody:async r=>new Uint8Array(await r.arrayBuffer())},'@/lib/hosting/websites/receipt':{receiptAuthorized:()=>false,recordReceipt:async()=>databaseWork++}});
 assert.equal((await route.POST(new Request('https://fixture.invalid/api/hosting-websites/receipts',{method:'POST',body:'{}'}))).status,403);assert.equal(databaseWork,0);
});
test('client app serialization excludes encrypted credentials and deployment lists filter ownership before pagination',()=>{
 const types=fs.readFileSync('lib/hosting/apps/types.ts','utf8'),columns=types.match(/APP_COLUMNS = "([^"]+)"/)[1];assert(!columns.includes('token'));assert(!columns.includes('encrypted'));
 const store=fs.readFileSync('lib/hosting/apps/store.ts','utf8');assert.match(store,/query = query\.in\("app_id", owned\)/);assert(!store.includes('rows.filter((row) => owned.has'));
 const actions=fs.readFileSync('lib/hosting/apps/actions.ts','utf8');assert(!actions.includes('assignHostingApp'));assert(!actions.includes('agentRemove'));assert(!actions.includes('unbanHostingAddress'));
});
test('payment proof has strict byte bounds and only permits PNG/JPEG payload headers',async()=>{
 const helper=load('lib/hosting/websites/body.ts');assert(helper.safeProof(Uint8Array.from([137,80,78,71,13,10,26,10]),'image/png'));assert(!helper.safeProof(Uint8Array.from([60,115,118,103,62]),'image/svg+xml'));
 const request=new Request('https://fixture.invalid',{method:'POST',body:'fixture'});await assert.rejects(helper.boundedBody(request,3),/too large/);
});
test('bank checkout cannot be enabled until the signed agent and matching quota are ready',async()=>{
 let ready=false,writes=0;
 const query={eq:()=>query,select:async()=>({data:[{id:true}],error:null})};
 const m=load('lib/hosting/websites/actions.ts',{'next/cache':{revalidatePath(){}},'next/navigation':{redirect:p=>{throw Error('redirect:'+p);}},'@/lib/hosting/auth':{requireHostingAdmin:async()=>({id:'fixture-admin'})},'@/lib/security/rateLimit':{rateLimit:async()=>{}},'@/lib/hosting/agent-client':{agentConfigured:()=>ready,agentCall:async()=>({version:'website-checkout-v1',uploadLimitBytes:1000000000,maxSiteBytes:2000000000})},'@/lib/supabaseClient':{getSupabase:()=>({from:()=>({update:()=>{writes++;return query;}})})}});
 const form=new FormData();for(const [k,v] of Object.entries({currency:'GBP',bank_details:'Fixture bank details only',website_price_minor:'1500',extra_gb_month_minor:'200',max_extra_gb:'1',revision:'1',enabled:'yes'}))form.set(k,v);
 await assert.rejects(m.saveWebsiteSettings(form),/redirect:\/hosting\/website-payments\?setup=agent_missing/);assert.equal(writes,0);
 const old=process.env.HOSTING_APP_SECRETS_KEY;try{ready=true;process.env.HOSTING_APP_SECRETS_KEY='fixture-key-only-32-characters-long';await m.saveWebsiteSettings(form);assert.equal(writes,1);}finally{if(old===undefined)delete process.env.HOSTING_APP_SECRETS_KEY;else process.env.HOSTING_APP_SECRETS_KEY=old;}
});
