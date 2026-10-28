const assert=require('node:assert/strict');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const esbuild=require('esbuild');
(async()=>{
 const built=await esbuild.build({entryPoints:[path.resolve(__dirname,'../lib/hosting/managed.ts')],bundle:true,platform:'node',format:'cjs',write:false,plugins:[{name:'private-fixtures',setup(b){
  b.onResolve({filter:/^server-only$/},()=>({path:'empty',namespace:'fixture'}));
  b.onResolve({filter:/^\.\/auth$/},()=>({path:'auth',namespace:'fixture'}));
  b.onResolve({filter:/^@\/lib\/supabaseClient$/},()=>({path:'db',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='empty'?'':a.path==='auth'?'export async function requireHostingAdmin(){throw Error()} export async function requireHostingClient(){throw Error()}':'export function getSupabase(){return globalThis.fixtureDB}'}));
 }}]});
 const service='11111111-1111-4111-8111-111111111111',client='22222222-2222-4222-8222-222222222222',domain='33333333-3333-4333-8333-333333333333',key='44444444-4444-4444-8444-444444444444';
 const site={id:service,client_id:client,primary_domain:'fixture.test',status:'pending'};
 const saved={id:domain,service_id:service,client_id:client,hostname:'fixture.test'};
 let calls=0,wire,response;const env={HOSTING_SERVICES_ENABLED:'approved',HOSTING_DOMAIN_AUTOMATION_ENABLED:'approved',HOSTING_SERVICES_ORIGIN:'https://fixture.invalid',HOSTING_SERVICES_PORTAL_KEY:'synthetic-primary-domain-key-0000000000'};
 const db={from(table){return {select(){return this},eq(){return this},async single(){return {error:null,data:table.endsWith('_domains')?saved:table.endsWith('_clients')?{status:'active'}:site}}}}};
 const sandbox={module:{exports:{}},exports:{},require,Buffer,TextDecoder,AbortSignal,URL,process:{env},fixtureDB:db,fetch:async(_url,options)=>{
  calls++;wire=JSON.parse(options.body);assert.equal(options.headers['X-HMS-Services-Signature'],crypto.createHmac('sha256',env.HOSTING_SERVICES_PORTAL_KEY).update('hms:services-portal:v1:'+options.body).digest('hex'));
  return new Response(JSON.stringify(response));
 }};sandbox.exports=sandbox.module.exports;vm.runInNewContext(built.outputFiles[0].text,sandbox);
 const {serviceRequest}=sandbox.module.exports;
 const scope={actor:key,owner:true,readOnly:false,sites:new Map([[service,{client,name:'Fixture'}]])};
 const command={action:'hosting.domain.request',service,domain,operation:'ssl',request_key:key};
 response={id:'a'.repeat(32),digest:'b'.repeat(64),state:'queued',operation:'ssl',live_verified:false};
 assert.equal((await serviceRequest(scope,command)).state,'queued');assert.equal(wire.command.domain,'fixture.test');assert.equal(wire.command.client,client);assert.equal(wire.command.operation,'ssl');
 const before=calls;
 for(const context of [{...scope,owner:false},{...scope,readOnly:true},{...scope,sites:new Map()}])await assert.rejects(()=>serviceRequest(context,command));
 await assert.rejects(()=>serviceRequest(scope,{...command,hostname:'attacker.test'}));
 for(const patch of [{client_id:'foreign'},{service_id:key},{hostname:'alias.test'}]){const original={...saved};Object.assign(saved,patch);await assert.rejects(()=>serviceRequest(scope,command));Object.assign(saved,original);}
 assert.equal(calls,before);
 const now=Math.floor(Date.now()/1000);
 const status={service,domain:'fixture.test',job:null,observation:{dns:'matched',tls:'valid',expires:now+86400,checked:now-2,fresh:true},live_verified:true};
 response=status;assert.equal((await serviceRequest(scope,{action:'hosting.domain.status',service,domain})).live_verified,true);
 for(const patch of [{domain:'foreign.test'},{observation:null},{observation:{...status.observation,expires:now-1}},{observation:{...status.observation,checked:now-1000,fresh:true}},{observation:{...status.observation,checked:now+100}},{observation:{...status.observation,dns:'mismatch'}}]){
  response={...status,...patch};await assert.rejects(()=>serviceRequest(scope,{action:'hosting.domain.status',service,domain}));
 }
 response={...status,observation:{...status.observation,checked:now-1000,fresh:false},live_verified:false};
 assert.equal((await serviceRequest(scope,{action:'hosting.domain.status',service,domain})).live_verified,false);
 env.HOSTING_DOMAIN_AUTOMATION_ENABLED='';await assert.rejects(()=>serviceRequest(scope,command));
 console.log('PASS primary-domain ownership, authoritative hostname, HMAC, owner-only gate and DNS/TLS/expiry/freshness response checks');
})().catch(error=>{console.error(error);process.exitCode=1});
