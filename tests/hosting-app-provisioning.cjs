const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{spawnSync}=require('node:child_process'),esbuild=require('esbuild'),crypto=require('node:crypto'),ts=require('typescript');
function moduleAt(file){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,{module:m,exports:m.exports,require});return m.exports;}
(async()=>{
const limitsMod=moduleAt('lib/hosting/packageLimits.ts');
const build=await esbuild.build({entryPoints:[path.resolve(__dirname,'../lib/hosting/managed.ts')],bundle:true,platform:'node',format:'cjs',write:false,
 plugins:[{name:'fixtures',setup(b){
  b.onResolve({filter:/^server-only$/},()=>({path:'empty',namespace:'fixture'}));
  b.onResolve({filter:/^\.\/auth$/},()=>({path:'auth',namespace:'fixture'}));
  b.onResolve({filter:/^@\/lib\/supabaseClient$/},()=>({path:'database',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='empty'?'':a.path==='auth'?'export async function requireHostingAdmin(){return {id:"fixture"}};export async function requireHostingClient(){throw Error("denied")}':'export function getSupabase(){return globalThis.fixtureDB}',loader:'js'}));
 }}]});
const id=n=>`${n}${n}${n}${n}${n}${n}${n}${n}-${n}${n}${n}${n}-4${n}${n}${n}-8${n}${n}${n}-${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}`;
const service=id(1),client=id(2),server=id(3),pkg=id(4),actor=id(5),request=id(6),account=id(7),assignment=id(8),second=id(9),otherClient=id('a');
const limits=limitsMod.APP_PLAN_PRESETS[1].limits,digest=crypto.createHash('sha256').update(limitsMod.canonicalLimits(limits)).digest('hex');
const snapshot={schema:1,package_id:pkg,name:'App Business',version:1,limits,limits_digest:digest,pricing_ready:false};
const tables={
 freelance_hq_hosting_services:[{id:service,client_id:client,server_id:server,package_id:pkg,status:'pending',assignment_key:assignment,package_snapshot:snapshot,primary_domain:'first.example.test'}],
 freelance_hq_hosting_accounts:[{id:account,service_id:service,client_id:client,server_id:server,package_id:pkg,package_version:1,assignment_key:assignment,limits_digest:digest,status:'requested'}],
 freelance_hq_hosting_account_sites:[{id:service,account_id:account,client_id:client,hostname:'first.example.test',is_primary:true,status:'verified'},{id:second,account_id:account,client_id:client,hostname:'second.example.test',is_primary:false,status:'verified'}],
 freelance_hq_hosting_clients:[{id:client,status:'active'}],freelance_hq_hosting_packages:[{id:pkg,is_active:true}],freelance_hq_hosting_servers:[{id:server,status:'available'}],
 freelance_hq_hosting_package_servers:[{package_id:pkg,server_id:server}]};
const rpcCalls=[];let rpcError=null,rpcData='enforced';
const db={from(table){const filters=[];const api={select(){return api},eq(k,v){filters.push([k,v]);return api},async single(){const rows=(tables[table]||[]).filter(r=>filters.every(([k,v])=>r[k]===v));return rows.length===1?{error:null,data:rows[0]}:{error:{message:'none'},data:null}}};return api},
 async rpc(name,args){rpcCalls.push([name,args]);return rpcError?{error:{message:rpcError},data:null}:{error:null,data:rpcData}}};
const env={HOSTING_SERVICES_ENABLED:'approved',HOSTING_APP_ACCOUNTS_ENABLED:'approved',HOSTING_SERVICES_ORIGIN:'https://fixture.invalid',HOSTING_SERVICES_PORTAL_KEY:'synthetic-key-only-00000000000000000000'};
let fetches=0,wire,reply=null;
const python=process.env.HMS_AUTOMATION_SOURCE;
const sandbox={module:{exports:{}},exports:{},require,Buffer,TextDecoder,AbortSignal,URL,process:{env},fixtureDB:db,console,
 fetch:async(url,options)=>{
  fetches++;wire=JSON.parse(options.body);
  assert.equal(options.headers['X-HMS-Services-Signature'],crypto.createHmac('sha256',env.HOSTING_SERVICES_PORTAL_KEY).update('hms:services-portal:v1:'+options.body).digest('hex'));
  assert.equal(options.redirect,'error');
  if(reply==='failure')return new Response('{}',{status:503});
  if(typeof reply==='function')return new Response(JSON.stringify(reply(wire.command)));
  if(python&&wire.command.action==='hosting.app.provision'){
   const code=`import sys,json,sqlite3\nfrom contextlib import contextmanager\nfrom modules.hosting.app_accounts import AppAccounts\nfrom modules.hosting.service_gateway import ServiceGateway\npacket=json.load(sys.stdin)\ndb=sqlite3.connect(':memory:',isolation_level=None)\nclass Forms:\n def __init__(self):self.db=db\n @contextmanager\n def transaction(self):\n  db.execute('BEGIN IMMEDIATE')\n  try:yield;db.commit()\n  except:db.rollback();raise\nregistry=AppAccounts(db)\ngateway=ServiceGateway(None,Forms(),key=packet['key'],app_accounts=(registry,packet['server'],{packet['package']:{'policy_digest':'a'*64,'version':1,'limits_digest':packet['digest']}},lambda a:a==packet['actor']))\nprint(json.dumps(gateway.handle(packet['body'].encode(),packet['signature'])))`;
   const child=spawnSync('python3',['-c',code],{encoding:'utf8',cwd:python,env:{...process.env,PYTHONPATH:python},input:JSON.stringify({actor,server,package:pkg,digest,key:env.HOSTING_SERVICES_PORTAL_KEY,body:options.body,signature:options.headers['X-HMS-Services-Signature']})});
   assert.equal(child.status,0,child.stderr);return new Response(child.stdout);
  }
  return new Response(JSON.stringify({id:'a'.repeat(32),digest:'b'.repeat(64),state:'queued',live_verified:false}));
 }};
sandbox.exports=sandbox.module.exports;vm.runInNewContext(build.outputFiles[0].text,sandbox);
const {serviceRequest,signerContext}=sandbox.module.exports;
const scope={actor,owner:true,readOnly:false,sites:new Map([[service,{client,name:'Fixture'}],[second,{client,name:'second.example.test'}]])};
const provision={action:'hosting.app.provision',service,site:service,request_key:request};
const denied=async(context,command,why)=>{const before=fetches;await assert.rejects(()=>serviceRequest(context,command),undefined,why);assert.equal(fetches,before,why+': nothing may reach the private service');};
// ---- request building: ids only from the browser, everything else from the stored contract
const job=await serviceRequest(scope,provision);assert.equal(job.state,'queued');assert.equal(job.live_verified,false);
const c=wire.command;
assert.deepEqual([c.action,c.kind,c.account,c.service,c.assignment,c.client,c.server,c.package,c.version,c.limits_digest,c.site,c.domain,c.request_key],['hosting.app.provision','provision',account,service,assignment,client,server,pkg,1,digest,service,'first.example.test',request]);
assert.deepEqual(JSON.parse(JSON.stringify(c.limits)),JSON.parse(JSON.stringify(limits)));assert.equal(Object.keys(c.limits).length,24);
// ---- denial matrix: nothing is sent
await denied({...scope,owner:false},provision,'client scope');
await denied({...scope,readOnly:true},provision,'read-only');
await denied({...scope,sites:new Map()},provision,'foreign service');
env.HOSTING_APP_ACCOUNTS_ENABLED='';await denied(scope,provision,'switch off');env.HOSTING_APP_ACCOUNTS_ENABLED='approved';
await denied(scope,{...provision,client:'attacker'},'extra field');
await denied(scope,{...provision,site:id('b')},'site that is not in the account');
const touch=(table,patch,fn)=>async()=>{const row=tables[table][0],old={...row};Object.assign(row,patch);try{await fn();}finally{Object.assign(row,old);}};
await touch('freelance_hq_hosting_clients',{status:'closed'},()=>denied(scope,provision,'inactive client'))();
await touch('freelance_hq_hosting_servers',{status:'draft'},()=>denied(scope,provision,'server not available'))();
await touch('freelance_hq_hosting_packages',{is_active:false},()=>denied(scope,provision,'inactive package'))();
await touch('freelance_hq_hosting_accounts',{status:'enforced'},()=>denied(scope,provision,'primary already provisioned'))();
await touch('freelance_hq_hosting_accounts',{limits_digest:'f'.repeat(64)},()=>denied(scope,provision,'account digest differs from the contract'))();
await touch('freelance_hq_hosting_accounts',{package_version:2},()=>denied(scope,provision,'version differs'))();
await touch('freelance_hq_hosting_accounts',{assignment_key:id('c')},()=>denied(scope,provision,'assignment differs'))();
await touch('freelance_hq_hosting_services',{package_snapshot:{...snapshot,limits:{...limits,disk_mb:999999}}},()=>denied(scope,provision,'tampered limits (digest recomputed)'))();
await touch('freelance_hq_hosting_services',{client_id:otherClient},()=>denied(scope,provision,'service owned by another client'))();
await touch('freelance_hq_hosting_services',{status:'cancelled'},()=>denied(scope,provision,'cancelled service'))();
tables.freelance_hq_hosting_package_servers.pop();await denied(scope,provision,'package not allowed on server');tables.freelance_hq_hosting_package_servers.push({package_id:pkg,server_id:server});
// additional websites need an enforced account
await denied(scope,{...provision,site:second},'add-site before enforcement');
tables.freelance_hq_hosting_accounts[0].status='enforced';
if(python){await assert.rejects(()=>serviceRequest(scope,{...provision,site:second}));/* the private service holds its own account state and refuses what the portal believes */}
else await serviceRequest(scope,{...provision,site:second});
assert.equal(wire.command.kind,'add-site');assert.equal(wire.command.site,second);assert.equal(wire.command.domain,'second.example.test');
tables.freelance_hq_hosting_accounts[0].status='requested';
// the legacy one-site worker never receives an App contract
env.HOSTING_PROVISIONING_ENABLED='approved';await denied(scope,{action:'hosting.provision',service,request_key:request},'legacy dispatch');
// ---- answers are bound to this account and contract
const good={account,client,state:'enforced',enforced:true,limits_digest:digest,assignment,package:pkg,package_version:1,plan_digest:'d'.repeat(64),capabilities:{static_sites:true,databases:false},blocked_features:['databases','php'],
 sites:[{site:service,domain:'first.example.test',state:'verified',primary:true}],jobs:[{id:'e'.repeat(32),kind:'provision',state:'verified',site:service}],receipt_digest:'c'.repeat(64),live_verified:false};
const status={action:'hosting.app.status',service};
reply=()=>good;
const answer=await serviceRequest(scope,status);assert.equal(answer.recorded,'enforced');
assert.equal(rpcCalls.at(-1)[0],'freelance_hq_hosting_record_app_status');assert.equal(rpcCalls.at(-1)[1].p_account,account);assert.equal(rpcCalls.at(-1)[1].p_actor,actor);assert.equal(rpcCalls.at(-1)[1].p_status.receipt_digest,'c'.repeat(64));
assert.deepEqual(wire.command,{action:'hosting.app.status',account,client});
const bad=[{account:id('d')},{client:otherClient},{assignment:id('e')},{limits_digest:'f'.repeat(64)},{package:id('f')},{package_version:2},{enforced:false},{state:'requested'},{receipt_digest:null},{live_verified:true},{extra:1},{sites:[good.sites[0],good.sites[0]]}];
for(const patch of bad){const calls=rpcCalls.length;reply=()=>({...good,...patch});await assert.rejects(()=>serviceRequest(scope,status),undefined,JSON.stringify(patch));assert.equal(rpcCalls.length,calls,'a rejected answer must not be recorded');}
rpcError='Status does not match the contract';reply=()=>good;await assert.rejects(()=>serviceRequest(scope,status));rpcError=null;
reply='failure';await assert.rejects(()=>serviceRequest(scope,status));
// ---- usage: unknown stays unknown and is stored exactly as reported
const entry=(level,used)=>({limit:10,effective:10,used,percent:used==null?null:90,level,basis:used==null?'not_measured':'repquota.group'});
const usageFor=(over={})=>Object.fromEntries(limitsMod.RESOURCE_FIELDS.map(f=>[f[0],entry('unknown',null)]).concat(Object.entries(over)));
reply=()=>({account,usage:usageFor({disk_mb:entry('warn90',9)}),live_verified:false});
const usage=await serviceRequest(scope,{action:'hosting.app.usage',service});assert.equal(usage.usage.traffic_mb.used,null);assert.equal(rpcCalls.at(-1)[0],'freelance_hq_hosting_record_app_usage');
for(const body of [{account:id('d'),usage:usageFor(),live_verified:false},{account,usage:{disk_mb:entry('ok',1)},live_verified:false},{account,usage:{...usageFor(),invented:entry('ok',1)},live_verified:false},{account,usage:usageFor({disk_mb:{...entry('ok',1),extra:1}}),live_verified:false}]){reply=()=>body;await assert.rejects(()=>serviceRequest(scope,{action:'hosting.app.usage',service}));}
// ---- additional websites follow their account AND their parent contract (source commands and signer context)
env.HOSTING_SOURCES_ENABLED='approved';env.HOSTING_PUBLISHING_ENABLED='approved';
const sourceCall={action:'source.status',service:second};
const reaches=async(why)=>{const before=fetches;reply=()=>({});await assert.rejects(()=>serviceRequest(scope,sourceCall));assert.ok(fetches>before,why+': should reach the private service');};
const blocked=async(why)=>{const before=fetches;await assert.rejects(()=>serviceRequest(scope,sourceCall));assert.equal(fetches,before,why+': must not reach the private service');};
tables.freelance_hq_hosting_accounts[0].status='enforced';
await reaches('verified website of an enforced account with an active parent');
assert.deepEqual({...await signerContext(scope,second)},{service:second,client,actor});
await touch('freelance_hq_hosting_services',{status:'cancelled'},async()=>{await blocked('parent contract cancelled');await assert.rejects(()=>signerContext(scope,second));})();
await touch('freelance_hq_hosting_services',{status:'suspended'},()=>blocked('parent contract suspended'))();
await touch('freelance_hq_hosting_accounts',{status:'suspended'},async()=>{await blocked('account suspended');await assert.rejects(()=>signerContext(scope,second));})();
await touch('freelance_hq_hosting_accounts',{status:'provider_confirmed'},()=>blocked('account not enforced'))();
tables.freelance_hq_hosting_account_sites[1].status='reserved';await blocked('website not verified');await assert.rejects(()=>signerContext(scope,second));tables.freelance_hq_hosting_account_sites[1].status='verified';
await assert.rejects(()=>signerContext({...scope,owner:false},second));await assert.rejects(()=>signerContext({...scope,sites:new Map()},second));
tables.freelance_hq_hosting_accounts[0].status='requested';
console.log('PASS App account request building, contract/tamper denial, answer binding, receipt recording, unknown usage'+(python?', real Python gateway/SQLite queue':''));
})().catch(error=>{console.error(error);process.exitCode=1});
