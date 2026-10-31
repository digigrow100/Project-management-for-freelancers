import base64
from contextlib import contextmanager
import hashlib
import json
import pathlib
import sqlite3
import sys
import unittest
import uuid
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'scripts/email/server'))
from mail_accounts import MailAccounts,Refused,canon,operation

class Accounts(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:',isolation_level=None);self.key=Ed25519PrivateKey.generate();self.actor=str(uuid.uuid4());self.service=str(uuid.uuid4());self.client=str(uuid.uuid4());self.calls=[];self.rows={};self.next=1
  @contextmanager
  def provider():yield self.remote
  self.engine=MailAccounts(self.db,owner=lambda actor:actor==self.actor,public_key=self.key.public_key(),host_private=b'x'*32,provider=provider,policy={'capacity':{'mailboxes':100,'mailbox_mb':1024,'total_mb':2048},'server':1,'mx_host':'mail.example.test','spf':'v=spf1 -all','client_template':{},'mail_template':{'maildir':'/var/vmail/{domain}/{localpart}','uid':5000,'gid':5000},'group_lookup':lambda c:3},reserve=lambda *a:True,clock=lambda:1000)
 def remote(self,method,*args):
  self.calls.append((method,args))
  if method=='mail_domain_get':return []if isinstance(args[0],dict)else self.rows.get(args[0],False)
  if method=='client_add':self.client_record=dict(args[1],client_id=2);return 2
  if method=='client_get':return self.client_record
  if method=='mail_domain_add':self.rows[3]={'domain_id':3,'domain':args[1]['domain'],'sys_groupid':3,'server_id':1};return 3
  raise AssertionError(method)
 def enqueue(self,operation=None,key=None,service=None,client=None,actor=None):
  return self.engine.enqueue(actor or self.actor,service or self.service,client or self.client,'example.test',key or str(uuid.uuid4()),operation or {'operation':'enroll','domain':'example.test','limits':{'mailboxes':2,'mailbox_mb':512,'total_mb':1024}})
 def sign(self,job):
  row=self.db.execute('select * from mail_jobs where id=?',(job,)).fetchone();body={'job':job,'digest':row['digest'],'nonce':uuid.uuid4().hex,'issued':990,'expires':1290};return body|{'signature':base64.b64encode(self.key.sign(b'hms-managed-approval-v1\n'+canon(body))).decode()}
 def test_enqueue_is_non_mutating_and_idempotent(self):
  key=str(uuid.uuid4());r=self.enqueue(key=key);self.assertEqual(self.enqueue(key=key),r);self.assertEqual(self.calls,[])
  with self.assertRaises(Refused):self.enqueue(key=key,operation={'operation':'enroll','domain':'example.test','limits':{'mailboxes':1,'mailbox_mb':512,'total_mb':512}})
 def test_requires_exact_independent_signature(self):
  job=self.enqueue()['job'];a=self.sign(job);a['signature']=base64.b64encode(b'x'*64).decode()
  with self.assertRaises(Refused):self.engine.approve(self.actor,self.service,self.client,'example.test',job,a)
  self.engine.process();self.assertEqual(self.calls,[])
 def test_real_signature_claim_and_provider_readback(self):
  job=self.enqueue()['job'];a=self.sign(job);self.engine.approve(self.actor,self.service,self.client,'example.test',job,a);self.engine.process()
  self.assertEqual(self.db.execute('select state from mail_jobs').fetchone()[0],'confirmed')
  snap=self.engine.snapshot(self.actor,self.service,self.client,'example.test');self.assertEqual(snap['state'],'active');self.assertFalse(snap['sending_ready']);self.assertEqual(snap['limits']['total_mb'],1024)
  before=len(self.calls);self.engine.process();self.assertEqual(len(self.calls),before)
  with self.assertRaises(Refused):self.engine.approve(self.actor,self.service,self.client,'example.test',job,a)
 def test_cross_service_and_actor_denied(self):
  self.enqueue()
  for args in [(self.actor,self.service,str(uuid.uuid4()),'example.test'),(str(uuid.uuid4()),self.service,self.client,'example.test'),(self.actor,self.service,self.client,'other.test')]:
   with self.assertRaises(Refused):self.engine.snapshot(*args)
 def test_unknown_provider_result_is_not_retried(self):
  def fail(method,*args):
   self.calls.append((method,args))
   if method=='mail_domain_get':return []
   raise OSError('private secret must not be returned')
  self.remote=fail;job=self.enqueue()['job'];self.engine.approve(self.actor,self.service,self.client,'example.test',job,self.sign(job));self.engine.process();self.assertEqual(self.db.execute('select state from mail_jobs').fetchone()[0],'uncertain');before=len(self.calls);self.engine.process();self.assertEqual(len(self.calls),before)
 def test_one_pending_request_and_capacity_bounds(self):
  self.enqueue()
  with self.assertRaises(sqlite3.IntegrityError):self.enqueue()
  self.assertEqual(self.db.execute('select count(*)from mail_jobs').fetchone()[0],1)
 def test_cancelled_request_cannot_be_signed_or_processed(self):
  job=self.enqueue()['job'];a=self.sign(job);self.engine.cancel(self.actor,self.service,self.client,'example.test',job)
  with self.assertRaises(Refused):self.engine.approve(self.actor,self.service,self.client,'example.test',job,a)
  self.engine.process();self.assertEqual(self.calls,[])
 def test_public_snapshot_never_returns_private_policy(self):
  snapshot=self.engine.snapshot(self.actor,self.service,self.client,'example.test');self.assertEqual(snapshot['mailboxes'],[]);self.assertNotIn('client_template',json.dumps(snapshot));self.assertNotIn('host_private',snapshot)
 def test_tampered_intent_cannot_use_old_approval(self):
  job=self.enqueue()['job'];a=self.sign(job);row=json.loads(self.db.execute('select intent from mail_jobs').fetchone()[0]);row['command']['limits']['mailbox_mb']=1;self.db.execute('update mail_jobs set intent=?',(json.dumps(row),))
  with self.assertRaises(Refused):self.engine.approve(self.actor,self.service,self.client,'example.test',job,a)
  self.assertEqual(self.calls,[])
 def test_legacy_hosting_binding_cannot_be_bypassed(self):
  self.engine.policy['legacy_reserved']=lambda domain:True
  job=self.enqueue()['job'];self.engine.approve(self.actor,self.service,self.client,'example.test',job,self.sign(job));self.engine.process()
  self.assertEqual(self.db.execute('select state from mail_jobs').fetchone()[0],'failed');self.assertEqual(self.calls,[])
 def test_mailbox_ownership_and_independent_access_controls(self):
  job=self.enqueue()['job'];self.engine.approve(self.actor,self.service,self.client,'example.test',job,self.sign(job));self.engine.process()
  resource='a'*32;self.db.execute('insert into mail_boxes values(?,?,?,?)',(resource,self.service,'info@example.test',10))
  record={'mailuser_id':10,'server_id':1,'sys_groupid':3,'email':'info@example.test','login':'info@example.test','maildir':'/var/vmail/example.test/info','uid':5000,'gid':5000,'quota':512*1048576,'disablesmtp':'y','disabledeliver':'n','disableimap':'n','disablepop3':'n'}
  old=self.remote
  def remote(method,*args):
   if method=='mail_user_get':return record.copy()
   if method=='mail_user_update':self.calls.append((method,args));record.update(args[2]);return True
   return old(method,*args)
  self.remote=remote
  control={'operation':'controls','resource':resource,'sending':False,'receiving':False,'login':True};job=self.enqueue(control)['job'];self.engine.approve(self.actor,self.service,self.client,'example.test',job,self.sign(job));self.engine.process()
  self.assertEqual(self.db.execute('select state from mail_jobs where id=?',(job,)).fetchone()[0],'confirmed');self.assertEqual(record['disabledeliver'],'y');self.assertEqual(record['disableimap'],'n');self.assertEqual(record['disablesmtp'],'y')
  record['sys_groupid']=999;before=len(self.calls);job=self.enqueue({'operation':'quota','resource':resource,'quota_mb':500})['job'];self.engine.approve(self.actor,self.service,self.client,'example.test',job,self.sign(job));self.engine.process();self.assertEqual(self.db.execute('select state from mail_jobs where id=?',(job,)).fetchone()[0],'failed');self.assertFalse(any(method.endswith(('_add','_update','_delete'))for method,args in self.calls[before:]),'ownership mismatch must stop before mutation')
 def test_unsafe_operations_are_refused(self):
  for op in [{'operation':'create','name':'../root','quota_mb':100,'sealed':'x'*80},{'operation':'controls','resource':'a'*32,'sending':1,'receiving':True,'login':True},{'operation':'delete','resource':'a'*32,'confirm':'b'*32},{'operation':'enroll','domain':'127.0.0.1','limits':{'mailboxes':1,'mailbox_mb':1,'total_mb':1}},{'operation':'alias','name':'root','resource':'../../etc/passwd'}]:
   with self.assertRaises(Refused):operation(op)
if __name__=='__main__':unittest.main()
