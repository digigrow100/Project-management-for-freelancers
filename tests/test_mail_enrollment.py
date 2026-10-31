import importlib.util
import json
import hashlib
import os
import pathlib
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('enrollment', pathlib.Path(__file__).resolve().parents[1] / 'scripts/email/enroll_verified_mail.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class MailEnrollmentGuards(unittest.TestCase):
    def sample(self, local='mailtest', domain='example.test'):
        return {'email': local+'@'+domain, 'uid':'5000', 'gid':'5000', 'homedir':'/var/vmail', 'maildir':'/var/vmail/'+domain+'/'+local}

    def template(self, rows):
        return module.mail_template(rows, 5000, 5000, '/var/vmail')

    def test_distinct_domains_and_mailboxes_share_only_placeholder_template(self):
        result = self.template([self.sample(), self.sample('info','other.test')])
        self.assertEqual(result['maildir'], '/var/vmail/{domain}/{localpart}')
        self.assertEqual(result['uid'], 5000)
        self.assertEqual(result['disablesmtp'], 'y')
        self.assertNotIn('example.test', str(result))
        self.assertFalse(any('password' in key for key in result))

    def test_unsafe_templates_fail_before_enrollment(self):
        for changes in [{'uid':'0'},{'gid':'0'},{'maildir':'/etc/passwd'},{'maildir':'/var/vmail/example.test/other'},{'homedir':'/root'},{'maildir':'/var/vmail/example.test/mailtest/../escape'}]:
            with self.subTest(changes=changes), self.assertRaises(module.Refused):
                self.template([dict(self.sample(),**changes)])
        with self.assertRaises(module.Refused): self.template([])
        with self.assertRaises(module.Refused): module.mail_template([self.sample()],0,0,'/var/vmail')

    def test_conflicting_provider_layouts_are_not_guessed(self):
        other=self.sample('info','other.test');other['maildir']+='/Maildir'
        with self.assertRaises(module.Refused): self.template([self.sample(),other])

    def test_mail_permissions_are_additive_and_limited(self):
        original='client_get;client_add;mail_user_get;'
        updated,missing=module.permission_delta(original)
        self.assertTrue(updated.startswith(original))
        self.assertEqual(set(missing),set(module.METHODS)-{'mail_user_get'})
        self.assertEqual(set(updated.split(';'))-{''}, {'client_get','client_add'}|set(module.METHODS))
        self.assertEqual(module.permission_delta(updated),(updated,[]))
        for bad in ['serialized:array','client_get; ANY;','client_get|mail_user_add',';client_get;']:
            with self.assertRaises(module.Refused):module.permission_delta(bad)

    def test_private_metadata_reader_keeps_file_boundaries(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=pathlib.Path(tmp)/'secret';p.write_text('fixture');p.chmod(0o600)
            self.assertEqual(module.read_private(p,p.stat().st_uid),b'fixture')
            p.chmod(0o640)
            with self.assertRaises(module.Refused):module.read_private(p,p.stat().st_uid)
            self.assertEqual(p.stat().st_mode & 0o777,0o640)
            link=pathlib.Path(tmp)/'link';link.symlink_to(p)
            with self.assertRaises(OSError):module.read_private(link,p.stat().st_uid)

    def test_worker_uses_existing_signature_gate_and_no_send_command(self):
        files=module.unit_files();self.assertEqual(len(files),2)
        service=files[module.UNIT+'.service'];timer=files[module.UNIT+'.timer']
        self.assertIn('User=hms-services\n',service)
        self.assertIn('approvals-managed\n',service)
        self.assertIn('NoNewPrivileges=yes\n',service)
        self.assertIn('ProtectSystem=strict\n',service)
        self.assertIn('ReadWritePaths=/var/lib/housemysite-services\n',service)
        self.assertNotIn('deliver-form',service)
        self.assertNotIn('apply-provision',service)
        self.assertIn('OnActiveSec=20s\n',timer)
        self.assertNotIn('Persistent=yes',timer)

    def test_policy_selection_uses_digest_not_assumed_filename(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory=pathlib.Path(tmp)
            (directory/'old.json').write_text('invalid')
            (directory/'business.json').write_text('{"version":1}')
            digest=lambda value:hashlib.sha256(json.dumps(value,sort_keys=True).encode()).hexdigest()
            pin=digest({'version':1})
            selected=module.find_policy(directory,pin,lambda p:p.read_bytes(),digest)
            self.assertEqual(selected,{'version':1})
            with self.assertRaises(module.Refused):module.find_policy(directory,'0'*64,lambda p:p.read_bytes(),digest)

    def test_runtime_directories_and_files_must_be_protected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=pathlib.Path(tmp)/'release';folder=root/'scripts';folder.mkdir(parents=True)
            file=folder/'worker.py';file.write_text('pass');file.chmod(0o644)
            module.protected_source(file,root,os.getuid())
            folder.chmod(0o777)
            with self.assertRaises(module.Refused):module.protected_source(file,root,os.getuid())
            folder.chmod(0o755)
            link=folder/'link.py';link.symlink_to(file)
            with self.assertRaises(module.Refused):module.protected_source(link,root,os.getuid())

    def test_stage_errors_do_not_leak_provider_text(self):
        def failed():raise RuntimeError('PRIVATE_SENTINEL')
        with self.assertRaises(module.Refused) as caught:module.step('provider_login',failed)
        self.assertEqual(str(caught.exception),'provider_login_RuntimeError')
        self.assertNotIn('PRIVATE_SENTINEL',str(caught.exception))

    def test_provider_metadata_queries_are_fixed_and_exclude_password_columns(self):
        self.assertIn('SET SESSION TRANSACTION READ ONLY',module.PHP)
        self.assertIn('SELECT email,uid,gid,maildir,homedir FROM mail_user',module.PHP)
        self.assertNotIn('SELECT *',module.PHP)
        self.assertNotIn('UPDATE mail_user',module.PHP)
        self.assertNotIn('INSERT INTO mail_user',module.PHP)
        self.assertIn('UPDATE remote_user SET remote_functions=? WHERE remote_userid=? AND BINARY remote_functions=?',module.PHP)
        self.assertNotIn('remote_password',module.PHP)


if __name__=='__main__':unittest.main()
