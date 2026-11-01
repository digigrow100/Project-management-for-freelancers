import hashlib
import hmac
import importlib.util
import json
from pathlib import Path
import sqlite3
import sys
import time
import unittest
import uuid
from unittest.mock import patch
from types import SimpleNamespace
from contextlib import contextmanager
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts/email/server'))
from mail_agent import packet
from mail_accounts import Refused
spec=importlib.util.spec_from_file_location('installer',ROOT/'scripts/email/install_control_center.py');installer=importlib.util.module_from_spec(spec);spec.loader.exec_module(installer)
spec=importlib.util.spec_from_file_location('webmail',ROOT/'scripts/email/webmail_setup.py');webmail=importlib.util.module_from_spec(spec);spec.loader.exec_module(webmail)
class TransportAndInstall(unittest.TestCase):
 def test_hmac_exact_body_context_expiry_replay_and_owner(self):
  db=sqlite3.connect(':memory:',isolation_level=None);db.execute('create table mail_http_nonces(nonce text primary key,expires integer not null)')
  @contextmanager
  def tx():
   db.execute('begin immediate')
   try:yield;db.commit()
   except BaseException:db.rollback();raise
  engine=SimpleNamespace(db=db,owner=lambda a:a=='owner',reserve=lambda *a:True,tx=tx,snapshot=lambda *a:{'state':'fixture'})
  value={'schema':1,'actor':'owner','nonce':str(uuid.uuid4()),'expires':int(time.time())+60,'command':{'action':'snapshot','service':str(uuid.uuid4()),'client':str(uuid.uuid4()),'domain':'example.test'}};key=b'k'*32
  def call(v,context=b'hms:mail-portal:v1:'):
   raw=json.dumps(v).encode();return packet(engine,raw,hmac.new(key,context+raw,hashlib.sha256).hexdigest(),key)
  with self.assertRaises(Refused):call(value,b'other-context:')
  with self.assertRaises(Refused):call(value|{'expires':int(time.time())-1})
  with self.assertRaises(Refused):call(value|{'actor':'client'})
  self.assertEqual(call(value),{'state':'fixture'})
  with self.assertRaises(sqlite3.IntegrityError):call(value)
 def test_webmail_failure_reports_fixed_auth_code_and_exact_stage(self):
  def refuse():raise webmail.WebmailRefused('mysql_admin_auth_failed')
  proxy=SimpleNamespace(trusted=lambda *a:None,request=lambda *a:None)
  module=SimpleNamespace(existing=lambda *a:None,preflight=refuse,SAFE_CODES=webmail.SAFE_CODES)
  with patch.object(installer,'import_file',side_effect=[object(),proxy,module]):
   with self.assertRaises(installer.Refused)as error:installer.install(False)
  self.assertEqual(str(error.exception),'mysql_admin_auth_failed');self.assertEqual(installer.STAGE,'webmail_preflight')
 def test_unexpected_webmail_failure_does_not_publish_exception_text(self):
  def refuse():raise RuntimeError('fixture-private-password')
  proxy=SimpleNamespace(trusted=lambda *a:None,request=lambda *a:None)
  module=SimpleNamespace(existing=lambda *a:None,preflight=refuse,SAFE_CODES=webmail.SAFE_CODES)
  with patch.object(installer,'import_file',side_effect=[object(),proxy,module]):
   with self.assertRaises(installer.Refused)as error:installer.install(False)
  self.assertEqual(str(error.exception),'webmail_preflight_RuntimeError');self.assertNotIn('password',str(error.exception))
 def test_installer_rejects_changed_vhost_before_writing(self):
  raw=b'<VirtualHost *:443>\nServerName server1.housemysite.com\nSSLProxyVerify require\nSSLProxyCheckPeerName On\nSSLProxyCheckPeerExpire On\n# BEGIN HOUSEMYSITE PRIVATE SERVICES\nProxyPassMatch "^/v1/services$" "https://127.0.0.1:18443"\n</VirtualHost>\n'
  rendered=installer.render(raw);self.assertIn(b'^/v1/mail$',rendered);self.assertIn(b'SSLProxyVerify require',rendered);self.assertIn(b'18443',rendered)
  for broken in [raw.replace(b'server1.housemysite.com',b'other.test'),rendered,raw.replace(b'SSLProxyVerify require',b'SSLProxyVerify none'),raw+b'<VirtualHost *:443></VirtualHost>']:
   with self.assertRaises(installer.Refused):installer.render(broken)
 def test_units_keep_fixed_non_root_runtime_and_bounded_sockets(self):
  units=installer.unit_files();self.assertIn('User=hms-services',units['housemysite-email-worker.service']);self.assertIn('NoNewPrivileges=yes',units['housemysite-email-center.service']);self.assertIn('MaxConnections=16',units['housemysite-mail-policy.socket']);self.assertIn('RestrictAddressFamilies=AF_UNIX',units['housemysite-mail-usage@.service']);self.assertNotIn('/bin/sh',str(units))
 def test_isolated_webmail_does_not_replace_existing_route(self):
  block=webmail.apache_block();self.assertIn('Alias /housemysite-webmail ',block);self.assertNotIn('Alias /webmail ',block);self.assertIn('Require all denied',block);self.assertIn('/opt/housemysite-webmail/public',block)
if __name__=='__main__':unittest.main()
