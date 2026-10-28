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
 let fetches=0,wire,mode='valid',clientStatus='active',realRoot=null,grants={},seedTrees=[];
 const env={HOSTING_SERVICES_ENABLED:'approved',HOSTING_SOURCES_ENABLED:'approved',HOSTING_PUBLISHING_ENABLED:'approved',HOSTING_SOURCES_UPLOAD_ENABLED:'approved',HOSTING_CLIENT_FEATURES:'sources',HOSTING_SERVICES_ORIGIN:'https://fixture.invalid',HOSTING_SERVICES_PORTAL_KEY:'synthetic-key-only-00000000000000000000'};
 const db={from(table){return {select(){return this},eq(){return this},async single(){return {error:null,data:table.endsWith('_services')?row:table.endsWith('_clients')?{status:clientStatus}:{}}}}}};
 const repository=(id,branch)=>({installation_id:7,repository_id:id,full_name:'acme/site',branch,write:true});
 let version=0,bound=null,publication={state:'none',runtime:null,live_tree:null,live_since:null,previous_tree:null,rollback_available:false,health:null,live_verified:false},published=false,treeRuntime='static';
 const synthetic=()=>{
  const c=wire.command;
  const status=()=>({service:c.service,version,repository:bound,jobs:[],trees:[],nextjs:{state:'none',live:false,job:null,error:null,reason:null,builds:[]},current:null,publication,published_to_web_root:published,live_verified:publication.live_verified});
  if(mode==='foreign')return {...status(),service:other};
  if(mode==='extra')return {...status(),secret:'x'};
  if(c.action==='source.connect'||c.action==='source.switch'){version=c.expected_version+1;bound=repository(mode==='mismatch'?999:c.repository_id,c.branch);return status();}
  if(c.action==='source.disconnect'){version=c.expected_version+1;bound=null;return status();}
  if(c.action==='source.repositories')return {service:c.service,version,repository:bound,available:[{installation_id:7,repository_id:10,full_name:'acme/site',write:true}]};
  if(c.action==='source.request')return {id:'b'.repeat(32),digest:'c'.repeat(64),state:'queued',operation:mode==='wrongop'?'deploy':c.operation,source:c.operation==='publish'||c.operation==='rollback'?'release':c.tree?'tree':'github',tree:c.operation==='rollback'?'d'.repeat(32):c.tree,created:1,result:null,live_verified:mode==='livejob'};
  if(c.action==='source.recover')return {id:'b'.repeat(32),digest:'c'.repeat(64),state:'queued',operation:'recover',source:'job',tree:null,created:1,result:null,live_verified:false};
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
     input:JSON.stringify({root:realRoot,trees:seedTrees,actor,client,service,key:env.HOSTING_SERVICES_PORTAL_KEY,body:options.body,signature:options.headers['X-HMS-Services-Signature'],grants,members:{[actor]:{client,write:true},[other]:{client:other,write:true}}})});
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

 // Publication: publish, rollback and recover are gated separately, scoped like every source command and strictly validated.
 const released='e'.repeat(32);
 for(const scope of [owner,member]){
  const publish=await serviceRequest(scope,{action:'source.request',service,operation:'publish',request_key:request,tree:released});
  assert.equal(publish.state,'queued');assert.equal(publish.operation,'publish');assert.equal(publish.source,'release');assert.equal(wire.command.client,client);
  assert.equal((await serviceRequest(scope,{action:'source.request',service,operation:'rollback',request_key:request,tree:null})).operation,'rollback');
  assert.equal(wire.command.tree,null);
  assert.equal((await serviceRequest(scope,{action:'source.recover',service,job:'f'.repeat(32),request_key:request})).operation,'recover');
  assert.equal(wire.command.job,'f'.repeat(32));assert.equal(wire.command.client,client);
 }
 const publishing=fetches;
 for(const bad of [{action:'source.request',service,operation:'publish',request_key:request,tree:null},{action:'source.request',service,operation:'rollback',request_key:request,tree:released},{action:'source.request',service,operation:'export',request_key:request,tree:null},
  {action:'source.request',service,operation:'publish',request_key:request,tree:'../x'},{action:'source.recover',service,job:'short',request_key:request},{action:'source.recover',service,job:'f'.repeat(32),request_key:request,client:other}])
  await assert.rejects(()=>serviceRequest(owner,bad));
 for(const command of [{action:'source.request',service,operation:'publish',request_key:request,tree:released},{action:'source.request',service,operation:'rollback',request_key:request,tree:null},{action:'source.recover',service,job:'f'.repeat(32),request_key:request}]){
  env.HOSTING_PUBLISHING_ENABLED='';await assert.rejects(()=>serviceRequest(owner,command));await assert.rejects(()=>serviceRequest(member,command));env.HOSTING_PUBLISHING_ENABLED='approved';
  await assert.rejects(()=>serviceRequest({...owner,readOnly:true},command));await assert.rejects(()=>serviceRequest({...owner,sites:new Map()},command));
  await assert.rejects(()=>serviceRequest({...member,sites:new Map([[service,{client:other,name:'Other'}]])},command));
  clientStatus='suspended';await assert.rejects(()=>serviceRequest(owner,command));clientStatus='active';
 }
 assert.equal(fetches,publishing);  // every denial above happened before any private request
 env.HOSTING_PUBLISHING_ENABLED='';assert.ok(await serviceRequest(owner,{action:'source.status',service}));env.HOSTING_PUBLISHING_ENABLED='approved';  // staging and status keep working without publishing
 mode='wrongop';await assert.rejects(()=>serviceRequest(owner,{action:'source.request',service,operation:'publish',request_key:request,tree:released}));
 mode='livejob';await assert.rejects(()=>serviceRequest(owner,{action:'source.request',service,operation:'publish',request_key:request,tree:released}));mode='valid';

 // A website is only reported live when the private service proves it: inconsistent "live" claims are rejected.
 const live={state:'live',runtime:'static',live_tree:released,live_since:5,previous_tree:null,rollback_available:false,health:{ok:true,checked:5,status:200,root_status:200,tls:false},live_verified:true};
 for(const [name,patch,claimed] of [['live without health',{health:null},true],['live, unverified, without health',{health:null,live_verified:false},true],['live without a live tree',{live_tree:null},true],['verified without live',{state:'none',live_tree:null,live_since:null,health:null},false],['unverified live flag',{live_verified:false},true],
  ['rollback while not live',{state:'uncertain',live_tree:null,rollback_available:true,live_verified:false,health:null},false],['unknown runtime',{runtime:'ruby'},true]]){
  publication={...live,...patch};published=claimed;
  await assert.rejects(()=>serviceRequest(owner,{action:'source.status',service}),name);
 }
 publication={...live};published=false;await assert.rejects(()=>serviceRequest(owner,{action:'source.status',service}),'published flag must match publication state');
 published=true;const proved=await serviceRequest(owner,{action:'source.status',service});assert.equal(proved.published_to_web_root,true);assert.equal(proved.live_verified,true);assert.equal(proved.publication.state,'live');
 publication={state:'none',runtime:null,live_tree:null,live_since:null,previous_tree:null,rollback_available:false,health:null,live_verified:false};published=false;

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
   // Publication requests reach the real queue, but only for a released, publishable tree of this client's own site.
   const staticTree='1'.repeat(32),nextTree='2'.repeat(32);
   seedTrees=[{id:staticTree,digest:'a'.repeat(64),runtime:'static'},{id:nextTree,digest:'b'.repeat(64),runtime:'nextjs'}];
   await assert.rejects(()=>serviceRequest(member,{action:'source.request',service,operation:'rollback',request_key:crypto.randomUUID(),tree:null}));
   await assert.rejects(()=>serviceRequest(member,{action:'source.request',service,operation:'publish',request_key:crypto.randomUUID(),tree:nextTree}));
   await assert.rejects(()=>serviceRequest(member,{action:'source.request',service,operation:'publish',request_key:crypto.randomUUID(),tree:'3'.repeat(32)}));
   await assert.rejects(()=>serviceRequest(member,{action:'source.recover',service,job:'4'.repeat(32),request_key:crypto.randomUUID()}));
   const publishKey=crypto.randomUUID();
   const queuedPublish=await serviceRequest(member,{action:'source.request',service,operation:'publish',request_key:publishKey,tree:staticTree});
   assert.equal(queuedPublish.operation,'publish');assert.equal(queuedPublish.state,'queued');assert.equal(queuedPublish.live_verified,false);
   assert.equal((await serviceRequest(member,{action:'source.request',service,operation:'publish',request_key:publishKey,tree:staticTree})).id,queuedPublish.id);
   await assert.rejects(()=>serviceRequest(member,{action:'source.request',service,operation:'publish',request_key:crypto.randomUUID(),tree:staticTree}));
   const afterPublish=await serviceRequest(member,{action:'source.status',service});
   assert.equal(afterPublish.publication.state,'none');assert.equal(afterPublish.published_to_web_root,false);assert.equal(afterPublish.live_verified,false);
   const shown=afterPublish.trees.find(t=>t.id===nextTree);assert.equal(shown.publishable,false);assert.equal(shown.runtime,'nextjs');
   // A different client's actor on the same service is refused by the private service even if the portal were wrong.
   const foreign={actor:other,owner:false,readOnly:false,sites:new Map([[service,{client,name:'Fixture'}]])};
   await assert.rejects(()=>serviceRequest(foreign,{action:'source.status',service}));
  }finally{fs.rmSync(realRoot,{recursive:true,force:true});realRoot=null;}
 }
 console.log('PASS website source scope, exact schemas, feature/read-only/client gates, response validation, signed upload ticket'+(process.env.HMS_AUTOMATION_SOURCE?', real Python gateway/SQLite ownership':''));
})().catch(error=>{console.error(error);process.exitCode=1});
