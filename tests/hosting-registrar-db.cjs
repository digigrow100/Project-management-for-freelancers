const {PGlite}=require('@electric-sql/pglite'),fs=require('fs'),assert=require('node:assert/strict'),{randomUUID}=require('crypto');
(async()=>{
const db=new PGlite();await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create table public.freelance_hq_profiles(id uuid primary key,role text);create table public.freelance_hq_clients(id uuid primary key);");
for(const f of ['20261020202238_hosting_management','20261031083515_hosting_dynadot_registrar'])await db.exec(fs.readFileSync('supabase/migrations/'+f+'.sql','utf8'));
const q=async(sql,args)=>(await db.query(sql,args)).rows,admin=randomUUID(),member=randomUUID();
await q('insert into auth.users(id)values($1),($2)',[admin,member]);await q("insert into freelance_hq_profiles values($1,'admin'),($2,'member')",[admin,member]);
const connect=async(actor=admin)=>(await q("select freelance_hq_hosting_registrar_connect($1,$2,'sandbox') id",[actor,'encrypted-fixture-not-a-real-key-123456789']))[0].id;
await assert.rejects(connect(member),/admin access/);const version=await connect();
const prepare=async(actor=admin)=>(await q("insert into freelance_hq_hosting_registrar_operations(actor_id,connection_version,domain,kind,intent,before_state)values($1,$2,'example.com','renew','{}','{}')returning id",[actor,version]))[0].id;
const claim=async(id,actor=admin)=>q('select freelance_hq_hosting_registrar_claim($1,$2)',[actor,id]);
const finish=async(id,state)=>q('select freelance_hq_hosting_registrar_finish($1,$2,$3)',[admin,id,state]);
const first=await prepare(),second=await prepare();await assert.rejects(claim(first,member),/admin access/);await claim(first);await assert.rejects(claim(first),/expired or already/);await assert.rejects(claim(second),/reconciliation/);await assert.rejects(connect(),/reconciliation/);
await finish(first,'uncertain');await assert.rejects(claim(second),/reconciliation/);await assert.rejects(finish(first,'failed'),/state changed/);await finish(first,'confirmed');await assert.rejects(finish(first,'failed'),/state changed/);await claim(second);await finish(second,'failed');
const expired=await prepare();await q("update freelance_hq_hosting_registrar_operations set expires_at=now()-interval '1 second' where id=$1",[expired]);await assert.rejects(claim(expired),/expired/);
const old=await prepare();const newVersion=await connect();await assert.rejects(claim(old),/expired/);
const run=(await q('select freelance_hq_hosting_registrar_sync_start($1,$2) id',[admin,newVersion]))[0].id;
const sync=(page,total,next,domains)=>q('select freelance_hq_hosting_registrar_sync_page($1,$2,$3,$4,$5,$6,$7)',[admin,newVersion,run,page,total,next,domains]);
await assert.rejects(sync(2,2,false,[{name:'two.example',status:'active'}]),/Sync changed/);
await sync(1,2,true,[{name:'one.example',status:'active'}]);await assert.rejects(sync(1,2,true,[]),/Sync changed/);await assert.rejects(sync(2,3,false,[{name:'two.example',status:'active'}]),/list changed/);await sync(2,2,false,[{name:'two.example',status:'active'}]);
assert.equal((await q('select sync_next from freelance_hq_hosting_registrar_connection'))[0].sync_next,0);assert.equal((await q('select count(*)::int n from freelance_hq_hosting_registrar_domains'))[0].n,2);
for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(connect(),/permission denied/);for(const table of ['connection','domains','operations'])await assert.rejects(db.exec('select * from freelance_hq_hosting_registrar_'+table),/permission denied/);await db.exec('reset role');}
await db.close();console.log('PASS: admin roles, durable one-shot claim, uncertain lock, atomic audit, expired/rotated reviews, ordered complete sync and private tables.');
})().catch(e=>{console.error(e);process.exit(1)});
