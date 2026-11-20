const {test}=require('node:test'),assert=require('node:assert/strict'),{build}=require('esbuild'),path=require('node:path'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
async function api(){const r=await build({entryPoints:['lib/hosting/registrar/website-dns.ts'],bundle:true,platform:'node',format:'cjs',write:false,plugins:[{name:'isolate',setup(b){b.onResolve({filter:/^(server-only|@\/lib\/supabaseClient|@\/lib\/security\/rateLimit|\.\/store)$/},()=>({path:'stub',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export const getSupabase=()=>{throw Error("No live DB")},rateLimit=async()=>{},checked=x=>x.data,connection=async()=>{throw Error("No credentials")},remember=async()=>{},table=x=>x;'}));}}]});const m={exports:{}};new Function('require','module','exports',r.outputFiles[0].text)(require,m,m.exports);return m.exports;}
const fixture=()=>({name:'example.com',expires:0,locked:true,renewOption:'donot',status:'active',glue:{glue_type:'dns',dns_main_list:[{record_type:'mx',record_value1:'mail.example.com',record_value2:'10'},{record_type:'txt',record_value1:'v=spf1 include:example.test ~all',record_value2:''}],dns_sub_list:[]}});
test('REST v2 website DNS appends exactly A, www CNAME and proof TXT; preserves MX/TXT; retries do not duplicate writes',async()=>{
 const {websiteDnsRecords,appendWebsiteRecords}=await api(),changes=websiteDnsRecords('example.com','example.com','a'.repeat(48));
 assert.deepEqual(changes.map(c=>[c.kind,c.record.host,c.record.type]),[['dns_add','@','a'],['dns_add','www','cname'],['dns_add','_hms-verify','txt']]);
 let saved=fixture(),writes=0;const states=[];
 const provider={info:async()=>structuredClone(saved),change:async(zone,c)=>{assert.equal(zone,'example.com');assert.equal(c.kind,'dns_add');writes++;const r=c.record,key=r.host==='@'?'dns_main_list':'dns_sub_list';saved.glue[key].push({...r.host==='@'?{}:{sub_host:r.host},record_type:r.type,record_value1:r.value,record_value2:''});}};
 const journal={claim:async()=>String(writes),finish:async(id,s)=>states.push(s)};
 await appendWebsiteRecords(provider,'example.com',changes,journal);await appendWebsiteRecords(provider,'example.com',changes,journal);
 assert.equal(writes,3);assert.deepEqual(states,['confirmed','confirmed','confirmed']);assert.equal(saved.glue.dns_main_list.filter(r=>['mx','txt'].includes(r.record_type)).length,2);
 assert.throws(()=>websiteDnsRecords('housemysite.com','web.housemysite.com','a'.repeat(48)),/invalid_request/);
});
test('provider timeout or missing unrelated DNS records stays uncertain and blocks blind retry; conflicting routing stays untouched',async()=>{
 const {websiteDnsRecords,appendWebsiteRecords}=await api(),changes=websiteDnsRecords('example.com','example.com','a'.repeat(48));let state='',claims=0;
 const journal={claim:async()=>{claims++;return 'op';},finish:async(id,s)=>state=s};
 await assert.rejects(appendWebsiteRecords({info:async()=>fixture(),change:async()=>{throw Error('timeout');}},'example.com',changes,journal),/timeout/);assert.equal(state,'uncertain');
 const conflict=fixture();conflict.glue.dns_main_list.push({record_type:'a',record_value1:'192.0.2.1',record_value2:''});
 await assert.rejects(appendWebsiteRecords({info:async()=>conflict,change:async()=>assert.fail('no replacement allowed')},'example.com',changes,journal),/record_conflict/);assert.equal(claims,1);
 let reads=0;await assert.rejects(appendWebsiteRecords({info:async()=>++reads===1?fixture():{...fixture(),glue:{glue_type:'dns',dns_main_list:[{record_type:'a',record_value1:'62.171.130.156',record_value2:''}]}},change:async()=>{}},'example.com',changes,journal),/answer_unknown/);assert.equal(state,'uncertain');
});
function load(file,mocks){const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module:mod,exports:mod.exports,Date,Promise,JSON,Error,require:n=>n==='server-only'?{}:mocks[n]??require(n)});return mod.exports;}
test('a pending website can verify apex/www now; only a ready deployment activates routing then HTTPS',async()=>{
 let calls=0,cert=false;const app={id:'app',name:'w-'+'a'.repeat(32),client_id:'client',status:'pending',active_deployment_id:'deploy'},rows=['example.com','www.example.com'].map((hostname,i)=>({id:String(i),app_id:'app',hostname,group_host:'example.com',verification_token:'a'.repeat(48),status:'pending_dns'}));
 const dns=await (async()=>{const r=await build({entryPoints:['lib/hosting/apps/dns.ts'],bundle:true,platform:'node',format:'cjs',write:false});const m={exports:{}};new Function('module','exports',r.outputFiles[0].text)(m,m.exports);return m.exports;})();
 const m=load('lib/hosting/apps/domain-workflow.ts',{'@/lib/supabaseClient':{getSupabase:()=>({from:()=>({update:values=>({eq:(k,id)=>({eq:async()=>{Object.assign(rows.find(d=>d.id===id),values);return {error:null};}})})})})},'@/lib/hosting/agent-client':{agentCall:async()=>({appId:'app',clientId:'client',deploymentId:'deploy',domains:[]}),agentDomains:async()=>{calls++;}},'./store':{getApp:async()=>app,listDomains:async()=>rows},'./dns':dns,'./lookup':{lookupHostname:async(host,proof)=>{assert.equal(proof,'example.com');return {addresses:['62.171.130.156'],ipv6:[],txt:['a'.repeat(48)]};},certificateReady:async()=>({ok:cert})}});
 await m.verifyDomainGroup(app,'example.com');assert.equal(calls,0);assert(rows.every(d=>d.status==='verifying'&&d.dns_verified_at));
 app.status='running';await m.activateWebsiteDomains('app');assert.equal(calls,1);assert(rows.every(d=>d.status==='issuing_ssl'));
 cert=true;await m.activateWebsiteDomains('app');assert(rows.every(d=>d.status==='active'));
});
test('upload CSP permits only the configured HTTPS origin on website pages; legacy DNS cannot replace/truncate a zone',async()=>{
 const old=process.env.HOSTING_AGENT_URL;try{process.env.HOSTING_AGENT_URL='https://deploy.housemysite.com';const config=(await import(path.resolve('next.config.mjs')+'?fixture=upload')).default,headers=await config.headers();
 const upload=headers.find(h=>h.source==='/:portal(client|hosting)/apps/:path*');assert(upload.headers.find(h=>h.key==='Content-Security-Policy').value.includes('https://deploy.housemysite.com'));
 assert(!headers.find(h=>h.source.startsWith('/:path(')).headers.find(h=>h.key==='Content-Security-Policy').value.includes('deploy.housemysite.com'));
 }finally{if(old===undefined)delete process.env.HOSTING_AGENT_URL;else process.env.HOSTING_AGENT_URL=old;}
 const result=await build({entryPoints:['lib/dynadot.ts'],bundle:true,platform:'node',format:'cjs',write:false,plugins:[{name:'legacy-fixture',setup(b){b.onResolve({filter:/^(server-only|\.\/dynadotCrypto|\.\/store)$/},a=>({path:a.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const decryptApiKey=()=>"fixture-only",getDomainSettings=async()=>({dynadotApiKeyEncrypted:"fixture-only"});'}));}}]});
 const mod={exports:{}};let captured;
 new Function('require','module','exports','fetch',result.outputFiles[0].text)(require,mod,mod.exports,async url=>{captured=new URL(url);return Response.json({SetDnsResponse:{Status:'success'}});});
 await mod.exports.setDynadotDnsRecords('example.com',[{host:'@',recordType:'a',value:'62.171.130.156'},{host:'@',recordType:'txt',value:'fixture'},{host:'www',recordType:'cname',value:'example.com'}]);
 assert.equal(captured.searchParams.get('add_dns_to_current_setting'),'1');assert.equal(captured.searchParams.get('main_record_type1'),'txt');assert.equal(captured.searchParams.get('subdomain0'),'www');
 await assert.rejects(mod.exports.setDynadotDnsRecords('example.com',Array.from({length:101},()=>({host:'www',recordType:'a',value:'62.171.130.156'}))),/Too many/);
});
