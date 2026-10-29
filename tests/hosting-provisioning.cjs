const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const esbuild=require('esbuild');
const crypto=require('node:crypto');

(async()=>{
 const build=await esbuild.build({entryPoints:[path.resolve(__dirname,'../lib/hosting/managed.ts')],bundle:true,platform:'node',format:'cjs',write:false,
  plugins:[{name:'private-fixtures',setup(b){
   b.onResolve({filter:/^server-only$/},()=>({path:'empty',namespace:'fixture'}));
   b.onResolve({filter:/^\.\/auth$/},()=>({path:'auth',namespace:'fixture'}));
   b.onResolve({filter:/^@\/lib\/supabaseClient$/},()=>({path:'database',namespace:'fixture'}));
   b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='empty'?'':a.path==='auth'?'export async function requireHostingAdmin(){return {id:"fixture"}};export async function requireHostingClient(){throw Error("denied")}':'export function getSupabase(){return globalThis.fixtureDB}'}));
  }}]});
 const service='11111111-1111-4111-8111-111111111111',client='22222222-2222-4222-8222-222222222222',server='33333333-3333-4333-8333-333333333333',pkg='44444444-4444-4444-8444-444444444444',actor='55555555-5555-4555-8555-555555555555',request='66666666-6666-4666-8666-666666666666';
 const row={id:service,client_id:client,server_id:server,package_id:pkg,primary_domain:'fixture.test',status:'pending'};
 let fetches=0,serverStatus='available',wire,mode='valid';
 const env={HOSTING_SERVICES_ENABLED:'approved',HOSTING_PROVISIONING_ENABLED:'approved',HOSTING_SERVICES_ORIGIN:'https://fixture.invalid',HOSTING_SERVICES_PORTAL_KEY:'synthetic-key-only-00000000000000000000'};
 const db={from(table){return {select(){return this},eq(){return this},async single(){
  return {error:null,data:table.endsWith('_services')?row:table.endsWith('_clients')?{status:'active'}:table.endsWith('_packages')?{is_active:true}:table.endsWith('_servers')&&!table.endsWith('_package_servers')?{status:serverStatus}:{server_id:server}};
 }}}};
 const sandbox={module:{exports:{}},exports:{},require,Buffer,TextDecoder,AbortSignal,URL,process:{env},fixtureDB:db,console,
  fetch:async(url,options)=>{
   fetches++;wire=JSON.parse(options.body);
   assert.equal(options.headers['X-HMS-Services-Signature'],crypto.createHmac('sha256',env.HOSTING_SERVICES_PORTAL_KEY).update('hms:services-portal:v1:'+options.body).digest('hex'));
   assert.equal(options.redirect,'error');
   if(mode==='failure')return new Response('{}',{status:503});
   if(mode==='foreign')return new Response(JSON.stringify({service:client,state:'not_requested',live_verified:false}));
   if(wire.command.action==='hosting.status')return new Response(JSON.stringify({service,state:'not_requested',live_verified:false}));
   if(process.env.HMS_AUTOMATION_SOURCE){
    const code=`import sys,json,sqlite3\nfrom contextlib import contextmanager\nfrom cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey\nfrom modules.hosting.provisioning_jobs import ProvisioningJobs\nfrom modules.hosting.service_gateway import ServiceGateway\npacket=json.load(sys.stdin)\ndb=sqlite3.connect(':memory:',isolation_level=None)\nclass Forms:\n def __init__(self):self.db=db\n @contextmanager\n def transaction(self):\n  db.execute('BEGIN IMMEDIATE')\n  try:yield;db.commit()\n  except:db.rollback();raise\nqueue=ProvisioningJobs(db,access=lambda a,c,w:a==packet['actor'] and c==packet['client'],owner_key=Ed25519PrivateKey.generate().public_key(),reserve=lambda *a:True)\ngateway=ServiceGateway(None,Forms(),key=packet['key'],provisioning=(queue,packet['server'],{packet['package']:'a'*64},lambda a:a==packet['actor']))\nprint(json.dumps(gateway.handle(packet['body'].encode(),packet['signature'])))`;
    const child=spawnSync('python',['-c',code],{encoding:'utf8',cwd:process.env.HMS_AUTOMATION_SOURCE,env:{...process.env,PYTHONPATH:process.env.HMS_AUTOMATION_SOURCE},input:JSON.stringify({actor,client,server,package:pkg,key:env.HOSTING_SERVICES_PORTAL_KEY,body:options.body,signature:options.headers['X-HMS-Services-Signature']})});
    assert.equal(child.status,0,child.stderr);return new Response(child.stdout);
   }
   return new Response(JSON.stringify({id:'a'.repeat(32),digest:'b'.repeat(64),state:'queued',live_verified:false}));
  }};
 sandbox.exports=sandbox.module.exports;
 vm.runInNewContext(build.outputFiles[0].text,sandbox);
 const {serviceRequest}=sandbox.module.exports;
 const scope={actor,owner:true,readOnly:false,sites:new Map([[service,{client,name:'Fixture'}]])};
 const command={action:'hosting.provision',service,request_key:request};
 const result=await serviceRequest(scope,command);assert.equal(result.state,'queued');assert.equal(result.live_verified,false);
 assert.equal(wire.command.client,client);assert.equal(wire.command.server,server);assert.equal(wire.command.package,pkg);assert.equal(wire.command.domain,'fixture.test');
 assert.equal(wire.command.request_key,request);
 const before=fetches;
 for(const [context,cmd] of [[{...scope,owner:false},command],[{...scope,readOnly:true},command],[{...scope,sites:new Map()},command],[scope,{...command,client:'attacker'}]])await assert.rejects(()=>serviceRequest(context,cmd));
 assert.equal(fetches,before);
 serverStatus='draft';await assert.rejects(()=>serviceRequest(scope,command));assert.equal(fetches,before);serverStatus='available';
 env.HOSTING_PROVISIONING_ENABLED='';await assert.rejects(()=>serviceRequest(scope,command));env.HOSTING_PROVISIONING_ENABLED='approved';
 mode='foreign';await assert.rejects(()=>serviceRequest(scope,{action:'hosting.status',service}));
 mode='failure';await assert.rejects(()=>serviceRequest(scope,command));
 console.log('PASS provisioning scope, authoritative metadata, HMAC, disabled/client/read-only denial, response validation'+(process.env.HMS_AUTOMATION_SOURCE?', real Python gateway/SQLite queue':''));
})().catch(error=>{console.error(error);process.exitCode=1});
