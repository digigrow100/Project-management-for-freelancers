import base64
import hashlib
import importlib.util
import json
from pathlib import Path
import socket
import sqlite3
import tempfile
import types
import unittest
from unittest.mock import patch, MagicMock

spec = importlib.util.spec_from_file_location('readiness', Path(__file__).resolve().parents[1] / 'scripts/email/inspect_mail_readiness.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
RealPinnedSMTP = module.PinnedSMTP


class MailReadinessReport(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.key = self.root / 'host.key'
        self.key.write_bytes(base64.urlsafe_b64encode(b'x' * 32))
        self.key.chmod(0o600)
        self.settings = self.root / 'settings.json'
        self.settings.write_text(json.dumps({'state_dir': str(self.root), 'management': {'host_private_file': str(self.key)}, 'provider': {'password_file': 'PRIVATE_SENTINEL'}}))
        self.settings.chmod(0o600)
        self.db_path = self.root / 'services.sqlite'
        db = sqlite3.connect(self.db_path)
        db.executescript("create table managed_bindings(kind text,enabled int,config text);create table managed_jobs(kind text,state text);insert into managed_bindings values('email',1,'{\"smtp_locked\":true}');insert into managed_jobs values('email','uncertain');")
        db.close()
        self.smtp = MagicMock()
        self.tls = MagicMock()
        self.tls.return_value.wrap_socket.return_value.__enter__.return_value.recv.return_value = b'* OK IMAP ready\r\n'
        self.patches = [patch.object(module, 'SETTINGS', self.settings), patch.object(module.os, 'geteuid', return_value=0),
                        patch.object(module, 'public_fingerprint', return_value='f' * 64),
                        patch.object(module.subprocess, 'run', return_value=types.SimpleNamespace(returncode=0)),
                        patch.object(module.socket, 'getaddrinfo', return_value=[(socket.AF_INET, socket.SOCK_STREAM, 6, '', ('62.171.130.156', 587))]),
                        patch.object(module.socket, 'create_connection', return_value=MagicMock()),
                        patch.object(module.ssl, 'create_default_context', self.tls),
                        patch.object(module, 'PinnedSMTP', self.smtp)]
        for item in self.patches:
            item.start()

    def tearDown(self):
        for item in reversed(self.patches):
            item.stop()
        self.temp.cleanup()

    def report(self):
        before = hashlib.sha256(self.db_path.read_bytes()).hexdigest()
        report = module.inspect()
        self.assertEqual(hashlib.sha256(self.db_path.read_bytes()).hexdigest(), before)
        self.assertNotIn('PRIVATE_SENTINEL', json.dumps(report))
        self.assertFalse(report['mail_sent'])
        self.assertEqual(report['provider_changes'], 0)
        self.assertFalse(report['delivery_verified'])
        self.smtp.return_value.__enter__.return_value.login.assert_not_called()
        self.smtp.return_value.__enter__.return_value.sendmail.assert_not_called()
        return report

    def test_complete_collection_not_delivery_claim(self):
        report = self.report()
        self.assertTrue(report['complete'])
        self.assertEqual(report['mail_bindings'], {'total': 1, 'enabled': 1, 'smtp_locked': 1})
        self.assertEqual(report['unresolved_mail_jobs'], 1)
        self.assertTrue(report['smtp_starttls'])
        self.assertTrue(report['imap_tls'])
        self.assertEqual(report['host_fingerprint'], 'f' * 64)

    def test_settings_mode_diagnosed_without_weakening_or_chmod(self):
        self.settings.chmod(0o640)
        report = self.report()
        self.assertEqual(report['issues'][0]['stage'], 'settings')
        self.assertEqual(report['issues'][0]['code'], 'file_not_private')
        self.assertEqual(report['file_metadata']['settings']['mode'], '0640')
        self.assertIsNone(report['provider_configured'])
        self.assertTrue(report['smtp_starttls'])
        self.assertTrue(report['services']['postfix'])
        self.assertEqual(self.settings.stat().st_mode & 0o777, 0o640)

    def test_invalid_key_does_not_hide_inventory_or_tls(self):
        self.key.write_text('PRIVATE_SENTINEL')
        report = self.report()
        self.assertEqual(report['issues'][0]['stage'], 'host_key')
        self.assertIn(report['issues'][0]['code'], ['host_key_encoding_invalid', 'host_key_length_invalid'])
        self.assertIsNone(report['host_fingerprint'])
        self.assertEqual(report['mail_bindings']['enabled'], 1)
        self.assertTrue(report['imap_tls'])

    def test_non_public_resolution_reports_cause_and_preserves_results(self):
        with patch.object(module.socket, 'getaddrinfo', return_value=[(socket.AF_INET, socket.SOCK_STREAM, 6, '', ('127.0.1.1', 587))]):
            report = self.report()
        self.assertEqual(report['issues'][0]['code'], 'mail_hostname_has_non_public_addresses')
        self.assertEqual(report['hostname_resolution']['addresses'], ['127.0.1.1'])
        self.assertEqual(report['host_fingerprint'], 'f' * 64)
        self.assertEqual(report['mail_bindings']['total'], 1)
        self.assertTrue(report['smtp_starttls'], 'pinned public endpoint is independent of local hostname aliases')
        self.assertTrue(report['imap_tls'])
        self.assertEqual(report['endpoint_ipv4'], '62.171.130.156')

    def test_malformed_database_policy_and_dns_failure_are_independent(self):
        db = sqlite3.connect(self.db_path)
        db.execute("update managed_bindings set config='PRIVATE_SENTINEL'")
        db.commit()
        db.close()
        with patch.object(module.socket, 'getaddrinfo', side_effect=socket.gaierror('PRIVATE_SENTINEL')):
            report = self.report()
        self.assertEqual([e['stage'] for e in report['issues']], ['inventory', 'hostname_resolution'])
        self.assertEqual(report['host_fingerprint'], 'f' * 64)
        self.assertTrue(report['services']['dovecot'])

    def test_tls_failure_does_not_hide_other_endpoint(self):
        self.smtp.side_effect = OSError('PRIVATE_SENTINEL')
        report = self.report()
        self.assertFalse(report['smtp_starttls'])
        self.assertTrue(report['imap_tls'])
        self.assertEqual(report['issues'][0]['stage'], 'smtp_starttls')

    def test_pinned_smtp_destination_keeps_certificate_hostname(self):
        client = object.__new__(RealPinnedSMTP)
        with patch.object(module.socket, 'create_connection') as connection:
            client._get_socket(module.HOST, 587, 8)
            connection.assert_called_once_with(('62.171.130.156', 587), timeout=8)
        with self.assertRaises(module.CheckError):
            client._get_socket('other.example.test', 587, 8)
        with self.assertRaises(module.CheckError):
            client._get_socket(module.HOST, 25, 8)

    def test_starttls_verifies_host_name_not_ip(self):
        with patch.object(RealPinnedSMTP, 'connect', return_value=(220, b'ready')):
            client = RealPinnedSMTP(module.HOST, 587, timeout=8)
        client.sock = MagicMock()
        original = client.sock
        context = MagicMock()
        with patch.object(client, 'ehlo_or_helo_if_needed'), patch.object(client, 'has_extn', return_value=True), patch.object(client, 'docmd', return_value=(220, b'ready')):
            client.starttls(context=context)
        context.wrap_socket.assert_called_once_with(original, server_hostname='server1.housemysite.com')

    def test_symlink_is_not_followed(self):
        link = self.root / 'link.json'
        link.symlink_to(self.settings)
        with patch.object(module, 'SETTINGS', link):
            report = self.report()
        self.assertFalse(report['checks']['settings'])
        self.assertIsNone(report['provider_configured'])


if __name__ == '__main__':
    unittest.main()
