const path=require('path'),fs=require('fs'),vm=require('vm'),ts=require('typescript'),React=require('react'),Renderer=require('react-test-renderer'),assert=require('node:assert/strict'),{renderToStaticMarkup}=require('react-dom/server');const {act}=Renderer;
let calls=[],resolve,currentReview,dialogShows=0;const cache=new Map();
const details={name:'example.com',expires:1799999999000,locked:true,renewOption:'auto',status:'active',glue:{glue_type:'DNS',dns_main_list:[{record_type:'a',record_value1:'192.0.2.1',record_value2:''},{record_type:'caa',record_value1:'opaque-preserved',record_value2:'issue'}]}};
async function action(f){
 calls.push(f);const kind=f.get('action');if(kind==='connect')return new Promise(r=>resolve=r);
 if(kind==='list')return {ok:true,rows:[{name:details.name,details,synced_at:'2026-10-31',category:'other'}],total:1,pageSize:25,asOf:1793448000000,syncAt:null,needsReconcile:false,mode:'production',summary:{total:1,expiring:0,expired:0,autoRenew:1,locked:1}};
 if(kind==='details')return {ok:true,domain:details};
 if(kind==='prepare'){currentReview={id:require('crypto').randomUUID(),domain:details.name,intent:JSON.parse(f.get('intent')),before:details,quote:null,expires:'2099-01-01T00:00:00Z',mode:'production'};return {ok:true,review:currentReview};}
 if(kind==='apply'){
  assert.equal(f.get('confirmation'),details.name);const change=currentReview.intent;
  if(change.kind==='dns_remove')details.glue={...details.glue,dns_main_list:details.glue.dns_main_list.filter(r=>r.record_value1!==change.record.value)};
  if(change.kind==='dns_add')details.glue={...details.glue,dns_main_list:[...details.glue.dns_main_list,{record_type:change.record.type,record_value1:change.record.value,record_value2:''}]};
  return {ok:true,message:'Change confirmed',domain:{...details}};
 }
 return {ok:true,operations:[]};
}
function load(file,mocks={}){
 if(cache.has(file)&&!Object.keys(mocks).length)return cache.get(file);
 const m={exports:{}};
 function localRequire(n){
  if(n in mocks)return mocks[n];if(n==='server-only')return {};
  if(n==='next/link')return ({href,prefetch,children,...props})=>React.createElement('a',{href,...props},children);
  if(n==='@/lib/hosting/registrar/actions')return {registrarAction:action};
  if(n.startsWith('.')||n.startsWith('@/')){const base=n.startsWith('@/')?n.slice(2):path.join(path.dirname(file),n);return load(['.ts','.tsx'].map(e=>base+e).find(fs.existsSync));}
  return require(n);
 }
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,require:localRequire,FormData,setTimeout});
 if(!Object.keys(mocks).length)cache.set(file,m.exports);return m.exports;
}

const {RegistrarPanel}=load('components/hosting/RegistrarPanel.tsx'),{RegistrarConnectionPanel}=load('components/hosting/RegistrarConnectionPanel.tsx'),{HostingSettingsTabs}=load('components/hosting/HostingSettingsTabs.tsx');
(async()=>{
let tree;act(()=>{tree=Renderer.create(React.createElement(RegistrarPanel,{connected:false,initialMode:'production',lastSync:null}));});assert.equal(calls.length,0);assert.equal(tree.root.findAllByType('form').length,0);assert.equal(tree.root.findAllByType('input').filter(x=>x.props.type==='password').length,0);assert.ok(tree.root.findAllByType('a').every(a=>a.props.href==='/hosting/settings/domains'));act(()=>tree.unmount());
act(()=>{tree=Renderer.create(React.createElement(RegistrarConnectionPanel,{connected:false,initialMode:'production',verifiedAt:null}));});assert.equal(calls.length,0);const passwords=tree.root.findAllByType('input').filter(x=>x.props.type==='password');assert.equal(passwords.length,2);assert.ok(passwords.every(x=>x.props.defaultValue===undefined&&x.props.value===undefined));assert.equal(tree.root.findByProps({name:'mode'}).props.defaultValue,'production');
const f=new FormData;f.set('action','connect');f.set('key','private-key-fixture');f.set('secret','private-secret-fixture');f.set('mode','sandbox');const submit=tree.root.findByType('form').props.action;
act(()=>{submit(f);submit(f);});assert.equal(calls.length,1,'double submit must not test/save twice');assert.ok(tree.root.findAllByType('button').some(x=>x.props.disabled));await act(async()=>resolve({ok:false,error:'Credentials rejected'}));assert.match(tree.root.findByProps({role:'alert'}).children.join(''),/Credentials rejected/);assert.ok(!JSON.stringify(tree.toJSON()).includes('private-secret'));
act(()=>tree.root.findByType('form').props.action(f));await act(async()=>resolve({ok:true,mode:'sandbox'}));assert.equal(tree.root.findAllByType('input').length,0,'successful save removes credential fields');assert.match(JSON.stringify(tree.toJSON()),/Sandbox account/);assert.equal(tree.root.findByProps({href:'/hosting/registrar'}).props.href,'/hosting/registrar');
act(()=>tree.root.findAllByType('button').find(x=>x.children.includes('Update connection')).props.onClick());assert.equal(tree.root.findByProps({name:'mode'}).props.defaultValue,'sandbox','updates keep current account mode');assert.ok(tree.root.findAllByType('input').filter(x=>x.props.type==='password').every(x=>x.props.value===undefined&&x.props.defaultValue===undefined));act(()=>tree.root.findAllByType('button').find(x=>x.children.includes('Cancel')).props.onClick());assert.equal(tree.root.findAllByType('input').length,0);act(()=>tree.unmount());
calls=[];await act(async()=>{tree=Renderer.create(React.createElement(RegistrarPanel,{connected:true,initialMode:'production',lastSync:null}),{createNodeMock:element=>element.type==='dialog'?{open:false,showModal(){this.open=true;dialogShows++;},close(){this.open=false;}}:null});});
assert.deepEqual(calls.map(f=>f.get('action')),['list']);assert.equal(tree.root.findAllByType('input').filter(x=>x.props.type==='password').length,0);
assert.match(JSON.stringify(tree.toJSON()),/Total domains/);assert.match(JSON.stringify(tree.toJSON()),/Sync domains/);
await act(async()=>tree.root.findByProps({'aria-label':'Manage example.com'}).props.onClick());assert.equal(tree.root.findAllByProps({'aria-label':'Domain details'}).length,1);assert.equal(dialogShows,0);
const {DomainDetailsPanel}=load('components/hosting/DomainDetailsPanel.tsx'),{DomainDnsDialog,editableDnsRecord}=load('components/hosting/DomainDnsDialog.tsx'),{DomainReview}=load('components/hosting/DomainReview.tsx');
act(()=>tree.root.findByType(DomainDetailsPanel).props.onTab('renewal'));assert.match(JSON.stringify(tree.toJSON()),/Review renewal price/);
act(()=>tree.root.findByType(DomainDetailsPanel).props.onTab('overview'));act(()=>tree.root.findByType(DomainDetailsPanel).props.onDns());assert.equal(dialogShows,1,'DNS uses a native modal');
assert.ok(!calls.some(f=>['connect','apply'].includes(f.get('action'))),'viewing DNS never writes');
assert.equal(editableDnsRecord({record_type:'caa',record_value1:'opaque-preserved',record_value2:'issue'}),null,'unsupported record metadata must not be discarded');
act(()=>tree.root.findByProps({'aria-label':'Edit @ A record'}).props.onClick());act(()=>tree.root.findByProps({'aria-label':'DNS record value'}).props.onChange({target:{value:'203.0.113.8'}}));
await act(async()=>tree.root.findAllByType('form').find(f=>f.props.className?.includes('hms-dns-form')).props.onSubmit({preventDefault(){}}));assert.equal(currentReview.intent.kind,'dns_remove');assert.equal(calls.filter(f=>f.get('action')==='apply').length,0);
await act(async()=>tree.root.findByType(DomainReview).props.onApply('example.com'));assert.match(JSON.stringify(tree.toJSON()),/Step 2 of 2/);assert.equal(calls.filter(f=>f.get('action')==='apply').length,1,'replacement is never added automatically');
await act(async()=>tree.root.findAllByType('form').find(f=>f.props.className?.includes('hms-dns-form')).props.onSubmit({preventDefault(){}}));assert.equal(currentReview.intent.kind,'dns_add');assert.equal(currentReview.intent.record.value,'203.0.113.8');
await act(async()=>tree.root.findByType(DomainReview).props.onApply('example.com'));assert.equal(calls.filter(f=>f.get('action')==='apply').length,2);assert.ok(details.glue.dns_main_list.some(r=>r.record_value1==='opaque-preserved'));
assert.ok(details.glue.dns_main_list.some(r=>r.record_value1==='203.0.113.8'));act(()=>tree.root.findByProps({'aria-label':'Close DNS editor'}).props.onClick());assert.equal(tree.root.findByType(DomainDnsDialog).props.open,false);act(()=>tree.unmount());

const nav=renderToStaticMarkup(React.createElement(HostingSettingsTabs,{active:'domains'}));assert.match(nav,/href="\/hosting\/settings"/);assert.match(nav,/href="\/hosting\/settings\/domains" aria-current="page"/);
let denied=false,reads=0,selected='';
function getSupabase(){
 reads++;
 return {from:()=>({select:columns=>{
  selected=columns;
  return {eq:()=>({maybeSingle:async()=>({error:null,data:{mode:'production',verified_at:null,sync_at:null,credentials_encrypted:'must-never-leave-server'}})})};
 }})};
}
const summary=load('lib/hosting/registrar/settings.ts',{'@/lib/hosting/auth':{requireHostingAdmin:async()=>{if(denied)throw Error('MFA denied');}},'@/lib/supabaseClient':{getSupabase}});
const meta=await summary.registrarSummary();assert.equal(selected,'mode,verified_at,sync_at');assert.ok(!JSON.stringify(meta).includes('credentials'));denied=true;const before=reads;await assert.rejects(summary.registrarSummary(),/MFA denied/);assert.equal(reads,before,'denied owner cannot read metadata');denied=false;
const mocks={'@/lib/hosting/registrar/settings':summary,'@/components/hosting/RegistrarPanel':{RegistrarPanel},'@/components/hosting/RegistrarConnectionPanel':{RegistrarConnectionPanel},'@/components/hosting/HostingSettingsTabs':{HostingSettingsTabs}};
const domainsPage=load('app/(app)/hosting/registrar/page.tsx',mocks).default,settingsPage=load('app/(app)/hosting/settings/domains/page.tsx',mocks).default;
const domainHtml=renderToStaticMarkup(await domainsPage());assert.ok(!domainHtml.includes('type="password"'));assert.ok(!domainHtml.includes('name="key"'));assert.match(domainHtml,/\/hosting\/settings\/domains/);
const settingsHtml=renderToStaticMarkup(await settingsPage());assert.match(settingsHtml,/name="key"/);assert.match(settingsHtml,/name="secret"/);assert.ok(!settingsHtml.includes('must-never-leave-server'));denied=true;await assert.rejects(settingsPage(),/MFA denied/);
console.log('PASS: settings-only credentials, disconnected/connected domain routes, update/cancel, preserved mode, one-shot pending form, domain tools and admin-only metadata.');
})().catch(e=>{console.error(e);process.exit(1)});
