#!/usr/bin/env python3
"""Read-only mail enrollment report. No mail authentication/sending, provider/DNS
writes or credential output. A failed section never hides independent results.
"""
import base64
import binascii
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import socket
import sqlite3
import ssl
import stat
import subprocess
import smtplib

SETTINGS = Path('/etc/housemysite-services/settings.json')
HOST = 'server1.housemysite.com'
PUBLIC_IPV4 = '62.171.130.156'  # Existing enrolled VPS; never a caller-supplied destination.


class CheckError(ValueError):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def private_file(path, metadata=None):
    """Keep the original file boundary. Diagnose it, never chmod or bypass it."""
    fd = os.open(Path(path), os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        info = os.fstat(fd)
        if metadata is not None:
            metadata.update(mode=format(stat.S_IMODE(info.st_mode), '04o'), uid=info.st_uid,
                            gid=info.st_gid, bytes=info.st_size, regular=stat.S_ISREG(info.st_mode))
        if not stat.S_ISREG(info.st_mode):
            raise CheckError('not_regular_file')
        if info.st_size > 65536:
            raise CheckError('file_too_large')
        if info.st_mode & 0o077:
            raise CheckError('file_not_private')
        data = os.read(fd, 65537)
        if len(data) > 65536:
            raise CheckError('file_too_large')
        return data
    finally:
        os.close(fd)


class PinnedSMTP(smtplib.SMTP):
    def _get_socket(self, host, port, timeout):
        if host != HOST or port != 587 or not ipaddress.ip_address(PUBLIC_IPV4).is_global:
            raise CheckError('unexpected_mail_endpoint')
        # SMTP retains HOST for STARTTLS certificate/SNI verification. Only the
        # connection destination is pinned, so local /etc/hosts aliases cannot
        # send a diagnostic to a private address or hide this independent result.
        return socket.create_connection((PUBLIC_IPV4, 587), timeout=timeout)


def public_fingerprint(secret):
    from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey
    from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
    public = X25519PrivateKey.from_private_bytes(secret).public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
    return hashlib.sha256(public).hexdigest()


def inspect():
    report = {'read_only': True, 'provider_changes': 0, 'mail_sent': False,
              'server_hostname': HOST, 'endpoint_ipv4': PUBLIC_IPV4, 'complete': False, 'issues': [], 'checks': {},
              'file_metadata': {}, 'provider_configured': None, 'management_configured': None,
              'host_fingerprint': None, 'state_present': None, 'mail_bindings': None,
              'unresolved_mail_jobs': None, 'services': {}, 'hostname_resolution': None,
              'smtp_starttls': None, 'imap_tls': None, 'delivery_verified': False}

    def issue(stage, error):
        # Only our own fixed codes and exception TYPE. Never exception text, paths,
        # provider responses, JSON contents, private key bytes or customer addresses.
        code = error.code if isinstance(error, CheckError) else {
            FileNotFoundError: 'file_missing', PermissionError: 'file_access_denied',
            json.JSONDecodeError: 'invalid_json', TimeoutError: 'check_timed_out',
        }.get(type(error), 'check_failed')
        report['issues'].append({'stage': stage, 'code': code, 'error_type': type(error).__name__})
        report['checks'][stage] = False

    def check(stage, work):
        try:
            result = work()
            report['checks'][stage] = True
            return result
        except Exception as error:
            issue(stage, error)
            return None

    if getattr(os, 'geteuid', lambda: -1)() != 0:
        issue('operator', CheckError('root_required'))
        return report

    def settings():
        metadata = report['file_metadata'].setdefault('settings', {})
        value = json.loads(private_file(SETTINGS, metadata))
        if not isinstance(value, dict):
            raise CheckError('settings_not_object')
        report['provider_configured'] = isinstance(value.get('provider'), dict)
        report['management_configured'] = isinstance(value.get('management'), dict)
        return value

    config = check('settings', settings)
    if config is not None:
        def fingerprint():
            management = config.get('management')
            if not isinstance(management, dict) or not isinstance(management.get('host_private_file'), str):
                raise CheckError('host_key_not_configured')
            metadata = report['file_metadata'].setdefault('host_key', {})
            data = private_file(management['host_private_file'], metadata).strip()
            try:
                secret = base64.b64decode(data, altchars=b'-_', validate=True)
            except (ValueError, binascii.Error):
                raise CheckError('host_key_encoding_invalid') from None
            if len(secret) != 32:
                raise CheckError('host_key_length_invalid')
            report['host_fingerprint'] = public_fingerprint(secret)
        check('host_key', fingerprint)

        def inventory():
            directory = config.get('state_dir')
            if not isinstance(directory, str) or not Path(directory).is_absolute():
                raise CheckError('state_directory_invalid')
            state = Path(directory) / 'services.sqlite'
            report['state_present'] = state.is_file() and not state.is_symlink()
            if not report['state_present']:
                raise CheckError('state_file_missing_or_symlink')
            db = sqlite3.connect(state.resolve().as_uri() + '?mode=ro', uri=True, timeout=5)
            try:
                have = {r[0] for r in db.execute("select name from sqlite_master where type='table'")}
                if 'managed_bindings' not in have:
                    raise CheckError('mail_binding_table_missing')
                rows = list(db.execute("select enabled,config from managed_bindings where kind='email'"))
                policies = [json.loads(r[1]) for r in rows]
                if any(not isinstance(p, dict) or type(p.get('smtp_locked', False)) is not bool for p in policies):
                    raise CheckError('mail_binding_policy_invalid')
                report['mail_bindings'] = {'total': len(rows), 'enabled': sum(r[0] == 1 for r in rows),
                                          'smtp_locked': sum(p.get('smtp_locked', False) for p in policies)}
                if 'managed_jobs' in have:
                    report['unresolved_mail_jobs'] = db.execute("select count(*) from managed_jobs where kind='email' and state in ('queued','applying','uncertain')").fetchone()[0]
            finally:
                db.close()
        check('inventory', inventory)
    else:
        report['checks']['host_key'] = 'not_checked_settings_unavailable'
        report['checks']['inventory'] = 'not_checked_settings_unavailable'

    for unit in ('postfix', 'dovecot', 'rspamd', 'housemysite-services'):
        def service(name=unit):
            result = subprocess.run(['systemctl', 'is-active', name], capture_output=True, timeout=5, check=False)
            report['services'][name] = result.returncode == 0
        check('service_' + unit, service)

    def resolution():
        addresses = sorted({r[4][0] for r in socket.getaddrinfo(HOST, 587, type=socket.SOCK_STREAM)})
        public = bool(addresses) and all(ipaddress.ip_address(a).is_global for a in addresses)
        report['hostname_resolution'] = {'addresses': addresses[:16], 'public_only': public}
        if not public:
            raise CheckError('mail_hostname_has_non_public_addresses')
        return True
    check('hostname_resolution', resolution)
    if ipaddress.ip_address(PUBLIC_IPV4).is_global:
        def smtp_check():
            with PinnedSMTP(HOST, 587, timeout=8) as smtp:
                smtp.ehlo()
                smtp.starttls(context=ssl.create_default_context())
                smtp.ehlo()
                report['smtp_starttls'] = True
        def imap_check():
            with socket.create_connection((PUBLIC_IPV4, 993), timeout=8) as raw:
                with ssl.create_default_context().wrap_socket(raw, server_hostname=HOST) as conn:
                    if not conn.recv(512).upper().startswith(b'* OK'):
                        raise CheckError('imap_greeting_invalid')
                    report['imap_tls'] = True
        check('smtp_starttls', smtp_check)
        if report['checks']['smtp_starttls'] is False:
            report['smtp_starttls'] = False
        check('imap_tls', imap_check)
        if report['checks']['imap_tls'] is False:
            report['imap_tls'] = False
    else:
        report['checks']['smtp_starttls'] = 'not_checked_pinned_address_invalid'
        report['checks']['imap_tls'] = 'not_checked_pinned_address_invalid'
    report['complete'] = not report['issues']
    report['next'] = 'Review issues and enrollment before activation. This report never proves authenticated mail delivery.'
    return report


if __name__ == '__main__':
    try:
        result = inspect()
    except Exception as error:
        result = {'read_only': True, 'provider_changes': 0, 'mail_sent': False, 'complete': False,
                  'issues': [{'stage': 'report', 'code': 'unexpected_report_failure', 'error_type': type(error).__name__}]}
    print(json.dumps(result))
    # A valid report with findings is a completed read-only check, not a transport failure.
    raise SystemExit(2 if any(i.get('code') == 'unexpected_report_failure' for i in result.get('issues', [])) else 0)
