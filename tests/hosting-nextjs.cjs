// Next.js website flow, portal side: strict commands, feature gates, response validation and the lifecycle states.
// With HMS_AUTOMATION_SOURCE (and root + Node.js + namespaces) the SAME requests also drive the real private service end to end:
// portal client -> signed API request -> real gateway -> durable queue -> real worker -> isolated build -> real runtime -> routed health -> status.
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
 const service='11111111-1111-4111-8111-111111111111',client='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333',actor='55555555-5555-4555-8555-555555555555';
 const tree='a'.repeat(32);
 const row={id:service,client_id:client,status:'active'};
 let wire,mode='valid',realRoot=null,fetches=0,grants={},clientStatus='active';
 const env={HOSTING_SERVICES_ENABLED:'approved',HOSTING_SOURCES_ENABLED:'approved',HOSTING_PUBLISHING_ENABLED:'approved',HOSTING_NEXTJS_ENABLED:'approved',HOSTING_CLIENT_FEATURES:'sources',HOSTING_SERVICES_ORIGIN:'https://fixture.invalid',HOSTING_SERVICES_PORTAL_KEY:'synthetic-key-only-00000000000000000000'};
 const db={from(table){return {select(){return this},eq(){return this},async single(){return {error:null,data:table.endsWith('_services')?row:table.endsWith('_clients')?{status:clientStatus}:{}}}}}};
 const job=(patch={})=>({id:'b'.repeat(32),digest:'c'.repeat(64),state:'queued',operation:'build',source:'tree',tree,created:1,result:null,live_verified:false,...patch});
 const sandbox={module:{exports:{}},exports:{},require,Buffer,TextDecoder,AbortSignal,URL,process:{env},fixtureDB:db,console,
  fetch:async(url,options)=>{
   fetches++;wire=JSON.parse(options.body);
   assert.equal(options.headers['X-HMS-Services-Signature'],crypto.createHmac('sha256',env.HOSTING_SERVICES_PORTAL_KEY).update('hms:services-portal:v1:'+options.body).digest('hex'));
   if(realRoot){
    const child=spawnSync('python',[path.resolve(__dirname,'fixtures/hosting-nextjs-harness.py')],{encoding:'utf8',cwd:process.env.HMS_AUTOMATION_SOURCE,env:{...process.env,PYTHONPATH:process.env.HMS_AUTOMATION_SOURCE},
     input:JSON.stringify({kind:'gateway',root:realRoot,actor,client,service,key:env.HOSTING_SERVICES_PORTAL_KEY,body:options.body,signature:options.headers['X-HMS-Services-Signature'],grants,members:{[actor]:{client,write:true},[other]:{client:other,write:true},viewer:{client,write:false}}})});
    if(child.status!==0){if(!/Denied|ValueError|Exact|Access|Invalid|Source|Idempotency|denied|forbidden/.test(child.stderr)||/Traceback[\s\S]*(ModuleNotFound|ImportError|SyntaxError|NameError|AttributeError)/.test(child.stderr))console.error(child.stderr);return new Response('{}',{status:403});}
    return new Response(child.stdout);
   }
   return new Response(JSON.stringify(mode==='wrongop'?job({operation:'deploy'}):mode==='wrongtree'?job({tree:'f'.repeat(32)}):mode==='livejob'?job({live_verified:true}):job()));
  }};
 sandbox.exports=sandbox.module.exports;
 vm.runInNewContext(build.outputFiles[0].text,sandbox);
 const {serviceRequest}=sandbox.module.exports;
 const owner={actor,owner:true,readOnly:false,sites:new Map([[service,{client,name:'Fixture'}]])};
 const member={...owner,owner:false};
 const buildCommand={action:'source.build',service,tree,request_key:crypto.randomUUID(),variables:{NEXT_PUBLIC_SITE_NAME:'Example'}};

 // --- strict command shape: build settings are plain, bounded and never secrets -------------------------------------------------------------
 let calls=fetches;
 const accepted=await serviceRequest(member,buildCommand);
 assert.equal(accepted.operation,'build');assert.equal(accepted.live_verified,false);assert.equal(fetches,calls+1);
 assert.equal(wire.command.client,client);assert.equal(JSON.stringify(wire.command.variables),'{"NEXT_PUBLIC_SITE_NAME":"Example"}');assert.equal(wire.command.action,'source.build');
 assert.equal((await serviceRequest(owner,buildCommand)).operation,'build');
 const rejected=[{variables:{PATH:'/evil'}},{variables:{NODE_OPTIONS:'--require /x'}},{variables:{LD_PRELOAD:'/x'}},{variables:{HTTPS_PROXY:'http://x'}},{variables:{DATABASE_PASSWORD:'x'}},{variables:{API_TOKEN:'x'}},{variables:{lower:'x'}},
  {variables:{A:'line\nbreak'}},{variables:{A:'x'.repeat(2049)}},{variables:Object.fromEntries(Array.from({length:33},(_,i)=>['V'+i,'x']))},{variables:null},{variables:[]},{variables:'A=1'},{tree:null},{tree:'zz'},{request_key:'not-a-uuid'},
  {extra:1},{client:other},{service:'not-a-uuid'}];
 for(const bad of rejected){calls=fetches;await assert.rejects(()=>serviceRequest(member,{...buildCommand,...bad}),JSON.stringify(bad).slice(0,60));assert.equal(fetches,calls,'rejected before any private request');}
 const missing={...buildCommand};delete missing.variables;await assert.rejects(()=>serviceRequest(member,missing));
 assert.equal((await serviceRequest(member,{...buildCommand,variables:{NEXT_PUBLIC_API_KEY:'public-by-design'}})).operation,'build');   // NEXT_PUBLIC_ values are shipped to browsers by design
 await assert.rejects(()=>serviceRequest(member,{action:'source.request',service,operation:'build',request_key:crypto.randomUUID(),tree}));   // builds have their own command

 // --- gates: sources + publishing + Next.js switches, client feature, read-only, scope ---------------------------------------------------------
 for(const [flag,value] of [['HOSTING_NEXTJS_ENABLED',''],['HOSTING_PUBLISHING_ENABLED',''],['HOSTING_SOURCES_ENABLED',''],['HOSTING_SERVICES_ENABLED','']]){
  const saved=env[flag];env[flag]=value;calls=fetches;await assert.rejects(()=>serviceRequest(member,buildCommand),flag);await assert.rejects(()=>serviceRequest(owner,buildCommand),flag);assert.equal(fetches,calls);env[flag]=saved;
 }
 env.HOSTING_CLIENT_FEATURES='';await assert.rejects(()=>serviceRequest(member,buildCommand));await serviceRequest(owner,buildCommand);env.HOSTING_CLIENT_FEATURES='sources';
 await assert.rejects(()=>serviceRequest({...member,readOnly:true},buildCommand));
 await assert.rejects(()=>serviceRequest({...member,sites:new Map()},buildCommand));
 clientStatus='suspended';await assert.rejects(()=>serviceRequest(member,buildCommand));clientStatus='active';

 // --- the private answer is checked against what was asked ------------------------------------------------------------------------------
 for(const bad of ['wrongop','wrongtree','livejob']){mode=bad;await assert.rejects(()=>serviceRequest(member,buildCommand),bad);}
 mode='valid';

 // --- status schema: the Next.js lifecycle can never claim more than the publication proves -----------------------------------------------
 const schema=await esbuild.build({entryPoints:[path.resolve(__dirname,'../lib/hosting/managedSchema.ts')],bundle:true,platform:'node',format:'cjs',write:false,packages:'external'});
 const exported={exports:{}};new Function('require','module','exports',schema.outputFiles[0].text)(require,exported,exported.exports);
 const {sourceStatus}=exported.exports;
 const none={state:'none',runtime:null,live_tree:null,live_since:null,previous_tree:null,rollback_available:false,health:null,live_verified:false};
 const live={state:'live',runtime:'nextjs',live_tree:tree,live_since:5,previous_tree:null,rollback_available:false,health:{ok:true,checked:5,status:200,root_status:200,tls:true},live_verified:true};
 const built={id:'e'.repeat(32),tree,state:'built',created:1,finished:2,artifact_sha256:'f'.repeat(64),reason:null,message:null,phase:null,summary:'compiled successfully',next_version:'14.2.35',variable_names:['NEXT_PUBLIC_SITE_NAME'],files:10,bytes:100};
 const failed={...built,state:'failed',artifact_sha256:null,reason:'exit_status',message:'The build command failed; see the build log.',phase:'build'};
 const treeRow=(patch={})=>({id:tree,kind:'zip',state:'released',files:1,bytes:1,created:1,manifest_sha256:'d'.repeat(64),runtime:'nextjs',publishable:false,buildable:true,...patch});
 const status=(patch={})=>({service,version:0,repository:null,jobs:[],trees:[treeRow()],nextjs:{state:'none',live:false,job:null,error:null,reason:null,builds:[]},current:null,publication:none,published_to_web_root:false,live_verified:false,...patch});
 const withNext=(next,rest={})=>status({nextjs:{state:'none',live:false,job:null,error:null,reason:null,builds:[],...next},...rest});
 sourceStatus.parse(status());
 sourceStatus.parse(withNext({state:'built',builds:[built]},{trees:[treeRow({publishable:true})]}));
 sourceStatus.parse(withNext({state:'live',live:true,builds:[built]},{trees:[treeRow({publishable:true})],publication:live,published_to_web_root:true,live_verified:true}));
 sourceStatus.parse(withNext({state:'failed',builds:[failed]}));
 for(const [name,bad] of Object.entries({
  'live without publication':withNext({state:'live',live:true,builds:[built]},{trees:[treeRow({publishable:true})]}),
  'live flag without publication':withNext({state:'built',live:true,builds:[built]},{trees:[treeRow({publishable:true})]}),
  'live state with live flag off':withNext({state:'live',live:false,builds:[built]},{trees:[treeRow({publishable:true})],publication:live,published_to_web_root:true,live_verified:true}),
  'publishable without a successful build':status({trees:[treeRow({publishable:true})]}),
  'publishable with only a failed build':withNext({state:'failed',builds:[failed]},{trees:[treeRow({publishable:true})]}),
  'built without artifact':withNext({state:'built',builds:[{...built,artifact_sha256:null}]}),
  'failed with artifact':withNext({state:'failed',builds:[{...failed,artifact_sha256:'f'.repeat(64)}]}),
  'built with failure reason':withNext({state:'built',builds:[{...built,reason:'exit_status'}]}),
  'uncertain publication but calm lifecycle':status({publication:{...none,state:'uncertain'}}),
  'node tree publishable':status({trees:[treeRow({runtime:'node',publishable:true,buildable:false})]}),
  'static tree not publishable':status({trees:[treeRow({runtime:'static',publishable:false,buildable:false})]}),
  'static tree buildable':status({trees:[treeRow({runtime:'static',publishable:true,buildable:true})]}),
  'build for a static tree':withNext({state:'built',builds:[built]},{trees:[treeRow({runtime:'static',publishable:true,buildable:false})]}),
  'unknown lifecycle state':withNext({state:'activated'}),
  'secret-looking build setting name':withNext({state:'built',builds:[{...built,variable_names:['DATABASE_PASSWORD']}]},{trees:[treeRow({publishable:true})]}),
  'extra field':{...status(),secret:'x'},
  'missing lifecycle':(()=>{const s=status();delete s.nextjs;return s;})(),
  'oversized log':withNext({state:'failed',builds:[{...failed,summary:'x'.repeat(6001)}]}),
 })){assert.throws(()=>sourceStatus.parse(bad),name);}

 // --- real private service, end to end ---------------------------------------------------------------------------------------------------
 if(process.env.HMS_AUTOMATION_SOURCE&&process.getuid&&process.getuid()===0){
  realRoot=fs.mkdtempSync(path.join(os.tmpdir(),'hms-nextjs-'));fs.chmodSync(realRoot,0o755);
  const step=(packet)=>{
   const child=spawnSync('python',[path.resolve(__dirname,'fixtures/hosting-nextjs-harness.py')],{encoding:'utf8',cwd:process.env.HMS_AUTOMATION_SOURCE,env:{...process.env,PYTHONPATH:process.env.HMS_AUTOMATION_SOURCE},timeout:600000,
    input:JSON.stringify({root:realRoot,actor,client,service,key:env.HOSTING_SERVICES_PORTAL_KEY,grants,members:{[actor]:{client,write:true},[other]:{client:other,write:true},viewer:{client,write:false}},...packet})});
   if(child.status!==0){console.error(child.stderr);throw Error('harness step failed: '+packet.kind);}
   return JSON.parse(child.stdout);
  };
  const portal=(scope,command)=>serviceRequest(scope,command);
  const key=()=>crypto.randomUUID();
  const run=(jobId,approve=false)=>step({kind:'worker',job:jobId,approve});
  const outsider={actor:other,owner:false,readOnly:false,sites:new Map([[service,{client,name:'Fixture'}]])};
  try{
   // Version one: upload (as the portal's ZIP flow stores it) -> approved staging -> build -> awaiting approval -> live.
   const one=step({kind:'seed',marker:'one',key_name:'deploy-one'});assert.equal(one.state,'done');
   let state=await portal(member,{action:'source.status',service});
   assert.equal(state.trees[0].runtime,'nextjs');assert.equal(state.trees[0].buildable,true);assert.equal(state.trees[0].publishable,false);assert.equal(state.nextjs.state,'none');
   await assert.rejects(()=>portal(member,{action:'source.request',service,operation:'publish',request_key:key(),tree:one.tree}),'cannot activate before a build');
   const queuedBuild=await portal(member,{action:'source.build',service,tree:one.tree,request_key:key(),variables:{NEXT_PUBLIC_MARKER:'one'}});
   assert.equal(queuedBuild.state,'queued');assert.equal((await portal(member,{action:'source.status',service})).nextjs.state,'queued');
   await assert.rejects(()=>portal(outsider,{action:'source.build',service,tree:one.tree,request_key:key(),variables:{}}),'another client cannot build this site');
   await assert.rejects(()=>portal(outsider,{action:'source.status',service}));
   assert.equal(run(queuedBuild.id).state,'done');
   state=await portal(member,{action:'source.status',service});
   assert.equal(state.nextjs.state,'built');assert.equal(state.trees[0].publishable,true);assert.equal(state.published_to_web_root,false);assert.equal(state.live_verified,false);
   assert.equal(state.nextjs.builds[0].state,'built');assert.match(state.nextjs.builds[0].artifact_sha256,/^[a-f0-9]{64}$/);assert.equal(JSON.stringify(state.nextjs.builds[0].variable_names),'["NEXT_PUBLIC_MARKER"]');
   assert.equal(step({kind:'fetch',path:'/'}),null,'a build alone serves nothing');
   const publishKey=key();
   const activation=await portal(member,{action:'source.request',service,operation:'publish',request_key:publishKey,tree:one.tree});
   assert.equal(activation.state,'queued');assert.equal((await portal(member,{action:'source.status',service})).nextjs.state,'awaiting_approval');
   assert.equal(run(activation.id,false).worker_stopped,'SourceDenied','no activation without the independent owner approval');
   const live1=run(activation.id,true);assert.equal(live1.state,'done');assert.equal(live1.live_verified,true);
   state=await portal(member,{action:'source.status',service});
   assert.equal(state.nextjs.state,'live');assert.equal(state.nextjs.live,true);assert.equal(state.publication.runtime,'nextjs');assert.equal(state.live_verified,true);
   assert.match(step({kind:'fetch',path:'/'}).body,/synthetic default|synthetic one/);
   // Version two replaces it; a crashing release is rolled back by the worker; rollback restores version one exactly.
   const two=step({kind:'seed',marker:'two',key_name:'deploy-two'});
   const buildTwo=await portal(member,{action:'source.build',service,tree:two.tree,request_key:key(),variables:{NEXT_PUBLIC_MARKER:'two'}});assert.equal(run(buildTwo.id).state,'done');
   const liveTwo=await portal(member,{action:'source.request',service,operation:'publish',request_key:key(),tree:two.tree});assert.equal(run(liveTwo.id,true).state,'done');
   assert.match(step({kind:'fetch',path:'/'}).body,/synthetic two/);
   state=await portal(member,{action:'source.status',service});assert.equal(state.publication.rollback_available,true);
   const back=await portal(member,{action:'source.request',service,operation:'rollback',request_key:key(),tree:null});assert.equal(run(back.id,true).state,'done');
   assert.match(step({kind:'fetch',path:'/'}).body,/synthetic one/);
   state=await portal(member,{action:'source.status',service});assert.equal(state.nextjs.state,'live');assert.equal(state.publication.live_tree,one.tree);assert.equal(state.publication.rollback_available,false);
   // A failing build never touches the live site.
   const bad=step({kind:'seed',marker:'bad',key_name:'deploy-bad',build:'#!/usr/bin/env node\nconsole.error("Error: Type error in app/page.js");process.exit(1);\n'});
   const badBuild=await portal(member,{action:'source.build',service,tree:bad.tree,request_key:key(),variables:{}});assert.equal(run(badBuild.id).state,'failed');
   state=await portal(member,{action:'source.status',service});
   const failure=state.nextjs.builds.find(b=>b.tree===bad.tree);assert.equal(failure.state,'failed');assert.equal(failure.reason,'exit_status');assert.match(failure.summary,/Type error in app\/page\.js/);assert.equal(state.trees.find(t=>t.id===bad.tree).publishable,false);
   assert.match(step({kind:'fetch',path:'/'}).body,/synthetic one/);
   // A lost reply while switching the route becomes "uncertain", blocks everything, and an approved recovery restores the live release.
   const three=step({kind:'seed',marker:'three',key_name:'deploy-three'});
   const buildThree=await portal(member,{action:'source.build',service,tree:three.tree,request_key:key(),variables:{NEXT_PUBLIC_MARKER:'three'}});assert.equal(run(buildThree.id).state,'done');
   const risky=await portal(member,{action:'source.request',service,operation:'publish',request_key:key(),tree:three.tree});
   step({kind:'fault',op:'switch'});assert.equal(run(risky.id,true).worker_stopped,'SourceDenied');step({kind:'clear_fault'});
   state=await portal(member,{action:'source.status',service});
   assert.equal(state.nextjs.state,'uncertain');assert.equal(state.publication.state,'uncertain');assert.equal(state.live_verified,false);
   await assert.rejects(()=>portal(member,{action:'source.request',service,operation:'rollback',request_key:key(),tree:null}));
   await assert.rejects(()=>portal(member,{action:'source.build',service,tree:three.tree,request_key:key(),variables:{}}));
   const recovery=await portal(member,{action:'source.recover',service,job:risky.id,request_key:key()});assert.equal(recovery.operation,'recover');
   assert.equal(run(recovery.id,true).state,'done');
   state=await portal(member,{action:'source.status',service});
   assert.equal(state.publication.state,'live');assert.equal(state.live_verified,true);assert.match(step({kind:'fetch',path:'/'}).body,/synthetic one/);
  }finally{try{step({kind:'cleanup'});}catch{}fs.rmSync(realRoot,{recursive:true,force:true});realRoot=null;}
 }
 console.log('PASS Next.js build/activation commands: strict schemas, gates, response validation, lifecycle proof rules'+(process.env.HMS_AUTOMATION_SOURCE&&process.getuid&&process.getuid()===0?', real build->runtime->routed health->status flow with rollback and recovery':''));
})().catch(error=>{console.error(error);process.exitCode=1});
