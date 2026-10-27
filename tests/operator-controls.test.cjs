const {test}=require('node:test'),assert=require('node:assert/strict'),{buildSync,build}=require('esbuild'),path=require('node:path'),{randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'..');let actor=randomUUID(),jobId=randomUUID(),requestKey=randomUUID(),serviceId=randomUUID(),serverId=randomUUID(),clientId=randomUUID();
const ctx={job:{id:jobId,service_id:serviceId,requested_by:actor,status:'awaiting_connection',kind:'configure',idempotency_key:requestKey},mapping:{actor_id:actor,server_id:serverId,client_id:clientId,service_id:serviceId,tenant:'acme',subject:'olivia',project:'c12345678'},service:{server_id:serverId,client_id:clientId},inserted:[],existing:null};global.__operatorTest=ctx;
const source=`const c=globalThis.__operatorTest;export function getSupabase(){return {from(table){let insert;const q={select(){return q},eq(){return q},insert(row){insert=row;return q},single:async()=>({error:null,data:table.endsWith('_jobs')?c.job:table.endsWith('_mappings')?c.mapping:table.endsWith('_services')?c.service:(c.inserted.push(insert),{id:'10000000-0000-4000-8000-000000000001'})}),maybeSingle:async()=>({data:c.existing,error:null})};return q}}}`;
let prepareOperatorDelivery;const setup=(async()=>{const output=await build({entryPoints:[path.join(root,'lib/hosting/operator.ts')],tsconfig:path.join(root,'tsconfig.focused.json'),bundle:true,platform:'node',format:'cjs',write:false,plugins:[{name:'private-database-fixture',setup(b){b.onResolve({filter:/^(server-only|@\/lib\/supabaseClient)$/},()=>({path:'mock',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:source,loader:'ts'}));}}]});const moduleOutput={exports:{}};new Function('require','module','exports',output.outputFiles[0].text)(require,moduleOutput,moduleOutput.exports);prepareOperatorDelivery=moduleOutput.exports.prepareOperatorDelivery;
})();
const schemaOutput=buildSync({entryPoints:[path.join(root,'lib/hosting/operatorSchema.ts')],bundle:true,platform:'node',format:'cjs',write:false});const schemaModule={exports:{}};new Function('require','module','exports',schemaOutput.outputFiles[0].text)(require,schemaModule,schemaModule.exports);const {typedRequest}=schemaModule.exports;
const request=(operation,payload)=>({operation,idempotency_key:requestKey,payload,auth:{issued:Math.floor(Date.now()/1000),signature:'a'.repeat(86)+'=='}});
const packet=req=>({job_id:jobId,request:req});
const payloads={
 'repo.bind':{project:'c12345678',repository:'acme/site',repository_id:11,workflow_id:2,workflow_path:'.github/workflows/build.yml',branch:'main',artifact_name:'release'},
 'env.set':{project:'c12345678',scope:'preview',sealed:'a'.repeat(12000)},
 'domain.assign':{project:'c12345678',domain:'site.example.org'},'domain.release':{project:'c12345678'},
 'limits.set':{project:'c12345678',scope:'preview',memory_mb:512,tasks:128,cpu_percent:100,disk_mb:1024},'deploy.cancel':{project:'c12345678',request_id:7}};
test('six extended operations have strict typed payloads; secret and arbitrary actions denied',()=>{
 for(const [op,payload] of Object.entries(payloads))assert.equal(typedRequest.safeParse(request(op,payload)).success,true,op);
 for(const req of [request('env.set',{project:'c12345678',scope:'preview',values:{PASSWORD:'plaintext'}}),request('repo.bind',{...payloads['repo.bind'],token:'private'}),request('project.delete',{project:'c12345678',confirm:'c12345678'}),request('limits.set',{...payloads['limits.set'],memory_mb:true}),request('deploy.cancel',{...payloads['deploy.cancel'],request_id:2**53})])assert.equal(typedRequest.safeParse(req).success,false);
});
test('extended management is default-off and owner/job/project bindings are independently checked',async()=>{
 await setup;delete process.env.HOSTING_OPERATOR_EXTENDED_CONTROLS;await assert.rejects(prepareOperatorDelivery(actor,packet(request('env.set',payloads['env.set']))),/disabled/);assert.equal(ctx.inserted.length,0);
 process.env.HOSTING_OPERATOR_EXTENDED_CONTROLS='approved';await assert.rejects(prepareOperatorDelivery(randomUUID(),packet(request('env.set',payloads['env.set']))),/denied/);
 await assert.rejects(prepareOperatorDelivery(actor,packet(request('env.set',{...payloads['env.set'],project:'cffffffff'}))),/mapping/);
 ctx.job.kind='deploy';await assert.rejects(prepareOperatorDelivery(actor,packet(request('env.set',payloads['env.set']))),/invalid/);ctx.job.kind='configure';
});
test('all allowed management requests preserve exact signed payload and bounded delivery',async()=>{
 await setup;process.env.HOSTING_OPERATOR_EXTENDED_CONTROLS='approved';for(const [op,payload] of Object.entries(payloads)){
 ctx.job.kind=op==='deploy.cancel'?'cancel':'configure';const req=request(op,payload);await prepareOperatorDelivery(actor,packet(req));const row=ctx.inserted.at(-1),body=JSON.parse(row.body);assert.deepEqual(body.request,req);assert.equal(body.service_id,serviceId);assert.ok(Buffer.byteLength(row.body)<=131072);
 }ctx.job.kind='configure';
});
test('existing conflicting request, stale signature and changed client/server mapping are denied',async()=>{
 await setup;const req=request('domain.release',payloads['domain.release']);ctx.existing={id:randomUUID(),body:JSON.stringify({request:request('domain.assign',payloads['domain.assign'])})};await assert.rejects(prepareOperatorDelivery(actor,packet(req)),/conflict/);ctx.existing=null;
 await assert.rejects(prepareOperatorDelivery(actor,packet({...req,auth:{...req.auth,issued:1}})),/expired/);
 const old=ctx.service.client_id;ctx.service.client_id=randomUUID();await assert.rejects(prepareOperatorDelivery(actor,packet(req)),/denied/);ctx.service.client_id=old;
});
