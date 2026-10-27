"""Test-only in-memory service gateway. Never install or expose outside loopback."""
import sys
import os
from pathlib import Path
sys.path.insert(0,os.environ.get('HMS_AUTOMATION_SOURCE',str(Path(__file__).resolve().parents[3]/'retention-work')))
import base64
import hashlib
import json
import sqlite3
import time
from http.server import HTTPServer
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from controlplane.sealed import generate,unseal
from modules.hosting.managed import Managed
from modules.hosting.service_gateway import ServiceGateway,service_handler
from modules.forms.service import Forms
from modules.forms.http import handler as forms_handler

ids=json.loads(sys.stdin.readline());private,public=generate();db=sqlite3.connect(':memory:',isolation_level=None)
def access(actor,client,write):return actor==ids['owner'] or actor==ids['a'] and client==ids['clientA'] or actor==ids['b'] and client==ids['clientB']
managed=Managed(db,access=access,owner_key=Ed25519PrivateKey.generate().public_key(),host_private=private,reserve=lambda *x:True)
config=dict(provider_client=3,group=7,server=1,prefix='c3_',domain='example.invalid',template={},user_template={},max_resources=10,max_quota_mb=100)
for kind in ['email','database']:managed.enroll(ids['service'],ids['clientA'],kind,config,enabled=True)
managed.enroll(ids['serviceB'],ids['clientB'],'email',config,enabled=True)
forms=Forms(db,encryption_key=b'f'*32,access=access,reserve=lambda *x:True)
for service,client,label in [(ids['service'],ids['clientA'],'Fixture Forms A'),(ids['serviceB'],ids['clientB'],'Fixture Forms B')]:forms.enroll(project=service,client=client,name=label,recipient='fixed@example.invalid',sender='forms@example.invalid',origins=['https://example.invalid'],paid_until=int(time.time())+3600,monthly_limit=10,active=True)
gateway=ServiceGateway(managed,forms,key='isolated-service-gateway-key-only-0000')
form_handler=forms_handler(forms);private_handler=service_handler(gateway)
class Handler(form_handler):
    reply=private_handler.reply
    def do_POST(self):
        if self.path=='/v1/services':return private_handler.do_POST(self)
        return super().do_POST()
    def do_GET(self):
        if self.path!='/__fixture/inspect':return self.reply(404,{})
        jobs=db.execute('SELECT service,request_key,command FROM managed_jobs').fetchall();roundtrip=True
        for row in jobs:
            command=json.loads(row['command'])
            if 'sealed'in command:
                value=json.loads(unseal(private,command['sealed'],('hms-managed-v1|'+row['service']+'|'+row['request_key']).encode()))
                roundtrip=roundtrip and value=={'password':'synthetic-password-ONLY-123'}
        self.reply(200,{'jobs':len(jobs),'password_roundtrip':roundtrip,'plaintext_saved':'synthetic-password-ONLY-123'in '\n'.join(db.iterdump()),'forms_used':db.execute('SELECT coalesce(sum(used),0) FROM forms_usage').fetchone()[0]})
server=HTTPServer(('127.0.0.1',39553),Handler)
print(json.dumps({'host_key':base64.urlsafe_b64encode(public).decode(),'fingerprint':hashlib.sha256(public).hexdigest()}),flush=True)
try:server.serve_forever()
finally:server.server_close();db.close()
