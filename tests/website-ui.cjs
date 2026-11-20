const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const React=require('react'),{act,create}=require('react-test-renderer');
function load(file,mocks={}){const exports={};const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;const out={exports};vm.runInNewContext(source,{module:out,exports,crypto:require('node:crypto').webcrypto,navigator:mocks.__navigator??{},FormData,fetch:async()=>({ok:true,json:async()=>({ok:true})}),require:n=>Object.hasOwn(mocks,n)?mocks[n]:n==='react-dom'?{useFormStatus:()=>({pending:false})}:n==='next/link'?{default:({children,...props})=>React.createElement('a',props,children)}:n==='next/navigation'?{useRouter:()=>({refresh(){}})}:n==='@/lib/hosting/websites/types'?{price:(p,c)=>c+' '+(p/100).toFixed(2)}:require(n)});return exports;}
const settings={enabled:true,currency:'GBP',website_price_minor:1500,extra_gb_month_minor:200,revision:1,bank_details:'Fixture bank — not a real account'};
test('Add New Website opens a native accessible bank-transfer dialog with optional reference/proof and required paid confirmation',()=>{
 const {AddWebsiteDialog}=load('components/hosting/dashboard/AddWebsiteDialog.tsx');let opened=0,closed=0,tree;
 act(()=>{tree=create(React.createElement(AddWebsiteDialog,{settings,credits:0,pending:false}),{createNodeMock:e=>e.type==='dialog'?{showModal(){opened++;},close(){closed++;}}:null});});
 act(()=>tree.root.findAllByType('button')[0].props.onClick());assert.equal(opened,1);const dialog=tree.root.findByType('dialog');assert(dialog.props['aria-labelledby']);
 assert.equal(tree.root.findAllByType('input').find(i=>i.props.type==='radio').props.defaultChecked,true);assert.equal(tree.root.findAllByType('input').find(i=>i.props.name==='bank_sent').props.required,true);
 assert.equal(tree.root.findAllByType('input').find(i=>i.props.name==='proof').props.required,undefined);assert.equal(tree.root.findAllByType('input').find(i=>i.props.name==='reference').props.required,undefined);
 act(()=>tree.root.findAllByType('button').find(b=>b.props['aria-label']).props.onClick());assert.equal(closed,1);act(()=>tree.unmount());
});
test('approved clients continue to website setup; pending clients see a status and read-only accounts cannot start checkout',()=>{
 const {AddWebsiteDialog}=load('components/hosting/dashboard/AddWebsiteDialog.tsx');let tree;
 act(()=>{tree=create(React.createElement(AddWebsiteDialog,{settings,credits:1,pending:false}));});assert.equal(tree.root.findByType('a').props.href,'/client/apps/new');act(()=>tree.unmount());
 act(()=>{tree=create(React.createElement(AddWebsiteDialog,{settings,credits:0,pending:true,readOnly:true}));});assert.equal(tree.root.findAllByType('button')[0].props.disabled,true);assert.equal(tree.root.findAllByType('form').length,0);assert.equal(tree.root.findByType('a').props.href,'/client/website-billing');act(()=>tree.unmount());
});
test('website setup offers only Upload/GitHub, gates optional storage consent and submits one durable creation key',async()=>{
 const {NewAppWizard}=load('components/hosting/dashboard/NewAppWizard.tsx');let tree,submitted;
 act(()=>{tree=create(React.createElement(NewAppWizard,{action:async f=>{submitted=Object.fromEntries(f);},credits:[{id:'fixture-credit',currency:'GBP',extra_gb_month_minor:200,max_extra_gb:1}]}));});
 assert.deepEqual(tree.root.findAllByType('input').filter(i=>i.props.type==='radio').map(i=>i.props.value),['upload','git']);
 act(()=>tree.root.findAllByType('select').find(s=>s.props.name==='extra_gb').props.onChange({target:{value:'1'}}));assert.equal(tree.root.findAllByType('input').find(i=>i.props.name==='storage_consent').props.required,true);
 const data=new FormData();await act(async()=>{await tree.root.findByType('form').props.action(data);});assert.match(submitted.request_key,/^[a-f0-9-]{36}$/);const key=submitted.request_key;await act(async()=>{await tree.root.findByType('form').props.action(new FormData());});assert.equal(submitted.request_key,key);act(()=>tree.unmount());
});

test('domain form locks overlapping submissions and shows a safe error without losing DNS instructions',async()=>{
 const {DomainActionForm}=load('components/hosting/dashboard/DomainActionForm.tsx');let release,calls=0,tree;
 act(()=>{tree=create(React.createElement(DomainActionForm,{label:'Verify DNS',action:async()=>{calls++;await new Promise(r=>release=r);return {ok:false,error:'Check DNS records, then verify again.'};}},React.createElement('input',{name:'hostname',value:'example.com',readOnly:true})));});
 // A browser FormData accepts a form; the Node fixture passes no element.
 let pending;act(()=>{pending=tree.root.findByType('form').props.onSubmit({preventDefault(){},currentTarget:undefined});});
 assert.equal(tree.root.findByType('button').props.disabled,true);
 await act(async()=>{await tree.root.findByType('form').props.onSubmit({preventDefault(){},currentTarget:undefined});release();await pending;});
 assert.equal(calls,1);assert.equal(tree.root.findByType('p').props.role,'alert');assert.equal(tree.root.findByType('button').props.disabled,false);act(()=>tree.unmount());
});

test('DNS copy controls report success and failure; storage meter separates the included GB from measured extra usage',async()=>{
 let copied='';const {CopyValue}=load('components/hosting/dashboard/CopyValue.tsx',{__navigator:{clipboard:{writeText:async value=>{copied=value;}}}});let tree;
 act(()=>{tree=create(React.createElement(CopyValue,{label:'A value',value:'62.171.130.156'}));});
 await act(async()=>{await tree.root.findByType('button').props.onClick();});assert.equal(copied,'62.171.130.156');assert.equal(tree.root.findByType('button').children[0],'Copied');act(()=>tree.unmount());
 const Fallback=load('components/hosting/dashboard/CopyValue.tsx').CopyValue;act(()=>{tree=create(React.createElement(Fallback,{label:'TXT name',value:'_hms-verify.example.com'}));});await act(async()=>{await tree.root.findByType('button').props.onClick();});assert.equal(tree.root.findAllByType('span').find(s=>s.props.role==='status').children[0],'Select and copy the text');act(()=>tree.unmount());
 const {StorageMeter}=load('components/hosting/dashboard/StorageMeter.tsx',{'@/lib/hosting/websites/types':{gbLabel:value=>(Number(value)/1e9).toFixed(1)+' GB'}});
 act(()=>{tree=create(React.createElement(StorageMeter,{used:1500000000,limit:2000000000}));});
 assert.equal(tree.root.findByType('progress').props.max,1000000000);assert.equal(tree.root.findByType('progress').props.value,1000000000);assert.match(tree.root.findByType('small').children.join(''),/0.5 GB extra used/);act(()=>tree.unmount());
});
