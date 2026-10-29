"""Test-only: the REAL automation gateway with verified GitHub links, signed webhooks and the auto-deploy policy, over persistent temporary SQLite."""
import base64
import hashlib
import hmac
import json
import sqlite3
import sys
import time
import uuid
from contextlib import contextmanager
from pathlib import Path
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.asymmetric import ec
from modules.hosting import runtime_secrets
from modules.hosting.auto_deploy import PREFIX, AutoDeploy
from modules.hosting.github_links import GitHubLinks
from modules.hosting.github_webhooks import GitHubWebhooks
from modules.hosting.provisioning_jobs import ProvisioningJobs, canonical
from modules.hosting.service_gateway import ServiceGateway
from modules.hosting.source_operations import SourceOperations

packet = json.load(sys.stdin)
root = Path(packet['root'])
db = sqlite3.connect(root / 'state.sqlite', isolation_level=None)
key_path = root / 'owner.key'
if not key_path.exists():
    key_path.write_bytes(Ed25519PrivateKey.generate().private_bytes(serialization.Encoding.Raw, serialization.PrivateFormat.Raw, serialization.NoEncryption()))
    key_path.chmod(0o600)
owner = Ed25519PrivateKey.from_private_bytes(key_path.read_bytes())
members = packet['members']
access = lambda actor, client, write: actor in members and members[actor]['client'] == client and (members[actor]['write'] or not write)
queue = ProvisioningJobs(db, access=lambda *a: True, owner_key=owner.public_key(), reserve=lambda *a: True)
if not db.execute('SELECT 1 FROM hosting_provisioning_jobs').fetchone():
    job = queue.enqueue(actor=packet['actor'], client=packet['client'], service=packet['service'], server='server1', hostname='fixture.test', request_key='provision1', policy_digest='a' * 64)
    body = dict(job=job['id'], digest=job['digest'], nonce='n1', issued=int(time.time()) - 1, expires=int(time.time()) + 100)
    body['signature'] = base64.b64encode(owner.sign(b'hms-provisioning-approval-v1\n' + canonical(body))).decode()
    queue.run(job['id'], body, lambda _: dict(client_id=1, site_id=1, domain='fixture.test', ownership_verified=True), policy_digest='a' * 64, enabled=True)
for name in ('staging', 'releases'):
    (root / name).mkdir(mode=0o700, exist_ok=True)
db.execute('CREATE TABLE IF NOT EXISTS hosting_provider_clients(portal_client TEXT,state TEXT,provider_client INTEGER,provider_group INTEGER)')
if not db.execute('SELECT 1 FROM hosting_provider_clients').fetchone():
    db.execute("INSERT INTO hosting_provider_clients VALUES(?,'verified',1,2)", (packet['client'],))


class Forms:
    def __init__(self):
        self.db = db

    @contextmanager
    def transaction(self):
        db.execute('BEGIN IMMEDIATE')
        try:
            yield
            db.commit()
        except BaseException:
            db.rollback()
            raise


# GitHub's answer about an installation is stubbed: the real client asks api.github.com with the App key.
installations = {int(k): v for k, v in packet.get('installations', {}).items()}
links = GitHubLinks(db, installation_lookup=lambda i: installations[i])
ops = SourceOperations(db, access=access, owner_key=owner.public_key(), reserve=lambda *a: True, grants=links, staging=root / 'staging', releases=root / 'releases')
ops.links, ops.auto = links, AutoDeploy(ops, owner.public_key())
# The runtime-secrets recipient key lives only in this temporary directory, standing in for the root-only key file on the VPS.
secrets_path = root / 'secrets.key'
if not secrets_path.exists():
    secrets_path.write_bytes(ec.generate_private_key(ec.SECP256R1()).private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
    secrets_path.chmod(0o600)
secrets_private = serialization.load_pem_private_key(secrets_path.read_bytes(), password=None)
ops.secrets.public_key_file = lambda: runtime_secrets.public_pem(secrets_private)
gateway = ServiceGateway(None, Forms(), key=packet['key'], sources=ops)
kind = packet.get('kind', 'gateway')
if kind == 'gateway':
    print(json.dumps(gateway.handle(packet['body'].encode(), packet['signature'])))
elif kind == 'policy':
    # Stands in for the owner's local signer: a policy signed with the owner key, exactly as the VPS verifies it.
    now = int(time.time())
    document = {'schema': 1, 'id': uuid.uuid4().hex, 'service': packet['service'], 'client': packet['client'], 'actor': packet['actor'], 'repository_id': packet['repository_id'], 'branch': packet['branch'],
                'allow_activation': False, 'runtimes': ['static'], 'max_per_day': 2, 'issued': now - 5, 'expires': now + 3600}
    signature = base64.b64encode(owner.sign(PREFIX + canonical(document))).decode()
    ops.auto.install(document, signature, packet['actor'])
    print(json.dumps({'installed': document['id']}))
elif kind == 'sign':
    # Stands in for the owner's local signer program: the REAL Signer class, with the terminal confirmation answered "yes".
    sys.path.insert(0, packet['signer_dir'])
    import hms_signer
    signer = hms_signer.Signer(owner, lambda text, code: True)
    print(json.dumps(signer.sign(packet['what'], packet['payload'])))
elif kind == 'open':
    # Stands in for the root runtime broker: opens what the worker would hand it.
    version, items = ops.secrets.snapshot(packet['service'])
    print(json.dumps({'version': version, 'values': {i['name']: runtime_secrets.open_blob(secrets_private, packet['service'], i['name'], i['blob']) for i in items}}))
elif kind == 'raw':
    # Opens one blob exactly as given (negative tests: wrong website or name must not open).
    try:
        print(json.dumps({'value': runtime_secrets.open_blob(secrets_private, packet['service'], packet['name'], packet['blob'])}))
    except runtime_secrets.SecretDenied:
        print(json.dumps({'denied': True}))
elif kind == 'public':
    print(json.dumps({'pem': runtime_secrets.public_pem(secrets_private).decode(), 'fingerprint': runtime_secrets.fingerprint(secrets_private.public_key())}))
elif kind == 'webhook':
    secret = packet['secret'].encode()
    raw = json.dumps(packet['payload']).encode()

    @contextmanager
    def state():
        yield db, links, ops.auto
    hooks = GitHubWebhooks(state, secret)
    status, body = hooks.handle(raw, {'x-hub-signature-256': 'sha256=' + hmac.new(secret, raw, hashlib.sha256).hexdigest(), 'x-github-event': packet['event'],
                                      'x-github-delivery': str(uuid.uuid4()), 'content-type': 'application/json'})
    print(json.dumps({'status': status, 'body': body}))
