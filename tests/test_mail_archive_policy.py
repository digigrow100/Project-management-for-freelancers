import base64
import importlib.util
import pathlib
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'scripts/email/server'))
from mail_accounts import Refused
from mail_archive import ImapArchive,LocalEncryptedStore,quote,PinnedIMAP,messages
from mail_smtp_policy import decision
from mail_usage_broker import parse

class BackupAndPolicy(unittest.TestCase):
 def test_local_encrypted_store_is_private_bounded_and_immutable(self):
  with tempfile.TemporaryDirectory()as directory:
   root=pathlib.Path(directory)/'backups';root.mkdir(mode=0o700);source=pathlib.Path(directory)/'source';source.write_bytes(b'ciphertext-only')
   store=LocalEncryptedStore(root,reserve=lambda *args:True,maximum_bytes=100);key='a'*32+'/'+ 'b'*32+'.enc';store.transfer('PUT',key,source,maximum=100);source.write_bytes(b'changed')
   with self.assertRaises(FileExistsError):store.transfer('PUT',key,source,maximum=100)
   target=pathlib.Path(directory)/'download';store.transfer('GET',key,target,maximum=100);self.assertEqual(target.read_bytes(),b'ciphertext-only');self.assertFalse(store.offsite)
   with self.assertRaises(Refused):store.transfer('GET','../../root',target,maximum=100)
   self.assertEqual(next(root.iterdir()).stat().st_mode&0o777,0o600)
 def test_password_vault_is_authenticated_and_never_plaintext(self):
  with tempfile.TemporaryDirectory()as directory:
   db=sqlite3.connect(':memory:',isolation_level=None);archive=ImapArchive(db,b'k'*32,object(),'mail.example.test',directory,lambda *a:True)
   archive.remember('a'*32,'fixture-password-only');cipher=db.execute('select secret from mail_vault').fetchone()[0];self.assertNotIn(b'fixture-password-only',cipher);self.assertEqual(archive.password('a'*32),'fixture-password-only')
   db.execute('update mail_vault set secret=?',(cipher[:-1]+bytes([cipher[-1]^1]),))
   with self.assertRaises(Exception):archive.password('a'*32)
 def test_imap_command_values_cannot_inject_commands(self):
  self.assertEqual(quote('Folder "quoted"'),b'"Folder \\"quoted\\""')
  for value in ['INBOX\r\nDELETE INBOX','\x00','']:
   with self.assertRaises(Refused):quote(value)
 def test_migration_refuses_private_and_mixed_dns_before_connecting(self):
  private=[(2,1,6,'',('127.0.0.1',993))]
  with patch('mail_archive.socket.getaddrinfo',return_value=private),patch('mail_archive.socket.create_connection')as connection:
   with self.assertRaises(Refused):PinnedIMAP('source.example.test',external=True)
   connection.assert_not_called()
 def test_backup_preserves_message_flags_and_internal_date(self):
  class Fake:
   def list(self):return 'OK',[b'(\\HasNoChildren) "." "INBOX"']
   def select(self,*args,**kw):return 'OK',[]
   def uid(self,verb,*args):
    if verb=='search':return 'OK',[b'1']
    return 'OK',[(b'1 (UID 1 FLAGS (\\Seen \\Answered \\Recent) INTERNALDATE "31-Oct-2026 12:00:00 +0000" BODY[] {4}',b'test'),b')']
  record=list(messages(Fake(),maximum_bytes=100))[0];self.assertEqual(record['flags'],['\\Seen','\\Answered']);self.assertEqual(record['internaldate'],'31-Oct-2026 12:00:00 +0000')
  class Target:
   def select(self,*args):return 'OK',[]
   def search(self,*args):return 'OK',[b'']
   def append(self,*args):self.args=args;return 'OK',[]
  target=Target();ImapArchive.append(target,record,'fixed-fixture-id');self.assertEqual(target.args[1],'(\\Seen \\Answered)');self.assertEqual(target.args[2],'"31-Oct-2026 12:00:00 +0000"');self.assertTrue(target.args[3].endswith(b'test'))
 def test_real_uuid_backup_restore_and_tamper_refusal(self):
  class Fake:
   appended=[]
   def __init__(self,*args,**kw):pass
   def login(self,*args):return 'OK',[]
   def logout(self):pass
   def list(self):return 'OK',[b'(\\HasNoChildren) "." "INBOX"']
   def select(self,*args,**kw):return 'OK',[]
   def uid(self,verb,*args):
    if verb=='search':return 'OK',[b'1']
    return 'OK',[(b'1 (FLAGS (\\Seen) INTERNALDATE "31-Oct-2026 12:00:00 +0000" BODY[] {7}',b'PRIVATE'),b')']
   def search(self,*args):return 'OK',[b'']
   def append(self,*args):self.appended.append(args);return 'OK',[]
  with tempfile.TemporaryDirectory()as directory,patch('mail_archive.PinnedIMAP',Fake):
   root=pathlib.Path(directory)/'backups';root.mkdir(mode=0o700);db=sqlite3.connect(':memory:',isolation_level=None);store=LocalEncryptedStore(root,reserve=lambda *a:True,maximum_bytes=10485760);archive=ImapArchive(db,b'k'*32,store,'mail.example.test',directory,lambda *a:True)
   service='11111111-1111-4111-8111-111111111111';box={'id':'a'*32,'address':'info@example.test','quota':1048576};archive.remember(box['id'],'Fixture-password-only');archive.execute('backup',service,box,{},None);point=archive.list(service)[0]['id'];cipher=next(root.iterdir()).read_bytes();self.assertNotIn(b'PRIVATE',cipher)
   archive.execute('restore',service,box,{'point':point},None);self.assertEqual(len(Fake.appended),1);self.assertTrue(Fake.appended[0][3].endswith(b'PRIVATE'));self.assertEqual(len(archive.list(service)),2,'restore first captures a safety backup')
   target=root/(service.replace('-','')+'-'+point+'.enc');target.write_bytes(cipher[:-1]+b'!');Fake.appended.clear()
   with self.assertRaises(Refused):archive.execute('restore',service,box,{'point':point},None)
   self.assertEqual(Fake.appended,[],'tampering refuses before mailbox append')
 def test_backup_can_restore_to_replacement_but_never_another_service(self):
  class Fake:
   appended=[]
   def __init__(self,*a,**kw):pass
   def login(self,address,password):self.address=address;return 'OK',[]
   def logout(self):pass
   def list(self):return 'OK',[b'(\\HasNoChildren) "." "INBOX"']
   def select(self,*a,**kw):return 'OK',[]
   def uid(self,verb,*a):
    if verb=='search':return 'OK',[b'1']
    return 'OK',[(b'1 (FLAGS () INTERNALDATE "31-Oct-2026 12:00:00 +0000" BODY[] {4}',b'mail'),b')']
   def search(self,*a):return 'OK',[b'']
   def append(self,*a):self.appended.append((self.address,a));return 'OK',[]
  with tempfile.TemporaryDirectory()as directory,patch('mail_archive.PinnedIMAP',Fake):
   root=pathlib.Path(directory)/'backups';root.mkdir(mode=0o700);db=sqlite3.connect(':memory:',isolation_level=None);store=LocalEncryptedStore(root,reserve=lambda *a:True,maximum_bytes=10485760);archive=ImapArchive(db,b'k'*32,store,'mail.example.test',directory,lambda *a:True)
   service='11111111-1111-4111-8111-111111111111';source={'id':'a'*32,'address':'old@example.test','quota':1048576};target={'id':'c'*32,'address':'replacement@example.test','quota':1048576}
   archive.remember(source['id'],'Original-password');archive.execute('backup',service,source,{},None);point=archive.list(service)[0]['id'];db.execute('delete from mail_vault where resource=?',(source['id'],));archive.remember(target['id'],'Replacement-password')
   archive.execute('restore',service,target,{'point':point},None);self.assertEqual(len(Fake.appended),1);self.assertEqual(Fake.appended[0][0],target['address']);self.assertTrue(Fake.appended[0][1][3].endswith(b'mail'))
   Fake.appended.clear()
   with self.assertRaises(Refused):archive.execute('restore','22222222-2222-4222-8222-222222222222',target,{'point':point},None)
   self.assertEqual(Fake.appended,[])
 def test_quota_usage_is_not_confused_with_the_limit(self):
  self.assertEqual(parse(b'Quota name\tType\tValue\tLimit\t%\nUser quota\tSTORAGE\t123\t1048576\t0\nUser quota\tMESSAGE\t4\t-\t0\n'),123*1024)
  for raw in [b'',b'User quota\tSTORAGE\tunknown\t1000\t0\n',b'A\tSTORAGE\t1\t2\t50\nB\tSTORAGE\t2\t2\t100\n']:
   with self.assertRaises(ValueError):parse(raw)
 def test_recipient_policy_counts_recipients_and_does_not_grant_relay(self):
  db=sqlite3.connect(':memory:',isolation_level=None);db.executescript('create table mail_boxes(id text,service text,address text);create table mail_accounts(service text,provider_domain integer,domain text);create table mail_aliases(resource text,name text);create table mail_send_events(id text primary key,resource text,service text,created integer,recipients integer);insert into mail_accounts values("svc",1,"example.test");insert into mail_boxes values("box","svc","info@example.test");')
  p={'hourly_recipients':3,'daily_recipients':5,'service_hourly_recipients':4};base={'request':'smtpd_access_policy','sasl_username':'info@example.test','protocol_state':'END-OF-MESSAGE','recipient_count':'2','sender':'info@example.test','instance':'1.2.3','queue_id':'queue1'}
  self.assertEqual(decision(db,base,p,10000),'DUNNO');self.assertEqual(decision(db,base,p,10000),'DUNNO');self.assertEqual(db.execute('select sum(recipients)from mail_send_events').fetchone()[0],2)
  self.assertTrue(decision(db,base|{'instance':'1.2.4'},p,10000).startswith('451'))
  self.assertEqual(decision(db,base|{'sasl_username':'unrelated@other.test','sender':'unrelated@other.test'},p,10000),'DUNNO');self.assertTrue(decision(db,base|{'protocol_state':'RCPT'},p,10000).startswith('451'));self.assertEqual(decision(db,base|{'sasl_username':'INFO@EXAMPLE.TEST'},p,10000),'DUNNO');self.assertTrue(decision(db,base|{'sasl_username':''},p,10000).startswith('553'));self.assertTrue(decision(db,base|{'sender':'spoof@other.test'},p,10000).startswith('553'))
if __name__=='__main__':unittest.main()
