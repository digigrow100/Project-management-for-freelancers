"""Test-only: drive the REAL automation ServiceGateway/SourceOperations with a persistent temporary SQLite state."""
import base64
import json
import sqlite3
import sys
from contextlib import contextmanager
from pathlib import Path
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from modules.hosting.provisioning_jobs import ProvisioningJobs, canonical
from modules.hosting.service_gateway import ServiceGateway
from modules.hosting.source_operations import PrivateGrants, SourceOperations

packet = json.load(sys.stdin)
root = Path(packet['root'])
db = sqlite3.connect(root / 'state.sqlite', isolation_level=None)


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


members = packet['members']
access = lambda actor, client, write: actor in members and members[actor]['client'] == client and (members[actor]['write'] or not write)
owner = Ed25519PrivateKey.generate()
queue = ProvisioningJobs(db, access=lambda *a: True, owner_key=owner.public_key(), reserve=lambda *a: True)
if not db.execute('SELECT 1 FROM hosting_provisioning_jobs').fetchone():
    job = queue.enqueue(actor=packet['actor'], client=packet['client'], service=packet['service'], server='server1', hostname='fixture.test', request_key='provision1', policy_digest='a' * 64)
    body = dict(job=job['id'], digest=job['digest'], nonce='n1', issued=int(__import__('time').time()) - 1, expires=int(__import__('time').time()) + 100)
    body['signature'] = base64.b64encode(owner.sign(b'hms-provisioning-approval-v1\n' + canonical(body))).decode()
    queue.run(job['id'], body, lambda _: dict(client_id=1, site_id=1, domain='fixture.test', ownership_verified=True), policy_digest='a' * 64, enabled=True)
for name in ('staging', 'releases'):
    (root / name).mkdir(mode=0o700, exist_ok=True)
db.execute('CREATE TABLE IF NOT EXISTS hosting_provider_clients(portal_client TEXT,state TEXT,provider_client INTEGER,provider_group INTEGER)')
if not db.execute('SELECT 1 FROM hosting_provider_clients').fetchone():
    db.execute("INSERT INTO hosting_provider_clients VALUES(?,'verified',1,2)", (packet['client'],))
grants = PrivateGrants(lambda: json.dumps(packet['grants']))
sources = SourceOperations(db, access=access, owner_key=owner.public_key(), reserve=lambda *a: True, grants=grants,
                           staging=root / 'staging', releases=root / 'releases')
for tree in packet.get('trees', []):
    # Synthetic released trees: the gateway only queues; no filesystem or provider work happens here.
    if not db.execute('SELECT 1 FROM source_trees WHERE id=?', (tree['id'],)).fetchone():
        db.execute("INSERT INTO source_trees(id,service,client,kind,origin,state,path,manifest,manifest_sha256,files,bytes,created,runtime) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                   (tree['id'], packet['service'], packet['client'], 'zip', 'f' * 64, 'released', None, '[]', tree['digest'], 1, 1, 1, tree['runtime']))
gateway = ServiceGateway(None, Forms(), key=packet['key'], sources=sources)
print(json.dumps(gateway.handle(packet['body'].encode(), packet['signature'])))
