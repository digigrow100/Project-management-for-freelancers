const {PGlite}=require('@electric-sql/pglite');const fs=require('fs'),assert=require('node:assert/strict');const {randomUUID:id}=require('crypto');const {spawnSync}=require('child_process');
const harness=process.env.HMS_AUTOMATION_SOURCE?process.env.HMS_AUTOMATION_SOURCE+'/tests/portal_transport_harness.py':null;
function python(mode,input){const r=spawnSync('python',[harness,mode],{input:input?JSON.stringify(input):undefined,encoding:'utf8'});if(r.status!==0)throw new Error(r.stderr);return JSON.parse(r.stdout);}
const fixture=harness?python('fixture'):null;
(async()=>{
 const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create table freelance_hq_profiles(id uuid primary key,role text);create table freelance_hq_clients(id uuid primary key);`);
 await db.exec(fs.readFileSync('supabase/migrations/20261020202238_hosting_management.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261021211549_hosting_operator_transport.sql','utf8'));
 const server=fixture?.server??id(),other=id(),actor=id(),client=fixture?.client??id(),service=fixture?.service??id(),job=id(),pkg=id();
 await db.query(`insert into auth.users(id) values($1)`,[actor]);
 await db.query(`insert into freelance_hq_hosting_servers(id,name,hostname) values($1,'Test','test.invalid'),($2,'Other','other.invalid')`,[server,other]);
 await db.query(`insert into freelance_hq_hosting_clients(id,name,email) values($1,'Test','test@example.invalid')`,[client]);
 await db.query(`insert into freelance_hq_hosting_packages(id,name,price_minor,currency,billing_cycle,disk_mb,memory_mb,cpu_percent) values($1,'Test',0,'PKR','monthly',1024,512,100)`,[pkg]);
 await db.query(`insert into freelance_hq_hosting_package_servers(package_id,server_id) values($1,$2)`,[pkg,server]);
 await db.query(`insert into freelance_hq_hosting_services(id,client_id,server_id,package_id,name,price_minor,currency,billing_cycle,next_due_date) values($1,$2,$3,$4,'Test',0,'PKR','monthly',current_date)`,[service,client,server,pkg]);
 await db.query(`insert into freelance_hq_hosting_jobs(id,service_id,kind,requested_by,idempotency_key) values($1,$2,'provision',$3,$4)`,[job,service,actor,fixture?.key??id()]);
 await db.query(`insert into freelance_hq_hosting_operators values($1,$3,false),($2,$3,true)`,[server,other,'a'.repeat(64)]);
 await db.query(`insert into freelance_hq_hosting_operator_mappings(service_id,server_id,client_id,tenant,subject,actor_id) values($1,$2,$3,'acme','olivia',$4)`,[service,server,client,actor]);
 const delivery=id(),claim=id(),hash=fixture?.hash??'b'.repeat(64);
 await db.query(`insert into freelance_hq_hosting_operator_deliveries(id,job_id,server_id,body,body_sha256,expires_at) values($1,$2,$3,$5,$4,now()+interval '5 minutes')`,[delivery,job,server,hash,fixture?.body??'{}']);
 const poll=async(s=server,t='a'.repeat(64),c=claim)=>(await db.query('select freelance_hq_hosting_operator_claim($1,$2,$3) d',[s,t,c])).rows[0].d;
 const ack=async(r,s=server)=>(await db.query('select freelance_hq_hosting_operator_receipt($1,$2,$3::jsonb) ok',[s,'a'.repeat(64),JSON.stringify(r)])).rows[0].ok;
 await assert.rejects(poll(),/denied/);await db.query(`update freelance_hq_hosting_operators set enabled=true where server_id=$1`,[server]);
 await assert.rejects(poll(server,'wrong'),/denied/);assert.equal(await poll(other),null);
 const first=await poll();await assert.rejects(db.query("update freelance_hq_hosting_jobs set status='cancelled' where id=$1",[job]),/reconciliation/);assert.equal(first.id,delivery);assert.deepEqual(await poll(),first);assert.equal(await poll(server,'a'.repeat(64),id()),null);
 const consumed=fixture?python('consume',first):null;
 const receipt=consumed?.queued??{delivery_id:delivery,claim_id:claim,body_sha256:hash,state:'queued',local_id:1,project:null};
 await assert.rejects(ack({...receipt,claim_id:id()}),/denied/);await assert.rejects(ack({...receipt,body_sha256:'c'.repeat(64)}),/denied/);
 assert.equal(await ack(receipt),true);assert.equal(await ack(receipt),true);
 await assert.rejects(ack({...receipt,state:'applied',local_id:2}),/receipt mismatch/);
 const final=consumed?.applied??{...receipt,state:'applied',project:'c12345678'};assert.equal(await ack(final),true);await assert.rejects(ack(receipt),/invalid transition/);
 if(fixture)assert.equal((await db.query('select project from freelance_hq_hosting_operator_mappings where service_id=$1',[service])).rows[0].project,final.project);
 await db.query(`update freelance_hq_hosting_operators set enabled=false where server_id=$1`,[server]);await assert.rejects(ack(final),/denied/);
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select * from freelance_hq_hosting_operators'),/permission denied/);await assert.rejects(poll(),/permission denied/);await db.exec('reset role');}
 await db.close();console.log('Operator database'+(fixture?' + Python adapter + real Intake + project binding':'')+': claims, isolation, revocation, receipt transitions and browser denial PASS');
})().catch(e=>{console.error(e);process.exit(1)});
