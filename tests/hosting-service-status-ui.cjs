const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript'),React=require('react'),Renderer=require('react-test-renderer');
const {act}=Renderer;
function load(file,mocks={}){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2020}}).outputText,{module:m,exports:m.exports,require:n=>n in mocks?mocks[n]:require(n),process,URL,FormData});return m.exports;}
(async()=>{
 const {ServiceCreateOptions}=load('components/hosting/ServiceCreateOptions.tsx');let tree;
 act(()=>{tree=Renderer.create(React.createElement(ServiceCreateOptions,{packages:[{id:'standard',name:'Standard',currency:'PKR'},{id:'app',name:'App',currency:'PKR',product_kind:'app_hosting'}]}));});
 const field=name=>tree.root.findByProps({name});
 assert.equal(field('status').props.value,'active');
 act(()=>field('status').props.onChange({target:{value:'pending'}}));assert.equal(field('status').props.value,'pending');
 act(()=>field('package_id').props.onChange({target:{value:'app'}}));assert.equal(field('status').props.value,'pending');assert.equal(field('status').findAllByType('option')[0].props.disabled,true);
 assert.match(JSON.stringify(tree.toJSON()),/Complete its server setup/);
 act(()=>tree.unmount());
 let resolve,calls=0,refreshes=0;
 const {ServiceStatusControl}=load('components/hosting/ServiceStatusControl.tsx',{'next/navigation':{useRouter:()=>({refresh:()=>refreshes++})},'@/lib/hosting/actions':{changeHostingServiceStatus:async()=>{calls++;return new Promise(r=>resolve=r)}}});
 act(()=>{tree=Renderer.create(React.createElement(ServiceStatusControl,{id:'one',name:'Test',status:'pending'}));});
 const select=()=>tree.root.findByType('select');
 act(()=>select().props.onChange({target:{value:'active'}}));assert.equal(select().props.disabled,true);assert.equal(select().props.value,'pending');
 act(()=>select().props.onChange({target:{value:'cancelled'}}));assert.equal(calls,1);
 await act(async()=>resolve({ok:false,error:'Complete server setup first.'}));assert.equal(select().props.value,'pending');assert.match(tree.root.findByProps({role:'alert'}).children.join(''),/Complete server setup/);
 act(()=>select().props.onChange({target:{value:'suspended'}}));await act(async()=>resolve({ok:true,status:'suspended'}));assert.equal(select().props.value,'suspended');assert.equal(refreshes,2);
 act(()=>tree.update(React.createElement(ServiceStatusControl,{id:'one',name:'Test',status:'cancelled'})));assert.equal(select().props.value,'cancelled');act(()=>tree.unmount());
 const v=load('lib/hosting/validation.ts'),errors=load('lib/hosting/serviceStatus.ts');let allowed=true,rpcCalls=0,dbError=null;
 const {changeHostingServiceStatus}=load('lib/hosting/actions.ts',{'./serviceStatus':errors,'@/lib/security/rateLimit':{rateLimit:async()=>{}},'next/cache':{revalidatePath:()=>{}},'next/navigation':{},'@/lib/supabaseClient':{getSupabase:()=>({rpc:async(name,args)=>{rpcCalls++;assert.equal(name,'freelance_hq_hosting_set_service_status');assert.deepEqual(Object.keys(args).sort(),['p_actor','p_expected_status','p_service','p_status']);return {data:args.p_status,error:dbError}}})},'@/lib/site':{},'./auth':{requireHostingAdmin:async()=>{if(!allowed)throw Error('Access or MFA denied');return {id:'owner'}}},'./store':{},'./validation':v,'./probes':{}});
 const id='11111111-1111-4111-8111-111111111111';assert.equal((await changeHostingServiceStatus(id,'active','pending')).ok,true);
 dbError={message:'App Hosting server enforcement is not verified'};assert.match((await changeHostingServiceStatus(id,'active','pending')).error,/Complete its server setup/);
 dbError={message:'private database details'};assert.ok(!(await changeHostingServiceStatus(id,'active','pending')).error.includes('private'));
 allowed=false;const before=rpcCalls;await assert.rejects(changeHostingServiceStatus(id,'active','pending'),/MFA denied/);assert.equal(rpcCalls,before);
 console.log('PASS: creation choices, pending lock, inline save/error/refresh, admin gate and safe server errors.');
})().catch(e=>{console.error(e);process.exit(1)});
