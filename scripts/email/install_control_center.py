#!/usr/bin/env python3
"""One guarded installation of the standalone mail agent. Existing services,
mailboxes, signing keys and registrar routes are preserved. No provider resource
or DNS operation is performed here. Private backups and a rollback receipt remain.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import pwd
import re
import shutil
import socket
import sqlite3
import stat
import subprocess
import sys
import tempfile
import time
import hmac
import uuid

ROOT=Path('/opt/housemysite-email-center')
POLICY=Path('/etc/housemysite-services/mail-policy.json')
VHOST=Path('/etc/apache2/sites-available/server1-ssl.conf')
POSTFIX=Path('/etc/postfix/main.cf')
UNITROOT=Path('/etc/systemd/system')
SOURCES=('mail_accounts.py','mail_agent.py','mail_archive.py','mail_smtp_policy.py','mail_usage_broker.py','mail_delivery.py')
class Refused(ValueError):pass

def need(v,code):
    if not v:raise Refused(code)
def run(*args):return subprocess.run(list(args),stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=30,check=True).stdout.decode()
def sha(value):return hashlib.sha256(value).hexdigest()
def atomic(path,value,mode=0o600,owner=None):
    fd,name=tempfile.mkstemp(prefix='.hms-email-',dir=path.parent)
    try:
        with os.fdopen(fd,'wb')as f:
            os.fchmod(f.fileno(),mode)
            if owner:os.fchown(f.fileno(),*owner)
            f.write(value);f.flush();os.fsync(f.fileno())
        os.replace(name,path)
    finally:
        if os.path.exists(name):os.unlink(name)
def import_file(path,name):
    spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

def template(config,uid,gid,helpers):
    # No installed application import runs as root.
    read,write=os.pipe();pid=os.fork()
    if pid==0:
        os.close(read)
        try:
            os.setgroups([]);os.setgid(gid);os.setuid(uid);os.chdir('/');sys.path.insert(0,str(helpers.CURRENT.resolve()))
            from scripts.services.service_runtime import private
            from modules.hosting.app_provisioner import policy_digest,validate_policy
            candidates=config['app_accounts']['packages'].values();selected=None
            for pin in candidates:
                try:
                    value=helpers.find_policy('/etc/housemysite-services/app-policies',pin['policy_digest'],private,policy_digest);validate_policy(value);selected=value;break
                except Exception:continue
            need(selected is not None and selected['provider_server']==1,'reviewed_provider_template_missing')
            result={'ok':True,'template':selected['client_template']}
        except Exception:result={'ok':False}
        os.write(write,json.dumps(result).encode());os.close(write);os._exit(0)
    os.close(write);raw=b''
    try:
        while True:
            part=os.read(read,8192)
            if not part:break
            raw+=part;need(len(raw)<=32768,'template_budget')
    finally:os.close(read);os.waitpid(pid,0)
    result=json.loads(raw);need(result.get('ok')is True,'reviewed_provider_template_missing');return result['template']

def unit_files():
    base='''[Service]
User=hms-services
Group=hms-services
UMask=0077
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
RestrictSUIDSGID=yes
RestrictNamespaces=yes
LockPersonality=yes
RestrictRealtime=yes
CapabilityBoundingSet=
AmbientCapabilities=
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
ReadWritePaths=/var/lib/housemysite-services
MemoryMax=512M
MemorySwapMax=0
CPUQuota=40%
TasksMax=32
'''
    units={'housemysite-email-center.service':'[Unit]\nDescription=HouseMySite standalone email control API\nAfter=network.target\n'+base+'ExecStart=/usr/bin/python3 -I '+str(ROOT)+'/mail_agent.py serve\nRestart=on-failure\n[Install]\nWantedBy=multi-user.target\n',
    'housemysite-email-worker.service':'[Unit]\nDescription=HouseMySite signed email worker\n'+base+'Type=oneshot\nExecStart=/usr/bin/python3 -I '+str(ROOT)+'/mail_agent.py worker\nTimeoutStartSec=21600\n',
    'housemysite-email-worker.timer':'[Unit]\nDescription=HouseMySite signed email request timer\n[Timer]\nOnActiveSec=20s\nOnUnitInactiveSec=20s\nAccuracySec=5s\n[Install]\nWantedBy=timers.target\n'}
    units['housemysite-mail-policy.socket']='[Unit]\nDescription=HouseMySite bounded SMTP recipient policy\n[Socket]\nListenStream=/var/spool/postfix/private/housemysite-mail-policy\nAccept=yes\nMaxConnections=16\nSocketUser=postfix\nSocketGroup=postfix\nSocketMode=0600\nRemoveOnStop=yes\n[Install]\nWantedBy=sockets.target\n'
    units['housemysite-mail-policy@.service']='[Unit]\nDescription=HouseMySite Postfix recipient policy instance\n'+base+'ExecStart=/usr/bin/python3 -I '+str(ROOT)+'/mail_smtp_policy.py\nStandardInput=socket\nStandardOutput=socket\nStandardError=null\nRuntimeMaxSec=120\n'
    units['housemysite-mail-usage.socket']='[Unit]\nDescription=HouseMySite fixed quota read socket\n[Socket]\nListenStream=/run/housemysite-mail-usage/socket\nDirectoryMode=0755\nAccept=yes\nMaxConnections=8\nSocketUser=hms-services\nSocketGroup=hms-services\nSocketMode=0600\nRemoveOnStop=yes\n[Install]\nWantedBy=sockets.target\n'
    units['housemysite-mail-usage@.service']='[Unit]\nDescription=HouseMySite single readonly mailbox quota lookup\n[Service]\nUser=root\nGroup=root\nExecStart=/usr/bin/python3 -I '+str(ROOT)+'/mail_usage_broker.py\nStandardInput=socket\nStandardOutput=socket\nStandardError=null\nUMask=0077\nNoNewPrivileges=yes\nProtectSystem=strict\nProtectHome=yes\nPrivateTmp=yes\nPrivateDevices=yes\nProtectKernelTunables=yes\nProtectKernelModules=yes\nProtectControlGroups=yes\nRestrictSUIDSGID=yes\nRestrictNamespaces=yes\nCapabilityBoundingSet=CAP_DAC_READ_SEARCH CAP_SETUID CAP_SETGID\nRestrictAddressFamilies=AF_UNIX\nMemoryMax=128M\nTasksMax=16\nRuntimeMaxSec=20\n'
    return units


def render(raw):
    text=raw.decode();active='\n'.join(line for line in text.splitlines()if not line.lstrip().startswith('#'))
    need(re.findall(r'<VirtualHost\s+([^>]+)>',active,re.I)==['*:443'] and re.findall(r'^\s*ServerName\s+([^\s#]+)',active,re.M|re.I)==['server1.housemysite.com'] and len(re.findall(r'</VirtualHost\s*>',active,re.I))==1,'vhost_layout_needs_review')
    need(text.count('# BEGIN HOUSEMYSITE PRIVATE SERVICES')==1,'private_route_marker_changed')
    need('"^/v1/services$" "https://127.0.0.1:18443"'in text and '/v1/mail'not in text,'existing_mail_route_needs_review')
    need(all(v in text for v in ('SSLProxyVerify require','SSLProxyCheckPeerName On','SSLProxyCheckPeerExpire On')),'verified_proxy_required')
    block='''
    # BEGIN HOUSEMYSITE EMAIL CENTER
    ProxyPassMatch "^/v1/mail$" "https://127.0.0.1:18445" connectiontimeout=3 timeout=25 retry=0 max=4 acquire=1000
    <LocationMatch "^/v1/mail$">
        <RequireAll>
            Require all granted
            Require method POST
            Require expr "req('Content-Type') == 'application/json'"
            Require expr "req('Content-Length') =~ m#^[0-9]{1,5}$# && req('Content-Length') -gt 0 && req('Content-Length') -le 32768"
            Require expr "-z req('Transfer-Encoding')"
            Require expr "req('X-HMS-Mail-Signature') =~ m#^[a-f0-9]{64}$#"
        </RequireAll>
        LimitRequestBody 32768
        Header always set Cache-Control "no-store"
    </LocationMatch>
    # END HOUSEMYSITE EMAIL CENTER
'''
    return text.replace('# BEGIN HOUSEMYSITE PRIVATE SERVICES',block+'    # BEGIN HOUSEMYSITE PRIVATE SERVICES',1).encode()

def install(execute):
    stage=Path(__file__).resolve().parent;helpers=import_file(stage/'enroll_verified_mail.py','enrollment_helpers');proxy=import_file(stage/'relay_install_helpers.py','proxy_helpers')
    for name in SOURCES:proxy.trusted(stage/'server'/name)
    proxy.trusted(stage/'webmail_setup.py');webmail=import_file(stage/'webmail_setup.py','webmail_setup')
    need(webmail.existing(proxy.request)is None,'existing_mail_center_webmail_do_not_repeat')
    webmail.preflight()
    proxy.trusted(VHOST);proxy.trusted(POSTFIX)
    actor=pwd.getpwnam('hms-services');vmail=pwd.getpwnam('vmail');need(actor.pw_uid>=500,'service_identity')
    config=json.loads(helpers.read_private(helpers.SETTINGS,actor.pw_uid));need(config['state_dir']=='/var/lib/housemysite-services','state_directory')
    for file in ('scripts/services/service_runtime.py','modules/hosting/managed.py'):helpers.protected_source(helpers.CURRENT.resolve()/file,helpers.CURRENT.resolve())
    need(not ROOT.exists() and not POLICY.exists() and not POLICY.is_symlink(),'existing_installation_do_not_repeat')
    units=unit_files();need(all(not(UNITROOT/name).exists()and not(UNITROOT/name).is_symlink()for name in units),'existing_unit_needs_review')
    username_path=Path(config['provider']['username_file']);need(username_path.is_relative_to(helpers.SETTINGS.parent),'provider_username_path')
    username=helpers.read_private(username_path,actor.pw_uid).decode().strip();metadata=helpers.php({'mode':'inspect','username':username,'uid':vmail.pw_uid,'gid':vmail.pw_gid})
    mail_template=helpers.mail_template(metadata['samples'],vmail.pw_uid,vmail.pw_gid,vmail.pw_dir)
    client_template=template(config,actor.pw_uid,actor.pw_gid,helpers)
    helpers.METHODS=['client_get','client_add','client_update','mail_domain_get','mail_domain_add','mail_domain_update','mail_domain_delete','mail_user_get','mail_user_add','mail_user_update','mail_user_delete','mail_alias_get','mail_alias_add','mail_alias_delete','client_get_by_username']
    after,missing=helpers.permission_delta(metadata['functions'])
    need(not(Path(config['state_dir'])/'mail-backups').exists(),'backup_directory_exists')
    relay_rules=run('postconf','-h','smtpd_relay_restrictions')+' '+run('postconf','-h','smtpd_recipient_restrictions');need(re.search(r'\b(?:reject|defer)_unauth_destination\b',relay_rules),'existing_relay_protection_required')
    space=os.statvfs(config['state_dir']);available=space.f_bavail*space.f_frsize-config['min_free_bytes'];pool=min(16384,available//(4*1048576));need(pool>=1024,'insufficient_reserved_capacity')
    policy={'server':1,'client_template':client_template,'mail_template':mail_template,'capacity':{'mailboxes':50,'mailbox_mb':102400,'total_mb':pool},'mx_host':'server1.housemysite.com','spf':'v=spf1 ip4:62.171.130.156 -all','sending_ready':True,'hourly_recipients':100,'daily_recipients':1000,'service_hourly_recipients':1000,'local_backups':{'maximum_bytes':pool*1048576},'usage_broker':True,'webmail_url':'https://server1.housemysite.com/housemysite-webmail/'}
    need(run('postconf','-h','smtpd_end_of_data_restrictions').strip()=='','existing_smtp_policy_needs_review')
    need(run('postconf','-h','queue_directory').strip()=='/var/spool/postfix','postfix_queue_layout')
    need(not re.search(r'^[^=\n]+/smtpd_end_of_data_restrictions\s*=',run('postconf','-P'),re.M),'smtp_master_override_needs_review')
    postfix_before=POSTFIX.read_bytes();postfix_after=postfix_before+b'\n# HouseMySite scoped email recipient limits\nsmtpd_end_of_data_restrictions = check_policy_service unix:private/housemysite-mail-policy\n'
    raw=VHOST.read_bytes();candidate=render(raw);
    candidate=candidate.replace(b'# BEGIN HOUSEMYSITE PRIVATE SERVICES',webmail.apache_block().encode()+b'    # BEGIN HOUSEMYSITE PRIVATE SERVICES',1)
    run('apache2ctl','configtest');need(run('systemctl','is-active','housemysite-services.service').strip()=='active','existing_services_not_active')
    with socket.socket()as probe:probe.bind(('127.0.0.1',18445))
    if not execute:return {'plan_only':True,'storage_pool_mb':pool,'local_encrypted_backups':True,'sending_enabled':False,'mailboxes_created':0,'dns_changes':0}
    baseline=proxy.request('HEAD','/')
    backup=Path('/root')/('hms-email-center-'+uuid.uuid4().hex);backup.mkdir(mode=0o700);atomic(backup/'original.conf',raw);atomic(backup/'postfix-original.cf',postfix_before);record={'vhost_before':sha(raw),'vhost_after':sha(candidate),'role_id':metadata['role_id'],'permissions_before':metadata['functions'],'permissions_after':after,'units':list(units),'files':list(SOURCES),'phase':'prepared','postfix_before':sha(postfix_before),'postfix_after':sha(postfix_after)};atomic(backup/'receipt.json',json.dumps(record).encode())
    changed=False;granted=False;smtp_changed=False
    try:
        webmail_result=webmail.install(atomic,backup)
        ROOT.mkdir(mode=0o755);ROOT.chmod(0o755)
        for name in SOURCES:atomic(ROOT/name,(stage/'server'/name).read_bytes(),0o644)
        atomic(POLICY,json.dumps(policy).encode(),owner=(actor.pw_uid,actor.pw_gid))
        destination=Path(config['state_dir'])/'mail-backups';need(not destination.exists(),'backup_directory_exists');destination.mkdir(mode=0o700);os.chown(destination,actor.pw_uid,actor.pw_gid)
        if missing:helpers.php({'mode':'grant','username':username,'role_id':metadata['role_id'],'before':metadata['functions'],'after':after});granted=True
        for name,content in units.items():atomic(UNITROOT/name,content.encode(),0o644)
        run('systemd-analyze','verify',*[str(UNITROOT/name)for name in units]);run('systemctl','daemon-reload');run('systemctl','start','housemysite-email-center.service');run('systemctl','is-active','housemysite-email-center.service')
        run('systemctl','start','housemysite-mail-policy.socket','housemysite-mail-usage.socket')
        with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM)as probe:
            probe.settimeout(10);probe.connect('/var/spool/postfix/private/housemysite-mail-policy');probe.sendall(b'request=smtpd_access_policy\nprotocol_state=END-OF-MESSAGE\nsasl_username=\n\n');need(probe.recv(128)==b'action=DUNNO\n\n','smtp_policy_health_failed')
        need(sha(POSTFIX.read_bytes())==sha(postfix_before),'concurrent_postfix_change');atomic(POSTFIX,postfix_after,stat.S_IMODE(POSTFIX.stat().st_mode));smtp_changed=True;run('postfix','check');run('systemctl','reload','postfix')
        need(sha(VHOST.read_bytes())==sha(raw),'concurrent_apache_change');atomic(VHOST,candidate,stat.S_IMODE(VHOST.stat().st_mode));changed=True;run('apache2ctl','configtest');run('systemctl','reload','apache2')
        owners=[name for name,row in json.loads(helpers.read_private(config['actors_file'],actor.pw_uid)).items()if row.get('enabled')is True and row.get('owner')is True and row.get('write')is True];need(owners,'owner_access_missing')
        key=helpers.read_private(config['portal_key_file'],actor.pw_uid).strip()
        for attempt in range(5):
            body=json.dumps({'schema':1,'actor':owners[0],'nonce':str(uuid.uuid4()),'expires':int(time.time())+60,'command':{'action':'snapshot','service':str(uuid.uuid4()),'client':str(uuid.uuid4()),'domain':'mail-health.example.invalid'}}).encode()
            headers={'Content-Type':'application/json','X-HMS-Mail-Signature':hmac.new(key,b'hms:mail-portal:v1:'+body,hashlib.sha256).hexdigest()}
            try:
                status,answer,_=proxy.request('POST','/v1/mail',body,headers);need(status==200 and json.loads(answer).get('state')=='not_enrolled','signed_mail_health_failed');break
            except Exception:
                if attempt==4:raise
                time.sleep(1)
        need(proxy.request('POST','/v1/mail',body,headers)[0]==403,'replay_not_denied')
        headers['X-HMS-Mail-Signature']='0'*64;need(proxy.request('POST','/v1/mail',body,headers)[0]==403,'bad_signature_not_denied')
        need(webmail.existing(proxy.request)is not None,'webmail_health_failed')
        current=proxy.request('HEAD','/');need((current[0],current[2])==(baseline[0],baseline[2]),'existing_root_changed')
        run('systemctl','enable','--now','housemysite-email-center.service','housemysite-email-worker.timer','housemysite-mail-policy.socket','housemysite-mail-usage.socket');record['phase']='installed';atomic(backup/'receipt.json',json.dumps(record).encode())
        return {'installed':True,'backup':str(backup),'storage_pool_mb':pool,'local_encrypted_backups':True,'offsite_backups':False,'webmail':webmail_result,'signed_worker':'active','mail_api_permissions_added':missing,'mailboxes_created':0,'dns_changes':0,'sending_policy_installed':True,'delivery_verified':False,'sending_enabled':False,'next':'Enable the reviewed portal release. Mailbox sending still needs an explicit signed control request and real delivery testing.'}
    except Exception:
        if smtp_changed and sha(POSTFIX.read_bytes())==sha(postfix_after):atomic(POSTFIX,postfix_before,stat.S_IMODE(POSTFIX.stat().st_mode));run('postfix','check');run('systemctl','reload','postfix')
        subprocess.run(['systemctl','disable','--now','housemysite-email-center.service','housemysite-email-worker.timer','housemysite-mail-policy.socket','housemysite-mail-usage.socket'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=30)
        if changed and sha(VHOST.read_bytes())==sha(candidate):atomic(VHOST,raw,stat.S_IMODE(VHOST.stat().st_mode));run('apache2ctl','configtest');run('systemctl','reload','apache2')
        if granted:
            try:helpers.php({'mode':'restore','username':username,'role_id':metadata['role_id'],'before':after,'after':metadata['functions']})
            except Exception:pass
        record['phase']='stopped_review_required';atomic(backup/'receipt.json',json.dumps(record).encode());raise Refused('installation_stopped_preserve_'+backup.name)
def rollback(directory):
    # Installation rollback is allowed only before any provider allocation. Once
    # customer mail exists the SMTP limiter must remain until a reviewed migration.
    directory=Path(directory)
    need(directory.parent==Path('/root')and re.fullmatch('hms-email-center-[a-f0-9]{32}',directory.name)and directory.resolve()==directory,'rollback_directory')
    info=directory.stat();need(info.st_uid==0 and stat.S_IMODE(info.st_mode)==0o700,'rollback_backup_permissions')
    receipt=json.loads((directory/'receipt.json').read_bytes());need(receipt['phase']=='installed','rollback_receipt_state')
    need(sha(VHOST.read_bytes())==receipt['vhost_after'] and sha(POSTFIX.read_bytes())==receipt['postfix_after'],'configuration_changed_do_not_overwrite')
    original=(directory/'original.conf').read_bytes();postfix=(directory/'postfix-original.cf').read_bytes()
    need(sha(original)==receipt['vhost_before']and sha(postfix)==receipt['postfix_before'],'rollback_backup_digest')
    # Stop new submissions and the timer before inspecting stable private state.
    run('systemctl','stop','housemysite-email-center.service','housemysite-email-worker.timer')
    try:
        need(subprocess.run(['systemctl','is-active','--quiet','housemysite-email-worker.service'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode!=0,'worker_is_running')
        state=Path('/var/lib/housemysite-services/mail-services.sqlite');need(state.is_file()and not state.is_symlink(),'mail_state_missing')
        with sqlite3.connect(state.as_uri()+'?mode=ro',uri=True)as db:
            need(not db.execute('SELECT 1 FROM mail_accounts WHERE provider_client IS NOT NULL LIMIT 1').fetchone(),'customer_mail_exists_preserve_sending_policy')
            need(not db.execute("SELECT 1 FROM mail_jobs WHERE state IN ('queued','applying','uncertain') LIMIT 1").fetchone(),'mail_requests_exist_preserve_worker')
    except Exception:
        run('systemctl','start','housemysite-email-center.service','housemysite-email-worker.timer');raise
    run('systemctl','disable','housemysite-email-worker.timer')
    atomic(VHOST,original,stat.S_IMODE(VHOST.stat().st_mode));run('apache2ctl','configtest');run('systemctl','reload','apache2')
    atomic(POSTFIX,postfix,stat.S_IMODE(POSTFIX.stat().st_mode));run('postfix','check');run('systemctl','reload','postfix')
    run('systemctl','disable','--now','housemysite-email-center.service','housemysite-mail-policy.socket','housemysite-mail-usage.socket')
    receipt['phase']='installation_rolled_back';atomic(directory/'receipt.json',json.dumps(receipt).encode())
    return {'rolled_back':True,'customer_data_deleted':False,'private_keys_preserved':True,'packages_preserved':True,'state_preserved':True,'next':'Keep the portal independent-email flag disabled. Preserve the backup and source for review.'}

if __name__=='__main__':
    parser=argparse.ArgumentParser();group=parser.add_mutually_exclusive_group();group.add_argument('--execute',action='store_true');group.add_argument('--rollback-backup');args=parser.parse_args();os.umask(0o077)
    try:need(os.geteuid()==0,'root_required');print(json.dumps(rollback(args.rollback_backup)if args.rollback_backup else install(args.execute)))
    except Exception as error:print(json.dumps({'installed':False,'code':str(error)if isinstance(error,Refused)else'preflight_or_installation_needs_review','mailboxes_created':0,'dns_changes':0,'sending_enabled':False}));raise SystemExit(1)
