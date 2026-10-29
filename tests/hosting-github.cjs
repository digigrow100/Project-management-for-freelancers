// GitHub connection, portal side: OAuth state handling, what is trusted from GitHub, strict responses, gates and policy controls.
// With HMS_AUTOMATION_SOURCE the same calls drive the real private gateway (verified links, signed webhooks, owner-signed policy) over SQLite.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const esbuild=require('esbuild');

(async()=>{
 const build=await esbuild.build({entryPoints:[path.resolve(__dirname,'../lib/hosting/githubLink.ts')],bundle:true,platform:'node',format:'cjs',write:false,
  plugins:[{name:'private-fixtures',setup(b){
   b.onResolve({filter:/^server-only$/},()=>({path:'empty',namespace:'fixture'}));
   b.onResolve({filter:/^\.\/auth$/},()=>({path:'auth',namespace:'fixture'}));
   b.onResolve({filter:/^@\/lib\/supabaseClient$/},()=>({path:'database',namespace:'fixture'}));
   b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='empty'?'':a.path==='auth'?'export async function requireHostingAdmin(){return {id:"fixture"}};export async function requireHostingClient(){throw Error("denied")}':'export function getSupabase(){return globalThis.fixtureDB}'}));
  }}]});
 const service='11111111-1111-4111-8111-111111111111',client='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333',actor='55555555-5555-4555-8555-555555555555';
 const row={id:service,client_id:client,status:'active'};
 const env={HOSTING_SERVICES_ENABLED:'approved',HOSTING_SOURCES_ENABLED:'approved',HOSTING_PUBLISHING_ENABLED:'approved',HOSTING_GITHUB_ENABLED:'approved',HOSTING_AUTODEPLOY_ENABLED:'approved',HOSTING_CLIENT_FEATURES:'sources',
  HOSTING_SERVICES_ORIGIN:'https://fixture.invalid',HOSTING_SERVICES_PORTAL_KEY:'synthetic-key-only-00000000000000000000',HOSTING_GITHUB_APP_SLUG:'housemysite-test',HOSTING_GITHUB_CLIENT_ID:'Iv1.test',
  HOSTING_GITHUB_CLIENT_SECRET:'client-secret-test',HOSTING_GITHUB_STATE_KEY:'state-key-for-tests-0000000000000000000000'};
 let wire,mode='valid',realRoot=null,grants={},installations={},remoteStatus=null;
 const db={from(table){return {select(){return this},eq(){return this},async single(){return {error:null,data:table.endsWith('_services')?row:table.endsWith('_clients')?{status:'active'}:{}}}}}};
 const ghStatus=(over={})=>({service,installations:[{installation_id:7,github_login:'octo',account_login:'acme',state:'active',write:true,repositories:1}],auto:{service,policy:null,pending:null,recent:[]},...over});
 const sandbox={module:{exports:{}},exports:{},require,Buffer,TextDecoder,AbortSignal,URL,URLSearchParams,process:{env},fixtureDB:db,console,
  fetch:async(url,options)=>{
   wire=JSON.parse(options.body);
   assert.equal(options.headers['X-HMS-Services-Signature'],crypto.createHmac('sha256',env.HOSTING_SERVICES_PORTAL_KEY).update('hms:services-portal:v1:'+options.body).digest('hex'));
   if(realRoot){
    const child=spawnSync('python',[path.resolve(__dirname,'fixtures/hosting-github-gateway.py')],{encoding:'utf8',cwd:process.env.HMS_AUTOMATION_SOURCE,env:{...process.env,PYTHONPATH:process.env.HMS_AUTOMATION_SOURCE},
     input:JSON.stringify({kind:'gateway',root:realRoot,actor,client,service,installations,key:env.HOSTING_SERVICES_PORTAL_KEY,body:options.body,signature:options.headers['X-HMS-Services-Signature'],members:{[actor]:{client,write:true},[other]:{client:other,write:true}}})});
    if(child.status!==0){if(/Traceback[\s\S]*(ModuleNotFound|ImportError|SyntaxError|NameError|AttributeError)/.test(child.stderr))console.error(child.stderr);return new Response('{}',{status:403});}
    return new Response(child.stdout);
   }
   if(mode==='failure')return new Response('{}',{status:503});
   return new Response(JSON.stringify(remoteStatus??ghStatus()));
  }};
 sandbox.exports=sandbox.module.exports;
 vm.runInNewContext(build.outputFiles[0].text,sandbox);
 const lib=sandbox.module.exports;
 const managed=await esbuild.build({entryPoints:[path.resolve(__dirname,'../lib/hosting/managed.ts')],bundle:true,platform:'node',format:'cjs',write:false,
  plugins:[{name:'private-fixtures',setup(b){
   b.onResolve({filter:/^server-only$/},()=>({path:'empty',namespace:'fixture'}));b.onResolve({filter:/^\.\/auth$/},()=>({path:'auth',namespace:'fixture'}));b.onResolve({filter:/^@\/lib\/supabaseClient$/},()=>({path:'database',namespace:'fixture'}));
   b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='empty'?'':a.path==='auth'?'export async function requireHostingAdmin(){return {id:"fixture"}};export async function requireHostingClient(){throw Error("denied")}':'export function getSupabase(){return globalThis.fixtureDB}'}));
  }}]});
 const managedBox={module:{exports:{}},exports:{},require,Buffer,TextDecoder,AbortSignal,URL,process:{env},fixtureDB:db,console,fetch:sandbox.fetch};managedBox.exports=managedBox.module.exports;vm.runInNewContext(managed.outputFiles[0].text,managedBox);
 const {serviceRequest}=managedBox.module.exports;
 const member={actor,owner:false,readOnly:false,sites:new Map([[service,{client,name:'Fixture'}]])};
 const owner={...member,owner:true};

 // --- state: signed, expiring, bound to the actor, the website and the scope --------------------------------------------------------------
 const key=env.HOSTING_GITHUB_STATE_KEY,now=1000000;
 const good={a:actor,s:service,n:'a'.repeat(32),x:now+600,c:'client'};
 const signed=lib.signState(good,key);
 assert.deepEqual(JSON.parse(JSON.stringify(lib.verifyState(signed,key,now))),good);
 for(const bad of [signed.slice(0,-2)+'xx',signed+'.x','','a.b',lib.signState({...good,x:now-1},key),lib.signState({...good,n:'zz'},key),lib.signState({...good,c:'admin'},key),lib.signState(good,'another-key-0000000000000000000000000')]){
  assert.throws(()=>lib.verifyState(bad,key,now));
 }
 // --- start: enabled only when fully configured, fixed GitHub host, one-time nonce ---------------------------------------------------------------
 assert.equal(lib.githubEnabled(env),true);
 for(const missing of ['HOSTING_GITHUB_ENABLED','HOSTING_SOURCES_ENABLED','HOSTING_GITHUB_APP_SLUG','HOSTING_GITHUB_CLIENT_ID','HOSTING_GITHUB_CLIENT_SECRET','HOSTING_GITHUB_STATE_KEY'])assert.equal(lib.githubEnabled({...env,[missing]:''}),false,missing);
 assert.equal(lib.githubEnabled({...env,HOSTING_GITHUB_STATE_KEY:'short'}),false);
 assert.equal(lib.githubEnabled({...env,HOSTING_GITHUB_APP_SLUG:'../evil'}),false);
 const started=lib.startGithub(actor,service,'client',env,now);
 assert.match(started.url,/^https:\/\/github\.com\/apps\/housemysite-test\/installations\/new\?state=/);
 assert.match(started.nonce,/^[a-f0-9]{32}$/);
 const decoded=lib.verifyState(decodeURIComponent(started.url.split('state=')[1]),key,now);
 assert.equal(decoded.n,started.nonce);assert.equal(decoded.a,actor);
 assert.throws(()=>lib.startGithub(actor,service,'client',{...env,HOSTING_GITHUB_ENABLED:''},now));
 assert.equal(lib.parseCookie('a=1; hms_gh_state=abc; b=2','hms_gh_state'),'abc');assert.equal(lib.parseCookie(null,'x'),null);

 // --- finish with a scripted GitHub ---------------------------------------------------------------------------------------------------------
 const github=(over={})=>{
  const calls=[];
  const fetcher=async(url,init)=>{
   calls.push([url,init.method??'GET',init.headers?.Authorization]);
   assert.equal(init.redirect,'error');
   if(over.fail&&url.includes(over.fail))return new Response('{}',{status:500});
   if(url==='https://github.com/login/oauth/access_token')return new Response(JSON.stringify(over.exchange??{access_token:'ghu_temporary_user_token_1234567890'}));
   if(url==='https://api.github.com/user')return new Response(JSON.stringify(over.user??{id:99,login:'octo'}));
   if(url.startsWith('https://api.github.com/user/installations?'))return new Response(JSON.stringify(over.installations??{installations:[{id:7}]}));
   if(url.includes('/repositories?'))return new Response(JSON.stringify(over.repositories??{repositories:[{id:10,full_name:'acme/site'},{id:11,full_name:'bad name'},{id:12,full_name:'acme/other'}]}));
   throw Error('unexpected '+url);
  };
  return {fetcher,calls};
 };
 const query=(over={})=>new URLSearchParams({state:signed,code:'abc123',installation_id:'7',setup_action:'install',...over});
 const attempt=async(over={},extra={})=>lib.finishGithub({scope:member,query:query(over),cookie:good.n,env,fetcher:github(extra.github).fetcher,now,...extra.input});
 // state, cookie, actor, website, scope
 for(const [name,input] of Object.entries({'wrong cookie':{cookie:'b'.repeat(32)},'no cookie':{cookie:null},'another actor':{scope:{...member,actor:other}},'website not in scope':{scope:{...member,sites:new Map()}},'wrong scope':{scope:owner}})){
  await assert.rejects(()=>attempt({},{input}),name);
 }
 await assert.rejects(()=>lib.finishGithub({scope:member,query:query({state:lib.signState({...good,x:now-5},key)}),cookie:good.n,env,fetcher:github().fetcher,now}),'expired state');
 // the organisation-approval path never reaches GitHub or the private service
 const requested=github();
 assert.equal((await lib.finishGithub({scope:member,query:query({setup_action:'request',code:''}),cookie:good.n,env,fetcher:requested.fetcher,now})).outcome,'requested');assert.equal(requested.calls.length,0);
 // malformed or hostile query values
 for(const bad of [{installation_id:'7abc'},{installation_id:'0'},{installation_id:'-1'},{installation_id:''},{code:''},{code:'x'.repeat(201)},{code:'a b'},{setup_action:'delete'},{setup_action:''}])await assert.rejects(()=>attempt(bad),JSON.stringify(bad));
 // what GitHub says must hold
 await assert.rejects(()=>attempt({},{github:{installations:{installations:[{id:8}]}}}),'the GitHub user cannot use this installation (installation id supplied by someone else)');
 await assert.rejects(()=>attempt({},{github:{installations:{installations:'x'}}}));
 await assert.rejects(()=>attempt({},{github:{exchange:{error:'bad_verification_code'}}}));
 await assert.rejects(()=>attempt({},{github:{exchange:{access_token:'short'}}}));
 await assert.rejects(()=>attempt({},{github:{user:{id:'99',login:'octo'}}}));
 await assert.rejects(()=>attempt({},{github:{user:{id:99}}}));
 for(const part of ['login/oauth','api.github.com/user/installations?','/repositories?'])await assert.rejects(()=>attempt({},{github:{fail:part}}),part);
 await assert.rejects(()=>attempt({},{github:{repositories:{repositories:'x'}}}));
 // success: the user token is used only for reads on GitHub, only against GitHub, and only the verified result goes to the private service
 const ok=github();
 mode='valid';remoteStatus=ghStatus();
 const done=await lib.finishGithub({scope:member,query:query(),cookie:good.n,env,fetcher:ok.fetcher,now});
 assert.equal(done.outcome,'linked');
 assert.equal(wire.command.action,'source.github_link');assert.equal(wire.command.client,client);assert.equal(wire.command.installation_id,7);assert.equal(wire.command.github_user_id,99);assert.equal(wire.command.github_login,'octo');
 assert.equal(JSON.stringify(wire.command.repositories),JSON.stringify([{id:10,full_name:'acme/site'},{id:12,full_name:'acme/other'}]));   // the badly named entry was dropped
 assert.ok(!JSON.stringify(wire).includes('ghu_temporary_user_token'));assert.ok(!JSON.stringify(wire).includes('client-secret-test'));
 assert.ok(ok.calls.every(([url])=>/^https:\/\/(github\.com|api\.github\.com)\//.test(url)));
 assert.equal(ok.calls[0][2],undefined);   // the code exchange carries no bearer token
 // the private service must report exactly this installation as active, or the link is refused
 remoteStatus=ghStatus({installations:[]});await assert.rejects(()=>lib.finishGithub({scope:member,query:query(),cookie:good.n,env,fetcher:github().fetcher,now}));
 remoteStatus=ghStatus({installations:[{installation_id:7,github_login:'octo',account_login:'acme',state:'suspended',write:true,repositories:1}]});await assert.rejects(()=>lib.finishGithub({scope:member,query:query(),cookie:good.n,env,fetcher:github().fetcher,now}));
 remoteStatus=null;
 // the link command cannot be sent by a browser, only by the server-side callback, and only while enabled
 const linkCommand={action:'source.github_link',service,installation_id:7,github_user_id:99,github_login:'octo',repositories:[]};
 await assert.rejects(()=>serviceRequest(member,linkCommand));
 await assert.rejects(()=>serviceRequest(member,linkCommand,{internal:false}));
 env.HOSTING_GITHUB_ENABLED='';await assert.rejects(()=>serviceRequest(member,linkCommand,{internal:true}));env.HOSTING_GITHUB_ENABLED='approved';
 // --- status and policy controls -----------------------------------------------------------------------------------------------------------------
 remoteStatus=ghStatus();
 assert.equal((await serviceRequest(member,{action:'source.github_status',service})).installations[0].installation_id,7);
 assert.equal((await serviceRequest({...member,readOnly:true},{action:'source.github_status',service})).service,service);   // read-only members may look
 await assert.rejects(()=>serviceRequest({...member,readOnly:true},{action:'source.auto_revoke',service}));
 const policy={id:'a'.repeat(32),state:'revoked',repository_id:10,branch:'main',allow_activation:false,runtimes:['static'],max_per_day:2,expires:5000000000,failures:0,reason:'revoked by user'};
 remoteStatus=ghStatus({auto:{service,policy,pending:null,recent:[]}});
 assert.equal((await serviceRequest(member,{action:'source.auto_revoke',service})).auto.policy.state,'revoked');
 remoteStatus=ghStatus({auto:{service,policy:{...policy,state:'active',reason:null},pending:null,recent:[]}});
 await assert.rejects(()=>serviceRequest(member,{action:'source.auto_revoke',service}),'a revoke the private service did not apply is refused');
 remoteStatus=ghStatus({auto:{service,policy:{...policy,state:'paused',reason:'uncertain'},pending:null,recent:[]}});
 await assert.rejects(()=>serviceRequest(member,{action:'source.auto_resume',service}),'a resume that left it paused is refused');
 remoteStatus=ghStatus({auto:{service,policy:{...policy,state:'active',reason:null},pending:null,recent:[]}});
 assert.equal((await serviceRequest(member,{action:'source.auto_resume',service})).auto.policy.state,'active');
 for(const flag of ['HOSTING_AUTODEPLOY_ENABLED','HOSTING_PUBLISHING_ENABLED']){const saved=env[flag];env[flag]='';await assert.rejects(()=>serviceRequest(member,{action:'source.auto_resume',service}),flag);env[flag]=saved;}
 env.HOSTING_PUBLISHING_ENABLED='';remoteStatus=ghStatus({auto:{service,policy,pending:null,recent:[]}});assert.equal((await serviceRequest(member,{action:'source.auto_revoke',service})).service,service);env.HOSTING_PUBLISHING_ENABLED='approved';   // stopping never needs a release switch
 // schema: an active policy needs an active installation; foreign service or extra fields are refused
 remoteStatus=ghStatus({installations:[{installation_id:7,github_login:'octo',account_login:'acme',state:'revoked',write:true,repositories:1}],auto:{service,policy:{...policy,state:'active',reason:null},pending:null,recent:[]}});
 await assert.rejects(()=>serviceRequest(member,{action:'source.github_status',service}));
 for(const bad of [ghStatus({service:other}),{...ghStatus(),secret:'x'},ghStatus({auto:{service:other,policy:null,pending:null,recent:[]}}),ghStatus({auto:{service,policy:{...policy,runtimes:['node']},pending:null,recent:[]}}),
  ghStatus({auto:{service,policy:{...policy,max_per_day:50},pending:null,recent:[]}}),ghStatus({auto:{service,policy:null,pending:{commit_sha:'zz',received:1},recent:[]}})]){
  remoteStatus=bad;await assert.rejects(()=>serviceRequest(member,{action:'source.github_status',service}));
 }
 remoteStatus=null;

 // --- real private gateway ------------------------------------------------------------------------------------------------------------------------------
 if(process.env.HMS_AUTOMATION_SOURCE){
  realRoot=fs.mkdtempSync(path.join(os.tmpdir(),'hms-github-'));fs.chmodSync(realRoot,0o700);
  const fixture=(packet)=>{const child=spawnSync('python',[path.resolve(__dirname,'fixtures/hosting-github-gateway.py')],{encoding:'utf8',cwd:process.env.HMS_AUTOMATION_SOURCE,env:{...process.env,PYTHONPATH:process.env.HMS_AUTOMATION_SOURCE},
   input:JSON.stringify({root:realRoot,actor,client,service,installations,members:{[actor]:{client,write:true},[other]:{client:other,write:true}},key:env.HOSTING_SERVICES_PORTAL_KEY,...packet})});if(child.status!==0){console.error(child.stderr);throw Error('fixture failed');}return JSON.parse(child.stdout);};
  try{
   installations={7:{id:7,account:{id:5,login:'acme'},suspended_at:null,permissions:{contents:'write',metadata:'read'}}};
   const linked=await lib.finishGithub({scope:member,query:query(),cookie:good.n,env,fetcher:github().fetcher,now});
   assert.equal(linked.outcome,'linked');assert.equal(linked.status.installations[0].repositories,2);
   const repos=await serviceRequest(member,{action:'source.repositories',service});
   assert.equal(JSON.stringify(repos.available.map(r=>r.full_name).sort()),'["acme/other","acme/site"]');
   const connected=await serviceRequest(member,{action:'source.connect',service,installation_id:7,repository_id:10,branch:'main',expected_version:0});assert.equal(connected.repository.repository_id,10);
   // an installation GitHub does not know, or that belongs to another client, can never be linked
   installations={};await assert.rejects(()=>lib.finishGithub({scope:member,query:query({installation_id:'7'}),cookie:good.n,env,fetcher:github().fetcher,now}));
   installations={7:{id:7,account:{id:5,login:'acme'},suspended_at:null,permissions:{contents:'write',metadata:'read'}}};
   await assert.rejects(()=>serviceRequest(member,{action:'source.connect',service,installation_id:7,repository_id:99,branch:'main',expected_version:1}));
   assert.equal((await serviceRequest(member,{action:'source.github_status',service})).auto.policy,null);
   fixture({kind:'policy',repository_id:10,branch:'main'});
   let status=await serviceRequest(member,{action:'source.github_status',service});assert.equal(status.auto.policy.state,'active');assert.equal(status.auto.policy.allow_activation,false);
   // signed webhooks: a push is queued once; a removed installation pauses the policy and cancels what was queued
   const push={ref:'refs/heads/main',after:'a'.repeat(40),repository:{id:10},installation:{id:7}};
   assert.equal(fixture({kind:'webhook',secret:'webhook-secret-for-tests-0000000000',event:'push',payload:push}).body.outcome,'push:1');
   status=await serviceRequest(member,{action:'source.github_status',service});assert.equal(status.auto.pending.commit_sha,'a'.repeat(40));
   assert.equal(fixture({kind:'webhook',secret:'webhook-secret-for-tests-0000000000',event:'installation',payload:{action:'deleted',installation:{id:7}}}).body.outcome,'installation:revoked');
   status=await serviceRequest(member,{action:'source.github_status',service});
   assert.equal(status.auto.policy.state,'paused');assert.equal(status.auto.policy.reason,'installation_lost');assert.equal(status.auto.pending,null);assert.equal(status.installations[0].state,'revoked');
   await assert.rejects(()=>serviceRequest(member,{action:'source.auto_resume',service}).then(r=>{if(r.auto.policy.state!=='active')throw Error('still paused')}),'resume with a revoked installation does not re-enable it');
   assert.equal((await serviceRequest(member,{action:'source.auto_revoke',service})).auto.policy.state,'revoked');
   // another client's actor sees and changes nothing
   const foreign={actor:other,owner:false,readOnly:false,sites:new Map([[service,{client,name:'Fixture'}]])};
   await assert.rejects(()=>serviceRequest(foreign,{action:'source.github_status',service}));
   await assert.rejects(()=>serviceRequest(foreign,{action:'source.auto_revoke',service}));
  }finally{fs.rmSync(realRoot,{recursive:true,force:true});realRoot=null;}
 }
 console.log('PASS GitHub connection: signed OAuth state, evidence from GitHub only, strict gates and responses, policy controls'+(process.env.HMS_AUTOMATION_SOURCE?', real gateway with verified links, signed webhooks and the owner-signed policy':''));
})().catch(error=>{console.error(error);process.exitCode=1});
