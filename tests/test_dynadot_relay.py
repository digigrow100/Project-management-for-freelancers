import concurrent.futures
import hashlib
import hmac
import http.client
import importlib.util
import json
from pathlib import Path
import socket
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
import uuid

ROOT=Path(__file__).resolve().parents[1]
def load(name):
    spec=importlib.util.spec_from_file_location(name,ROOT/'scripts/dynadot-relay'/f'{name}.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
r=load('relay');installer=load('install')

def packet():
    return {'schema':1,'nonce':str(uuid.uuid4()),'expires':int(time.time())+60,'mode':'production','method':'PUT',
        'path':'/restful/v2/domains/example.com/domain_lock','key':'synthetic-key','signature':'A'*43+'=',
        'request_id':str(uuid.uuid4()),'body':'{"lock":true}'}

class RelayTests(unittest.TestCase):
    def test_scope(self):
        p=packet();r.validate(p,int(time.time()))
        for method,path in [('GET','https://evil.example/'),('GET','/restful/v2/domains/../login'),('POST','/restful/v2/domains/example.com/transfer'),('PUT','/restful/v2/domains/example.com/records')]:
            with self.subTest(path=path),self.assertRaises(ValueError):r.validate({**p,'method':method,'path':path},int(time.time()))
        for field,value in [('mode','other'),('key','x\r\nInjected: y'),('expires',int(time.time())+1000),('nonce','not-uuid')]:
            with self.subTest(field=field),self.assertRaises((ValueError,TypeError)):r.validate({**p,field:value},int(time.time()))
        with self.assertRaises(ValueError):r.validate({**p,'secret':'not-permitted'},int(time.time()))
    def test_durable_single_claim_concurrent(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'state.sqlite';ledger=r.Ledger(path);p=packet()
            def claim(_):
                try:ledger.claim(p['nonce'],p['expires'],int(time.time()));return True
                except Exception:return False
            with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:self.assertEqual(sum(pool.map(claim,range(8))),1)
            with self.assertRaises(Exception):r.Ledger(path).claim(p['nonce'],p['expires'],int(time.time()))
    def test_forward_preserves_provider_bytes_and_no_redirect(self):
        p=packet();received=[]
        class Response:
            status=200
            def read(self,limit):return b'{"code":200,"data":{"ok":true}}'
        class Conn:
            def __init__(self,host,**kw):self.sock=self;received.append(host)
            def connect(self):pass
            def getsockname(self):return ('203.0.113.5',12345)
            def request(self,*args,**kw):received.append((args,kw))
            def getresponse(self):return Response()
            def close(self):pass
        with patch.object(r,'IPv4TLS',Conn):
            self.assertEqual(r.forward(p)[0],200)
            self.assertEqual(received[0],'api.dynadot.com')
            self.assertEqual(received[1][1]['body'],b'{"lock":true}')
            self.assertEqual(received[1][1]['headers']['X-Signature'],p['signature'])
            Response.status=302
            with self.assertRaises(ValueError):r.forward(p)
    def test_real_handler_auth_replay_and_lost_reply(self):
        with tempfile.TemporaryDirectory() as d:
            server=r.Server(('127.0.0.1',0),r.Handler)
            server.key=b'synthetic-key'*4;server.ledger=r.Ledger(Path(d)/'ledger.sqlite')
            server.slots=threading.BoundedSemaphore(4);server.connections=threading.BoundedSemaphore(8)
            thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start();calls=[]
            def call(raw,sig):
                connection=http.client.HTTPConnection('127.0.0.1',server.server_port,timeout=5)
                try:
                    connection.request('POST','/v1/dynadot-relay',raw,{'Content-Type':'application/json','X-HMS-Dynadot-Signature':sig})
                    answer=connection.getresponse();return answer.status,answer.getheader('X-HMS-Dynadot-Forwarded'),answer.read()
                finally:connection.close()
            raw=json.dumps(packet()).encode();sig=hmac.new(server.key,r.PREFIX+raw,hashlib.sha256).hexdigest()
            try:
                with patch.object(r,'forward',side_effect=lambda p:(calls.append(p) or (200,b'{"code":200}'))):
                    self.assertEqual(call(raw,'0'*64)[0],403);self.assertEqual(len(calls),0)
                    self.assertEqual(call(raw,sig)[:2],(200,'1'));self.assertEqual(call(raw,sig)[0],409);self.assertEqual(len(calls),1)
                p=packet();raw=json.dumps(p).encode();sig=hmac.new(server.key,r.PREFIX+raw,hashlib.sha256).hexdigest()
                with patch.object(r,'forward',side_effect=OSError('lost reply')):
                    self.assertEqual(call(raw,sig)[:2],(502,None))
                with patch.object(r,'forward') as upstream:
                    self.assertEqual(call(raw,sig)[0],409);upstream.assert_not_called()
            finally:server.shutdown();server.server_close();thread.join(timeout=3)
    def test_installer_preserves_existing_vhost(self):
        raw=b'''<VirtualHost *:443>\nServerName server1.housemysite.com\n# BEGIN HOUSEMYSITE PRIVATE SERVICES\nSSLProxyCACertificateFile "/etc/apache2/housemysite-services-ca.crt"\nProxyPassMatch "^/v1/services$" "https://127.0.0.1:18443"\n# END HOUSEMYSITE PRIVATE SERVICES\n</VirtualHost>\n'''
        candidate=installer.render(raw)
        self.assertIn(b'"^/v1/dynadot-relay$" "https://127.0.0.1:18444"',candidate)
        self.assertIn(b'LimitRequestBody 32768',candidate)
        self.assertIn(b'X-HMS-Dynadot-Signature',candidate)
        # Removing the additive block and whitespace insertion restores original text.
        start=candidate.index(b'\n    # BEGIN HOUSEMYSITE DYNADOT RELAY')
        end=candidate.index(b'    # BEGIN HOUSEMYSITE PRIVATE SERVICES',start)
        self.assertEqual(candidate[:start]+candidate[end+4:],raw)
        for bad in (candidate,raw.replace(b'*:443',b'*:80'),raw.replace(b'server1.housemysite.com',b'customer.example.com')):
            with self.assertRaises(ValueError):installer.render(bad)

if __name__=='__main__':unittest.main()
