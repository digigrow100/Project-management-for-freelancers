"""Test-only worker side of the portal -> API -> queue -> worker -> runtime -> status flow for Next.js websites.

One invocation per step (state lives in a temporary directory), driving the REAL automation code: the signed service
gateway, the durable job queue, the isolated build sandbox, the Next.js runtime broker (units are really run as a
throw-away account), and a route emulation that serves the managed route file. Needs root, Node.js and namespaces.
Nothing here touches a network service, a provider, a production path or a secret.
"""
import base64
import json
import os
import sqlite3
import sys
import types
import urllib.request
from contextlib import contextmanager
from pathlib import Path
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives import serialization
import modules.hosting.nextjs_build as nb
import modules.hosting.nextjs_runtime as nr
import modules.hosting.site_broker as sb
from modules.hosting.provisioning_jobs import ProvisioningJobs, canonical
from modules.hosting.publication import BrokerUncertain
from modules.hosting.service_gateway import ServiceGateway
from modules.hosting.source_operations import PrivateGrants, SourceOperations
from modules.hosting.website_tree import TreeStage, TreeLimits, scan_tree
import tests.nextjs_harness as harness
import tests.nextjs_site_fixture as fixture

SERVICE_UID, SITE_UID, SITE_GID, SITE, PROVIDER_CLIENT, PROVIDER_GROUP, SERVER, DOMAIN = 61003, 61001, 61002, 1, 1, 2, 1, 'fixture.test'
packet = json.load(sys.stdin)
root = Path(packet['root'])
now = lambda: int(__import__('time').time())


def owner_key():
    path = root / 'owner.key'
    if not path.exists():
        path.write_bytes(Ed25519PrivateKey.generate().private_bytes(serialization.Encoding.Raw, serialization.PrivateFormat.Raw, serialization.NoEncryption()))
        path.chmod(0o600)
    return Ed25519PrivateKey.from_private_bytes(path.read_bytes())


class Forms:
    def __init__(self, db):
        self.db = db

    @contextmanager
    def transaction(self):
        self.db.execute('BEGIN IMMEDIATE')
        try:
            yield
            self.db.commit()
        except BaseException:
            self.db.rollback()
            raise


db = sqlite3.connect(root / 'state.sqlite', isolation_level=None)
db.row_factory = sqlite3.Row
key = owner_key()
members = packet['members']
access = lambda actor, client, write: actor in members and members[actor]['client'] == client and (members[actor]['write'] or not write)
queue = ProvisioningJobs(db, access=lambda *a: True, owner_key=key.public_key(), reserve=lambda *a: True)
if not db.execute('SELECT 1 FROM hosting_provisioning_jobs').fetchone():
    job = queue.enqueue(actor=packet['actor'], client=packet['client'], service=packet['service'], server='server1', hostname=DOMAIN, request_key='provision1', policy_digest='a' * 64)
    body = dict(job=job['id'], digest=job['digest'], nonce='n1', issued=now() - 1, expires=now() + 100)
    body['signature'] = base64.b64encode(key.sign(b'hms-provisioning-approval-v1\n' + canonical(body))).decode()
    queue.run(job['id'], body, lambda _: dict(client_id=PROVIDER_CLIENT, site_id=SITE, domain=DOMAIN, ownership_verified=True), policy_digest='a' * 64, enabled=True)
db.execute('CREATE TABLE IF NOT EXISTS hosting_provider_clients(portal_client TEXT,state TEXT,provider_client INTEGER,provider_group INTEGER)')
if not db.execute('SELECT 1 FROM hosting_provider_clients').fetchone():
    db.execute("INSERT INTO hosting_provider_clients VALUES(?,'verified',?,?)", (packet['client'], PROVIDER_CLIENT, PROVIDER_GROUP))
for name in ('staging', 'releases', 'clients'):
    (root / name).mkdir(mode=0o755 if name == 'clients' else 0o700, exist_ok=True)
grants = PrivateGrants(lambda: json.dumps(packet['grants']))
ops = SourceOperations(db, access=access, owner_key=key.public_key(), reserve=lambda *a: True, grants=grants, staging=root / 'staging', releases=root / 'releases',
                       limits=TreeLimits(reserve_bytes=1024))
gateway = ServiceGateway(None, Forms(db), key=packet['key'], sources=ops)

# --- disposable "server": site account directories, real runtime broker, real systemd-like process runner ---
docroot = root / 'clients' / ('client%d' % PROVIDER_CLIENT) / ('web%d' % SITE)
for path in (docroot / 'web', docroot / 'private'):
    path.mkdir(parents=True, exist_ok=True)
for path in (root, root / 'clients', docroot.parent, docroot):
    path.chmod(0o755)
sb.MIN_ACCOUNT_ID = 1000
base = root / 'nx'
base.mkdir(exist_ok=True)
base.chmod(0o755)
config = harness.test_config(base, ready_seconds=8)
system = harness.LocalSystem(uid=SITE_UID)
system.bind(config)
record = {'domain_id': str(SITE), 'domain': DOMAIN, 'type': 'vhost', 'system_user': 'web%d' % SITE, 'system_group': 'client%d' % PROVIDER_CLIENT, 'document_root': str(docroot),
          'server_id': str(SERVER), 'sys_groupid': str(PROVIDER_GROUP), 'active': 'y', 'php': 'php-fpm', 'client_id': str(PROVIDER_CLIENT)}
runtime = nr.Runtime(config, system, lookup=lambda site: dict(record), service_uid=SERVICE_UID, clients_root=root / 'clients',
                     getpwnam=lambda name: types.SimpleNamespace(pw_uid=SITE_UID, pw_dir=str(docroot)), getgrnam=lambda name: types.SimpleNamespace(gr_gid=SITE_GID))
fault = (root / 'fault').read_text().strip() if (root / 'fault').exists() else ''


def route(path):
    file = nr.Layout(config, 'web%d' % SITE).route
    if not file.exists():
        return None
    port = int(__import__('re').search(r'http://127\.0\.0\.1:(\d+)/"\n', file.read_text()).group(1))
    try:
        with urllib.request.urlopen('http://127.0.0.1:%d%s' % (port, path), timeout=5) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()
    except OSError:
        return None


def runtime_call(request):
    if fault and request['op'] == fault:
        nr.handle(request, runtime=runtime)  # the broker acted but its reply was lost
        raise BrokerUncertain('no reply')
    return nr.handle(request, runtime=runtime)


def nextjs_health(domain, marker, release, artifact):
    answer = route('/.hms-ready/' + marker)
    if answer is None or answer[0] != 200 or json.loads(answer[1]) != {'release': release, 'artifact': artifact}:
        return {'ok': False, 'reason': 'release_not_served'}
    root_page = route('/')
    if root_page is None or root_page[0] >= 500:
        return {'ok': False, 'reason': 'root_error'}
    return {'ok': True, 'reason': 'release_served', 'status': 200, 'root_status': root_page[0], 'tls': False}


def static_health(domain, marker, runtime_name):
    page = route('/')
    return {'ok': bool(page and page[0] < 500), 'reason': 'root_responds', 'status': 200, 'root_status': 200, 'tls': False}


platform = types.SimpleNamespace(
    rpc=lambda method, *a: {'domain': DOMAIN, 'type': 'vhost', 'active': 'y', 'domain_id': SITE, 'server_id': SERVER, 'sys_groupid': PROVIDER_GROUP, 'php': 'php-fpm'},
    group_for_client=lambda c: PROVIDER_GROUP, broker=lambda r: (_ for _ in ()).throw(RuntimeError('no static publisher in this harness')), health=static_health, server_id=SERVER,
    nextjs_build=lambda request: nb.handle(request, releases_root=ops.releases, artifacts_root=config.artifacts_root, service_uid=SERVICE_UID, release_owner=os.geteuid()),
    nextjs_runtime=runtime_call, nextjs_health=nextjs_health)


def sign(job):
    body = dict(job=job['id'], digest=job['digest'], nonce='n' + job['id'], issued=now() - 1, expires=now() + 200)
    body['signature'] = base64.b64encode(key.sign(b'hms-source-approval-v1\n' + canonical(body))).decode()
    return body


kind = packet['kind']
result = None
if kind == 'gateway':
    result = gateway.handle(packet['body'].encode(), packet['signature'])
elif kind == 'seed':
    # Upload + approved staging deploy, as the portal's ZIP flow would produce, from the synthetic project fixture.
    files = fixture.package_files(packet.get('build') or fixture.DEFAULT_BUILD)
    files['public/marker.txt'] = packet['marker']
    stage = TreeStage(root / 'staging', TreeLimits(reserve_bytes=1024))
    for name, body in sorted(files.items()):
        stage.add(name, '100644', [body.encode()])
    staged = stage.finish()
    scan = scan_tree(stage.root, TreeLimits(reserve_bytes=1024))
    tree = ops.insert_tree(packet['service'], packet['client'], 'zip', 'f' * 64, stage.root, scan)
    job = ops.enqueue(actor=packet['actor'], client=packet['client'], service=packet['service'], operation='deploy', request_key=packet['key_name'], tree=tree['id'])
    done = ops.run(job['id'], sign(job), enabled=True)
    result = {'tree': tree['id'], 'state': done['state']}
elif kind == 'worker':
    row = ops.job(packet['job'])
    expect_plan = None
    if row['operation'] in ('publish', 'rollback'):
        expect_plan = ops.plan(packet['job'], platform=platform)['plan_digest']
    approval = sign(row) if packet.get('approve') and row['operation'] != 'build' else None
    try:
        result = ops.run(packet['job'], approval, enabled=True, expect_plan=expect_plan, platform=platform)
    except Exception as error:  # the outcome is reported by the next status read; the worker itself reports only that it stopped
        result = {'worker_stopped': type(error).__name__}
elif kind == 'fault':
    (root / 'fault').write_text(packet['op'])
    result = {'fault': packet['op']}
elif kind == 'clear_fault':
    (root / 'fault').unlink(missing_ok=True)
    result = {'fault': None}
elif kind == 'fetch':
    answer = route(packet['path'])
    result = None if answer is None else {'status': answer[0], 'body': answer[1].decode()}
elif kind == 'cleanup':
    system.shutdown()
    result = {'stopped': True}
print(json.dumps(result))
