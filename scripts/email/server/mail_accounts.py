"""Standalone email accounts. Private portal requests enqueue; an independent
owner signature and durable one-shot worker apply changes. No implicit retry.
The provider and storage adapters are enrolled locally, never chosen by browsers.
"""
import base64
from contextlib import contextmanager
import hashlib
import json
import re
import secrets
import sqlite3
import time
import uuid
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey

class Refused(ValueError): pass

def require(value):
    if not value: raise Refused('Mail request refused')

def canon(v): return json.dumps(v, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()
def ident(v): require(isinstance(v,str) and str(uuid.UUID(v))==v); return v
def rid(v): require(isinstance(v,str) and re.fullmatch(r'[a-f0-9]{32}',v)); return v

def limits(v):
    require(isinstance(v,dict) and set(v)=={'mailboxes','mailbox_mb','total_mb'})
    for k,n in [('mailboxes',1000),('mailbox_mb',102400),('total_mb',1048576)]: require(type(v[k]) is int and 1<=v[k]<=n)
    require(v['mailboxes']*v['mailbox_mb']<=v['total_mb']);return v

def operation(v):
    require(isinstance(v,dict));op=v.get('operation')
    fields={'enroll':{'domain','limits'},'limits':{'limits'},'create':{'name','sealed','quota_mb'},'password':{'resource','sealed'},'quota':{'resource','quota_mb'},'controls':{'resource','sending','receiving','login'},'delete':{'resource','confirm'},'alias':{'name','resource'},'alias_delete':{'resource','alias','confirm'},'forward':{'resource','destination','keep_copy'},'autoreply':{'resource','enabled','subject','text'},'backup':{'resource'},'restore':{'resource','point','confirm'},'migrate':{'resource','source_host','source_user','sealed'}}
    require(op in fields and set(v)==fields[op]|{'operation'})
    if 'resource' in v: rid(v['resource'])
    if 'limits' in v: limits(v['limits'])
    if 'name' in v: require(isinstance(v['name'],str) and re.fullmatch(r'[a-z][a-z0-9_.+-]{0,63}',v['name']))
    if 'quota_mb' in v: require(type(v['quota_mb']) is int and 1<=v['quota_mb']<=102400)
    for k in ('sending','receiving','login','keep_copy','enabled'):
        if k in v: require(type(v[k]) is bool)
    if 'confirm' in v: require(v['confirm']==(v['alias']if op=='alias_delete'else v['resource']))
    if 'alias'in v:rid(v['alias'])
    if 'point' in v: rid(v['point'])
    if 'sealed' in v: require(isinstance(v['sealed'],str) and re.fullmatch(r'[A-Za-z0-9_-]{80,5998}={0,2}',v['sealed']))
    for k in ('domain','source_host'):
        if k in v: require(isinstance(v[k],str) and len(v[k])<=253 and re.fullmatch(r'(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?',v[k]))
    for k in ('destination','source_user'):
        if k in v: require(isinstance(v[k],str) and len(v[k])<=254 and re.fullmatch(r'[^\s@\x00-\x1f]+@[^\s@\x00-\x1f]+\.[^\s@\x00-\x1f]+',v[k]))
    if op=='autoreply':
        require(isinstance(v['subject'],str) and len(v['subject'])<=120 and not any(c in v['subject'] for c in '\r\n\x00'))
        require(isinstance(v['text'],str) and len(v['text'])<=5000 and '\x00' not in v['text'])
    return v

class MailAccounts:
    def __init__(self,db,*,owner,public_key,host_private,provider,policy,reserve,archive=None,usage=None,clock=time.time):
        self.db,self.owner,self.public_key,self.host_private,self.provider,self.policy,self.reserve,self.clock=db,owner,public_key,host_private,provider,policy,reserve,clock
        self.archive,self.usage=archive,usage
        require(isinstance(policy['capacity'],dict) and set(policy['capacity'])=={'mailboxes','mailbox_mb','total_mb'});require(all(type(v)is int and v>0 for v in policy['capacity'].values()));require(type(policy['server']) is int and policy['server']>0)
        require(len(host_private)==32 and callable(owner) and callable(reserve))
        db.row_factory=sqlite3.Row;db.execute('PRAGMA foreign_keys=ON');db.execute('PRAGMA synchronous=FULL')
        db.executescript('''
        CREATE TABLE IF NOT EXISTS mail_accounts(service TEXT PRIMARY KEY,client TEXT NOT NULL UNIQUE,domain TEXT NOT NULL UNIQUE,config TEXT NOT NULL,provider_client INTEGER,provider_group INTEGER,provider_domain INTEGER);
        CREATE TABLE IF NOT EXISTS mail_boxes(id TEXT PRIMARY KEY,service TEXT NOT NULL REFERENCES mail_accounts(service),address TEXT NOT NULL UNIQUE,provider_id INTEGER NOT NULL UNIQUE);
        CREATE TABLE IF NOT EXISTS mail_jobs(id TEXT PRIMARY KEY,service TEXT NOT NULL REFERENCES mail_accounts(service),request_key TEXT NOT NULL,intent TEXT NOT NULL,digest TEXT NOT NULL,state TEXT NOT NULL,created INTEGER NOT NULL,approval TEXT,UNIQUE(service,request_key));
        CREATE UNIQUE INDEX IF NOT EXISTS mail_one_pending ON mail_jobs(service) WHERE state IN ('queued','applying','uncertain');
        CREATE TABLE IF NOT EXISTS mail_nonces(nonce TEXT PRIMARY KEY,job TEXT NOT NULL UNIQUE);
        CREATE TABLE IF NOT EXISTS mail_steps(job TEXT NOT NULL,step TEXT NOT NULL,provider_id INTEGER NOT NULL,PRIMARY KEY(job,step));
        CREATE TABLE IF NOT EXISTS mail_delivery_reports(service TEXT PRIMARY KEY,report TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS mail_send_events(id TEXT PRIMARY KEY,resource TEXT NOT NULL,service TEXT NOT NULL,created INTEGER NOT NULL,recipients INTEGER NOT NULL);
        CREATE INDEX IF NOT EXISTS mail_send_events_time ON mail_send_events(created);
        CREATE TABLE IF NOT EXISTS mail_aliases(id TEXT PRIMARY KEY,service TEXT NOT NULL,resource TEXT NOT NULL,name TEXT NOT NULL UNIQUE,provider_id INTEGER NOT NULL UNIQUE);
        ''')
    @contextmanager
    def tx(self):
        require(not self.db.in_transaction);self.db.execute('BEGIN IMMEDIATE')
        try: yield;self.db.commit()
        except BaseException:self.db.rollback();raise
    def account(self,actor,service,client,domain):
        require(self.owner(actor) is True);ident(service);ident(client)
        row=self.db.execute('SELECT * FROM mail_accounts WHERE service=?',(service,)).fetchone()
        require(row is not None and row['client']==client and row['domain']==domain);return dict(row)
    def job_view(self,row):
        return {k:row[k] for k in ('id','state','digest','created')}|{'intent':json.loads(row['intent']),'approval_received':bool(row['approval'])}
    def enqueue(self,actor,service,client,domain,key,command):
        require(self.owner(actor) is True);ident(service);ident(client);ident(key);operation(command)
        require(self.reserve(16384,2) is True)
        with self.tx():
            if command['operation']=='enroll':
                require(command['domain']==domain)
                if not self.db.execute('SELECT 1 FROM mail_accounts WHERE service=?',(service,)).fetchone():
                    self.db.execute('INSERT INTO mail_accounts VALUES(?,?,?,?,NULL,NULL,NULL)',(service,client,domain,canon(command['limits']).decode()))
            self.account(actor,service,client,domain)
            signed=dict(command,domain=domain)
            if 'resource' in command:
                box=self.db.execute('SELECT address FROM mail_boxes WHERE id=? AND service=?',(command['resource'],service)).fetchone()
                require(box is not None);signed['target']=box['address']
            elif command['operation']=='create':signed['target']=command['name']+'@'+domain
            if 'target'in signed:require(len(signed['target'])<=254)
            if command['operation']=='alias_delete':
                alias=self.db.execute('SELECT name FROM mail_aliases WHERE id=? AND resource=? AND service=?',(command['alias'],command['resource'],service)).fetchone();require(alias is not None);signed['alias_target']=alias['name']
            intent={'actor':actor,'service':service,'kind':'email','request_key':key,'command':signed};digest=hashlib.sha256(canon(intent)).hexdigest()
            old=self.db.execute('SELECT * FROM mail_jobs WHERE service=? AND request_key=?',(service,key)).fetchone()
            if old: require(old['digest']==digest);return {'accepted':True,'job':old['id']}
            job=uuid.uuid4().hex
            self.db.execute('INSERT INTO mail_jobs VALUES(?,?,?,?,?,?,?,NULL)',(job,service,key,canon(intent).decode(),digest,'queued',int(self.clock())))
        return {'accepted':True,'job':job}
    def approve(self,actor,service,client,domain,job,approval):
        self.account(actor,service,client,domain);rid(job)
        row=self.db.execute('SELECT * FROM mail_jobs WHERE id=? AND service=?',(job,service)).fetchone()
        require(row is not None and row['state']=='queued');self.verify(row,approval)
        with self.tx():
            require(self.db.execute('UPDATE mail_jobs SET approval=? WHERE id=? AND state=? AND approval IS NULL',(canon(approval).decode(),job,'queued')).rowcount==1)
        return {'accepted':True,'job':job}
    def verify(self,row,approval):
        require(isinstance(approval,dict) and set(approval)=={'job','digest','nonce','issued','expires','signature'})
        require(hashlib.sha256(canon(json.loads(row['intent']))).hexdigest()==row['digest'])
        require(approval['job']==row['id'] and approval['digest']==row['digest']);rid(approval['nonce']);now=int(self.clock())
        require(type(approval['issued']) is int and type(approval['expires']) is int and now-600<=approval['issued']<=now+30 and now<approval['expires']<=approval['issued']+600)
        body={k:v for k,v in approval.items() if k!='signature'}
        try:self.public_key.verify(base64.b64decode(approval['signature'],validate=True),b'hms-managed-approval-v1\n'+canon(body))
        except Exception:raise Refused('Owner signature denied') from None
    def cancel(self,actor,service,client,domain,job):
        self.account(actor,service,client,domain);rid(job)
        with self.tx():require(self.db.execute("UPDATE mail_jobs SET state='cancelled',approval=NULL WHERE id=? AND service=? AND state='queued'",(job,service)).rowcount==1)
        return {'accepted':True,'job':job}
    def reconcile(self,actor,service,client,domain,job_id):
        a=self.account(actor,service,client,domain);rid(job_id)
        job=self.db.execute('SELECT * FROM mail_jobs WHERE id=? AND service=?',(job_id,service)).fetchone();require(job is not None and job['state']=='uncertain')
        signed=json.loads(job['intent'])['command'];op=signed['operation'];outcome='uncertain'
        require(hashlib.sha256(canon(json.loads(job['intent']))).hexdigest()==job['digest'])
        with self.provider()as remote:
            if op=='enroll':
                username='hmse_'+service.replace('-','')[:20];found=remote('client_get_by_username',username)
                if type(found)is int and found>0:found=remote('client_get',found)
                if isinstance(found,list):require(len(found)<=1);found=found[0]if found else None
                domains=remote('mail_domain_get',{'domain':domain})
                if not found and domains in(None,False,[]):outcome='failed'
                elif isinstance(found,dict):
                    require(found.get('username')==username and found.get('customer_no')=='hms_mail_'+service)
                    require(int(found['limit_mailbox'])==signed['limits']['mailboxes'] and int(found['limit_mailquota'])==signed['limits']['total_mb'])
                    primary=int(found['client_id']);group=self.policy['group_lookup'](primary)
                    if domains in(None,False,[]):
                        with self.tx():self.db.execute('UPDATE mail_accounts SET provider_client=?,provider_group=? WHERE service=?',(primary,group,service))
                        outcome='failed'
                    else:
                        if isinstance(domains,list):require(len(domains)==1);domains=domains[0]
                        check=dict(a,provider_client=primary,provider_group=group,provider_domain=int(domains['domain_id']));self.check(domains,check,domain=True)
                        with self.tx():self.db.execute('UPDATE mail_accounts SET provider_client=?,provider_group=?,provider_domain=?,config=? WHERE service=?',(primary,group,check['provider_domain'],canon(signed['limits']).decode(),service))
                        outcome='confirmed'
            elif op=='create':
                rows=remote('mail_user_get',{'email':signed['target']})
                if rows in(None,False,[]):outcome='failed'
                else:
                    if isinstance(rows,list):require(len(rows)==1);rows=rows[0]
                    box={'address':signed['target'],'provider_id':int(rows['mailuser_id'])};self.check(rows,a,box);require(int(rows['quota'])==signed['quota_mb']*1048576)
                    require(rows.get('disablesmtp')=='y')
                    old=self.db.execute('SELECT * FROM mail_boxes WHERE provider_id=?',(box['provider_id'],)).fetchone()
                    if old:require(old['service']==service and old['address']==box['address'])
                    else:
                        with self.tx():self.db.execute('INSERT INTO mail_boxes VALUES(?,?,?,?)',(uuid.uuid4().hex,service,box['address'],box['provider_id']))
                    outcome='confirmed'
            elif op=='limits':
                observed=remote('client_get',a['provider_client']);requested=signed['limits']
                require(observed.get('customer_no')=='hms_mail_'+service)
                if int(observed['limit_mailbox'])==requested['mailboxes'] and int(observed['limit_mailquota'])==requested['total_mb']:
                    with self.tx():self.db.execute('UPDATE mail_accounts SET config=? WHERE service=?',(canon(requested).decode(),service))
                    outcome='confirmed'
            elif op in ('quota','controls','forward','autoreply'):
                box=self.db.execute('SELECT * FROM mail_boxes WHERE id=? AND service=?',(signed['resource'],service)).fetchone();require(box is not None)
                observed=remote('mail_user_get',box['provider_id']);self.check(observed,a,box)
                if op=='quota':expected={'quota':signed['quota_mb']*1048576}
                elif op=='controls':expected={'disablesmtp':'n'if signed['sending']else'y','disabledeliver':'n'if signed['receiving']else'y','disablelda':'n'if signed['receiving']else'y','disablelmtp':'n'if signed['receiving']else'y','disableimap':'n'if signed['login']else'y','disablepop3':'n'if signed['login']else'y'}
                elif op=='forward':expected={'cc':signed['destination'],'forward_in_lda':'y'}
                else:expected={'autoresponder':'y'if signed['enabled']else'n','autoresponder_subject':signed['subject'],'autoresponder_text':signed['text']}
                if all(str(observed.get(k))==str(v)for k,v in expected.items()):outcome='confirmed'
            elif op=='alias':
                rows=remote('mail_alias_get',{'source':signed['name']+'@'+domain});box=self.db.execute('SELECT * FROM mail_boxes WHERE id=? AND service=?',(signed['resource'],service)).fetchone();require(box is not None)
                if rows in(None,False,[]):outcome='failed'
                else:
                    if isinstance(rows,list):require(len(rows)==1);rows=rows[0]
                    require(rows.get('source')==signed['name']+'@'+domain and rows.get('destination')==box['address'] and str(rows.get('sys_groupid'))==str(a['provider_group']) and str(rows.get('server_id'))==str(self.policy['server']))
                    primary=int(rows['virtual_id']);old=self.db.execute('SELECT * FROM mail_aliases WHERE provider_id=?',(primary,)).fetchone()
                    if old:require(old['service']==service and old['resource']==box['id'])
                    else:
                        with self.tx():self.db.execute('INSERT INTO mail_aliases VALUES(?,?,?,?,?)',(uuid.uuid4().hex,service,box['id'],rows['source'],primary))
                    outcome='confirmed'
            elif op=='alias_delete':
                alias=self.db.execute('SELECT * FROM mail_aliases WHERE id=? AND service=?',(signed['alias'],service)).fetchone()
                if alias and remote('mail_alias_get',alias['provider_id'])in(None,False,[]):
                    with self.tx():self.db.execute('DELETE FROM mail_aliases WHERE id=?',(alias['id'],))
                    outcome='confirmed'
            elif op=='delete':
                box=self.db.execute('SELECT * FROM mail_boxes WHERE id=? AND service=?',(signed['resource'],service)).fetchone()
                if box and remote('mail_user_get',box['provider_id'])in(None,False,[]):
                    with self.tx():self.db.execute('DELETE FROM mail_boxes WHERE id=?',(box['id'],))
                    outcome='confirmed'
        if outcome!='uncertain':
            with self.tx():self.db.execute('UPDATE mail_jobs SET state=? WHERE id=? AND state=?',(outcome,job_id,'uncertain'))
        return {'accepted':True,'job':job_id}
    def delivery(self,actor,service,client,domain):
        a=self.account(actor,service,client,domain);require(a['provider_domain']is not None)
        from mail_delivery import check
        with self.provider()as remote:
            panel=remote('mail_domain_get',a['provider_domain']);self.check(panel,a,domain=True)
        report=dict(check(self.policy,panel),service=service)
        with self.tx():self.db.execute('INSERT OR REPLACE INTO mail_delivery_reports VALUES(?,?)',(service,canon(report).decode()))
        return report
    def snapshot(self,actor,service,client,domain):
        require(self.owner(actor) is True);ident(service);ident(client)
        row=self.db.execute('SELECT * FROM mail_accounts WHERE service=?',(service,)).fetchone()
        host=base64.urlsafe_b64encode(X25519PrivateKey.from_private_bytes(self.host_private).public_key().public_bytes(serialization.Encoding.Raw,serialization.PublicFormat.Raw)).decode()
        result={'service':service,'domain':domain,'state':'not_enrolled','host_key':host,'limits':None,'sending_ready':False,'mailboxes':[],'jobs':[],'backups':[],'delivery':None,'webmail_url':self.policy.get('webmail_url',''),
                'capabilities':{'backups':self.archive is not None,'migration':self.archive is not None,'aliases':True,'forwarding':True,'autoreply':True,'usage':self.usage is not None},'records':[]}
        if not row:return result
        observed=self.db.execute('SELECT report FROM mail_delivery_reports WHERE service=?',(service,)).fetchone()
        if observed:result['delivery']=json.loads(observed[0])
        row=self.account(actor,service,client,domain)
        result['jobs']=[self.job_view(r) for r in self.db.execute('SELECT * FROM mail_jobs WHERE service=? ORDER BY created DESC,id LIMIT 20',(service,))]
        if not row['provider_domain']:return result
        cfg=json.loads(row['config']);result['limits']=cfg;result['state']='attention' if any(j['state'] in ('uncertain','applying') for j in result['jobs']) else 'active'
        with self.provider() as remote:
            panel=remote('mail_domain_get',row['provider_domain']);self.check(panel,row,domain=True)
            for box in self.db.execute('SELECT * FROM mail_boxes WHERE service=? ORDER BY address LIMIT 1000',(service,)):
                r=remote('mail_user_get',box['provider_id']);self.check(r,row,box)
                aliases=[{'id':a[0],'address':a[1]} for a in self.db.execute('SELECT id,name FROM mail_aliases WHERE resource=?',(box['id'],))]
                used=self.usage(box['address']) if self.usage else None
                require(used is None or type(used)is int and used>=0)
                result['mailboxes'].append({'id':box['id'],'address':box['address'],'quota_mb':int(r['quota'])//1048576,'used_bytes':used,'sending':r.get('disablesmtp')=='n','receiving':r.get('disabledeliver')=='n','login':r.get('disableimap')=='n' and r.get('disablepop3')=='n','aliases':aliases,'forward':r.get('cc') or None,'autoreply':r.get('autoresponder')=='y'})
            # Exact server-generated key, not an invented DKIM record.
            if panel.get('dkim')=='y' and panel.get('dkim_selector') and panel.get('dkim_public'):
                selector=panel['dkim_selector'];require(re.fullmatch(r'[a-zA-Z0-9_-]{1,63}',selector));key=''.join(panel['dkim_public'].splitlines());key=key.replace('-----BEGIN PUBLIC KEY-----','').replace('-----END PUBLIC KEY-----','')
                require(re.fullmatch(r'[A-Za-z0-9+/=]{64,4096}',key));result['records'].append({'type':'TXT','name':selector+'._domainkey','value':'v=DKIM1; k=rsa; p='+key})
        if self.archive:result['backups']=self.archive.list(service)
        result['records']+=[{'type':'MX','name':'@','value':self.policy['mx_host'],'priority':10},{'type':'TXT','name':'@','value':self.policy['spf']},{'type':'TXT','name':'_dmarc','value':'v=DMARC1; p=none;'}]
        result['sending_ready']=bool(self.policy.get('sending_ready',False))
        return result
    def check(self,r,account,box=None,domain=False):
        require(isinstance(r,dict) and str(r.get('sys_groupid'))==str(account['provider_group']) and str(r.get('server_id'))==str(self.policy['server']))
        if domain:require(r.get('domain')==account['domain'] and int(r['domain_id'])==account['provider_domain'])
        if box:
            require(r.get('email')==box['address'] and int(r['mailuser_id'])==box['provider_id'])
            expected=self.policy['mail_template'];local,domain=box['address'].split('@');require(r.get('maildir')==expected['maildir'].replace('{domain}',domain).replace('{localpart}',local))
            require(all(str(r.get(k))==str(expected[k])for k in ('uid','gid')))
    def process(self):
        # A crashed mutation is uncertain, never automatically retried.
        with self.tx():self.db.execute("UPDATE mail_jobs SET state='uncertain',approval=NULL WHERE state='applying'")
        for job in self.db.execute("SELECT * FROM mail_jobs WHERE state='queued' AND approval IS NOT NULL ORDER BY created LIMIT 10").fetchall():
            self.mutation_started=False
            try:
                approval=json.loads(job['approval']);self.verify(job,approval);intent=json.loads(job['intent']);signed=intent['command']
                command=operation({k:v for k,v in signed.items() if k not in ('target','alias_target') and (k!='domain' or signed['operation']=='enroll')})
                account=dict(self.db.execute('SELECT * FROM mail_accounts WHERE service=?',(job['service'],)).fetchone());require(self.owner(intent['actor']) is True)
                require(signed['domain']==account['domain'])
                if 'resource' in command:
                    box=self.db.execute('SELECT address FROM mail_boxes WHERE id=? AND service=?',(command['resource'],job['service'])).fetchone()
                    require(box is not None and box['address']==signed['target'])
                with self.tx():
                    self.db.execute('INSERT INTO mail_nonces VALUES(?,?)',(approval['nonce'],job['id']))
                    require(self.db.execute("UPDATE mail_jobs SET state='applying',approval=NULL WHERE id=? AND state='queued'",(job['id'],)).rowcount==1)
                self.apply(job,account,command)
                with self.tx():self.db.execute("UPDATE mail_jobs SET state='confirmed' WHERE id=?",(job['id'],))
            except Exception:
                with self.tx():self.db.execute("UPDATE mail_jobs SET state=?,approval=NULL WHERE id=? AND state IN ('queued','applying')",('uncertain'if self.mutation_started else'failed',job['id']))
    def step(self,job,name,provider_id):
        require(type(provider_id)is int and provider_id>0)
        with self.tx():self.db.execute('INSERT INTO mail_steps VALUES(?,?,?)',(job['id'],name,provider_id))
    def apply(self,job,a,c):
        op=c['operation'];service=a['service'];cfg=json.loads(a['config'])
        with self.provider() as transport:
            def remote(method,*args):
                if method.endswith(('_add','_update','_delete')):self.mutation_started=True
                return transport(method,*args)
            if op=='enroll':
                require(a['provider_domain'] is None)
                require(not self.policy.get('legacy_reserved',lambda domain:False)(a['domain']))
                requested=limits(c['limits']);cap=self.policy['capacity']
                require(requested['total_mb']<=cap['total_mb'] and requested['mailboxes']<=cap['mailboxes'] and requested['mailbox_mb']<=cap['mailbox_mb'])
                allocated=sum(json.loads(r[0])['total_mb'] for r in self.db.execute('SELECT config FROM mail_accounts WHERE provider_client IS NOT NULL AND service<>?',(service,)))
                require(allocated+requested['total_mb']<=cap['total_mb'])
                # Never adopt or overwrite an existing provider domain.
                require(remote('mail_domain_get',{'domain':a['domain']}) in (None,False,[]))
                username='hmse_'+service.replace('-','')[:20]
                client={**self.policy['client_template'],'username':username,'password':secrets.token_urlsafe(48),'contact_name':a['domain'],'customer_no':'hms_mail_'+service,'limit_maildomain':1,'limit_mailbox':requested['mailboxes'],'limit_mailalias':requested['mailboxes']*20,'limit_mailforward':requested['mailboxes']*20,'limit_mailquota':requested['total_mb'],'limit_web_domain':0,'limit_database':0,'limit_shell_user':0,'web_php_options':'no','ssh_chroot':'no'}
                client_id=a['provider_client']
                if client_id is None:
                    client_id=remote('client_add',0,client);require(type(client_id)is int and client_id>0);self.step(job,'client',client_id)
                observed_client=remote('client_get',client_id);require(observed_client.get('username')==username and observed_client.get('customer_no')=='hms_mail_'+service and int(observed_client['limit_mailbox'])==requested['mailboxes'] and int(observed_client['limit_mailquota'])==requested['total_mb'])
                group=self.policy['group_lookup'](client_id);require(type(group)is int and group>0)
                from cryptography.hazmat.primitives.asymmetric import rsa
                key=rsa.generate_private_key(public_exponent=65537,key_size=2048)
                dkim={'dkim_private':key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption()).decode(),'dkim_public':key.public_key().public_bytes(serialization.Encoding.PEM,serialization.PublicFormat.SubjectPublicKeyInfo).decode(),'dkim_selector':'hms'+service.replace('-','')[:12]}
                domain_id=remote('mail_domain_add',client_id,{'server_id':self.policy['server'],'domain':a['domain'],'active':'y','dkim':'y',**dkim});require(type(domain_id)is int and domain_id>0);self.step(job,'domain',domain_id)
                observed=remote('mail_domain_get',domain_id);require(isinstance(observed,dict) and observed.get('domain')==a['domain'] and str(observed.get('sys_groupid'))==str(group) and str(observed.get('server_id'))==str(self.policy['server']))
                with self.tx():self.db.execute('UPDATE mail_accounts SET provider_client=?,provider_group=?,provider_domain=?,config=? WHERE service=?',(client_id,group,domain_id,canon(requested).decode(),service))
                return
            require(a['provider_domain'] is not None);self.check(remote('mail_domain_get',a['provider_domain']),a,domain=True)
            if op=='limits':
                new=limits(c['limits']);boxes=list(self.db.execute('SELECT * FROM mail_boxes WHERE service=?',(service,)));require(len(boxes)<=new['mailboxes'])
                allocated=0
                for b in boxes:
                    r=remote('mail_user_get',b['provider_id']);self.check(r,a,b);require(int(r['quota'])<=new['mailbox_mb']*1048576);allocated+=int(r['quota'])
                require(allocated<=new['total_mb']*1048576)
                total=sum(json.loads(r['config'])['total_mb'] for r in self.db.execute('SELECT config FROM mail_accounts WHERE service<>? AND provider_client IS NOT NULL',(service,)))
                require(total+new['total_mb']<=self.policy['capacity']['total_mb'] and new['mailboxes']<=self.policy['capacity']['mailboxes'] and new['mailbox_mb']<=self.policy['capacity']['mailbox_mb'])
                require(remote('client_update',a['provider_client'],{'limit_mailbox':new['mailboxes'],'limit_mailquota':new['total_mb']})is True)
                r=remote('client_get',a['provider_client']);require(int(r['limit_mailbox'])==new['mailboxes'] and int(r['limit_mailquota'])==new['total_mb'])
                with self.tx():self.db.execute('UPDATE mail_accounts SET config=? WHERE service=?',(canon(new).decode(),service))
                return
            box=None;r=None
            if 'resource'in c:
                box=self.db.execute('SELECT * FROM mail_boxes WHERE id=? AND service=?',(c['resource'],service)).fetchone();require(box is not None)
                r=remote('mail_user_get',box['provider_id']);self.check(r,a,box)
            password=None
            if 'sealed'in c:
                from controlplane.sealed import unseal
                value=json.loads(unseal(self.host_private,c['sealed'],('hms-managed-v1|'+service+'|'+job['request_key']).encode()))
                require(isinstance(value,dict) and set(value)=={'password'} and isinstance(value['password'],str) and re.fullmatch(r'[!-~]{1,256}' if op=='migrate' else r'[!-~]{16,128}',value['password']));password=value['password']
            if op in ('create','quota'):
                require(c['quota_mb']<=cfg['mailbox_mb']);allocated=0
                for b in self.db.execute('SELECT * FROM mail_boxes WHERE service=?',(service,)):
                    record=remote('mail_user_get',b['provider_id']);self.check(record,a,b)
                    if not box or b['id']!=box['id']:allocated+=int(record['quota'])
                require(allocated+c['quota_mb']*1048576<=cfg['total_mb']*1048576)
            if op=='create':
                require(self.db.execute('SELECT count(*) FROM mail_boxes WHERE service=?',(service,)).fetchone()[0]<cfg['mailboxes'])
                address=c['name']+'@'+a['domain'];require(remote('mail_user_get',{'email':address})in(None,False,[]))
                template=dict(self.policy['mail_template']);pattern=template['maildir'];require(pattern.count('{domain}')==1 and pattern.count('{localpart}')==1)
                template.update(server_id=self.policy['server'],email=address,login=address,password=password,quota=c['quota_mb']*1048576,maildir=pattern.replace('{domain}',a['domain']).replace('{localpart}',c['name']),disablesmtp='y',disabledeliver='n',disableimap='n',disablepop3='n')
                primary=remote('mail_user_add',a['provider_client'],template);require(type(primary)is int and primary>0);self.step(job,'mailbox',primary)
                b={'address':address,'provider_id':primary};observed=remote('mail_user_get',primary);self.check(observed,a,b);require(int(observed['quota'])==template['quota'] and observed.get('disablesmtp')=='y')
                box_id=uuid.uuid4().hex
                with self.tx():self.db.execute('INSERT INTO mail_boxes VALUES(?,?,?,?)',(box_id,service,address,primary))
                if self.archive:self.archive.remember(box_id,password)
                return
            if op=='delete':
                require(not self.db.execute('SELECT 1 FROM mail_aliases WHERE resource=?',(box['id'],)).fetchone());require(remote('mail_user_delete',box['provider_id'])is True);require(remote('mail_user_get',box['provider_id'])in(None,False,[]))
                with self.tx():self.db.execute('DELETE FROM mail_boxes WHERE id=?',(box['id'],))
                return
            if op=='alias':
                name=c['name']+'@'+a['domain'];require(len(name)<=254 and self.db.execute('SELECT count(*)FROM mail_aliases WHERE resource=?',(box['id'],)).fetchone()[0]<20);require(remote('mail_user_get',{'email':name})in(None,False,[]));require(remote('mail_alias_get',{'source':name})in(None,False,[]))
                primary=remote('mail_alias_add',a['provider_client'],{'server_id':self.policy['server'],'source':name,'destination':box['address'],'type':'alias','active':'y'});require(type(primary)is int and primary>0);self.step(job,'alias',primary)
                observed=remote('mail_alias_get',primary);require(isinstance(observed,dict) and observed.get('source')==name and observed.get('destination')==box['address'] and str(observed.get('sys_groupid'))==str(a['provider_group']) and str(observed.get('server_id'))==str(self.policy['server']))
                with self.tx():self.db.execute('INSERT INTO mail_aliases VALUES(?,?,?,?,?)',(uuid.uuid4().hex,service,box['id'],name,primary))
                return
            if op=='alias_delete':
                alias=self.db.execute('SELECT * FROM mail_aliases WHERE id=? AND resource=? AND service=?',(c['alias'],box['id'],service)).fetchone();require(alias is not None)
                observed=remote('mail_alias_get',alias['provider_id']);require(isinstance(observed,dict) and observed.get('source')==alias['name'] and observed.get('destination')==box['address'] and str(observed.get('sys_groupid'))==str(a['provider_group']) and str(observed.get('server_id'))==str(self.policy['server']))
                require(remote('mail_alias_delete',alias['provider_id'])is True and remote('mail_alias_get',alias['provider_id'])in(None,False,[]))
                with self.tx():self.db.execute('DELETE FROM mail_aliases WHERE id=?',(alias['id'],))
                return
            if op in ('backup','restore','migrate'):
                require(self.archive is not None);self.archive.execute(op,service,dict(box,quota=int(r['quota'])),c,password,on_mutation=lambda:setattr(self,'mutation_started',True));return
            if op=='quota':
                if c['quota_mb']*1048576<int(r['quota']):require(self.usage is not None and (self.usage(box['address']) is not None) and self.usage(box['address'])<=c['quota_mb']*1048576)
                patch={'quota':c['quota_mb']*1048576}
            elif op=='password':patch={'password':password}
            elif op=='controls':
                require(not c['sending'] or self.policy.get('sending_ready')is True)
                if c['sending']:
                    from mail_delivery import check
                    panel=remote('mail_domain_get',a['provider_domain']);require(check(self.policy,panel)['can_send']is True)
                patch={'disablesmtp':'n'if c['sending']else'y','disabledeliver':'n'if c['receiving']else'y','disablelda':'n'if c['receiving']else'y','disablelmtp':'n'if c['receiving']else'y','disableimap':'n'if c['login']else'y','disablepop3':'n'if c['login']else'y'}
            elif op=='forward':
                require(c['keep_copy'] is True);patch={'cc':c['destination'],'forward_in_lda':'y'}
            elif op=='autoreply':patch={'autoresponder':'y'if c['enabled']else'n','autoresponder_subject':c['subject'],'autoresponder_text':c['text']}
            else:raise Refused('Unsupported mailbox operation')
            require(remote('mail_user_update',a['provider_client'],box['provider_id'],patch)is True);observed=remote('mail_user_get',box['provider_id']);self.check(observed,a,box)
            require(all(str(observed.get(k))==str(v)for k,v in patch.items()if k!='password'))
            if op=='password' and self.archive:self.archive.remember(box['id'],password)
