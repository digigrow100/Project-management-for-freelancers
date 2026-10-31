"""Install a separate relay and one exact route; preserve the existing services release."""
import argparse
import fcntl
import hashlib
import hmac
import http.client
import json
import os
from pathlib import Path
import pwd
import re
import shutil
import socket
import ssl
import stat
import subprocess
import tempfile
import time
import uuid

SOURCE = Path('/etc/apache2/sites-available/server1-ssl.conf')
TARGET = Path('/opt/housemysite-dynadot-relay')
UNIT = Path('/etc/systemd/system/housemysite-dynadot-relay.service')
HOST = 'server1.housemysite.com'
MARKER = '# BEGIN HOUSEMYSITE DYNADOT RELAY'
CA = '/etc/apache2/housemysite-services-ca.crt'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def command(*args):
    return subprocess.run(args, check=True, capture_output=True, timeout=30).stdout.decode()


def trusted(path):
    for item in (path, *path.parents):
        info = item.lstat()
        if info.st_uid != 0 or info.st_mode & 0o022 or stat.S_ISLNK(info.st_mode):
            raise ValueError('Untrusted installation path')
    if not path.is_file() or path.stat().st_nlink != 1:
        raise ValueError('Regular source required')


def render(raw):
    text = raw.decode()
    active = '\n'.join(line for line in text.splitlines() if not line.lstrip().startswith('#'))
    if (re.findall(r'<VirtualHost\s+([^>]+)>', active, re.I) != ['*:443']
        or re.findall(r'^\s*ServerName\s+([^\s#]+)', active, re.M | re.I) != [HOST]
        or len(re.findall(r'</VirtualHost\s*>', active, re.I)) != 1
        or '# BEGIN HOUSEMYSITE PRIVATE SERVICES' not in text
        or '# END HOUSEMYSITE PRIVATE SERVICES' not in text
        or '"^/v1/services$" "https://127.0.0.1:18443"' not in text
        or CA not in text or '/v1/dynadot-relay' in text):
        raise ValueError('Existing services vhost needs review; nothing changed')
    block = '''
    # BEGIN HOUSEMYSITE DYNADOT RELAY
    ProxyPassMatch "^/v1/dynadot-relay$" "https://127.0.0.1:18444" connectiontimeout=3 timeout=20 retry=0 max=4 acquire=1000
    <LocationMatch "^/v1/dynadot-relay$">
        <RequireAll>
            Require all granted
            Require method POST
            Require expr "req('Content-Type') == 'application/json'"
            Require expr "req('Content-Length') =~ m#^[0-9]{1,5}$# && req('Content-Length') -gt 0 && req('Content-Length') -le 32768"
            Require expr "-z req('Transfer-Encoding')"
            Require expr "req('X-HMS-Dynadot-Signature') =~ m#^[a-f0-9]{64}$#"
        </RequireAll>
        LimitRequestBody 32768
        Header always set Cache-Control "no-store"
    </LocationMatch>
    # END HOUSEMYSITE DYNADOT RELAY
'''
    # Existing exact service route and all other content remain byte-for-byte intact.
    return text.replace('# BEGIN HOUSEMYSITE PRIVATE SERVICES', block + '    # BEGIN HOUSEMYSITE PRIVATE SERVICES', 1).encode()


def atomic(path, data, mode):
    fd, name = tempfile.mkstemp(prefix='.hms-relay-', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            os.fchmod(stream.fileno(), mode)
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def request(method, path, body=None, headers=None):
    class LocalTLS(http.client.HTTPSConnection):
        def connect(self):
            raw = socket.create_connection(('127.0.0.1', 443), timeout=25)
            try:
                self.sock = ssl.create_default_context().wrap_socket(raw, server_hostname=HOST)
            except BaseException:
                raw.close()
                raise
    connection = LocalTLS(HOST, timeout=25)
    try:
        connection.request(method, path, body, headers or {})
        response = connection.getresponse()
        return response.status, response.read(65537), response.getheader('Location')
    finally:
        connection.close()


def health(key):
    packet = json.dumps({'schema': 1, 'nonce': str(uuid.uuid4()), 'expires': int(time.time()) + 60,
                         'mode': 'production', 'action': 'health'}, separators=(',', ':')).encode()
    headers = {'Content-Type': 'application/json', 'X-HMS-Dynadot-Signature': hmac.new(key, b'hms:dynadot-relay:v1:' + packet, hashlib.sha256).hexdigest()}
    status, data, _ = request('POST', '/v1/dynadot-relay', packet, headers)
    result = json.loads(data)
    if status != 200 or result.get('relay') != 'ready' or result.get('provider_authenticated') is not False:
        raise ValueError('Signed HTTPS relay health check failed')
    if request('POST', '/v1/dynadot-relay', packet, headers)[0] != 409:
        raise ValueError('Replay was not blocked')
    headers['X-HMS-Dynadot-Signature'] = '0' * 64
    if request('POST', '/v1/dynadot-relay', packet, headers)[0] != 403:
        raise ValueError('Invalid signature accepted')
    if request('GET', '/v1/dynadot-relay')[0] != 403:
        raise ValueError('GET accepted')
    return result


def rollback(backup):
    if backup.parent != Path('/root') or not re.fullmatch(r'hms-dynadot-relay-[a-f0-9]{32}', backup.name):
        raise ValueError('Fixed backup required')
    trusted(backup / 'receipt.json')
    trusted(backup / 'original.conf')
    receipt = json.loads((backup / 'receipt.json').read_bytes())
    trusted(SOURCE)
    raw = (backup / 'original.conf').read_bytes()
    if digest(raw) != receipt['original'] or digest(SOURCE.read_bytes()) != receipt['candidate']:
        raise ValueError('Apache changed; preserve later edits and review')
    atomic(SOURCE, raw, receipt['mode'])
    try:
        command('apache2ctl', 'configtest')
        command('systemctl', 'reload', 'apache2')
    except BaseException:
        atomic(SOURCE, render(raw), receipt['mode'])
        raise
    command('systemctl', 'disable', '--now', 'housemysite-dynadot-relay.service')
    # Preserve source, state, receipt and key material. Never delete a replay ledger.
    return {'relay_enabled': False, 'backup': str(backup), 'state_preserved': True}


def install(args):
    trusted(SOURCE)
    stage = Path(__file__).resolve().parent
    for name, sha in [('relay.py', args.relay_sha), ('housemysite-dynadot-relay.service', args.unit_sha)]:
        path = stage / name
        trusted(path)
        if not sha or digest(path.read_bytes()) != sha:
            raise ValueError('Release hash mismatch')
    if TARGET.exists() or UNIT.exists() or UNIT.is_symlink():
        raise ValueError('Relay installation already exists; do not overwrite or repeat')
    if command('systemctl', 'is-active', 'housemysite-services.service').strip() != 'active':
        raise ValueError('Existing service required')
    raw = SOURCE.read_bytes()
    candidate = render(raw)
    command('apache2ctl', 'configtest')
    modules = command('apache2ctl', '-M')
    if any(name not in modules for name in ('ssl_module', 'proxy_module', 'proxy_http_module', 'headers_module')):
        raise ValueError('Required Apache modules missing')
    # Verify existing upstream TLS configuration is still strict, before sharing it.
    for directive in ('SSLProxyVerify require', 'SSLProxyCheckPeerName On', 'SSLProxyCheckPeerExpire On'):
        if directive not in raw.decode():
            raise ValueError('Existing verified TLS proxy required')
    account = pwd.getpwnam('hms-services')
    key_path = Path('/etc/housemysite-services/portal.key')
    info = key_path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != account.pw_uid or stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1:
        raise ValueError('Existing private portal key required')
    key = key_path.read_bytes()
    if not 32 <= len(key) <= 4096:
        raise ValueError('Existing key invalid')
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 18444))
    baseline = request('HEAD', '/')
    baseline = baseline[0], baseline[2]
    if not args.execute:
        return {'plan_only': True, 'route': '/v1/dynadot-relay', 'listener': '127.0.0.1:18444', 'provider_changes': 0}
    backup = Path('/root') / ('hms-dynadot-relay-' + uuid.uuid4().hex)
    backup.mkdir(mode=0o700)
    atomic(backup / 'original.conf', raw, 0o600)
    receipt = {'original': digest(raw), 'candidate': digest(candidate), 'mode': stat.S_IMODE(SOURCE.stat().st_mode)}
    atomic(backup / 'receipt.json', json.dumps(receipt).encode(), 0o600)
    apache_changed = False
    try:
        TARGET.mkdir(mode=0o755)
        atomic(TARGET / 'relay.py', (stage / 'relay.py').read_bytes(), 0o644)
        atomic(UNIT, (stage / UNIT.name).read_bytes(), 0o644)
        command('systemd-analyze', 'verify', str(UNIT))
        command('systemctl', 'daemon-reload')
        command('systemctl', 'start', UNIT.stem)
        if digest(SOURCE.read_bytes()) != receipt['original']:
            raise ValueError('Concurrent Apache edit')
        atomic(SOURCE, candidate, receipt['mode'])
        apache_changed = True
        command('apache2ctl', 'configtest')
        command('systemctl', 'reload', 'apache2')
        # Bounded wait for systemd listener readiness; health performs no domain API action.
        result = None
        for attempt in range(5):
            try:
                result = health(key)
                break
            except (OSError, ValueError, http.client.HTTPException):
                if attempt == 4:
                    raise
                time.sleep(1)
        after = request('HEAD', '/')
        if (after[0], after[2]) != baseline:
            raise ValueError('Existing root behavior changed')
        command('systemctl', 'enable', UNIT.stem)
        return {'installed': True, **result, 'backup': str(backup), 'provider_changes': 0,
                'next': 'Allow connection_source_ipv4 in Dynadot; wait ten minutes; enable portal relay; test connection'}
    except BaseException:
        if apache_changed:
            if digest(SOURCE.read_bytes()) != receipt['candidate']:
                raise RuntimeError('Concurrent Apache edit; automatic restoration blocked; inspect backup ' + str(backup))
            atomic(SOURCE, raw, receipt['mode'])
            command('apache2ctl', 'configtest')
            command('systemctl', 'reload', 'apache2')
        subprocess.run(['systemctl', 'disable', '--now', UNIT.stem], capture_output=True, timeout=30)
        print(json.dumps({'installed': False, 'backup': str(backup), 'apache_restored': apache_changed, 'do_not_repeat': True}))
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--relay-sha')
    parser.add_argument('--unit-sha')
    parser.add_argument('--execute', action='store_true')
    parser.add_argument('--rollback', type=Path)
    args = parser.parse_args()
    os.umask(0o077)
    if os.geteuid() != 0:
        raise ValueError('Root required')
    fd = os.open('/run/lock/housemysite-dynadot-relay.lock', os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as lock:
        info = os.fstat(lock.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_nlink != 1 or stat.S_IMODE(info.st_mode) != 0o600:
            raise ValueError('Private lock required')
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        print(json.dumps(rollback(args.rollback) if args.rollback else install(args)))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Never print exception messages that could contain a config value or subprocess output.
        print(json.dumps({'stopped': True, 'error_type': type(error).__name__, 'do_not_repeat': True}))
        raise SystemExit(1)
