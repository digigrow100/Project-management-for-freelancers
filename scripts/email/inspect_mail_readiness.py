#!/usr/bin/env python3
"""One read-only mail enrollment check. Never sends email, authenticates a mailbox,
changes provider/DNS settings, enrolls a worker or prints credentials/customer addresses.
Run the reviewed file as root on the existing HouseMySite VPS.
"""
import base64
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


def private_file(path):
    path = Path(path)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_size > 65536 or info.st_mode & 0o077:
            raise ValueError('Private regular file required')
        return os.read(fd, 65537)
    finally:
        os.close(fd)


def inspect():
    if os.geteuid() != 0:
        raise ValueError('Run as root on the enrolled VPS')
    config = json.loads(private_file(SETTINGS))
    management = config.get('management') or {}
    report = {'read_only': True, 'provider_changes': 0, 'mail_sent': False,
              'server_hostname': HOST, 'provider_configured': bool(config.get('provider')),
              'management_configured': bool(management), 'host_fingerprint': None}
    key_path = management.get('host_private_file')
    if key_path:
        from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey
        from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
        secret = base64.urlsafe_b64decode(private_file(key_path).strip())
        public = X25519PrivateKey.from_private_bytes(secret).public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
        report['host_fingerprint'] = hashlib.sha256(public).hexdigest()
    state = Path(config['state_dir']) / 'services.sqlite'
    report['state_present'] = state.is_file() and not state.is_symlink()
    report['mail_bindings'] = {'total': 0, 'enabled': 0, 'smtp_locked': 0}
    if report['state_present']:
        db = sqlite3.connect(state.resolve().as_uri() + '?mode=ro', uri=True)
        try:
            have = {r[0] for r in db.execute("select name from sqlite_master where type='table'")}
            if 'managed_bindings' in have:
                rows = list(db.execute("select enabled,config from managed_bindings where kind='email'"))
                report['mail_bindings'] = {'total': len(rows), 'enabled': sum(bool(r[0]) for r in rows),
                                          'smtp_locked': sum(bool(json.loads(r[1]).get('smtp_locked')) for r in rows)}
            if 'managed_jobs' in have:
                report['unresolved_mail_jobs'] = db.execute("select count(*) from managed_jobs where kind='email' and state in ('queued','applying','uncertain')").fetchone()[0]
        finally:
            db.close()
    report['services'] = {}
    for unit in ('postfix', 'dovecot', 'rspamd', 'housemysite-services'):
        result = subprocess.run(['systemctl', 'is-active', unit], capture_output=True, timeout=5, check=False)
        report['services'][unit] = result.returncode == 0
    # Fixed hostname, public addresses only, verified certificate. No provider or customer password.
    addresses = socket.getaddrinfo(HOST, 587, type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(row[4][0]).is_global for row in addresses):
        raise ValueError('Mail hostname must resolve only to public addresses')
    report['smtp_starttls'] = False
    report['imap_tls'] = False
    try:
        with smtplib.SMTP(HOST, 587, timeout=8) as smtp:
            smtp.ehlo()
            smtp.starttls(context=ssl.create_default_context())
            smtp.ehlo()
            report['smtp_starttls'] = True
    except (OSError, smtplib.SMTPException):
        pass
    try:
        with socket.create_connection((HOST, 993), timeout=8) as raw:
            with ssl.create_default_context().wrap_socket(raw, server_hostname=HOST) as conn:
                greeting = conn.recv(512)
                report['imap_tls'] = greeting.upper().startswith(b'* OK')
    except OSError:
        pass
    report['delivery_verified'] = False
    report['next'] = 'Review enrollment, domain ownership and plan sending controls before activating mailbox creation. This check does not prove delivery.'
    return report


if __name__ == '__main__':
    try:
        print(json.dumps(inspect()))
    except Exception as error:
        print(json.dumps({'read_only': True, 'provider_changes': 0, 'mail_sent': False, 'error_type': type(error).__name__, 'reason': 'Mail readiness could not be fully inspected. No activation was attempted.'}))
        raise SystemExit(2)
