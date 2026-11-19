const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const {PGlite}=require('@electric-sql/pglite');
const {NextRequest}=require('next/server');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const migrationFile='supabase/migrations/20261119134937_retire_human_extensions.sql';
const migration=fs.readFileSync(migrationFile,'utf8');
const tables=[...migration.matchAll(/^    '(freelance_hq_[a-z_]+)'/gm)].map(m=>m[1]);
function load(file,mocks={}){
 const mod={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(code,{module:mod,exports:mod.exports,process,Headers,URL,Date,Intl,require:n=>Object.hasOwn(mocks,n)?mocks[n]:require(n)});
 return mod.exports;
}
function middleware(){
 const rules=load('lib/retiredHumanExtensions.ts');
 const network=load('lib/security/adminNetworkPolicy.ts');
 return load('middleware.ts',{
  './lib/retiredHumanExtensions':rules,'./lib/security/adminNetworkPolicy':network,
  './lib/security/cookies':{secureAuthCookie:x=>x},
  './lib/hosting/portalHost':{isHostingPortalHost:()=>false,HOSTING_ROBOTS_TAG:'noindex',isHostingProbePath:()=>false},
  '@supabase/ssr':{createServerClient:()=>{throw Error('Retired routes must never access Auth');}},
 }).middleware;
}
test('removed pages, downloads and all API methods return 404 before auth or network access',async()=>{
 const run=middleware();
 const paths=['/extensions','/admin/time-tracking','/admin/employee-activity','/admin/employee-activity/screen/test','/admin/whatsapp-bridge','/client-chat','/api/extension/pair','/api/extension/activity','/api/extension/devices','/api/extension/screen-share/signal','/api/whatsapp-bridge/requests','/api/client-chat/test/send','/api/presence','/api/presence/team','/api/admin/employee-activity','/api/admin/activity-settings','/api/admin/project-domain-mappings','/api/admin/screen-share','/api/admin/whatsapp-bridge/pairing','/api/cron/activity-retention','/downloads/freelance-hq-chrome-extension.zip','/downloads/freelance-hq-whatsapp-bridge.zip'];
 for(const path of paths)for(const method of ['GET','POST','DELETE','OPTIONS']){
  const response=await run(new NextRequest('https://web.housemysite.com'+path,{method,headers:{origin:'https://other.invalid'}}));
  assert.equal(response.status,404,path+' '+method);assert.equal(response.headers.get('location'),null);assert.match(response.headers.get('cache-control'),/no-store/);
 }
 for(const path of ['/api/seo-bots/tasks','/seo-bots','/seo-bots/login'])assert.equal((await run(new NextRequest('https://web.housemysite.com'+path))).status,200,path);
 const {isRetiredHumanExtensionPath:retired}=load('lib/retiredHumanExtensions.ts');
 for(const path of ['/team','/admin/my-tasks','/api/admin/task-activity','/api/seo-bots/tasks','/api/extension-example','/extensions-example'])assert.equal(retired(path),false,path);
});
test('archive preserves every historical row and FK, removes API-schema tables and denies application roles',async()=>{
 const db=new PGlite();
 try{
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
  assert.equal(tables.length,22);
  for(const table of tables)await db.exec(`CREATE TABLE public.${table}(id integer PRIMARY KEY, value text); INSERT INTO public.${table} VALUES(1,'historical fixture'); GRANT ALL ON public.${table} TO anon, authenticated, service_role;`);
  await db.exec('ALTER TABLE public.freelance_hq_whatsapp_message_shares ADD COLUMN message_id integer REFERENCES public.freelance_hq_whatsapp_messages(id); UPDATE public.freelance_hq_whatsapp_message_shares SET message_id=1; CREATE TABLE public.freelance_hq_seo_bot_tasks(id integer PRIMARY KEY); INSERT INTO public.freelance_hq_seo_bot_tasks VALUES(7); GRANT SELECT ON public.freelance_hq_seo_bot_tasks TO service_role;');
  await db.exec(migration);await db.exec(migration);
  for(const table of tables){
   assert.equal((await db.query(`SELECT to_regclass('public.${table}') AS name`)).rows[0].name,null);
   assert.equal((await db.query(`SELECT count(*)::int AS count FROM freelance_hq_retired_extensions.${table}`)).rows[0].count,1);
   const row=(await db.query(`SELECT relrowsecurity FROM pg_class WHERE oid='freelance_hq_retired_extensions.${table}'::regclass`)).rows[0];assert.equal(row.relrowsecurity,true);
   for(const role of ['anon','authenticated','service_role']){
    const grants=(await db.query(`SELECT has_schema_privilege('${role}','freelance_hq_retired_extensions','USAGE') AS schema_access, has_table_privilege('${role}','freelance_hq_retired_extensions.${table}','SELECT,INSERT,UPDATE,DELETE') AS table_access`)).rows[0];
    assert.equal(grants.schema_access,false);assert.equal(grants.table_access,false);
   }
  }
  assert.equal((await db.query("SELECT confrelid::regclass::text AS target FROM pg_constraint WHERE conrelid='freelance_hq_retired_extensions.freelance_hq_whatsapp_message_shares'::regclass AND contype='f'")).rows[0].target,'freelance_hq_retired_extensions.freelance_hq_whatsapp_messages');
  assert.deepEqual((await db.query('SELECT * FROM public.freelance_hq_seo_bot_tasks')).rows,[{id:7}]);
  assert.equal((await db.query("SELECT has_table_privilege('service_role','public.freelance_hq_seo_bot_tasks','SELECT') AS allowed")).rows[0].allowed,true);
 }finally{await db.close();}
});
test('archive tolerates absent retired tables and aborts collisions without overwriting rows',async()=>{
 const db=new PGlite();
 try{
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');await db.exec(migration);
  await db.exec("CREATE TABLE public.freelance_hq_activity_logs(id integer); INSERT INTO public.freelance_hq_activity_logs VALUES(1); CREATE TABLE freelance_hq_retired_extensions.freelance_hq_activity_logs(id integer); INSERT INTO freelance_hq_retired_extensions.freelance_hq_activity_logs VALUES(2);");
  await assert.rejects(db.exec(migration),/archive collision/);await db.exec('ROLLBACK;');
  assert.equal((await db.query('SELECT id FROM public.freelance_hq_activity_logs')).rows[0].id,1);
  assert.equal((await db.query('SELECT id FROM freelance_hq_retired_extensions.freelance_hq_activity_logs')).rows[0].id,2);
 }finally{await db.close();}
});
test('admin overview retains financial/project/task controls and has no monitoring cards or polling',()=>{
 const {AdminDashboardOverview}=load('components/AdminDashboardOverview.tsx',{
  'next/link':{default:({children,...props})=>React.createElement('a',props,children)},
  '@/lib/date':{businessMonthKey:()=> '2026-11'},'@/components/DomainsPanel':{DomainsPanel:()=>null},
 });
 const html=renderToStaticMarkup(React.createElement(AdminDashboardOverview,{projects:[],progressMap:{},openTasks:[],completedTasks:[],invoices:[],invoiceItems:{},payments:[],paymentPlans:[],domains:[],domainClients:[],renewals:[],personalTasks:[],assigneesByProject:{},websitesByDomainId:{},hasDynadotApiKey:false}));
 for(const text of ['Total Received','Outstanding Invoices','Active Projects','Task Queue','My Tasks'])assert(html.includes(text),text);
 for(const text of ['Team Performance','Team Workload','My Work Time','WhatsApp'])assert(!html.includes(text),text);
 for(const file of ['app/(app)/admin/page.tsx','app/(app)/layout.tsx','components/MemberFocusDashboard.tsx','components/Sidebar.tsx','components/MobileNav.tsx','components/AdminDashboardOverview.tsx']){
  const source=fs.readFileSync(file,'utf8');assert.doesNotMatch(source,/\/api\/(?:extension|whatsapp-bridge|presence)|AdminMyWorkTime|WhatsAppBridge|ExtensionHealthBanner|EmployeeActivityOverview|initialExtensionWork/);
 }
 const cron=JSON.parse(fs.readFileSync('vercel.json','utf8')).crons;assert(!cron.some(c=>c.path.includes('activity-retention')));
 assert(cron.some(c=>c.path==='/api/cron/hosting-renewals'));assert(cron.some(c=>c.path==='/api/cron/monthly-invoices'));
 for(const path of ['chrome-extension','whatsapp-bridge-extension','app/api/extension','app/api/whatsapp-bridge','app/api/presence','app/api/client-chat','public/downloads/freelance-hq-chrome-extension.zip','public/downloads/freelance-hq-whatsapp-bridge.zip'])assert(!fs.existsSync(path),path);
});
