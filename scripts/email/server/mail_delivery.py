"""Read-only DNS and TLS checks. Presence is not a delivery/inbox guarantee."""
import concurrent.futures
import ipaddress
import re
import shlex
import smtplib
import socket
import ssl
import subprocess
import time

def lookup(kind,name):
    result=subprocess.run(['/usr/bin/dig','+short','+time=2','+tries=1',kind,name],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=4,check=False)
    if result.returncode or len(result.stdout)>32768:raise ValueError('DNS unavailable')
    lines=result.stdout.decode('ascii').splitlines()
    return [''.join(shlex.split(line))for line in lines]if kind=='TXT'else lines

def normalize_key(value):
    return re.sub(r'\s+','',value.replace('-----BEGIN PUBLIC KEY-----','').replace('-----END PUBLIC KEY-----',''))

def check(policy,panel,*,resolver=lookup,tls=None):
    domain=panel['domain'];host=policy['mx_host'];selector=panel.get('dkim_selector','')
    def mx():
        rows=resolver('MX',domain)
        if not rows:return 'missing'
        return 'matched'if all(line.split()[-1].rstrip('.').lower()==host for line in rows)else'different'
    def spf():
        rows=[r for r in resolver('TXT',domain)if r.lower().startswith('v=spf1 ')]
        if not rows:return 'missing'
        if len(rows)!=1:return 'different'
        expected=[v for v in policy['spf'].split()if v.startswith(('ip4:','ip6:'))]
        tokens=rows[0].split();return 'matched'if expected and all(v in tokens or'+'+v in tokens for v in expected)else'different'
    def dkim():
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,63}',selector)or not panel.get('dkim_public'):return 'missing'
        expected=normalize_key(panel['dkim_public']);rows=resolver('TXT',selector+'._domainkey.'+domain)
        if not rows:return 'missing'
        for row in rows:
            tags=dict(part.strip().split('=',1)for part in row.split(';')if'='in part)
            if normalize_key(tags.get('p',''))==expected and expected:return 'matched'
        return 'different'
    def dmarc():
        rows=[r for r in resolver('TXT','_dmarc.'+domain)if r.startswith('v=DMARC1;')]
        if not rows:return 'missing'
        return 'matched'if len(rows)==1 and re.search(r'(?:^|;)\s*p=(?:none|quarantine|reject)\s*(?:;|$)',rows[0])else'different'
    def server_dns():
        ips=[v.split(':',1)[1]for v in policy['spf'].split()if v.startswith(('ip4:','ip6:'))]
        if not ips:return 'missing'
        for text in ips:
            address=ipaddress.ip_address(text);records=resolver('A'if address.version==4 else'AAAA',host)
            if str(address)not in records:return 'different'
            ptr=resolver('PTR',address.reverse_pointer)
            if host not in [v.rstrip('.').lower()for v in ptr]:return 'different'
        return 'matched'
    def smtp_tls():
        if tls:return tls()
        ipv4=next(v[4:]for v in policy['spf'].split()if v.startswith('ip4:'))
        class SMTP(smtplib.SMTP):
            def _get_socket(self,host,port,timeout):return socket.create_connection((ipv4,port),timeout)
        client=SMTP(host,587,timeout=5)
        try:client.ehlo();client.starttls(context=ssl.create_default_context());return 'matched'
        finally:
            try:client.quit()
            except Exception:client.close()
    actions={'mx':mx,'spf':spf,'dkim':dkim,'dmarc':dmarc,'server_dns':server_dns,'tls':smtp_tls}
    def safe(work):
        try:return work()
        except Exception:return 'unavailable'
    with concurrent.futures.ThreadPoolExecutor(max_workers=6)as pool:
        futures={k:pool.submit(safe,f)for k,f in actions.items()};checks={k:f.result()for k,f in futures.items()}
    return {'domain':domain,'checked_at':int(time.time()),'checks':checks,'can_send':all(checks[k]=='matched'for k in ('spf','dkim','dmarc','server_dns','tls')),'can_receive':checks['mx']=='matched','delivery_verified':False}
