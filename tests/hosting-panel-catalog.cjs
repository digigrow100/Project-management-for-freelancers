const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');

let denied=false,scopeReads=0;
const blocked=new Error('access denied');
function loader(){
 const cache=new Map();
 function load(file){
  file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;
  const module={exports:{}};cache.set(file,module);
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  function localRequire(name){
   if(name==='server-only')return {};
   if(name==='next/link')return ({href,prefetch,children,...props})=>React.createElement('a',{href,...props},children);
   if(name==='@/lib/hosting/auth')return {requireHostingAdmin:async()=>{if(denied)throw blocked;return {id:'owner'};}};
   if(name==='@/lib/hosting/email/actions')return {emailWorkspace:async()=>({domains:[],hosted:[],settings:{},servicesEnabled:false})};
   if(name==='@/lib/hosting/managed'||name==='@/lib/hosting/backups')return {serviceScope:async()=>{scopeReads++;throw Error('must not load unconfigured service');},backupContext:async()=>{scopeReads++;throw Error('must not load unconfigured backup');}};
   if(name.startsWith('@/components/hosting/')&&!name.endsWith('/PanelGuide'))return new Proxy({},{get:()=>()=>React.createElement('div',null,'MANAGED_CONTROL')});
   if(name.startsWith('@/')){const base=name.slice(2);return load(['.ts','.tsx'].map(ext=>base+ext).find(fs.existsSync));}
   return require(name);
  }
  vm.runInNewContext(code,{module,exports:module.exports,require:localRequire,process,console},{filename:file});return module.exports;
 }
 return load;
}

(async()=>{
 const load=loader();
 const {PANEL_GUIDES,PANEL_GROUPS,panelFeatureState}=load('lib/hosting/panelCatalog.ts');
 const {HOSTING_SECTIONS}=load('lib/hostingWorkspace.ts');
 assert.equal(Object.keys(PANEL_GUIDES).length,HOSTING_SECTIONS.length);
 const keys=new Set(HOSTING_SECTIONS.map(x=>x.key));
 for(const section of HOSTING_SECTIONS){const guide=PANEL_GUIDES[section.key];assert.ok(guide.items.length&&guide.next);assert.ok(PANEL_GROUPS.includes(guide.group));for(const related of guide.related)assert.ok(keys.has(related));}
 assert.equal(panelFeatureState('sources',{HOSTING_SOURCES_ENABLED:'approved'}).enabled,false);
 assert.equal(panelFeatureState('nextjs',{HOSTING_SERVICES_ENABLED:'approved',HOSTING_SOURCES_ENABLED:'approved',HOSTING_NEXTJS_ENABLED:'approved'}).enabled,false);
 assert.equal(panelFeatureState('backups',{HOSTING_BACKUP_PORTAL_ENABLED:'approved',HOSTING_BACKUP_OWNER_ID:'owner'}).enabled,false);
 assert.equal(panelFeatureState('backups',{HOSTING_BACKUP_PORTAL_ENABLED:'true'}).enabled,false);
 assert.equal(panelFeatureState('backups',{HOSTING_BACKUP_PORTAL_ENABLED:'true',HOSTING_BACKUP_OWNER_ID:'owner'}).enabled,true);
 const enabled={HOSTING_SERVICES_ENABLED:'approved',HOSTING_SOURCES_ENABLED:'approved',HOSTING_PUBLISHING_ENABLED:'approved',HOSTING_GITHUB_ENABLED:'approved',HOSTING_AUTODEPLOY_ENABLED:'approved'};
 assert.equal(panelFeatureState('autodeploy',enabled).enabled,true);
 assert.equal(panelFeatureState('autodeploy',{...enabled,HOSTING_GITHUB_ENABLED:''}).enabled,false);
 const saved={...process.env};
 try{
  for(const key of Object.keys(process.env))if(key.startsWith('HOSTING_'))delete process.env[key];
  process.env.HOSTING_PORTAL_KEY='SECRET_SENTINEL';
  const ui=load('components/hosting/PanelGuide.tsx');
  const html=renderToStaticMarkup(React.createElement(ui.HostingControlCenter));
  for(const section of HOSTING_SECTIONS)assert.ok(html.includes(`href="/hosting/${section.key}"`));
  assert.ok(!html.includes('SECRET_SENTINEL'));
  assert.match(renderToStaticMarkup(React.createElement(ui.IntegrationOverview)),/do not confirm a running worker/);
  for(const section of ['sources','email','databases','forms','backups']){
   const Page=loader()(`app/(app)/hosting/${section}/page.tsx`).default;
   const content=renderToStaticMarkup(await Page());
   if(section==='email'){assert.match(content,/Professional email/);}else{assert.match(content,/Connection setup needed/);assert.ok(!content.includes('MANAGED_CONTROL'));}assert.ok(!content.includes('SECRET_SENTINEL'));
   denied=true;await assert.rejects(Page(),e=>e===blocked);denied=false;
  }
  assert.equal(scopeReads,0,'Unconfigured pages must not touch provider scopes or owner-bound backup context');
 }finally{for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);}
 console.log('PASS: all tabs linked, feature dependencies, exact backup flag, no secret rendering, disabled-page safety and owner authorization.');
})().catch(error=>{console.error(error);process.exitCode=1;});
