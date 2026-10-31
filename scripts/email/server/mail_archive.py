"""Encrypted mailbox backup/import using verified IMAP and a fixed private S3
bucket. Keys/credentials are local private enrollment, never browser URLs.
Restore imports a copy and uses a per-message marker to avoid repeat imports.
"""
import base64
import hashlib
import hmac
import http.client
import imaplib
import ipaddress
import json
import os
from pathlib import Path
import re
import secrets
import socket
import ssl
import tempfile
import time
import uuid
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from mail_accounts import require,canon,Refused

def quote(value):
    if isinstance(value,str):value=value.encode('ascii')
    require(isinstance(value,bytes) and 0<len(value)<=1024 and not any(c in value for c in (b'\r',b'\n',b'\x00')))
    return b'"'+value.replace(b'\\',b'\\\\').replace(b'"',b'\\"')+b'"'

class PinnedIMAP(imaplib.IMAP4_SSL):
    def __init__(self,host,*,external=False):
        addresses=socket.getaddrinfo(host,993,type=socket.SOCK_STREAM)
        require(addresses)
        if external:require(all(ipaddress.ip_address(a[4][0]).is_global for a in addresses))
        self.pinned=addresses[0][4][0]
        context=ssl.create_default_context();context.minimum_version=ssl.TLSVersion.TLSv1_2
        super().__init__(host,993,ssl_context=context,timeout=30)
    def _create_socket(self,timeout):
        raw=socket.create_connection((self.pinned,993),timeout)
        try:return self.ssl_context.wrap_socket(raw,server_hostname=self.host)
        except BaseException:raw.close();raise

class S3:
    offsite=True
    def __init__(self,config):
        require(set(config)=={'bucket','region','access_key','secret_key','prefix'})
        require(re.fullmatch('[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]',config['bucket']) and '..'not in config['bucket'] and '.'not in config['bucket'])
        require(re.fullmatch('[a-z]{2}-[a-z]+-[0-9]',config['region']) and re.fullmatch('[a-z0-9/-]{1,100}',config['prefix']) and '..'not in config['prefix'])
        self.c=config;self.host=config['bucket']+'.s3.'+config['region']+'.amazonaws.com'
    def transfer(self,method,key,path,*,maximum):
        require(method in ('PUT','GET') and re.fullmatch('[a-f0-9]{32}/[a-f0-9]{32}.enc',key));path=Path(path)
        size=path.stat().st_size if method=='PUT'else 0;require(size<=maximum)
        payload=hashlib.sha256()
        if method=='PUT':
            with path.open('rb')as f:
                for part in iter(lambda:f.read(1048576),b''):payload.update(part)
        digest=payload.hexdigest();now=time.gmtime();date=time.strftime('%Y%m%d',now);stamp=time.strftime('%Y%m%dT%H%M%SZ',now)
        target='/'+self.c['prefix'].strip('/')+'/'+key
        headers={'host':self.host,'x-amz-content-sha256':digest,'x-amz-date':stamp}
        if method=='PUT':headers['if-none-match']='*'
        names=';'.join(sorted(headers));canonical=method+'\n'+target+'\n\n'+''.join(k+':'+headers[k]+'\n'for k in sorted(headers))+'\n'+names+'\n'+digest
        scope=date+'/'+self.c['region']+'/s3/aws4_request';tosign='AWS4-HMAC-SHA256\n'+stamp+'\n'+scope+'\n'+hashlib.sha256(canonical.encode()).hexdigest()
        k=('AWS4'+self.c['secret_key']).encode()
        for part in (date,self.c['region'],'s3','aws4_request'):k=hmac.new(k,part.encode(),hashlib.sha256).digest()
        headers['Authorization']='AWS4-HMAC-SHA256 Credential='+self.c['access_key']+'/'+scope+', SignedHeaders='+names+', Signature='+hmac.new(k,tosign.encode(),hashlib.sha256).hexdigest()
        connection=http.client.HTTPSConnection(self.host,timeout=60,context=ssl.create_default_context())
        try:
            connection.putrequest(method,target,skip_host=True)
            for k,v in headers.items():connection.putheader(k,v)
            if method=='PUT':connection.putheader('Content-Length',str(size))
            connection.endheaders()
            if method=='PUT':
                with path.open('rb')as f:
                    for part in iter(lambda:f.read(1048576),b''):connection.send(part)
            response=connection.getresponse();require(response.status==200)
            if method=='GET':
                total=0
                with path.open('wb')as f:
                    while True:
                        part=response.read(1048576)
                        if not part:break
                        total+=len(part);require(total<=maximum);f.write(part)
                    f.flush();os.fsync(f.fileno())
            else:response.read(4096)
        finally:connection.close()


class LocalEncryptedStore:
    offsite=False
    def __init__(self,root,*,reserve,maximum_bytes):
        self.root=Path(root);self.reserve=reserve;self.maximum_bytes=maximum_bytes
        require(self.root.is_absolute() and self.root.resolve()==self.root and self.root.is_dir())
        info=self.root.stat();require(info.st_uid==os.geteuid() and info.st_mode&0o077==0)
    def transfer(self,method,key,path,*,maximum):
        require(method in ('PUT','GET') and re.fullmatch('[a-f0-9]{32}/[a-f0-9]{32}.enc',key))
        path=Path(path);target=self.root/key.replace('/','-')
        if method=='PUT':
            size=path.stat().st_size;require(size<=maximum and self.reserve(size+1048576,1))
            files=list(self.root.glob('*.enc'));require(len(files)<1000)
            require(all(p.is_file()and not p.is_symlink()for p in files));require(sum(p.stat().st_size for p in files)+size<=self.maximum_bytes)
            fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
            try:
                with os.fdopen(fd,'wb')as out,path.open('rb')as source:
                    for part in iter(lambda:source.read(1048576),b''):out.write(part)
                    out.flush();os.fsync(out.fileno())
                directory=os.open(self.root,os.O_RDONLY|os.O_DIRECTORY)
                try:os.fsync(directory)
                finally:os.close(directory)
            except BaseException:
                target.unlink(missing_ok=True);raise
        else:
            fd=os.open(target,os.O_RDONLY|os.O_NOFOLLOW)
            with os.fdopen(fd,'rb')as source,path.open('wb')as out:
                info=os.fstat(source.fileno());require(info.st_uid==os.geteuid() and info.st_mode&0o077==0 and info.st_size<=maximum)
                for part in iter(lambda:source.read(1048576),b''):out.write(part)
                out.flush();os.fsync(out.fileno())

def messages(imap,*,maximum_bytes,maximum_messages=100000):
    status,folders=imap.list();require(status=='OK' and len(folders)<=100);total=0;count=0
    for row in folders:
        require(isinstance(row,bytes));match=re.fullmatch(rb'\(([^)]*)\) (?:"[^"]*"|NIL) (.+)',row);require(match is not None)
        if b'\\Noselect' in match[1]:continue
        raw=match[2]
        if raw.startswith(b'"')and raw.endswith(b'"'):raw=raw[1:-1].replace(b'\\"',b'"').replace(b'\\\\',b'\\')
        require(imap.select(quote(raw),readonly=True)[0]=='OK')
        status,uids=imap.uid('search',None,'ALL');require(status=='OK');ids=uids[0].split()if uids and uids[0]else[];require(len(ids)+count<=maximum_messages)
        for uid in ids:
            require(re.fullmatch(rb'[0-9]+',uid));status,parts=imap.uid('fetch',uid,'(RFC822.SIZE FLAGS INTERNALDATE BODY.PEEK[])');require(status=='OK')
            body=next((p[1]for p in parts if isinstance(p,tuple)and len(p)==2 and isinstance(p[1],bytes)),None)
            require(body is not None and len(body)<=32*1048576);count+=1;total+=len(body);require(total<=maximum_bytes)
            metadata=next(p[0] for p in parts if isinstance(p,tuple) and len(p)==2 and isinstance(p[1],bytes))
            flags=[v.decode('ascii') for v in imaplib.ParseFlags(metadata) if v!=b'\\Recent']
            require(all(re.fullmatch(r'[\\A-Za-z0-9_$.-]{1,80}',v)for v in flags))
            date=re.search(rb'INTERNALDATE "([^"\r\n]{1,80})"',metadata)
            require(date is not None)
            yield {'folder':base64.b64encode(raw).decode(),'message':base64.b64encode(body).decode(),'flags':flags,'internaldate':date[1].decode('ascii')}

class ImapArchive:
    def __init__(self,db,key,store,host,state,reserve,clock=time.time):
        require(isinstance(key,bytes)and len(key)==32);self.db,self.aes,self.store,self.host,self.state,self.reserve,self.clock=db,AESGCM(key),store,host,Path(state),reserve,clock
        db.executescript('CREATE TABLE IF NOT EXISTS mail_vault(resource TEXT PRIMARY KEY,secret BLOB NOT NULL);CREATE TABLE IF NOT EXISTS mail_backup_points(id TEXT PRIMARY KEY,service TEXT NOT NULL,resource TEXT NOT NULL,created INTEGER NOT NULL,bytes INTEGER NOT NULL,digest TEXT NOT NULL);')
    def remember(self,resource,password):
        nonce=secrets.token_bytes(12);secret=nonce+self.aes.encrypt(nonce,password.encode(),resource.encode())
        self.db.execute('INSERT OR REPLACE INTO mail_vault VALUES(?,?)',(resource,secret))
    def password(self,resource):
        row=self.db.execute('SELECT secret FROM mail_vault WHERE resource=?',(resource,)).fetchone();require(row is not None);v=row[0];return self.aes.decrypt(v[:12],v[12:],resource.encode()).decode()
    def list(self,service):
        return [dict(zip(('id','resource','created','bytes'),r))|{'offsite':self.store.offsite}for r in self.db.execute('SELECT id,resource,created,bytes FROM mail_backup_points WHERE service=? ORDER BY created DESC LIMIT 100',(service,))]
    def execute(self,op,service,box,command,password,on_mutation=None):
        require(self.reserve(64*1048576,2)is True);resource=box['id'];point=command.get('point')or uuid.uuid4().hex
        fd,name=tempfile.mkstemp(prefix='mail-archive-',dir=self.state);os.fchmod(fd,0o600);os.close(fd);path=Path(name)
        try:
            target=destination=source=None
            if op=='backup':
                source=PinnedIMAP(self.host);source.login(box['address'],self.password(resource));budget=int(box['quota'])
                with path.open('wb')as f:
                    f.write(b'HMSMAIL1\n')
                    for record in messages(source,maximum_bytes=budget):
                        require(self.reserve(len(record['message'])+1048576,1)is True);nonce=secrets.token_bytes(12);encrypted=nonce+self.aes.encrypt(nonce,canon(record),(service+'|'+resource+'|'+point).encode());f.write(base64.b64encode(encrypted)+b'\n')
                    f.flush();os.fsync(f.fileno())
                digest=hashlib.sha256(path.read_bytes()).hexdigest()if path.stat().st_size<1048576 else self.file_digest(path)
                if self.store.offsite and on_mutation:on_mutation()
                self.store.transfer('PUT',service.replace('-','')+'/'+point+'.enc',path,maximum=2*budget)
                self.db.execute('INSERT INTO mail_backup_points VALUES(?,?,?,?,?,?)',(point,service,resource,int(self.clock()),path.stat().st_size,digest))
                return
            destination=PinnedIMAP(self.host);destination.login(box['address'],self.password(resource))
            if op=='restore':
                self.execute('backup',service,box,{'operation':'backup'},None)
                row=self.db.execute('SELECT bytes,digest FROM mail_backup_points WHERE id=? AND service=? AND resource=?',(point,service,resource)).fetchone();require(row is not None and self.reserve(row[0]+1048576,1)is True)
                self.store.transfer('GET',service.replace('-','')+'/'+point+'.enc',path,maximum=row[0]);require(path.stat().st_size==row[0] and self.file_digest(path)==row[1])
                # Authenticate every encrypted record before importing any message.
                with path.open('rb')as f:
                    require(f.readline()==b'HMSMAIL1\n')
                    for line in f:self.decode(line,service,resource,point)
                with path.open('rb')as f:
                    f.readline()
                    for index,line in enumerate(f):self.append(destination,self.decode(line,service,resource,point),point+':'+str(index),on_mutation)
            elif op=='migrate':
                require(isinstance(password,str));source=PinnedIMAP(command['source_host'],external=True);source.login(command['source_user'],password)
                for record in messages(source,maximum_bytes=int(box['quota'])):self.append(destination,record,hashlib.sha256(canon(record)).hexdigest(),on_mutation)
            else:raise Refused('Unsupported archive operation')
        finally:
            for imap in (locals().get('source'),locals().get('destination')):
                if imap:
                    try:imap.logout()
                    except Exception:pass
            path.unlink(missing_ok=True)
    def decode(self,line,service,resource,point):
        require(len(line)<=64*1048576);raw=base64.b64decode(line.rstrip(b'\n'),validate=True);return json.loads(self.aes.decrypt(raw[:12],raw[12:],(service+'|'+resource+'|'+point).encode()))
    @staticmethod
    def file_digest(path):
        digest=hashlib.sha256()
        with path.open('rb')as f:
            for part in iter(lambda:f.read(1048576),b''):digest.update(part)
        return digest.hexdigest()
    @staticmethod
    def append(imap,record,marker,on_mutation=None):
        require(set(record)=={'folder','message','flags','internaldate'});require(isinstance(record['flags'],list)and len(record['flags'])<=100 and all(isinstance(v,str)and re.fullmatch(r'[\\A-Za-z0-9_$.-]{1,80}',v)for v in record['flags']));require(isinstance(record['internaldate'],str)and re.fullmatch(r'[0-9]{1,2}-[A-Za-z]{3}-[0-9]{4} [0-9]{2}:[0-9]{2}:[0-9]{2} [+-][0-9]{4}',record['internaldate']));folder=base64.b64decode(record['folder'],validate=True);body=base64.b64decode(record['message'],validate=True);require(len(body)<=32*1048576)
        if imap.select(quote(folder))[0]!='OK':require(imap.create(quote(folder))[0]=='OK');require(imap.select(quote(folder))[0]=='OK')
        status,found=imap.search(None,'HEADER','X-HMS-Restore-ID',quote(marker));require(status=='OK')
        if found and found[0]:return
        if on_mutation:on_mutation()
        require(imap.append(quote(folder),'('+' '.join(record['flags'])+')','\"'+record['internaldate']+'\"',b'X-HMS-Restore-ID: '+marker.encode()+b'\r\n'+body)[0]=='OK')
