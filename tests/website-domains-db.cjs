const {PGlite}=require('@electric-sql/pglite'),fs=require('node:fs'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
(async()=>{const db=new PGlite();try{
 await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table freelance_hq_profiles(id uuid primary key,role text);create table freelance_hq_clients(id uuid primary key);");
 for(const name of ['20261020202238_hosting_management','20261031083515_hosting_dynadot_registrar','20261118180000_hosting_apps','20261119142249_website_bank_payments_and_storage','20261120202602_website_domains_and_preview'])await db.exec(fs.readFileSync('supabase/migrations/'+name+'.sql','utf8'));
 const [admin,user,other,client,foreign,credit,payment,version]=Array.from({length:8},randomUUID);
 await db.query('insert into auth.users values($1),($2),($3)',[admin,user,other]);await db.query("insert into freelance_hq_profiles values($1,'admin')",[admin]);
 await db.query("insert into freelance_hq_hosting_clients(id,name,email)values($1,'Fixture','fixture@example.test'),($2,'Other','other@example.test')",[client,foreign]);
 await db.query("insert into freelance_hq_hosting_client_access(client_id,auth_user_id,enabled,email)values($1,$2,true,'fixture@example.test'),($3,$4,true,'other@example.test')",[client,user,foreign,other]);
 await db.exec("update freelance_hq_website_settings set enabled=true,bank_details='Fixture only',website_price_minor=100");
 await db.query("select freelance_hq_website_request_payment($1,$2,$3,$4,1,'',null)",[user,client,payment,randomUUID()]);await db.query("select freelance_hq_website_review_payment($1,$2,true,'Fixture only')",[admin,payment]);
 const c=(await db.query('select id from freelance_hq_website_credits')).rows[0].id;
 const app=(await db.query("select freelance_hq_website_create($1,$2,$3,$4,'Fixture','static','upload','','',null,0,false) id",[user,client,c,randomUUID()])).rows[0].id;
 let rows=(await db.query('select * from freelance_hq_hosting_app_domains')).rows;assert.equal(rows.length,1);assert(rows[0].is_preview);assert.match(rows[0].hostname,/^w-[a-f0-9]{32}\.deploy\.housemysite\.com$/);
 const pair=actor=>db.query("select freelance_hq_website_domain_pair($1,$2,'example.com')",[actor,app]);await assert.rejects(pair(other),/Active client/);await pair(user);await pair(user);
 rows=(await db.query('select * from freelance_hq_hosting_app_domains where not is_preview order by hostname')).rows;assert.equal(rows.length,2);assert.equal(rows[0].verification_token,rows[1].verification_token);assert.equal(rows[0].status,'pending_dns');
 await assert.rejects(db.query("select freelance_hq_website_domain_pair($1,$2,'web.housemysite.com')",[user,app]),/Custom public/);
 await db.query("insert into freelance_hq_hosting_registrar_connection(id,version,credentials_encrypted,mode,verified_at,created_by)values(true,$1,'fixture-only','production',now(),$2)",[version,admin]);
 await db.query("insert into freelance_hq_hosting_registrar_domains(connection_version,name,details)values($1,'example.com',$2)",[version,{name:'example.com',glue:{glue_type:'dns'}}]);
 const before={name:'example.com',glue:{glue_type:'dns'}},intent={kind:'dns_add',record:{host:'@',type:'a',value:'62.171.130.156',priority:0}};
 const claim=(who=user,i=intent)=>db.query('select * from freelance_hq_website_dns_claim($1,$2,$3,\'example.com\',$4,$5)',[who,app,version,i,before]);
 await assert.rejects(claim(),/Admin domain assignment/);
 await db.query("insert into freelance_hq_hosting_domains(client_id,hostname)values($1,'example.com')",[client]);
 await assert.rejects(claim(other),/Active client/);await assert.rejects(claim(user,{kind:'dns_remove',record:intent.record}),/DNS additions/);await assert.rejects(claim(user,{kind:'dns_add',record:{...intent.record,value:'1.2.3.4'}}),/outside website/);
 const op=(await claim()).rows[0];assert.equal(op.website_app_id,app);await assert.rejects(claim(),/reconciliation/);
 await db.query("select freelance_hq_website_dns_finish($1,$2,'uncertain')",[user,op.id]);await assert.rejects(claim(),/reconciliation/);
 await assert.rejects(db.query("select freelance_hq_website_dns_finish($1,$2,'confirmed')",[other,op.id]),/Active client/);
 await db.query("select freelance_hq_website_dns_finish($1,$2,'confirmed',true)",[admin,op.id]);
 for(const record of [{host:'_hms-verify',type:'txt',value:rows[0].verification_token,priority:0},{host:'www',type:'cname',value:'example.com',priority:0}]){
  const result=(await claim(user,{kind:'dns_add',record})).rows[0];await db.query("select freelance_hq_website_dns_finish($1,$2,'confirmed')",[user,result.id]);
 }
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(pair(user),/permission denied/);await assert.rejects(claim(),/permission denied/);await db.exec('reset role');}
 console.log('PASS: additive domain migration, atomic apex/www pair, allocated preview, two-client denial, exact scoped DNS additions, shared operation lock, unknown-outcome block and admin reconciliation.');
 }finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1});
