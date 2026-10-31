"""Disposable real Apache -> verified TLS relay -> mocked provider integration."""
import hashlib
import hmac
import http.client
import importlib.util
import json
import os
from pathlib import Path
import pwd
import shutil
import socket
import ssl
import subprocess
import tempfile
import threading
import time
from unittest.mock import patch
import uuid

ROOT=Path(__file__).resolve().parents[1]
def load(name):
    spec=importlib.util.spec_from_file_location(name,ROOT/'scripts/dynadot-relay'/f'{name}.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
r=load('relay');installer=load('install')
apache=shutil.which('apache2')
if not apache:
    if os.environ.get('HMS_REQUIRE_APACHE')=='1':raise RuntimeError('Mandatory Apache dependency missing')
    print('Apache unavailable locally; mandatory CI integration must pass.');raise SystemExit(0)
with tempfile.TemporaryDirectory(prefix='hms-relay-apache-') as temp:
    base=Path(temp);cert=base/'cert.pem';key=base/'key.pem'
    subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=server1.housemysite.com','-addext','subjectAltName=DNS:server1.housemysite.com,IP:127.0.0.1','-keyout',str(key),'-out',str(cert)],check=True,capture_output=True)
    backend_cert=base/'backend.pem';backend_key=base/'backend.key'
    subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1','-keyout',str(backend_key),'-out',str(backend_cert)],check=True,capture_output=True)
    relay=r.Server(('127.0.0.1',18444),r.Handler,bind_and_activate=False)
    relay.connections=threading.BoundedSemaphore(8);relay.slots=threading.BoundedSemaphore(4);relay.key=b'synthetic-test-key'*3;relay.ledger=r.Ledger(base/'ledger.sqlite')
    relay.server_bind();relay.server_activate()
    tls=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);tls.load_cert_chain(backend_cert,backend_key)
    original=relay.finish_request
    def finish(request,address):
        request.settimeout(5)
        with tls.wrap_socket(request,server_side=True) as secure:original(secure,address)
    relay.finish_request=finish
    def show_error(*_):
        import traceback
        traceback.print_exc()
    relay.handle_error=show_error
    thread=threading.Thread(target=relay.serve_forever,daemon=True);thread.start()
    with socket.socket() as probe:probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
    user=pwd.getpwuid(os.getuid()).pw_name
    # Apache cannot start workers as root. Fixtures remain disposable/readable only.
    if os.getuid()==0:
        user='www-data';base.chmod(0o755);cert.chmod(0o644);key.chmod(0o644);backend_cert.chmod(0o644)
    www=base/'www';www.mkdir(mode=0o755);(www/'index.html').write_text('existing-root-fixture')
    mods=['mpm_event','authz_core','authz_host','authz_user','authn_core','ssl','proxy','proxy_http','headers','dir','mime']
    config=f'ServerRoot "{base}"\nPidFile "{base}/apache.pid"\nListen 127.0.0.1:{port}\nServerName server1.housemysite.com\nUser {user}\nGroup {user}\nErrorLog "{base}/errors.log"\nLogLevel warn ssl:debug\n'
    for mod in mods:config+=f'LoadModule {mod}_module /usr/lib/apache2/modules/mod_{mod}.so\n'
    config+='TypesConfig /etc/mime.types\n'
    source=f'''<VirtualHost *:443>
ServerName server1.housemysite.com
SSLEngine On
SSLCertificateFile "{cert}"
SSLCertificateKeyFile "{key}"
DocumentRoot "{www}"
DirectoryIndex index.html
<Directory "{www}">
Require all granted
</Directory>
# BEGIN HOUSEMYSITE PRIVATE SERVICES
ProxyRequests Off
SSLProxyEngine On
SSLProxyVerify require
SSLProxyVerifyDepth 1
SSLProxyCheckPeerName On
SSLProxyCheckPeerExpire On
SSLProxyCACertificateFile "{installer.CA}"
ProxyPassMatch "^/v1/services$" "https://127.0.0.1:18443"
# END HOUSEMYSITE PRIVATE SERVICES
</VirtualHost>
'''
    config+=installer.render(source.encode()).decode().replace('*:443',f'*:{port}').replace(installer.CA,str(backend_cert))
    conf=base/'httpd.conf';conf.write_text(config)
    subprocess.run([apache,'-f',str(conf),'-t'],check=True,capture_output=True)
    direct=http.client.HTTPSConnection('127.0.0.1',18444,context=ssl.create_default_context(cafile=str(backend_cert)),timeout=10)
    direct.request('GET','/v1/dynadot-relay')
    direct_answer=direct.getresponse()
    assert direct_answer.status==405
    direct_answer.read();direct.close()
    proc=subprocess.Popen([apache,'-f',str(conf),'-DFOREGROUND'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    context=ssl.create_default_context(cafile=str(cert))
    def request(method,path,body=None,headers=None):
        conn=http.client.HTTPSConnection('127.0.0.1',port,context=context,timeout=10)
        try:
            conn.request(method,path,body,headers or {});answer=conn.getresponse();return answer.status,answer.getheader('X-HMS-Dynadot-Forwarded'),answer.read()
        finally:conn.close()
    def signed(p):
        raw=json.dumps(p,separators=(',',':')).encode();return raw,{'Content-Type':'application/json','X-HMS-Dynadot-Signature':hmac.new(relay.key,r.PREFIX+raw,hashlib.sha256).hexdigest()}
    try:
        for attempt in range(40):
            try:
                assert request('GET','/')[2]==b'existing-root-fixture';break
            except (OSError,AssertionError):
                if proc.poll() is not None:raise RuntimeError('Apache exited')
                if attempt==39:raise
                time.sleep(.1)
        p={'schema':1,'nonce':str(uuid.uuid4()),'expires':int(time.time())+60,'mode':'production','method':'PUT','path':'/restful/v2/domains/example.com/domain_lock','key':'synthetic-key','signature':'A'*43+'=','request_id':str(uuid.uuid4()),'body':'{"lock":true}'}
        raw,headers=signed(p)
        with patch.object(r,'forward',return_value=(200,b'{"code":200}')) as upstream:
            first=request('POST','/v1/dynadot-relay',raw,headers)
            assert first[:2]==(200,'1'), (first,(base/'errors.log').read_text()[-6000:])
            assert request('POST','/v1/dynadot-relay',raw,headers)[0]==409
            assert upstream.call_count==1
            assert request('POST','/v1/dynadot-relay',raw,{**headers,'X-HMS-Dynadot-Signature':'0'*64})[0]==403
            assert request('GET','/v1/dynadot-relay')[0]==403
            assert request('POST','/v1/dynadot-relay',b'x'*32769,headers)[0] in (403,413)
            bad={**p,'nonce':str(uuid.uuid4()),'path':'https://evil.example/'};b,h=signed(bad)
            assert request('POST','/v1/dynadot-relay',b,h)[0]==409
            assert upstream.call_count==1
        # Wrong upstream CA must fail closed; never proxy over unverified TLS.
        other=base/'other.pem';otherkey=base/'other.key'
        subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=wrong','-keyout',str(otherkey),'-out',str(other)],check=True,capture_output=True)
        other.chmod(0o644)
        conf.write_text(config.replace(f'SSLProxyCACertificateFile "{backend_cert}"',f'SSLProxyCACertificateFile "{other}"'))
        subprocess.run([apache,'-f',str(conf),'-k','graceful'],check=True,capture_output=True);time.sleep(.5)
        p['nonce']=str(uuid.uuid4());b,h=signed(p)
        with patch.object(r,'forward') as upstream:
            assert request('POST','/v1/dynadot-relay',b,h)[0] in (500,502,503)
            upstream.assert_not_called()
        assert request('GET','/')[2]==b'existing-root-fixture'
        print('PASS: real Apache/TLS routing, valid signature, replay denial, auth/GET/body/scope denial, wrong-CA failure and existing root preservation.')
    finally:
        proc.terminate()
        try:proc.wait(timeout=10)
        except subprocess.TimeoutExpired:proc.kill();proc.wait()
        relay.shutdown();relay.server_close();thread.join(timeout=3)
