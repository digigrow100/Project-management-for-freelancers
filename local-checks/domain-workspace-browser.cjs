// Synthetic browser acceptance only. No Supabase credentials or provider requests.
const fs=require('fs'),http=require('http'),assert=require('node:assert/strict'),os=require('os'),path=require('path'),esbuild=require('esbuild');
const {chromium}=require('playwright');
(async()=>{
const root=process.cwd(),out=path.join(root,'domain-browser-output');fs.mkdirSync(out,{recursive:true});
const action=`
const now=1793448000000;let current,serial=0;
let domain={name:'housemysite.com',expires:now+18*86400000,locked:true,renewOption:'auto',status:'active',glue:{glue_type:'DNS',ttl:3600,dns_main_list:[{record_type:'a',record_value1:'192.0.2.1',record_value2:''},{record_type:'txt',record_value1:'keep-this-record',record_value2:''}]}};
const records=[domain,...['freshloom.co.uk','rapidtyres.co.uk','luxoracleaning.co.uk','fsrrecovery.co.uk','jk-mould.co.uk','studioexample.com','shopdemo.co.uk'].map((name,i)=>({...domain,name,expires:now+(i<2?i+3:90+i)*86400000}))];
window.fixtureCalls=[];
export async function registrarAction(f){const a=f.get('action');window.fixtureCalls.push(a);await new Promise(r=>setTimeout(r,80));
 if(a==='list'){const search=f.get('search')||'',filter=f.get('filter');const rows=records.filter(d=>d.name.includes(search)&&(filter!=='expiring'||d.expires<=now+30*86400000)).map(d=>({name:d.name,details:d,category:d.expires<=now+30*86400000?'expiring':'other',synced_at:'2026-10-31'}));return {ok:true,rows,total:rows.length,pageSize:25,asOf:now,mode:'production',syncAt:'2026-10-31T12:00:00Z',needsReconcile:false,summary:{total:8,expiring:3,expired:0,autoRenew:8,locked:8}};}
 if(a==='details')return {ok:true,domain};
 if(a==='prepare'){current={id:'review-'+(++serial),domain:domain.name,intent:JSON.parse(f.get('intent')),before:domain,quote:null,mode:'production',expires:'2099-01-01T00:00:00Z'};return {ok:true,review:current};}
 if(a==='apply'){if(f.get('confirmation')!==domain.name)throw Error('Confirmation mismatch');const r=current.intent.record;
 if(current.intent.kind==='dns_remove')domain={...domain,glue:{...domain.glue,dns_main_list:domain.glue.dns_main_list.filter(x=>x.record_value1!==r.value)}};
 if(current.intent.kind==='dns_add')domain={...domain,glue:{...domain.glue,dns_main_list:[...domain.glue.dns_main_list,{record_type:r.type,record_value1:r.value,record_value2:''}]}};
 records[0]=domain;return {ok:true,message:'Change confirmed by synthetic provider.',domain};}
 return {ok:true,operations:[]};
}`;
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import {RegistrarPanel} from './components/hosting/RegistrarPanel';import {HostingNavigation} from './components/HostingNavigation';
createRoot(document.getElementById('root')).render(<div className="hosting-shell"><div className="fixture-layout"><aside className="fixture-sidebar"><h2>House My Site</h2><HostingNavigation/></aside><main className="theme-main"><p className="fixture-breadcrumb">Hosting / Domains</p><h1>Domains</h1><p className="fixture-subtitle">Manage renewals, DNS and domain security.</p><RegistrarPanel connected={true} initialMode="production" lastSync={null}/></main></div></div>);`;
const built=await esbuild.build({stdin:{contents:entry,loader:'tsx',resolveDir:root},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'fixtures',setup(build){
 build.onResolve({filter:/^@\/lib\/hosting\/registrar\/actions$/},()=>({path:'actions',namespace:'fixture'}));
 build.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:action,loader:'js'}));
 build.onResolve({filter:/^next\/link$/},()=>({path:'next-link',namespace:'link'}));build.onLoad({filter:/.*/,namespace:'link'},()=>({contents:`import React from 'react';export default function Link({children,prefetch,...p}){return React.createElement('a',p,children)}`,loader:'js',resolveDir:root}));
 build.onResolve({filter:/^next\/navigation$/},()=>({path:'nav',namespace:'nav'}));build.onLoad({filter:/.*/,namespace:'nav'},()=>({contents:`export const usePathname=()=>'/hosting/registrar';`,loader:'js'}));
 build.onResolve({filter:/^@\//},args=>{const base=path.join(root,args.path.slice(2));const target=['.tsx','.ts'].map(e=>base+e).find(fs.existsSync);return target?{path:target}:undefined;});
}}]});
const reset=`*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif}button,input,select,textarea{font:inherit}button{cursor:pointer;background:none;border:0}a{text-decoration:none}h1,h2,h3,p{margin:0}button:disabled{cursor:default}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}.fixture-layout{display:flex;min-height:100vh;background:#f6f8fc}.fixture-sidebar{width:248px;flex-shrink:0;padding:25px 16px;background:#0d1e38}.fixture-sidebar h2{color:white;font-size:20px;margin:0 8px 30px}.fixture-layout main{flex:1;min-width:0;padding:24px 30px}.fixture-layout h1{font-size:30px;margin:24px 0 8px}.fixture-subtitle{color:#8291a6;margin-bottom:25px}.fixture-breadcrumb{color:#718199;font-size:13px}.shrink-0{flex-shrink:0}.flex-1{flex:1}@media(max-width:700px){.fixture-sidebar{display:none}.fixture-layout main{padding:16px}.fixture-layout h1{margin-top:15px}}`;
const css=reset+fs.readFileSync('app/(app)/hosting/hosting.css','utf8');
const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script>${built.outputFiles[0].text}</script></body></html>`;
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(html)});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:chromium.executablePath()});const page=await browser.newPage({viewport:{width:1600,height:1100}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:'+server.address().port);await page.getByRole('button',{name:'Manage housemysite.com',exact:true}).waitFor();
 assert.equal(await page.locator('input[type=password]').count(),0);assert.equal(await page.locator('.hms-domain-stat').count(),4);
 await page.screenshot({path:path.join(out,'domains-list.png'),fullPage:true});
 await page.getByRole('button',{name:'Manage housemysite.com',exact:true}).click();await page.getByRole('complementary',{name:'Domain details'}).waitFor();
 const layout=await page.locator('.hms-domain-workspace').evaluate(el=>getComputedStyle(el).gridTemplateColumns);assert.equal(layout.split(' ').length,2);
 await page.screenshot({path:path.join(out,'domains-split.png'),fullPage:true});
 await page.getByRole('button',{name:'DNS records',exact:true}).click();await page.getByRole('dialog',{name:'DNS records'}).waitFor();
 const modal=page.getByRole('dialog',{name:'DNS records'});assert.equal(await modal.evaluate(el=>el.open),true);assert.equal(await page.evaluate(()=>window.fixtureCalls.includes('apply')),false);
 await page.screenshot({path:path.join(out,'domains-dns.png'),fullPage:true});
 await page.getByRole('button',{name:'Edit @ A record',exact:true}).click();await page.getByRole('textbox',{name:'DNS record value',exact:true}).fill('203.0.113.8');
 await page.getByRole('button',{name:'Review original removal',exact:true}).click();await page.getByRole('textbox',{name:'Type domain to confirm'}).fill('housemysite.com');await page.getByRole('button',{name:'Confirm this change',exact:true}).click();
 await page.getByText(/Step 2 of 2/).waitFor();assert.equal(await page.evaluate(()=>window.fixtureCalls.filter(a=>a==='apply').length),1);
 await page.getByRole('button',{name:'Review replacement',exact:true}).click();await page.getByRole('textbox',{name:'Type domain to confirm'}).fill('housemysite.com');await page.getByRole('button',{name:'Confirm this change',exact:true}).click();
 await page.getByRole('cell',{name:'203.0.113.8',exact:true}).waitFor();assert.equal(await page.getByRole('cell',{name:'keep-this-record',exact:true}).count(),1);
 await page.waitForFunction(()=>!document.querySelector('[aria-label="Close DNS editor"]').disabled);
 await page.keyboard.press('Escape');await modal.waitFor({state:'hidden'});
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'DNS records',exact:true}).click();await modal.waitFor();
 const bounds=await modal.boundingBox();assert.ok(bounds.width<=390);await page.screenshot({path:path.join(out,'domains-mobile-dns.png'),fullPage:true});
 await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
 assert.deepEqual(errors,[]);console.log('PASS: actual Chromium grouped list, summary, split layout, native modal, two separately confirmed DNS changes, unrelated record preservation, Escape close, mobile fit and no page errors.');console.log('Synthetic screenshots: '+out);
}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1)});
