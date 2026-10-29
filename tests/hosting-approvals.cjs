// Portal side of owner approvals, the local signing companion client and sealed runtime secrets.
// Synthetic mode checks schemas, gates, response validation and the browser libraries. With HMS_AUTOMATION_SOURCE the same calls drive the REAL private
// gateway (approval inbox, owner-signed policy, secrets store) and the REAL Signer class stands in for the owner's local program.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const esbuild=require('esbuild');

const plugin={name:'private-fixtures',setup(b){
 b.onResolve({filter:/^server-only$/},()=>({path:'empty',namespace:'fixture'}));b.onResolve({filter:/^\.\/auth$/},()=>({path:'auth',namespace:'fixture'}));b.onResolve({filter:/^@\/lib\/supabaseClient$/},()=>({path:'database',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='empty'?'':a.path==='auth'?'export async function requireHostingAdmin(){return {id:"fixture"}};export async function requireHostingClient(){throw Error("denied")}':'export function getSupabase(){return globalThis.fixtureDB}'}));
}};
async function load(file,box){
 const out=await esbuild.build({entryPoints:[path.resolve(__dirname,'..',file)],bundle:true,platform:'node',format:'cjs',write:false,plugins:[plugin]});
 const sandbox={module:{exports:{}},exports:{},require,Buffer,TextDecoder,TextEncoder,AbortSignal,URL,URLSearchParams,atob,btoa,crypto:globalThis.crypto,console,...box};sandbox.exports=sandbox.module.exports;
 vm.runInNewContext(out.outputFiles[0].text,sandbox);return sandbox.module.exports;
}
const sha=text=>crypto.createHash('sha256').update(text).digest('hex');

(async()=>{
 const service='11111111-1111-4111-8111-111111111111',client='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333',actor='55555555-5555-4555-8555-555555555555';
 const row={id:service,client_id:client,status:'active'};
 const env={HOSTING_SERVICES_ENABLED:'approved',HOSTING_SOURCES_ENABLED:'approved',HOSTING_PUBLISHING_ENABLED:'approved',HOSTING_GITHUB_ENABLED:'approved',HOSTING_AUTODEPLOY_ENABLED:'approved',HOSTING_NEXTJS_ENABLED:'approved',HOSTING_CLIENT_FEATURES:'sources',
  HOSTING_SERVICES_ORIGIN:'https://fixture.invalid',HOSTING_SERVICES_PORTAL_KEY:'synthetic-key-only-00000000000000000000'};
 const db={from(table){return {select(){return this},eq(){return this},async single(){return {error:null,data:table.endsWith('_services')?row:table.endsWith('_clients')?{status:'active'}:{}}}}}};
 let remote=null,realRoot=null,installations={};
 const automation=process.env.HMS_AUTOMATION_SOURCE;
 const python=(packet)=>{const child=spawnSync('python',[path.resolve(__dirname,'fixtures/hosting-github-gateway.py')],{encoding:'utf8',cwd:automation,env:{...process.env,PYTHONPATH:automation},
  input:JSON.stringify({root:realRoot,actor,client,service,installations,signer_dir:path.join(automation,'scripts/signer'),members:{[actor]:{client,write:true},[other]:{client:other,write:true}},key:env.HOSTING_SERVICES_PORTAL_KEY,...packet})});
  if(child.status!==0){console.error(child.stderr);throw Error('fixture failed');}return JSON.parse(child.stdout);};
 const fetcher=async(url,options)=>{
  const body=JSON.parse(options.body);
  if(realRoot){
   const child=spawnSync('python',[path.resolve(__dirname,'fixtures/hosting-github-gateway.py')],{encoding:'utf8',cwd:automation,env:{...process.env,PYTHONPATH:automation},
    input:JSON.stringify({kind:'gateway',root:realRoot,actor,client,service,installations,signer_dir:path.join(automation,'scripts/signer'),key:env.HOSTING_SERVICES_PORTAL_KEY,body:options.body,signature:options.headers['X-HMS-Services-Signature'],members:{[actor]:{client,write:true},[other]:{client:other,write:true}}})});
   if(child.status!==0){if(/Traceback[\s\S]*(ModuleNotFound|ImportError|SyntaxError|NameError|AttributeError)/.test(child.stderr))console.error(child.stderr);return new Response('{}',{status:403});}
   return new Response(child.stdout);
  }
  return new Response(JSON.stringify(typeof remote==='function'?remote(body.command):remote));
 };
 const managed=await load('lib/hosting/managed.ts',{process:{env},fixtureDB:db,fetch:fetcher});
 const {serviceRequest,signerContext}=managed;
 const schema=await load('lib/hosting/managedSchema.ts',{process:{env}});
 const signerLib=await load('lib/hosting/signerClient.ts',{process:{env}});
 const seal=await load('lib/hosting/secretSeal.ts',{process:{env}});
 const member={actor,owner:false,readOnly:false,sites:new Map([[service,{client,name:'Fixture'}]])};
 const owner={...member,owner:true};

 // --- command shapes: exact fields, bounded values ----------------------------------------------------------------------------------------------
 const job='a'.repeat(32),digest='b'.repeat(64),sig='A'.repeat(86)+'==';
 const approval={job,digest,nonce:'c'.repeat(32),issued:1700000000,expires:1700000600,plan:null,signature:sig};
 const parse=c=>schema.serviceCommand.safeParse(c).success;
 assert.ok(parse({action:'source.approve',service,job,approval}));
 assert.ok(parse({action:'source.approve',service,job,approval:{...approval,plan:'d'.repeat(64)}}));
 for(const bad of [{...approval,extra:1},{...approval,nonce:'zz'},{...approval,signature:'short'},{...approval,job:'x'},{...approval,plan:'nothex'},{...approval,issued:-1},{job,digest}])assert.ok(!parse({action:'source.approve',service,job,approval:bad}),JSON.stringify(bad).slice(0,60));
 assert.ok(!parse({action:'source.approve',service,job,approval,extra:true}));
 assert.ok(!parse({action:'source.approval_view',service,job:'../x'}));
 const policy={schema:1,id:'e'.repeat(32),service,client,actor,repository_id:10,branch:'main',allow_activation:false,runtimes:['static'],max_per_day:2,issued:1700000000,expires:1700086400};
 assert.ok(parse({action:'source.auto_install',service,policy,signature:sig}));
 for(const bad of [{...policy,max_per_day:11},{...policy,runtimes:[]},{...policy,runtimes:['node']},{...policy,branch:'a..b'},{...policy,schema:2},{...policy,extra:1},{...policy,service:'not-a-uuid'}])assert.ok(!parse({action:'source.auto_install',service,policy:bad,signature:sig}));
 for(const name of ['DATABASE_URL','STRIPE_SECRET_KEY','A'])assert.ok(parse({action:'source.secret_delete',service,name}),name);
 for(const name of ['','lower','1ABC','PATH','PORT','NODE_OPTIONS','HMS_X','LD_PRELOAD','HOSTNAME','A'.repeat(65),'A-B'])assert.ok(!parse({action:'source.secret_delete',service,name}),name);
 assert.ok(!parse({action:'source.secret_put',service,name:'API_KEY',blob:'x'.repeat(79)}));
 assert.ok(!parse({action:'source.secret_put',service,name:'API_KEY',blob:'x'.repeat(8193)}));
 assert.ok(!parse({action:'source.secret_put',service,name:'API_KEY',blob:'x'.repeat(100),value:'plain'}));

 // --- gates --------------------------------------------------------------------------------------------------------------------------------------
 const gated=async(scope,command,mutate)=>{const saved={...env};try{mutate&&mutate();remote={};await serviceRequest(scope,command);return false;}catch{return true;}finally{Object.assign(env,saved);for(const k of Object.keys(env))if(!(k in saved))delete env[k];}};
 for(const command of [{action:'source.approvals_pending',service},{action:'source.approval_view',service,job},{action:'source.approve',service,job,approval},{action:'source.approval_withdraw',service,job},{action:'source.auto_install',service,policy,signature:sig}])
  assert.ok(await gated(member,command),'client scope cannot relay owner decisions: '+command.action);
 assert.ok(await gated(owner,{action:'source.auto_install',service,policy,signature:sig},()=>{env.HOSTING_AUTODEPLOY_ENABLED=''}));
 assert.ok(await gated(owner,{action:'source.auto_install',service,policy,signature:sig},()=>{env.HOSTING_GITHUB_ENABLED=''}));
 assert.ok(await gated(owner,{action:'source.auto_install',service,policy,signature:sig},()=>{env.HOSTING_PUBLISHING_ENABLED=''}));
 assert.ok(await gated({...owner,readOnly:true},{action:'source.approve',service,job,approval}));
 for(const action of ['source.secret_key']) assert.ok(await gated(member,{action,service},()=>{env.HOSTING_NEXTJS_ENABLED=''}),action);
 assert.ok(await gated(member,{action:'source.secret_put',service,name:'API_KEY',blob:'x'.repeat(100)},()=>{env.HOSTING_NEXTJS_ENABLED=''}));
 assert.ok(await gated({...member,readOnly:true},{action:'source.secret_put',service,name:'API_KEY',blob:'x'.repeat(100)}),'a read-only member cannot store secrets');
 assert.ok(await gated({...member,readOnly:true},{action:'source.secret_delete',service,name:'API_KEY'}));
 assert.ok(await gated(member,{action:'source.secret_list',service},()=>{row.client_id=other}),'a website of another client');row.client_id=client;
 assert.ok(await gated({...member,sites:new Map()},{action:'source.secret_list',service}));
 remote={service,version:0,secrets:[]};
 assert.equal((await serviceRequest({...member,readOnly:true},{action:'source.secret_list',service})).version,0);   // read-only members may see names

 // --- response validation ------------------------------------------------------------------------------------------------------------------------
 const publicJob={id:job,digest,state:'queued',operation:'deploy',source:'github',tree:null,created:1700000000,result:null,live_verified:false};
 const view=(over={})=>({job:publicJob,intent:{operation:'deploy',service},digest,needs_plan:false,plan:null,approval_received:true,approvable:true,summary:{operation:'deploy'},...over});
 remote=view();assert.equal((await serviceRequest(owner,{action:'source.approve',service,job,approval})).approval_received,true);
 remote=view({approval_received:false});await assert.rejects(()=>serviceRequest(owner,{action:'source.approve',service,job,approval}),'an approval the service did not record');
 remote=view({job:{...publicJob,id:'f'.repeat(32)}});await assert.rejects(()=>serviceRequest(owner,{action:'source.approve',service,job,approval}),'a different job');
 remote=view({digest:'f'.repeat(64)});await assert.rejects(()=>serviceRequest(owner,{action:'source.approval_view',service,job}),'a digest that is not the job digest');
 remote={...view(),secret:'x'};await assert.rejects(()=>serviceRequest(owner,{action:'source.approval_view',service,job}));
 remote=view({needs_plan:true,plan:{digest:'1'.repeat(64),detail:{counts:{}},error:null}});await assert.rejects(()=>serviceRequest(owner,{action:'source.approve',service,job,approval:{...approval,plan:'2'.repeat(64)}}),'the approval covers another plan');
 remote=view({approval_received:true});await assert.rejects(()=>serviceRequest(owner,{action:'source.approval_withdraw',service,job}),'a withdrawal that left the approval in the inbox');
 remote=view({approvable:true,job:{...publicJob,state:'done'}});await assert.rejects(()=>serviceRequest(owner,{action:'source.approval_view',service,job}),'approvable but not queued');
 remote={service,pending:[view(),view(),view(),view(),view(),view()]};await assert.rejects(()=>serviceRequest(owner,{action:'source.approvals_pending',service}));
 remote={service:other,pending:[]};await assert.rejects(()=>serviceRequest(owner,{action:'source.approvals_pending',service}));
 const stored=(names,version=1)=>({service,version,secrets:names.map(name=>({name,updated:1700000000}))});
 remote=stored(['API_KEY']);assert.equal((await serviceRequest(member,{action:'source.secret_put',service,name:'API_KEY',blob:'x'.repeat(100)})).secrets[0].name,'API_KEY');
 remote=stored([]);await assert.rejects(()=>serviceRequest(member,{action:'source.secret_put',service,name:'API_KEY',blob:'x'.repeat(100)}),'a put the service did not apply');
 remote=stored(['API_KEY']);await assert.rejects(()=>serviceRequest(member,{action:'source.secret_delete',service,name:'API_KEY'}),'a delete the service did not apply');
 remote={...stored(['API_KEY']),secrets:[{name:'API_KEY',updated:1,value:'leak'}]};await assert.rejects(()=>serviceRequest(member,{action:'source.secret_list',service}),'a value in any answer is refused');
 remote=stored(['PATH']);await assert.rejects(()=>serviceRequest(member,{action:'source.secret_list',service}),'reserved names in an answer');
 remote={service,public_key:'-----BEGIN PUBLIC KEY-----\nAAAA\n-----END PUBLIC KEY-----\n',fingerprint:'a'.repeat(64),format:'hms-secret-v1'};
 assert.equal((await serviceRequest(member,{action:'source.secret_key',service})).format,'hms-secret-v1');
 remote={...remote,format:'other'};await assert.rejects(()=>serviceRequest(member,{action:'source.secret_key',service}));
 // install: the service must report exactly this policy as active
 const github=(over={})=>({service,installations:[{installation_id:7,github_login:'octo',account_login:'acme',state:'active',write:true,repositories:1}],auto:{service,policy:{id:policy.id,state:'active',repository_id:10,branch:'main',allow_activation:false,runtimes:['static'],max_per_day:2,expires:5000000000,failures:0,reason:null,...over},pending:null,recent:[]}});
 remote=github();assert.equal((await serviceRequest(owner,{action:'source.auto_install',service,policy,signature:sig})).auto.policy.id,policy.id);
 for(const over of [{id:'0'.repeat(32)},{branch:'dev'},{repository_id:11},{allow_activation:true},{state:'paused',reason:'x'}]){remote=github(over);await assert.rejects(()=>serviceRequest(owner,{action:'source.auto_install',service,policy,signature:sig}),JSON.stringify(over));}
 // signer context: owner only, derived from the saved service
 assert.deepEqual(JSON.parse(JSON.stringify(await signerContext(owner,service))),{service,client,actor});
 for(const bad of [[member,service],[{...owner,readOnly:true},service],[owner,'x'],[owner,other],[{...owner,sites:new Map()},service]])await assert.rejects(()=>signerContext(...bad));
 row.client_id=other;await assert.rejects(()=>signerContext(owner,service));row.client_id=client;

 // --- signer client -------------------------------------------------------------------------------------------------------------------------------
 const json=(value,status=200)=>new Response(JSON.stringify(value),{status});
 const fp='9'.repeat(64);
 assert.equal((await signerLib.signerHello(null,async(url,init)=>{assert.equal(url,'http://127.0.0.1:47419/v1/hello');assert.equal(init.credentials,'omit');assert.equal(init.redirect,'error');return json({signer:'hms-signer',version:1,fingerprint:fp})})).fingerprint,fp);
 await assert.rejects(()=>signerLib.signerHello('8'.repeat(64),async()=>json({signer:'hms-signer',version:1,fingerprint:fp})),/different key/);
 await assert.rejects(()=>signerLib.signerHello(null,async()=>{throw Error('refused')}),/not found/);
 await assert.rejects(()=>signerLib.signerHello(null,async()=>json({signer:'other',version:1,fingerprint:fp})));
 const request={job,digest,intent:{a:1},plan:null,seconds:300};
 const good={approval:{...approval,plan:null,expires:approval.issued+330}};
 const sent=[];
 assert.equal((await signerLib.signApproval(request,'pairing-code-1',async(url,init)=>{sent.push([url,init]);return json(good)})).job,job);
 assert.equal(sent[0][1].headers['X-HMS-Signer-Token'],'pairing-code-1');assert.deepEqual(JSON.parse(sent[0][1].body),{kind:'source-approval',payload:request});
 for(const bad of ['short','has space!','']) await assert.rejects(()=>signerLib.signApproval(request,bad,async()=>json(good)),/pairing/);
 for(const reply of [{approval:{...good.approval,job:'9'.repeat(32)}},{approval:{...good.approval,digest:'9'.repeat(64)}},{approval:{...good.approval,plan:'9'.repeat(64)}},{approval:{...good.approval,expires:good.approval.issued+99999}},{approval:{...good.approval,expires:good.approval.issued}},{approval:good.approval,extra:1},{}])
  await assert.rejects(()=>signerLib.signApproval(request,'pairing-code-1',async()=>json(reply)),JSON.stringify(reply).slice(0,50));
 await assert.rejects(()=>signerLib.signApproval(request,'pairing-code-1',async()=>json({error:'Declined'},422)),/Declined/);
 await assert.rejects(()=>signerLib.signApproval(request,'pairing-code-1',async()=>json({error:'x'},403)),/did not sign/);
 const proposal={service,client,actor,repository_id:10,branch:'main',allow_activation:false,runtimes:['static'],max_per_day:2,days:7};
 const signedPolicy={policy:{...policy,issued:1700000000,expires:1700000000+7*86400},signature:sig};
 assert.equal((await signerLib.signPolicy(proposal,'pairing-code-1',async()=>json(signedPolicy))).policy.id,policy.id);
 for(const over of [{branch:'dev'},{allow_activation:true},{repository_id:11},{max_per_day:9},{runtimes:['static','php']},{client:other},{actor:'someone-else'},{expires:1700000000+99*86400}])
  await assert.rejects(()=>signerLib.signPolicy(proposal,'pairing-code-1',async()=>json({...signedPolicy,policy:{...signedPolicy.policy,...over}})),JSON.stringify(over));
 await assert.rejects(()=>signerLib.signPolicy({...proposal,days:31},'pairing-code-1',async()=>json(signedPolicy)));

 // --- sealing in the browser ----------------------------------------------------------------------------------------------------------------------
 const pair=await crypto.webcrypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 const spki=Buffer.from(await crypto.webcrypto.subtle.exportKey('spki',pair.publicKey)).toString('base64').match(/.{1,64}/g).join('\n');
 const pem=`-----BEGIN PUBLIC KEY-----\n${spki}\n-----END PUBLIC KEY-----\n`;
 const fingerprint=await seal.fingerprintOf(pem,crypto.webcrypto.subtle);
 assert.match(fingerprint,/^[a-f0-9]{64}$/);
 const sealIt=(over={})=>seal.sealSecret({publicKeyPem:pem,pinnedFingerprint:fingerprint,service,name:'API_KEY',value:'s3cret-value-123',...over},crypto.webcrypto);
 const blob=await sealIt();
 assert.ok(!blob.includes('s3cret-value-123'));assert.ok(schema.serviceCommand.safeParse({action:'source.secret_put',service,name:'API_KEY',blob}).success);
 assert.notEqual(await sealIt(),blob);   // fresh ephemeral key and nonce every time
 for(const [what,over,pattern] of [['no pin',{pinnedFingerprint:null},/fingerprint is configured/],['wrong pin',{pinnedFingerprint:'1'.repeat(64)},/does not match/],['reserved name',{name:'PATH'},/name/],['lowercase name',{name:'api'},/name/],
   ['empty value',{value:''},/Values/],['quote',{value:'a"b'},/Values/],['dollar',{value:'a$b'},/Values/],['newline',{value:'a\nb'},/Values/],['backslash',{value:'a\\b'},/Values/],['too long',{value:'x'.repeat(4097)},/Values/]])
  await assert.rejects(()=>sealIt(over),pattern,what);
 assert.ok(JSON.parse(await sealIt({value:'é'.repeat(100)})).ct);   // multi-byte values are measured in bytes
 await assert.rejects(()=>sealIt({value:'é'.repeat(2049)}),/Values/);

 // --- real private service -----------------------------------------------------------------------------------------------------------------------
 if(automation){
  realRoot=fs.mkdtempSync(path.join(os.tmpdir(),'hms-approvals-'));fs.chmodSync(realRoot,0o700);
  try{
   installations={7:{id:7,account:{id:5,login:'acme'},suspended_at:null,permissions:{contents:'write',metadata:'read'}}};
   remote=null;
   // runtime secrets: key -> seal in the browser -> store ciphertext -> only the broker side can open it
   const key=await serviceRequest(member,{action:'source.secret_key',service});
   const server=python({kind:'public'});assert.equal(key.fingerprint,server.fingerprint);
   const real=(name,value,over={})=>seal.sealSecret({publicKeyPem:key.public_key,pinnedFingerprint:key.fingerprint,service,name,value,...over},crypto.webcrypto);
   let list=await serviceRequest(member,{action:'source.secret_put',service,name:'API_KEY',blob:await real('API_KEY','s3cret-value-123')});assert.equal(list.version,1);
   list=await serviceRequest(member,{action:'source.secret_put',service,name:'DATABASE_URL',blob:await real('DATABASE_URL','mysql://user:pw@127.0.0.1/db')});assert.equal(list.version,2);
   assert.ok(!JSON.stringify(list).includes('s3cret'));assert.deepEqual(JSON.parse(JSON.stringify(list.secrets.map(s=>s.name))),['API_KEY','DATABASE_URL']);
   const opened=python({kind:'open',service});assert.equal(opened.version,2);assert.equal(opened.values.API_KEY,'s3cret-value-123');assert.equal(opened.values.DATABASE_URL,'mysql://user:pw@127.0.0.1/db');
   // the stored database never contains the plaintext
   assert.ok(!fs.readFileSync(path.join(realRoot,'state.sqlite')).toString('latin1').includes('s3cret-value-123'));
   // a sealed value cannot be moved to another website or name
   const blob1=await real('API_KEY','moved-value');
   assert.equal(python({kind:'raw',service,name:'API_KEY',blob:blob1}).value,'moved-value');
   assert.equal(python({kind:'raw',service:other,name:'API_KEY',blob:blob1}).denied,true);
   assert.equal(python({kind:'raw',service,name:'OTHER_NAME',blob:blob1}).denied,true);
   await assert.rejects(()=>serviceRequest(member,{action:'source.secret_put',service,name:'API_KEY',blob:'{"v":1}'.padEnd(120,' ')}),'a malformed blob is refused by the service');
   // another client's actor sees nothing
   const foreign={actor:other,owner:false,readOnly:false,sites:new Map([[service,{client,name:'Fixture'}]])};
   await assert.rejects(()=>serviceRequest(foreign,{action:'source.secret_list',service}));
   await assert.rejects(()=>serviceRequest(foreign,{action:'source.secret_put',service,name:'API_KEY',blob:blob1}));
   list=await serviceRequest(member,{action:'source.secret_delete',service,name:'API_KEY'});assert.equal(list.version,3);assert.deepEqual(JSON.parse(JSON.stringify(list.secrets.map(s=>s.name))),['DATABASE_URL']);
   assert.deepEqual(Object.keys(python({kind:'open',service}).values),['DATABASE_URL']);

   // GitHub link + repository, then a queued request awaiting the owner
   const link={action:'source.github_link',service,installation_id:7,github_user_id:99,github_login:'octo',repositories:[{id:10,full_name:'acme/site'}]};
   await serviceRequest(owner,link,{internal:true});
   await serviceRequest(owner,{action:'source.connect',service,installation_id:7,repository_id:10,branch:'main',expected_version:0});
   const queued=await serviceRequest(owner,{action:'source.request',service,operation:'deploy',request_key:crypto.randomUUID(),tree:null});
   assert.equal(queued.state,'queued');
   const pending=await serviceRequest(owner,{action:'source.approvals_pending',service});
   assert.equal(pending.pending.length,1);const item=pending.pending[0];
   assert.equal(item.job.id,queued.id);assert.equal(item.approvable,true);assert.equal(item.approval_received,false);
   // sign with the REAL signer class, relayed through the portal libraries
   const signerFetch=async(url,init)=>{const body=JSON.parse(init.body);return json(python({kind:'sign',what:body.kind,payload:body.payload}))};
   const signed=await signerLib.signApproval({job:item.job.id,digest:item.digest,intent:item.intent,plan:item.plan?item.plan.digest:null,seconds:300},'pairing-code-1',signerFetch);
   // tampering with a signed approval is caught by the private service even though the portal's schema accepts the shape
   await assert.rejects(()=>serviceRequest(owner,{action:'source.approve',service,job:item.job.id,approval:{...signed,expires:signed.expires+86400}}),'a changed lifetime');
   await assert.rejects(()=>serviceRequest(owner,{action:'source.approve',service,job:item.job.id,approval:{...signed,nonce:'0'.repeat(32)}}),'a changed nonce');
   const stolen=await serviceRequest(owner,{action:'source.approvals_pending',service});assert.equal(stolen.pending[0].approval_received,false);
   const received=await serviceRequest(owner,{action:'source.approve',service,job:item.job.id,approval:signed});assert.equal(received.approval_received,true);
   await assert.rejects(()=>serviceRequest(member,{action:'source.approve',service,job:item.job.id,approval:signed}),'a client member cannot relay it');
   const withdrawn=await serviceRequest(owner,{action:'source.approval_withdraw',service,job:item.job.id});assert.equal(withdrawn.approval_received,false);
   // an approval for another request cannot be attached to this one
   await assert.rejects(()=>serviceRequest(owner,{action:'source.approve',service,job:item.job.id,approval:{...signed,job:'9'.repeat(32)}}));
   // the owner-signed automatic-deployment policy, signed by the real signer from what the server derived
   const context=await signerContext(owner,service);
   const proposal={...context,repository_id:10,branch:'main',allow_activation:false,runtimes:['static'],max_per_day:2,days:7};
   const signedPolicy=await signerLib.signPolicy(proposal,'pairing-code-1',signerFetch);
   await assert.rejects(()=>serviceRequest(owner,{action:'source.auto_install',service,policy:{...signedPolicy.policy,allow_activation:true},signature:signedPolicy.signature}),'a policy changed after signing');
   await assert.rejects(()=>serviceRequest(owner,{action:'source.auto_install',service,policy:{...signedPolicy.policy,branch:'dev'},signature:signedPolicy.signature}));
   const installed=await serviceRequest(owner,{action:'source.auto_install',service,policy:signedPolicy.policy,signature:signedPolicy.signature});
   assert.equal(installed.auto.policy.state,'active');assert.equal(installed.auto.policy.allow_activation,false);
   await assert.rejects(()=>serviceRequest(member,{action:'source.auto_install',service,policy:signedPolicy.policy,signature:signedPolicy.signature}));
  }finally{fs.rmSync(realRoot,{recursive:true,force:true});realRoot=null;}
 }
 console.log('PASS owner approvals and sealed secrets: strict commands, owner-only gates, response proof, signer client checks, browser sealing'+(automation?', real private service with the real signer and a root-side opener':''));
})().catch(error=>{console.error(error);process.exitCode=1});
