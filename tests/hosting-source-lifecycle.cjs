const assert=require('node:assert/strict');
const path=require('node:path');
const esbuild=require('esbuild');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
(async()=>{
 const built=await esbuild.build({entryPoints:[path.resolve(__dirname,'../components/hosting/WebsiteSourcePanel.tsx')],tsconfig:path.resolve(__dirname,'../tsconfig.focused.json'),bundle:true,platform:'node',format:'cjs',write:false,packages:'external',alias:{'@':path.resolve(__dirname,'..')}});
 const output={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(require,output,output.exports);
 const {lifecycle,WebsiteSourcePanel}=output.exports;
 const none={state:'none',runtime:null,live_tree:null,live_since:null,previous_tree:null,rollback_available:false,health:null,live_verified:false};
 const live={state:'live',runtime:'static',live_tree:'a'.repeat(32),live_since:5,previous_tree:null,rollback_available:false,health:{ok:true,checked:5,status:200,root_status:200,tls:false},live_verified:true};
 const job=(operation,state)=>({id:'b'.repeat(32),digest:'c'.repeat(64),state,operation,source:'release',tree:null,created:1,result:null,live_verified:false});
 const tree=(state,runtime='static')=>({id:'a'.repeat(32),kind:'zip',state,files:1,bytes:1,created:1,manifest_sha256:'d'.repeat(64),runtime,publishable:['static','php'].includes(runtime)});
 const status=(patch)=>({service:'1',version:0,repository:null,jobs:[],trees:[],current:null,publication:none,published_to_web_root:false,live_verified:false,...patch});
 const label=(patch)=>lifecycle(status(patch)).label;
 assert.equal(label({}),'Not published');
 assert.equal(label({trees:[tree('staged')]}),'Uploaded — not published');
 assert.equal(label({trees:[tree('released')]}),'Staged — not published');
 assert.equal(label({trees:[tree('released','nextjs')]}),'Staged — not published');       // a Next.js source is never "live"
 assert.equal(label({jobs:[job('publish','queued')]}),'Awaiting owner approval');
 assert.equal(label({jobs:[job('deploy','applying')]}),'Staging files');
 assert.equal(label({jobs:[job('publish','applying')]}),'Publishing');
 assert.equal(label({jobs:[job('rollback','applying')]}),'Publishing');
 assert.equal(label({publication:live,published_to_web_root:true,live_verified:true,trees:[tree('released')]}),'Live on the server');
 assert.equal(label({jobs:[job('publish','failed')],trees:[tree('released')]}),'Failed — the previous site was restored');
 assert.equal(label({jobs:[job('publish','uncertain')]}),'Uncertain — review required');
 assert.equal(label({publication:{...none,state:'uncertain'}}),'Uncertain — review required');
 assert.equal(label({publication:{...live,live_verified:false,health:null},published_to_web_root:true}),'Not published');   // never live without the health proof
 assert.equal(label({publication:live,jobs:[job('publish','uncertain')],published_to_web_root:true,live_verified:true}),'Uncertain — review required');
 const html=renderToStaticMarkup(React.createElement(WebsiteSourcePanel,{scope:'client',services:[{id:'11111111-1111-4111-8111-111111111111',name:'Site'}],publishingEnabled:true}));
 assert.doesNotMatch(html,/Live on the server|Request publish|Request rollback/);
 assert.match(html,/needs separate owner approval|need separate owner approval/);
 console.log('PASS website lifecycle states: uploaded, staged, awaiting approval, publishing, live, failed, uncertain; no live claim without health proof');
})().catch(error=>{console.error(error);process.exitCode=1});
