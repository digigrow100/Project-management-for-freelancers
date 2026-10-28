const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const esbuild=require('esbuild');

(async()=>{
 const build=await esbuild.build({entryPoints:[path.resolve(__dirname,'../lib/hosting/managed.ts')],bundle:true,platform:'node',format:'cjs',write:false,
  plugins:[{name:'private-fixtures',setup(b){
   b.onResolve({filter:/^server-only$/},()=>({path:'empty',namespace:'fixture'}));
   b.onResolve({filter:/^\.\/auth$/},()=>({path:'auth',namespace:'fixture'}));
   b.onResolve({filter:/^@\/lib\/supabaseClient$/},()=>({path:'database',namespace:'fixture'}));
   b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='empty'?'':a.path==='auth'?'export async function requireHostingAdmin(){return {id:"fixture"}};export async function requireHostingClient(){throw Error("denied")}':'export function getSupabase(){return globalThis.fixtureDB}'}));
  }}]});
 const service='11111111-1111-4111-8111-111111111111',client='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333',actor='55555555-5555-4555-8555-555555555555',request='66666666-6666-4666-8666-666666666666';
 const tree='a'.repeat(32);
 const row={id:service,client_id:client,status:'pending'};
 let fetches=0,wire,mode='valid',clientStatus='active',realRoot=null,grants={};
 const env={HOSTING_SERVICES_ENABLED:'approved',HOSTING_SOURCES_ENABLED:'approved',HOSTING_SOURCES_UPLOAD_ENABLED:'approved',HOSTING_CLIENT_FEATURES:'sources',HOSTING_SERVICES_ORIGIN:'https://fixture.invalid',HOSTING_SERVICES_PORTAL_KEY:'synthetic-key-only-00000000000000000000'};
 const db={from(table){return {select(){return this},eq(){return this},async single(){return {error:null,data:table.endsWith('_services')?row:table.endsWith('_clients')?{status:clientStatus}:{}}}}}};
 const repository=(id,branch)=>({installation_id:7,repository_id:id,full_name:'acme/site',branch,write:true});
 let version=0,bound=null;
 const synthetic=()=>{
  const c=wire.command;
  const status=()=>({service:c.service,version,repository:bound,jobs:[],trees:[],current:null,published_to_web_root:false,live_verified:false});
  if(mode==='foreign')return {...status(),service:other};
  if(mode==='extra')return {...status(),secret:'x'};
  if(c.action==='source.connect'||c.action==='source.switch'){version=c.expected_version+1;bound=repository(mode==='mismatch'?999:c.repository_id,c.branch);return status();}
  if(c.action==='source.disconnect'){version=c.expected_version+1;bound=null;return status();}
  if(c.action==='source.repositories')return {service:c.service,version,repository:bound,available:[{installation_id:7,repository_id:10,full_name:'acme/site',write:true}]};
  if(c.action==='source.request')return {id:'b'.repeat(32),digest:'c'.repeat(64),state:'queued',operation:c.operation,source:c.tree?'tree':'github',tree:c.tree,created:1,result:null,live_verified:false};
  return status();
 };
 const sandbox={module:{exports:{}},exports:{},require,Buffer,TextDecoder,AbortSignal,URL,process:{env},fixtureDB:db,console,
  fetch:async(url,options)=>{
   fetches++;wire=JSON.parse(options.body);
   assert.equal(options.headers['X-HMS-Services-Signature'],crypto.createHmac('sha256',env.HOSTING_SERVICES_PORTAL_KEY).update('hms:services-portal:v1:'+options.body).digest('hex'));
   assert.equal(options.redirect,'error');assert.equal(new URL(url).pathname,'/v1/services');
   if(mode==='failure')return new Response('{}',{status:503});
   if(realRoot){
    const child=spawnSync('python',[path.resolve(__dirname,'fixtures/hosting-sources-gateway.py')],{encoding:'utf8',cwd:process.env.HMS_AUTOMATION_SOURCE,env:{...process.env,PYTHONPATH:process.env.HMS_AUTOMATION_SOURCE},
     input:JSON.stringify({root:realRoot,actor,client,service,key:env.HOSTING_SERVICES_PORTAL_KEY,body:options.body,signature:options.headers['X-HMS-Services-Signature'],grants,members:{[actor]:{client,write:true},[other]:{client:other,write:true}}})});
    if(child.status!==0){if(!/Denied|ValueError|Exact|Access|Invalid|Source|Idempotency|denied|forbidden/.test(child.stderr)||/Traceback[\s\S]*(ModuleNotFound|ImportError|SyntaxError|NameError|AttributeError)/.test(child.stderr))console.error(child.stderr);return new Response('{}',{status:403});}
    return new Response(child.stdout);
   }
   return new Response(JSON.stringify(synthetic()));
  }};
 sandbox.exports=sandbox.module.exports;
 vm.runInNewContext(build.outputFiles[0].text,sandbox);
 const {serviceRequest}=sandbox.module.exports;
 const owner={actor,owner:true,readOnly:false,sites:new Map([[service,{client,name:'Fixture'}]])};
 const member={...owner,owner:false};
 const connect={action:'source.connect',service,installation_id:7,repository_id:10,branch:'main',expected_version:0};

 // Owner and release-enabled client scopes work; the private command carries the saved client, never a browser field.
 for(const scope of [owner,member]){
  version=0;bound=null;
  const status=await serviceRequest(scope,connect);
  assert.equal(status.repository.repository_id,10);assert.equal(wire.command.client,client);assert.equal(wire.command.action,'source.connect');
  assert.equal((await serviceRequest(scope,{action:'source.status',service})).published_to_web_root,false);
  assert.equal((await serviceRequest(scope,{action:'source.repositories',service})).available.length,1);
  assert.equal((await serviceRequest(scope,{action:'source.switch',service,installation_id:7,repository_id:10,branch:'release/v1',expected_version:1})).version,2);
  assert.equal((await serviceRequest(scope,{action:'source.request',service,operation:'deploy',request_key:request,tree:null})).state,'queued');
  assert.equal(wire.command.tree,null);
  assert.equal((await serviceRequest(scope,{action:'source.request',service,operation:'export',request_key:request,tree})).tree,tree);
  assert.equal((await serviceRequest(scope,{action:'source.disconnect',service,expected_version:2})).repository,null);
 }

 // Read-only, disabled, unreleased, foreign-scope and inactive-client denial happens before any private request.
 const before=fetches;
 await serviceRequest({...member,readOnly:true},{action:'source.status',service});
 assert.equal(fetches,before+1);
 await assert.rejects(()=>serviceRequest({...owner,readOnly:true},connect));
 await assert.rejects(()=>serviceRequest({...owner,sites:new Map()},connect));
 await assert.rejects(()=>serviceRequest({...owner,sites:new Map([[service,{client:other,name:'Other'}]])},connect));
 row.client_id=other;await assert.rejects(()=>serviceRequest(owner,connect));row.client_id=client;
 row.status='cancelled';await assert.rejects(()=>serviceRequest(owner,connect));row.status='pending';
 clientStatus='suspended';await assert.rejects(()=>serviceRequest(owner,connect));assert.ok(await serviceRequest(owner,{action:'source.status',service}));clientStatus='active';
 env.HOSTING_CLIENT_FEATURES='';await assert.rejects(()=>serviceRequest(member,connect));await serviceRequest(owner,{action:'source.status',service});env.HOSTING_CLIENT_FEATURES='sources';
 env.HOSTING_SOURCES_ENABLED='';await assert.rejects(()=>serviceRequest(owner,connect));env.HOSTING_SOURCES_ENABLED='approved';
 env.HOSTING_SERVICES_ENABLED='';await assert.rejects(()=>serviceRequest(owner,connect));env.HOSTING_SERVICES_ENABLED='approved';
 const denied=fetches;

 // Browser-chosen scope fields are rejected by the exact schema.
 for(const bad of [{...connect,client:other},{...connect,branch:'../x'},{...connect,branch:'a b'},{...connect,branch:'x.lock'},{...connect,repository_id:-1},{...connect,installation_id:1.5},{action:'source.request',service,operation:'deploy',request_key:request,tree:'../x'},{action:'source.request',service,operation:'shell',request_key:request,tree:null},{action:'source.discard',service,tree:'short'},{action:'source.status',service:'not-a-uuid'}])
  await assert.rejects(()=>serviceRequest(owner,bad));
 assert.equal(fetches,denied);

 // Response validation: foreign service, extra fields, wrong repository and failures are refused.
 for(const m of ['foreign','extra','mismatch','failure']){mode=m;version=0;await assert.rejects(()=>serviceRequest(owner,connect),m);}
 mode='valid';

 // Upload ticket: local, signed, bound to actor/client/service/size/digest, and never forwarded.
 const sha256='d'.repeat(64);const calls=fetches;
 const ticket=await serviceRequest(member,{action:'source.upload_ticket',service,size:1234,sha256});
 assert.equal(fetches,calls);assert.equal(ticket.url,'https://fixture.invalid/v1/uploads');
 assert.equal(ticket.signature,crypto.createHmac('sha256',env.HOSTING_SERVICES_PORTAL_KEY).update('hms:upload-ticket:v1:'+ticket.ticket).digest('hex'));
 const decoded=JSON.parse(Buffer.from(ticket.ticket,'base64url').toString());
 assert.deepEqual({...decoded,nonce:undefined,expires:undefined},{schema:1,actor,client,service,sha256,size:1234,nonce:undefined,expires:undefined});
 assert.ok(decoded.expires-Math.floor(Date.now()/1000)<=300);
 for(const bad of [{size:21},{size:64*1024*1024+1},{sha256:'zz'}])await assert.rejects(()=>serviceRequest(owner,{action:'source.upload_ticket',service,size:1234,sha256,...bad}));
 env.HOSTING_SOURCES_UPLOAD_ENABLED='';await assert.rejects(()=>serviceRequest(owner,{action:'source.upload_ticket',service,size:1234,sha256}));env.HOSTING_SOURCES_UPLOAD_ENABLED='approved';
 await assert.rejects(()=>serviceRequest({...member,readOnly:true},{action:'source.upload_ticket',service,size:1234,sha256}));
 assert.equal(fetches,calls);

 if(process.env.HMS_AUTOMATION_SOURCE){
  // Real private gateway: ownership comes from the confirmed provisioning receipt in persistent SQLite.
  realRoot=fs.mkdtempSync(path.join(os.tmpdir(),'hms-sources-'));fs.chmodSync(realRoot,0o700);
  try{
   grants={[actor]:[{installation_id:7,repository_id:10,full_name:'acme/site',read:true,write:true},{installation_id:7,repository_id:20,full_name:'acme/other',read:true,write:false}]};
   const first=await serviceRequest(member,{action:'source.status',service});
   assert.equal(first.repository,null);assert.equal(first.version,0);
   assert.equal((await serviceRequest(member,{action:'source.repositories',service})).available.length,2);
   const connected=await serviceRequest(member,connect);assert.equal(connected.repository.full_name,'acme/site');assert.equal(connected.version,1);
   await assert.rejects(()=>serviceRequest(member,connect));
   await assert.rejects(()=>serviceRequest(member,{...connect,repository_id:99,expected_version:1,action:'source.switch'}));
   const queued=await serviceRequest(member,{action:'source.request',service,operation:'deploy',request_key:request,tree:null});
   assert.equal(queued.state,'queued');
   assert.equal((await serviceRequest(member,{action:'source.request',service,operation:'deploy',request_key:request,tree:null})).id,queued.id);
   const switched=await serviceRequest(member,{action:'source.switch',service,installation_id:7,repository_id:20,branch:'main',expected_version:1});
   assert.equal(switched.repository.repository_id,20);assert.equal(switched.jobs[0].state,'cancelled');
   await assert.rejects(()=>serviceRequest(member,{action:'source.request',service,operation:'export',request_key:crypto.randomUUID(),tree}));
   const gone=await serviceRequest(member,{action:'source.disconnect',service,expected_version:2});assert.equal(gone.repository,null);
   // A different client's actor on the same service is refused by the private service even if the portal were wrong.
   const foreign={actor:other,owner:false,readOnly:false,sites:new Map([[service,{client,name:'Fixture'}]])};
   await assert.rejects(()=>serviceRequest(foreign,{action:'source.status',service}));
  }finally{fs.rmSync(realRoot,{recursive:true,force:true});realRoot=null;}
 }
 console.log('PASS website source scope, exact schemas, feature/read-only/client gates, response validation, signed upload ticket'+(process.env.HMS_AUTOMATION_SOURCE?', real Python gateway/SQLite ownership':''));
})().catch(error=>{console.error(error);process.exitCode=1});
