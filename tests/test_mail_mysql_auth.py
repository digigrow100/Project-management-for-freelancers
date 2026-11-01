"""Local credential fixtures only. Never reads ISPConfig or contacts a database."""
import importlib.util
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('webmail_native',ROOT/'scripts/email/webmail_setup.py');webmail=importlib.util.module_from_spec(spec);spec.loader.exec_module(webmail)
FIXTURE="<?php\n// Native ISPConfig admin data\n$clientdb_host = 'localhost';\n$clientdb_user = 'root';\n$clientdb_password = 'Fixture-Only-Pass';\n?>\n"
class NativeMysql(unittest.TestCase):
 def test_literal_native_format_and_comments(self):
  value=webmail.parse_native(FIXTURE);self.assertEqual(value,{'host':'localhost','user':'root','password':'Fixture-Only-Pass'})
  self.assertEqual(webmail.parse_native(FIXTURE.replace('// Native ISPConfig admin data',"/* $clientdb_password='ignored'; */")),value)
  self.assertEqual(webmail.php_string(r"'back\\slash\'quote\n'"),"back\\slash'quote\\n")
  self.assertEqual(webmail.php_string(r'"escaped\$dollar\\slash\"quote"'),'escaped$dollar\\slash"quote')
 def test_executable_php_interpolation_and_duplicate_fields_refused(self):
  cases=[FIXTURE.replace('?>',"system('not executed'); ?>"),FIXTURE.replace('?>',"$clientdb_password='overwrite'; ?>"),FIXTURE.replace("'Fixture-Only-Pass'",'"$environment"'),FIXTURE.replace("'Fixture-Only-Pass'","getenv('SECRET')"),FIXTURE+'unexpected text',FIXTURE.replace("'localhost'","'remote.example.test'")]
  for value in cases:
   with self.subTest(value=value),self.assertRaises(webmail.WebmailRefused):webmail.parse_native(value)
 def test_options_cannot_inject_new_client_directives(self):
  value='quote"\\slash\n[client]\ninit-command=BAD\r\ttail';encoded=webmail.option_value(value)
  self.assertNotIn('\n',encoded);self.assertNotIn('\r',encoded);self.assertNotIn('\t',encoded);self.assertTrue(encoded.startswith('"')and encoded.endswith('"'));self.assertIn('\\"',encoded);self.assertIn('\\n[client]\\n',encoded)
 def test_native_credentials_use_inherited_private_memory_not_argv_env_or_disk(self):
  observed={};real_run=subprocess.run
  def launch(args,**kwargs):
   self.assertTrue(args[1].startswith('--defaults-file=/proc/self/fd/'));fd=kwargs['pass_fds'][0];observed['fd']=fd
   self.assertNotIn('Fixture-Only-Pass',str(args));self.assertNotIn('MYSQL_PWD',kwargs['env']);self.assertEqual(stat.S_IMODE(os.fstat(fd).st_mode),0o600)
   child="import os,sys; p='/proc/self/fd/'+sys.argv[1]; f=open(p,'rb'); data=f.read(); assert b'Fixture-Only-Pass' in data; assert data.startswith(b'[client]\\n'); print('1')"
   return real_run([sys.executable,'-c',child,str(fd)],**kwargs)
  with patch.object(webmail,'CLIENTDB',SimpleNamespace(exists=lambda:True,is_symlink=lambda:False)),patch.object(webmail,'native_text',return_value=FIXTURE),patch.object(webmail.subprocess,'run',side_effect=launch),patch.dict(os.environ,{'MYSQL_PWD':'must-not-inherit'}):
   self.assertEqual(webmail.mysql('SELECT 1').strip(),'1')
  with self.assertRaises(OSError):os.fstat(observed['fd'])
 def test_failed_auth_reports_only_fixed_code_and_closes_descriptor(self):
  seen={}
  def fail(args,**kwargs):seen['fd']=kwargs['pass_fds'][0];return subprocess.CompletedProcess(args,1,b'',b'ERROR 1045 (28000): Fixture-Only-Pass should never be returned')
  with patch.object(webmail,'CLIENTDB',SimpleNamespace(exists=lambda:True,is_symlink=lambda:False)),patch.object(webmail,'native_text',return_value=FIXTURE),patch.object(webmail.subprocess,'run',side_effect=fail),patch.object(webmail.os,'geteuid',return_value=1000):
   with self.assertRaises(webmail.WebmailRefused)as error:webmail.mysql('SELECT 1')
  self.assertEqual(str(error.exception),'mysql_admin_auth_failed');self.assertNotIn('Fixture',str(error.exception))
  with self.assertRaises(OSError):os.fstat(seen['fd'])
 def test_socket_missing_is_distinct_from_auth_failure(self):
  for stderr,code in [(b'ERROR 2002 socket unavailable','mysql_socket_unavailable'),(b'ERROR 1698 refused','mysql_admin_auth_failed'),(b'ERROR 1064 SQL contains sensitive text','mysql_operation_failed')]:
   with self.subTest(code=code),patch.object(webmail,'CLIENTDB',SimpleNamespace(exists=lambda:False,is_symlink=lambda:False)),patch.object(webmail.subprocess,'run',return_value=subprocess.CompletedProcess([],1,b'',stderr)):
    with self.assertRaises(webmail.WebmailRefused)as error:webmail.mysql('SELECT 1')
    self.assertEqual(error.exception.code,code)
 def test_unconfigured_socket_route_is_noninteractive_and_does_not_retry(self):
  with patch.object(webmail,'CLIENTDB',SimpleNamespace(exists=lambda:False,is_symlink=lambda:False)),patch.object(webmail.subprocess,'run',return_value=subprocess.CompletedProcess([],0,b'1\n',b''))as run:
   self.assertEqual(webmail.mysql('SELECT 1'),'1\n');self.assertIn('--no-defaults',run.call_args.args[0]);self.assertIn('--protocol=socket',run.call_args.args[0]);self.assertEqual(run.call_count,1)
 def test_symlink_and_writable_credential_file_are_never_accepted(self):
  with tempfile.TemporaryDirectory()as directory:
   target=Path(directory)/'config';target.write_text(FIXTURE);target.chmod(0o600);link=Path(directory)/'link';link.symlink_to(target)
   # Ancestor ownership is independently checked in production; fixture temp
   # ancestors are writable. No arbitrary config is evaluated in either case.
   with self.assertRaises(webmail.WebmailRefused):webmail.native_text(link)
   target.chmod(0o666)
   with self.assertRaises(webmail.WebmailRefused):webmail.native_text(target)
 def test_installed_mariadb_client_reads_private_inherited_options(self):
  if not Path('/usr/bin/mysql').is_file():
   if os.environ.get('HMS_REQUIRE_MYSQL_CLIENT')=='1':self.fail('Disposable MariaDB client is required for this CI check')
   self.skipTest('MariaDB client is only installed in disposable CI')
  real_run=subprocess.run
  def probe(args,**kwargs):
   result=real_run([args[0],args[1],'--print-defaults'],**kwargs)
   self.assertEqual(result.returncode,0,'Native client did not accept the protected option descriptor')
   self.assertIn(b'--user=fixture_memfd_admin',result.stdout);self.assertIn(b'--password=',result.stdout)
   return subprocess.CompletedProcess(args,0,b'1\n',b'')
  with patch.object(webmail,'CLIENTDB',SimpleNamespace(exists=lambda:True,is_symlink=lambda:False)),patch.object(webmail,'native_text',return_value=FIXTURE.replace("'root'","'fixture_memfd_admin'")),patch.object(webmail.subprocess,'run',side_effect=probe):self.assertEqual(webmail.mysql('SELECT 1'),'1\n')
 def test_new_config_directory_is_readable_by_fpm_under_private_umask(self):
  with tempfile.TemporaryDirectory()as directory,patch.object(webmail.os,'chown')as owner:
   path=Path(directory)/'isolated-config';previous=os.umask(0o077)
   try:webmail.create_config_directory(path,1234)
   finally:os.umask(previous)
   self.assertEqual(stat.S_IMODE(path.stat().st_mode),0o750);owner.assert_called_once_with(path,0,1234)
   with self.assertRaises(FileExistsError):webmail.create_config_directory(path,1234)
 def test_unknown_exception_message_cannot_become_a_public_code(self):
  error=webmail.WebmailRefused('Fixture-Only-Pass');self.assertEqual(error.code,'webmail_configuration_conflict');self.assertNotIn('Fixture',str(error))

class LocalSocketAdmin(unittest.TestCase):
 def result(self,output=b'1\n1\n',code=0,error=b''):
  return subprocess.CompletedProcess([],code,output,error)
 def test_verified_socket_identity_executes_once_without_password_or_inherited_fd(self):
  responses=[self.result(code=1,error=b'ERROR 1045 (28000): Access denied for user'),self.result(),self.result(b'result\n')]
  with patch.object(webmail,'CLIENTDB',SimpleNamespace(exists=lambda:True,is_symlink=lambda:False)),patch.object(webmail,'native_text',return_value=FIXTURE),patch.object(webmail.os,'geteuid',return_value=0),patch.object(webmail.subprocess,'run',side_effect=responses)as run:
   self.assertEqual(webmail.mysql('SELECT fixture;','hms_webmail'),'result\n')
  calls=run.call_args_list;self.assertEqual(len(calls),3)
  for call in calls[1:]:
   self.assertEqual(call.args[0][:5],['/usr/sbin/runuser','-u','mysql','--','/usr/bin/mysql'])
   self.assertIn('--no-defaults',call.args[0]);self.assertIn('--skip-password',call.args[0]);self.assertIn('--protocol=socket',call.args[0]);self.assertEqual(call.kwargs['pass_fds'],())
   self.assertNotIn('Fixture',str(call));self.assertNotIn('MYSQL_PWD',call.kwargs['env']);self.assertEqual(call.kwargs['env']['HOME'],'/nonexistent')
  self.assertIn(b"CURRENT_USER()='mysql@localhost'",calls[1].kwargs['input'])
  self.assertEqual(calls[2].kwargs['input'],b'SELECT fixture;');self.assertEqual(calls[2].args[0][-1],'hms_webmail')
  with self.assertRaises(OSError):os.fstat(calls[0].kwargs['pass_fds'][0])
 def test_wrong_identity_or_missing_admin_permissions_never_receives_operation(self):
  for output in (b'0\n1\n',b'1\n0\n',b'1\n1\nextra',b''):
   with self.subTest(output=output),patch.object(webmail.os,'geteuid',return_value=0),patch.object(webmail.subprocess,'run',return_value=self.result(output))as run:
    with self.assertRaises(webmail.WebmailRefused)as error:webmail.local_admin_mysql('CREATE DATABASE must_not_run;')
    self.assertEqual(error.exception.code,'mysql_local_admin_unverified');self.assertEqual(run.call_count,1);self.assertNotIn(b'CREATE DATABASE',run.call_args.kwargs['input'])
 def test_nonroot_cannot_request_identity_switch(self):
  with patch.object(webmail.os,'geteuid',return_value=1000),patch.object(webmail.subprocess,'run')as run:
   with self.assertRaises(webmail.WebmailRefused):webmail.local_admin_mysql('SELECT 1')
   run.assert_not_called()
 def test_failed_socket_login_never_receives_operation_or_exposes_error(self):
  with patch.object(webmail.os,'geteuid',return_value=0),patch.object(webmail.subprocess,'run',return_value=self.result(code=1,error=b'ERROR 1045 (28000): sensitive fixture'))as run:
   with self.assertRaises(webmail.WebmailRefused)as error:webmail.local_admin_mysql('CREATE DATABASE must_not_run;')
   self.assertEqual(str(error.exception),'mysql_admin_auth_failed');self.assertEqual(run.call_count,1)
 def test_failed_mutation_is_not_retried(self):
  responses=[self.result(),self.result(code=1,error=b'ERROR 2013 (HY000): uncertain fixture SQL')]
  with patch.object(webmail.os,'geteuid',return_value=0),patch.object(webmail.subprocess,'run',side_effect=responses)as run:
   with self.assertRaises(webmail.WebmailRefused)as error:webmail.local_admin_mysql('CREATE DATABASE fixture;')
   self.assertEqual(str(error.exception),'mysql_operation_failed');self.assertEqual(run.call_count,2)
 def test_sql_error_timeout_and_socket_failure_never_trigger_fallback(self):
  failures=[self.result(code=1,error=b'ERROR 1045 (28000) at line 1: execution error'),self.result(code=1,error=b'ERROR 2002 (HY000): socket missing'),self.result(code=1,error=b'ERROR 1064 (42000) at line 1: SQL error')]
  for failure in failures:
   with self.subTest(stderr=failure.stderr),patch.object(webmail,'CLIENTDB',SimpleNamespace(exists=lambda:False,is_symlink=lambda:False)),patch.object(webmail.subprocess,'run',return_value=failure),patch.object(webmail,'local_admin_mysql')as fallback:
    with self.assertRaises(webmail.WebmailRefused):webmail.mysql('CREATE DATABASE fixture;')
    fallback.assert_not_called()
  with patch.object(webmail,'CLIENTDB',SimpleNamespace(exists=lambda:False,is_symlink=lambda:False)),patch.object(webmail.subprocess,'run',side_effect=subprocess.TimeoutExpired('mysql',60)),patch.object(webmail,'local_admin_mysql')as fallback:
   with self.assertRaises(webmail.WebmailRefused):webmail.mysql('CREATE DATABASE fixture;')
   fallback.assert_not_called()
if __name__=='__main__':unittest.main()
