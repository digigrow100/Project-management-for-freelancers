#!/usr/bin/env python3
"""Separate TLS-loopback mail control service and one-shot signed worker.
Uses existing private provider/owner enrollment; never receives a general RPC.
"""
import argparse
import base64
from contextlib import contextmanager
import fcntl
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import signal
import socket
import struct
import sqlite3
import ssl
import stat
import sys
import time
from http.server import BaseHTTPRequestHandler
sys.path.insert(0,str(Path(__file__).resolve().parent))
from mail_accounts import MailAccounts,Refused,require

SETTINGS=Path('/etc/housemysite-services/settings.json')
POLICY=Path('/etc/housemysite-services/mail-policy.json')
STATE=Path('/var/lib/housemysite-services/mail-services.sqlite')

def private(path):
    path=Path(path);require(path.parent.resolve()==path.parent)
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
    try:
        info=os.fstat(fd);require(stat.S_ISREG(info.st_mode) and info.st_uid==os.geteuid() and stat.S_IMODE(info.st_mode)==0o600 and info.st_size<=65536)
        return os.read(fd,65537)
    finally:os.close(fd)

def unique(pairs):
    result={}
    for k,v in pairs:require(k not in result);result[k]=v
    return result

def packet(engine,raw,signature,key):
    require(isinstance(raw,bytes) and 0<len(raw)<=32768 and isinstance(signature,str) and re.fullmatch('[a-f0-9]{64}',signature))
    require(hmac.compare_digest(hmac.new(key,b'hms:mail-portal:v1:'+raw,hashlib.sha256).hexdigest(),signature))
    p=json.loads(raw,object_pairs_hook=unique)
    require(isinstance(p,dict) and set(p)=={'schema','actor','nonce','expires','command'} and type(p['schema'])is int and p['schema']==1)
    require(type(p['expires'])is int and int(time.time())<p['expires']<=int(time.time())+120)
    require(isinstance(p['nonce'],str) and re.fullmatch('[a-f0-9-]{36}',p['nonce']) and engine.owner(p['actor'])is True)
    require(engine.reserve(8192,1)is True)
    with engine.tx():
        engine.db.execute('DELETE FROM mail_http_nonces WHERE expires<?',(int(time.time()),))
        engine.db.execute('INSERT INTO mail_http_nonces VALUES(?,?)',(p['nonce'],p['expires']))
    c=p['command'];require(isinstance(c,dict));action=c.get('action')
    common={'action','service','domain','client'};shape={'snapshot':common,'delivery':common,'request':common|{'request_key','operation'},'approve':common|{'job','approval'},'cancel':common|{'job'},'reconcile':common|{'job'}}
    require(action in shape and set(c)==shape[action]);args=(p['actor'],c['service'],c['client'],c['domain'])
    if action=='snapshot':return engine.snapshot(*args)
    if action=='delivery':return engine.delivery(*args)
    if action=='request':return engine.enqueue(*args,c['request_key'],c['operation'])
    if action=='approve':return engine.approve(*args,c['job'],c['approval'])
    if action=='reconcile':return engine.reconcile(*args,c['job'])
    return engine.cancel(*args,c['job'])

def assemble():
    current=Path('/opt/housemysite-services/current').resolve();require(current.parent==Path('/opt/housemysite-services/releases'))
    for p in (current,current/'modules/hosting/ispconfig_json.py',current/'scripts/services/service_runtime.py'):
        info=p.stat();require(info.st_uid==0 and not info.st_mode&0o022)
    sys.path.insert(0,str(current))
    from cryptography.hazmat.primitives.serialization import load_pem_public_key
    from modules.hosting.ispconfig_json import ProvisioningJSONRemote
    from scripts.services.service_runtime import provider_group,PrivateHTTPSServer
    config=json.loads(private(SETTINGS));policy=json.loads(private(POLICY))
    require(config['provider'].get('wire_acceptance')=='reviewed')
    policy['group_lookup']=provider_group
    def legacy_reserved(domain):
        path=Path(config['state_dir'])/'services.sqlite'
        # Never claim a domain already reserved by the original managed service.
        require(path.is_file()and not path.is_symlink())
        with sqlite3.connect(path.as_uri()+'?mode=ro',uri=True,timeout=5)as legacy:
            row=legacy.execute("SELECT 1 FROM managed_bindings WHERE kind='email' AND json_extract(config,'$.domain')=? LIMIT 1",(domain,)).fetchone()
        return row is not None
    policy['legacy_reserved']=legacy_reserved
    class Remote(ProvisioningJSONRemote):
        methods={**ProvisioningJSONRemote.methods,'client_update':('session_id','client_id','params'),
                 'mail_alias_get':('session_id','primary_id'),'mail_alias_add':('session_id','client_id','params'),'mail_alias_delete':('session_id','primary_id'), 'client_get_by_username':('session_id','username')}
    @contextmanager
    def provider():
        rpc=Remote(config['provider']['url']);session=rpc('login',private(config['provider']['username_file']).decode().strip(),private(config['provider']['password_file']).decode().strip());require(isinstance(session,str) and session)
        try:yield lambda method,*args:rpc(method,session,*args)
        finally:
            try:rpc('logout',session)
            except Exception:pass
    def owner(actor):
        r=json.loads(private(config['actors_file'])).get(actor)
        return isinstance(r,dict) and r.get('owner')is True and r.get('enabled')is True and r.get('write')is True
    fd=os.open(STATE,os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW,0o600)
    info=os.fstat(fd);require(stat.S_ISREG(info.st_mode) and info.st_uid==os.geteuid() and stat.S_IMODE(info.st_mode)==0o600);os.close(fd)
    def disk_reserve(amount,files):
        usage=os.statvfs(STATE.parent)
        return usage.f_bavail*usage.f_frsize>=config['min_free_bytes']+amount and usage.f_favail>=config['min_free_inodes']+files and STATE.parent.stat().st_dev==config['device_id']
    def reserve(amount,files):
        size=sum(p.stat().st_size for p in (STATE,Path(str(STATE)+'-journal'),Path(str(STATE)+'-wal'),Path(str(STATE)+'-shm')) if p.exists())
        return disk_reserve(amount,files) and size+amount<=config['max_state_bytes']
    db=sqlite3.connect(STATE,isolation_level=None,timeout=10)
    engine=MailAccounts(db,owner=owner,public_key=load_pem_public_key(private(config['management']['owner_public_file'])),host_private=base64.urlsafe_b64decode(private(config['management']['host_private_file']).strip()),provider=provider,policy=policy,reserve=reserve)
    if policy.get('archive') or policy.get('local_backups'):
        from mail_archive import ImapArchive,S3,LocalEncryptedStore
        store=S3(policy['archive']) if policy.get('archive') else LocalEncryptedStore('/var/lib/housemysite-services/mail-backups',reserve=disk_reserve,maximum_bytes=policy['local_backups']['maximum_bytes'])
        engine.archive=ImapArchive(db,base64.urlsafe_b64decode(private(config['encryption_key_file']).strip()),store,policy['mx_host'],STATE.parent,disk_reserve)
    if policy.get('usage_broker'):
        def usage(address,timeout=2.5):
            try:
                with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM)as connection:
                    connection.settimeout(min(2.5,timeout));connection.connect('/run/housemysite-mail-usage/socket');_,uid,_=struct.unpack('3i',connection.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,12));require(uid==0);connection.sendall((address+'\n').encode());raw=connection.recv(128);value=json.loads(raw);require(set(value)=={'used_bytes'});return value['used_bytes']
            except Exception:return None
        engine.usage=usage
    db.execute('CREATE TABLE IF NOT EXISTS mail_http_nonces(nonce TEXT PRIMARY KEY,expires INTEGER NOT NULL)')
    return engine,config,PrivateHTTPSServer

def main():
    parser=argparse.ArgumentParser();parser.add_argument('mode',choices=['serve','worker','inspect']);args=parser.parse_args();os.umask(0o077)
    engine,config,server_class=assemble()
    if args.mode=='inspect':print(json.dumps({'mail_agent':'ready','provider_changes':0,'sending_enabled':False}));return
    if args.mode=='worker':
        lock_path=STATE.parent/'mail-worker.lock';fd=os.open(lock_path,os.O_WRONLY|os.O_CREAT|os.O_NOFOLLOW,0o600)
        with os.fdopen(fd,'w')as lock:
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);engine.process()
        return
    key=private(config['portal_key_file']).strip()
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*_):pass
        def reply(self,status,value):
            raw=json.dumps(value,allow_nan=False).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
        def do_GET(self):self.reply(405,{'error':'Unavailable'})
        def do_POST(self):
            try:
                require(self.path=='/v1/mail' and self.headers.get('Content-Type')=='application/json' and not self.headers.get('Transfer-Encoding'))
                require(len(self.headers.get_all('Content-Length',[]))==1 and len(self.headers.get_all('X-HMS-Mail-Signature',[]))==1)
                length=self.headers.get('Content-Length','');require(re.fullmatch('[0-9]{1,5}',length) and 0<int(length)<=32768)
                raw=self.rfile.read(int(length));require(len(raw)==int(length));result=packet(engine,raw,self.headers.get('X-HMS-Mail-Signature'),key)
                self.reply(200,result)
            except Exception:self.reply(403,{'error':'Unconfirmed; refresh saved status before retrying'})
    context=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);context.minimum_version=ssl.TLSVersion.TLSv1_2;private(config['tls']['key_file']);context.load_cert_chain(config['tls']['certificate_file'],config['tls']['key_file'])
    server=server_class(('127.0.0.1',18445),Handler,context)
    def stop(*_):raise SystemExit()
    signal.signal(signal.SIGTERM,stop)
    try:server.serve_forever(poll_interval=.5)
    finally:server.server_close();engine.db.close()
if __name__=='__main__':
    try:main()
    except Exception:print(json.dumps({'mail_agent':'stopped','error':'Private mail configuration or outcome requires review'}));raise SystemExit(1)
