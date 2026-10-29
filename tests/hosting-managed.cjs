// Email, mail domain and database management from the portal: strict schemas, gates, honest states, owner approval through the local signer,
// and (with HMS_AUTOMATION_SOURCE) the real private service, worker, reconciliation and a synthetic hosting panel with injected faults.
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
(async()=>{
 const service='11111111-1111-4111-8111-111111111111',client='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333',actor='55555555-5555-4555-8555-555555555555';
 const row={id:service,client_id:client,status:'active'},clientRow={status:'active'};
 const env={HOSTING_SERVICES_ENABLED:'approved',HOSTING_SERVICES_ORIGIN:'https://fixture.invalid',HOSTING_SERVICES_PORTAL_KEY:'synthetic-key-only-00000000000000000000'};
 const db={from(table){return {select(){return this},eq(){return this},async single(){return {error:null,data:table.endsWith('_services')?row:table.endsWith('_clients')?clientRow:{}}}}}};
 const automation=process.env.HMS_AUTOMATION_SOURCE;let remote=null,realRoot=null;
 const fixture=packet=>{const child=spawnSync('python',[path.resolve(__dirname,'fixtures/hosting-github-gateway.py')],{encoding:'utf8',cwd:automation,env:{...process.env,PYTHONPATH:automation},
  input:JSON.stringify({root:realRoot,actor,client,service,installations:{},signer_dir:path.join(automation,'scripts/signer'),members:{[actor]:{client,write:true},[other]:{client:other,write:true}},key:env.HOSTING_SERVICES_PORTAL_KEY,...packet})});
  if(child.status!==0){if(!packet.expectFailure)console.error(child.stderr);throw Error('fixture failed');}return JSON.parse(child.stdout);};
 const fetcher=async(url,options)=>{
  if(realRoot){try{return new Response(JSON.stringify(fixture({kind:'gateway',body:options.body,signature:options.headers['X-HMS-Services-Signature'],expectFailure:true})))}catch{return new Response('{}',{status:403})}}
  return new Response(JSON.stringify(typeof remote==='function'?remote(JSON.parse(options.body).command):remote));
 };
 const {serviceRequest}=await load('lib/hosting/managed.ts',{process:{env},fixtureDB:db,fetch:fetcher});
 const schema=await load('lib/hosting/managedSchema.ts',{process:{env}});
 const signerLib=await load('lib/hosting/signerClient.ts',{process:{env}});
 const signing=await load('lib/hosting/managedSigning.ts',{process:{env}});
 const operatorSigning=await load('lib/hosting/operatorSigning.ts',{process:{env}});
 const member={actor,owner:false,readOnly:false,sites:new Map([[service,{client,name:'Fixture'}]])},owner={...member,owner:true};
 const job='a'.repeat(32),digest='b'.repeat(64),sig='A'.repeat(86)+'==';
 const parse=c=>schema.serviceCommand.safeParse(c).success;

 // --- commands ------------------------------------------------------------------------------------------------------------------------------------
 assert.ok(parse({action:'request',service,kind:'email',request_key:crypto.randomUUID(),operation:{operation:'domain_create'}}));
 assert.ok(!parse({action:'request',service,kind:'email',request_key:crypto.randomUUID(),operation:{operation:'domain_create',extra:1}}));
 assert.ok(!parse({action:'request',service,kind:'email',request_key:crypto.randomUUID(),operation:{operation:'shell'}}));
 const approval={job,digest,nonce:'c'.repeat(32),issued:1700000000,expires:1700000600,signature:sig};
 for(const kind of ['email','database']){assert.ok(parse({action:'managed.approve',service,kind,job,approval}));assert.ok(parse({action:'managed.approval_view',service,kind,job}));}
 for(const bad of [{...approval,plan:null},{...approval,nonce:'zz'},{...approval,signature:'x'},{...approval,extra:1}])assert.ok(!parse({action:'managed.approve',service,kind:'email',job,approval:bad}));
 assert.ok(!parse({action:'managed.approve',service,kind:'mail',job,approval}));
 // --- gates ---------------------------------------------------------------------------------------------------------------------------------------
 const denied=async(scope,command)=>{remote={};try{await serviceRequest(scope,command);return false}catch{return true}};
 for(const action of ['managed.approvals_pending','managed.approval_view','managed.approve','managed.approval_withdraw']){
  const command={action,service,kind:'email',job,approval};const exact=schema.serviceCommand.parse(Object.fromEntries(Object.entries(command).filter(([k])=>({'managed.approvals_pending':['action','service','kind'],'managed.approval_view':['action','service','kind','job'],'managed.approve':['action','service','kind','job','approval'],'managed.approval_withdraw':['action','service','kind','job']})[action].includes(k))));
  assert.ok(await denied(member,exact),'a client session cannot relay '+action);
 }
 const req={action:'request',service,kind:'email',request_key:crypto.randomUUID(),operation:{operation:'domain_create'}};
 assert.ok(await denied({...member,readOnly:true},req),'read-only');
 clientRow.status='suspended';assert.ok(await denied(member,req),'a suspended client cannot queue changes');
 remote={service,kind:'email',enabled:true,resources:[],jobs:[],limits:{max_resources:3,max_quota_mb:100,used:0,pending_creates:0},domain:{name:'fixture.test',managed:true,present:false},host_key:'A'.repeat(43)+'='};
 assert.equal((await serviceRequest(member,{action:'inventory',service,kind:'email'})).limits.used,0);   // viewing stays possible
 clientRow.status='active';
 row.status='closed';assert.ok(await denied(member,req),'a closed service');row.status='active';
 row.client_id=other;assert.ok(await denied(member,req),'a service of another client');row.client_id=client;
 assert.ok(await denied({...member,sites:new Map()},req));
 // --- response proof ---------------------------------------------------------------------------------------------------------------------------------
 const inventory=(over={})=>({service,kind:'email',enabled:true,resources:[],jobs:[],limits:{max_resources:3,max_quota_mb:100,used:0,pending_creates:0},domain:{name:'fixture.test',managed:true,present:false},host_key:'A'.repeat(43)+'=',...over});
 for(const bad of [inventory({kind:'database'}),inventory({domain:undefined}),inventory({limits:{max_resources:3,max_quota_mb:null,used:0,pending_creates:0}}),{...inventory(),password:'x'},inventory({jobs:[{id:'x',state:'queued'}]}),
   inventory({jobs:[{id:'a1',state:'weird',created:1,approval_received:false,operation:'create',target:null}]}),inventory({resources:[{id:'a1',name:'x',password:'p'}]})]){
  remote=bad;await assert.rejects(()=>serviceRequest(member,{action:'inventory',service,kind:'email'}));
 }
 remote=inventory({kind:'database',domain:undefined,limits:{max_resources:3,max_quota_mb:null,used:0,pending_creates:0}});await assert.rejects(()=>serviceRequest(member,{action:'inventory',service,kind:'email'}),'another kind than asked');
 remote={id:job,digest,state:'queued'};assert.equal((await serviceRequest(member,req)).state,'queued');
 remote={id:job,digest,state:'queued',sealed:'x'};await assert.rejects(()=>serviceRequest(member,req));
 const jobView={id:job,digest,state:'queued',created:1,operation:'create',target:'info'};
 const view=(over={})=>({job:jobView,intent:{kind:'email'},digest,approval_received:true,approvable:true,...over});
 remote=view();assert.equal((await serviceRequest(owner,{action:'managed.approve',service,kind:'email',job,approval})).approval_received,true);
 remote=view({approval_received:false});await assert.rejects(()=>serviceRequest(owner,{action:'managed.approve',service,kind:'email',job,approval}));
 remote=view({digest:'f'.repeat(64)});await assert.rejects(()=>serviceRequest(owner,{action:'managed.approval_view',service,kind:'email',job}));
 remote=view({job:{...jobView,id:'f'.repeat(32)}});await assert.rejects(()=>serviceRequest(owner,{action:'managed.approval_view',service,kind:'email',job}));
 remote=view();await assert.rejects(()=>serviceRequest(owner,{action:'managed.approval_withdraw',service,kind:'email',job}),'withdrawal left the approval in place');

 // --- the real private service ---------------------------------------------------------------------------------------------------------------------
 if(automation){
  realRoot=fs.mkdtempSync(path.join(os.tmpdir(),'hms-managed-'));fs.chmodSync(realRoot,0o700);
  try{
   remote=null;
   const inv=kind=>serviceRequest(member,{action:'inventory',service,kind});
   const ask=async(kind,operation,fn)=>serviceRequest(member,{action:'request',service,kind,request_key:crypto.randomUUID(),operation});
   const approveAndRun=async(kind,queued)=>{
    const pending=await serviceRequest(owner,{action:'managed.approvals_pending',service,kind});
    const item=pending.pending.find(p=>p.job.id===queued.id);assert.ok(item,'the request is waiting for the owner');
    const signed=await signerLib.signManaged({job:item.job.id,digest:item.digest,intent:item.intent,target:item.job.target,seconds:300},'pairing-code-1',async(url,init)=>new Response(JSON.stringify(fixture({kind:'sign',what:JSON.parse(init.body).kind,payload:JSON.parse(init.body).payload}))));
    const received=await serviceRequest(owner,{action:'managed.approve',service,kind,job:queued.id,approval:signed});assert.equal(received.approval_received,true);
    return fixture({kind:'process'}).processed;
   };
   let email=await inv('email');
   assert.equal(email.domain.managed,true);assert.equal(email.domain.present,false);assert.equal(email.limits.used,0);
   // mailbox before the domain exists is refused
   const pin=await operatorSigning.keyFingerprint(email.host_key);
   const sealed=(key,password)=>signing.sealManagedPassword(email.host_key,pin,service,key,password);
   const key1=crypto.randomUUID();
   await assert.rejects(async()=>serviceRequest(member,{action:'request',service,kind:'email',request_key:key1,operation:{operation:'create',name:'info',sealed:await sealed(key1,'fixture-strong-password-ONLY')}}));
   // domain
   const domainJob=await ask('email',{operation:'domain_create'});assert.equal(domainJob.state,'queued');
   const ran=await approveAndRun('email',domainJob);assert.equal(ran[0].state,'provider_confirmed');
   email=await inv('email');assert.equal(email.domain.present,true);assert.equal(email.jobs[0].state,'provider_confirmed');assert.equal(email.jobs[0].operation,'domain_create');
   // mailbox with a sealed password
   const key2=crypto.randomUUID();
   const boxJob=await serviceRequest(member,{action:'request',service,kind:'email',request_key:key2,operation:{operation:'create',name:'info',sealed:await sealed(key2,'fixture-strong-password-ONLY')}});
   assert.equal((await approveAndRun('email',boxJob))[0].state,'provider_confirmed');
   email=await inv('email');assert.deepEqual(JSON.parse(JSON.stringify(email.resources.map(r=>r.name))),['fixture.test','info@fixture.test']);assert.equal(email.limits.used,1);
   assert.ok(!fs.readFileSync(path.join(realRoot,'state.sqlite')).toString('latin1').includes('fixture-strong-password-ONLY'));
   assert.ok(!JSON.stringify(email).includes('fixture-strong-password-ONLY'));
   // another client's actor and a client session see/relay nothing
   const foreign={actor:other,owner:false,readOnly:false,sites:new Map([[service,{client,name:'Fixture'}]])};
   await assert.rejects(()=>serviceRequest(foreign,{action:'inventory',service,kind:'email'}));
   await assert.rejects(()=>serviceRequest(member,{action:'managed.approvals_pending',service,kind:'email'}));
   // a forged approval is refused by the service even though the portal's schema accepts the shape
   const noise=await ask('email',{operation:'enable',resource:email.resources.find(r=>r.name==='info@fixture.test').id});
   const forged={job:noise.id,digest:noise.digest,nonce:'d'.repeat(32),issued:Math.floor(Date.now()/1000)-5,expires:Math.floor(Date.now()/1000)+200,signature:sig};
   await assert.rejects(()=>serviceRequest(owner,{action:'managed.approve',service,kind:'email',job:noise.id,approval:forged}));
   // a lost answer: the change took effect at the panel, the request is uncertain, and nothing else can touch that account meanwhile
   const box=email.resources.find(r=>r.name==='info@fixture.test').id;
   await assert.rejects(()=>ask('email',{operation:'quota',resource:box,quota_mb:20}),'a second request for the same account waits for the first');
   assert.equal((await approveAndRun('email',noise))[0].state,'provider_confirmed');
   fixture({kind:'faults',fail_after:['mail_user_update']});
   const quotaJob=await ask('email',{operation:'quota',resource:box,quota_mb:20});
   const after=await approveAndRun('email',quotaJob);
   email=await inv('email');
   const quotaState=email.jobs.find(j=>j.id===quotaJob.id).state;
   assert.ok(['uncertain','provider_confirmed'].includes(quotaState));
   if(quotaState==='uncertain'){
    await assert.rejects(()=>ask('email',{operation:'disable',resource:box}),'the account is blocked while a request is unresolved');
    const reconciled=fixture({kind:'reconcile',job:quotaJob.id});assert.equal(reconciled.state,'provider_confirmed');
   }
   email=await inv('email');assert.equal(email.jobs.find(j=>j.id===quotaJob.id).state,'provider_confirmed');
   // databases: a half-made database is journaled, reconciled as failed, and its name retired
   let database=await inv('database');assert.equal(database.domain,undefined);
   const dbPin=await operatorSigning.keyFingerprint(database.host_key);
   const dbKey=crypto.randomUUID();
   fixture({kind:'faults',fail_before:['sites_database_add']});
   const dbJob=await serviceRequest(member,{action:'request',service,kind:'database',request_key:dbKey,operation:{operation:'create',name:'shop',sealed:await signing.sealManagedPassword(database.host_key,dbPin,service,dbKey,'another-strong-password-1')}});
   const dbRan=await approveAndRun('database',dbJob);assert.equal(dbRan[0].state,'uncertain');
   assert.equal((await inv('database')).jobs[0].state,'uncertain');
   const result=fixture({kind:'reconcile',job:dbJob.id});assert.equal(result.state,'failed');
   const dbKey2=crypto.randomUUID();
   await assert.rejects(async()=>serviceRequest(member,{action:'request',service,kind:'database',request_key:dbKey2,operation:{operation:'create',name:'shop',sealed:await signing.sealManagedPassword(database.host_key,dbPin,service,dbKey2,'another-strong-password-1')}}),'the leftover database user retires the name');
   assert.equal((await inv('database')).jobs[0].state,'failed');
   // errors from the panel never reach the client
   const text=JSON.stringify([await inv('email'),await inv('database')]);assert.ok(!text.includes('synthetic provider text'));
  }finally{fs.rmSync(realRoot,{recursive:true,force:true});realRoot=null;}
 }
 console.log('PASS email/database management: strict schemas, owner-only approvals, live-client gates, honest states'+(automation?', real private service with the real signer, worker, reconciliation and a synthetic panel with injected faults':''));
})().catch(error=>{console.error(error);process.exitCode=1});
