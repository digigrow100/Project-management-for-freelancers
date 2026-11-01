"""Resume fixtures: local temporary files only; no service/provider commands."""
import importlib.util
import json
from pathlib import Path
import shutil
import sqlite3
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock,patch
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('resume_installer',ROOT/'scripts/email/install_control_center.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
EMPTY_STATE=module.resume_empty_state
RAW=b'<VirtualHost *:443>\nServerName server1.housemysite.com\nSSLProxyVerify require\nSSLProxyCheckPeerName On\nSSLProxyCheckPeerExpire On\n# BEGIN HOUSEMYSITE PRIVATE SERVICES\nProxyPassMatch "^/v1/services$" "https://127.0.0.1:18443"\n</VirtualHost>\n'
class Health(unittest.TestCase):
 def socket(self,chunks):
  sock=MagicMock();sock.__enter__.return_value=sock;sock.recv.side_effect=chunks;return sock
 def test_fragmented_frame_is_read_until_delimiter(self):
  sock=self.socket([b'action=DU',b'NNO\n',b'\n'])
  with patch.object(module.socket,'socket',return_value=sock):module.smtp_health()
  self.assertEqual(sock.recv.call_count,3);self.assertIn(b'sasl_username=\n\n',sock.sendall.call_args.args[0])
 def test_temporary_startup_result_retries_only_health(self):
  first=self.socket([b'action=451 4.7.0 Sending policy unavailable\n\n']);second=self.socket([b'action=DUNNO\n\n'])
  with patch.object(module.socket,'socket',side_effect=[first,second]),patch.object(module.time,'sleep'):module.smtp_health()
  self.assertEqual(first.sendall.call_args,second.sendall.call_args)
 def test_health_deadline_is_bounded_and_error_contains_no_response(self):
  with self.assertRaises(module.Refused)as error:module.smtp_health(timeout=0)
  self.assertEqual(str(error.exception),'smtp_policy_health_failed_timeout')
class Resume(unittest.TestCase):
 def fixture(self,base):
  backup=base/'backup';backup.mkdir();runtime=base/'runtime';runtime.mkdir();unitsdir=base/'units';unitsdir.mkdir()
  for name in module.SOURCES:shutil.copyfile(ROOT/'scripts/email/server'/name,runtime/name)
  vhost=base/'apache.conf';vhost.write_bytes(RAW);postfix=base/'postfix.cf';postfix.write_bytes(b'original postfix\n')
  state=base/'mail-services.sqlite'
  with sqlite3.connect(state)as db:
   for name in ('mail_accounts','mail_boxes','mail_jobs'):db.execute('CREATE TABLE '+name+'(fixture TEXT)')
  policy=base/'policy.json';policy.write_text(json.dumps({'capacity':{'total_mb':1024},'server':1,'sending_ready':True}))
  config=base/'settings.json';config.write_text(json.dumps({'state_dir':'/var/lib/housemysite-services','min_free_bytes':0,'provider':{'username_file':str(base/'username')}}));(base/'username').write_text('fixture-user')
  (backup/'original.conf').write_bytes(RAW);(backup/'postfix-original.cf').write_bytes(postfix.read_bytes());(backup/'roundcube-recovery-config.php').write_bytes(b'fixture-private-config')
  webconfig=base/'webmail-config';webconfig.write_bytes(b'fixture-private-config');pool=base/'pool';pool.write_text('fixture');public=base/'public';public.mkdir();(public/'index.php').write_text('fixture')
  webmail=SimpleNamespace(CONFIG=webconfig,POOL=pool,PUBLIC=public,apache_block=lambda:'fixture-webmail',install=MagicMock(),preflight=MagicMock())
  with patch.object(module,'ROOT',runtime):units=module.unit_files()
  for name,content in units.items():(unitsdir/name).write_text(content)
  candidate=module.render(RAW).replace(b'# BEGIN HOUSEMYSITE PRIVATE SERVICES',b'fixture-webmail    # BEGIN HOUSEMYSITE PRIVATE SERVICES',1)
  after=postfix.read_bytes()+b'\n# HouseMySite scoped email recipient limits\nsmtpd_end_of_data_restrictions = check_policy_service unix:private/housemysite-mail-policy\n'
  record={'phase':'stopped_review_required','failure_stage':'smtp_socket_health','failure_code':'smtp_policy_health_failed','units':list(units),'files':list(module.SOURCES),'vhost_before':module.sha(RAW),'vhost_after':module.sha(candidate),'postfix_before':module.sha(postfix.read_bytes()),'postfix_after':module.sha(after),'role_id':1,'permissions_before':'before','permissions_after':'after'}
  (backup/'receipt.json').write_text(json.dumps(record))
  def read(path,uid):return Path(path).read_bytes()
  helper=SimpleNamespace(SETTINGS=config,read_private=read,php=MagicMock(return_value={'role_id':1,'functions':'before'}),permission_delta=lambda value:('after',['fixture']))
  proxy=SimpleNamespace(trusted=lambda path:None,request=lambda *a:(200,b'','fixture'))
  return SimpleNamespace(**locals())
 def test_resume_success_and_failure_preserve_existing_installation(self):
  for fail in (False,True):
   with self.subTest(fail=fail),tempfile.TemporaryDirectory()as directory:
    f=self.fixture(Path(directory))
    def activate(*args):
     flags=args[-1]
     if fail:
      f.vhost.write_bytes(f.candidate);f.postfix.write_bytes(f.after);flags.update(apache=True,smtp=True);raise module.Refused('fixture_activation_failure')
     record=args[1];record['phase']='installed';module.atomic(f.backup/'receipt.json',json.dumps(record).encode());return {'installed':True}
    def run(*args):
     if 'DropInPaths'in ' '.join(args):return ''
     if 'ActiveState'in ' '.join(args):return 'inactive'
     return 'active'
    with patch.object(module,'resume_backup',return_value=f.backup),patch.object(module,'trusted_directory')as trusted,patch.object(module,'ROOT',f.runtime),patch.object(module,'UNITROOT',f.unitsdir),patch.object(module,'VHOST',f.vhost),patch.object(module,'POSTFIX',f.postfix),patch.object(module,'POLICY',f.policy),patch.object(module,'import_file',side_effect=[f.helper,f.proxy,f.webmail]),patch.object(module.pwd,'getpwnam',return_value=SimpleNamespace(pw_uid=994,pw_gid=985)),patch.object(module,'resume_empty_state',side_effect=lambda p:self.assert_empty(f.state)),patch.object(module.os,'statvfs',return_value=SimpleNamespace(f_bavail=10**9,f_frsize=4096)),patch.object(module,'run',side_effect=run),patch.object(module,'activate_existing',side_effect=activate)as activation,patch.object(module.subprocess,'run')as stop:
     if fail:
      with self.assertRaises(module.Refused):module._resume('fixture')
      self.assertEqual(f.vhost.read_bytes(),RAW);self.assertEqual(f.postfix.read_bytes(),b'original postfix\n');stop.assert_called_once()
      self.assertEqual(f.helper.php.call_args.args[0]['mode'],'restore')
     else:
      result=module._resume('fixture');self.assertTrue(result['resumed']);self.assertFalse(result['database_recreated']);self.assertFalse(result['packages_reinstalled']);stop.assert_not_called()
     activation.assert_called_once();trusted.assert_called_once_with(f.runtime);f.webmail.install.assert_not_called();f.webmail.preflight.assert_not_called()
    self.assertTrue((f.backup/'pre-resume-receipt.json').is_file());self.assertTrue(f.state.is_file())
 def assert_empty(self,state):EMPTY_STATE(state)
 def test_customer_state_refuses_resume(self):
  with tempfile.TemporaryDirectory()as directory:
   f=self.fixture(Path(directory));module.resume_empty_state(f.state)
   with sqlite3.connect(f.state)as db:db.execute("INSERT INTO mail_jobs VALUES('fixture')")
   with self.assertRaises(module.Refused):module.resume_empty_state(f.state)
 def test_unrelated_backup_path_is_refused_before_any_command(self):
  with patch.object(module,'run')as run:
   with self.assertRaises(module.Refused):module.resume_backup('/root/unrelated')
   run.assert_not_called()
if __name__=='__main__':unittest.main()
