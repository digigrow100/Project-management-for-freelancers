const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('node:assert/strict'),ts=require('typescript'),{createHmac}=require('crypto');
const cache={};function load(file,mocks={}){if(cache[file]&&!Object.keys(mocks).length)return cache[file];const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{module:m,exports:m.exports,require:n=>n==='server-only'?{}:n in mocks?mocks[n]:n.startsWith('.')?load(path.join(path.dirname(file),n+'.ts')):require(n),process,fetch,Response,AbortSignal,setTimeout,FormData});return cache[file]=m.exports;}
(async()=>{
const {Dynadot,signature}=load('lib/hosting/registrar/api.ts'),{intent,domainInfo}=load('lib/hosting/registrar/schema.ts'),{observed,validateChange}=load('lib/hosting/registrar/workflow.ts');
const c={key:'test-key',secret:'test-secret',mode:'sandbox'},id='11111111-1111-4111-8111-111111111111';
assert.equal(signature(c,'/restful/v2/domains?page=1',id,''),createHmac('sha256',c.secret).update(c.key+'\n/restful/v2/domains?page=1\n'+id+'\n').digest('base64'));
const raw={domain_name:'example.com',expiration_date:1799999999000,locked:'No',renew_option:'donot',status:'active',glue_info:{glue_type:'DNS',dns_main_list:[{record_type:'txt',record_value1:'keep me',record_value2:''}]}};
let requests=[],answer={code:200,data:{domain_info:raw}},http=200;
const transport=async(url,opts)=>{requests.push({url,opts});return new Response(JSON.stringify(answer),{status:http})};
let api=new Dynadot(c,transport);let d=await api.info('example.com');assert.equal(d.locked,false);assert.ok(!requests[0].url.includes(c.key));assert.equal(requests[0].opts.headers.Authorization,'Bearer '+c.key);assert.ok(requests[0].opts.headers['X-Signature']);assert.equal(requests[0].opts.redirect,'error');
answer={code:200,data:{domain_info_list:[raw],pagination_result:{page:2,page_size:100,total:101,has_next_page:'No'}}};api=new Dynadot(c,transport);assert.equal((await api.list(2)).pagination_result.has_next_page,false);
await assert.rejects(new Dynadot(c,transport).list(1),/invalid_response/);
answer={code:200,data:{domain_name:'example.com',price_list:[{currency:'USD',unit:'(price/1 year)',renewal_price:'10.25'}]}};assert.equal((await new Dynadot(c,transport).quote('example.com','usd')).amount,'10.25');await assert.rejects(new Dynadot(c,transport).quote('example.com','gbp'),/price_unavailable/);
answer={code:200};await new Dynadot(c,transport).change('example.com',{kind:'lock',locked:false},id);assert.equal(requests.at(-1).opts.body,'{"lock":false}');assert.equal(requests.at(-1).opts.method,'PUT');
await new Dynadot(c,transport).change('example.com',{kind:'dns_remove',record:{host:'@',type:'txt',value:'keep me',priority:0}},id);assert.deepEqual(JSON.parse(requests.at(-1).opts.body),{dns_main_list:[{record_type:'txt',record_value1:'keep me',record_value2:''}]});
answer={code:401,error:{description:'private provider details '+c.secret}};http=401;await assert.rejects(new Dynadot(c,transport).info('example.com'),e=>e.message==='credentials_rejected'&&!e.message.includes(c.secret));
await assert.rejects(new Dynadot(c,async()=>{throw Error(c.key)}).info('example.com'),e=>e.message==='answer_unknown');
const r={kind:'dns_add',record:{host:'@',type:'a',value:'203.0.113.5',priority:0}};validateChange(d,r);assert.equal(observed(d,d,r),false);assert.equal(observed(d,{...d,glue:{...d.glue,dns_main_list:[...d.glue.dns_main_list,{record_type:'a',record_value1:'203.0.113.5',record_value2:''}]}},r),true);
assert.throws(()=>validateChange({...d,glue:{glue_type:'NAME_SERVERS'}},r),/external_dns/);assert.throws(()=>validateChange(d,{kind:'dns_remove',record:r.record}),/record_changed/);
assert.equal(observed(d,{...d,expires:d.expires+1000},{kind:'renew',years:1,currency:'usd'}),true);
assert.throws(()=>intent.parse({kind:'nameservers',nameservers:['ns1.example.com','ns1.example.com']}));assert.throws(()=>intent.parse({kind:'dns_add',record:{...r.record,value:'not an IP'}}));assert.throws(()=>domainInfo.parse({...raw,locked:'garbage'}));
let reads=0;const actions=load('lib/hosting/registrar/actions.ts',{'next/cache':{},'@/lib/hosting/auth':{requireHostingAdmin:async()=>{throw Error('MFA denied')}},'@/lib/security/rateLimit':{},'@/lib/supabaseClient':{getSupabase:()=>{reads++;throw Error('unexpected')}},'./store':{}});await assert.rejects(actions.registrarAction(new FormData()),/MFA denied/);assert.equal(reads,0);
console.log('PASS: signed REST requests, pagination, strict responses, safe errors, renewal quotes, exact DNS selection, readback and auth boundary.');
})().catch(e=>{console.error(e);process.exit(1)});
