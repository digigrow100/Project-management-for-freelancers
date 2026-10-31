#!/usr/bin/env python3
"""Enroll ONE existing enforced account, then start the existing signed-request
worker. No mailbox/domain creation, SMTP sending, DNS cutover or plan changes.
Root preflight defaults to read-only; --execute is the explicit installation step.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import pwd
import grp
import re
import signal
import sqlite3
import stat
import subprocess
import sys
import time
import uuid

SETTINGS = Path('/etc/housemysite-services/settings.json')
CURRENT = Path('/opt/housemysite-services/current')
STATE = Path('/var/lib/housemysite-services')
ACCOUNT = 'eb91f56b-42f6-473e-9988-637171c491e6'
CLIENT = '4ac6bea8-260c-4c4d-bed3-afb68bfeafdc'
SERVICE = '40291038-6669-4976-8919-a1c014da4cc5'
ACTOR = '7e6e7b32-26c8-4d1c-b523-d54b5da8ee18'
DOMAIN = 'hmsaccept1.housemysite.com'
METHODS = ['mail_domain_get', 'mail_domain_add', 'mail_domain_update', 'mail_domain_delete',
           'mail_user_get', 'mail_user_add', 'mail_user_update', 'mail_user_delete']
UNIT = 'housemysite-managed-approvals'
PHP = r'''
ini_set('display_errors','0');error_reporting(0);
try {
 $input=json_decode(stream_get_contents(STDIN),true,16,JSON_THROW_ON_ERROR);
 ob_start();require '/usr/local/ispconfig/interface/lib/config.inc.php';ob_end_clean();
 $pdo=new PDO('mysql:host='.$conf['db_host'].';dbname='.$conf['db_database'].';charset=utf8mb4',$conf['db_user'],$conf['db_password'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_TIMEOUT=>4]);
 if($input['mode']==='inspect')$pdo->exec('SET SESSION TRANSACTION READ ONLY');
 $pdo->beginTransaction();
 $q=$pdo->prepare('SELECT remote_userid,remote_functions FROM remote_user WHERE remote_username=? LIMIT 2'.($input['mode']==='inspect'?'':' FOR UPDATE'));
 $q->execute([$input['username']]);$users=$q->fetchAll(PDO::FETCH_ASSOC);
 if(count($users)!==1)throw new Exception('scope');$u=$users[0];
 if($input['mode']==='inspect'){
  $q=$pdo->prepare('SELECT email,uid,gid,maildir,homedir FROM mail_user WHERE uid=? AND gid=? AND server_id=1 ORDER BY mailuser_id LIMIT 10');$q->execute([$input['uid'],$input['gid']]);$rows=$q->fetchAll(PDO::FETCH_ASSOC);$pdo->rollBack();
  echo json_encode(['role_id'=>(int)$u['remote_userid'],'functions'=>$u['remote_functions'],'samples'=>$rows],JSON_THROW_ON_ERROR);exit;
 }
 if(!in_array($input['mode'],['grant','restore'],true)||(int)$u['remote_userid']!==$input['role_id']||$u['remote_functions']!==$input['before'])throw new Exception('changed');
 $q=$pdo->prepare('UPDATE remote_user SET remote_functions=? WHERE remote_userid=? AND BINARY remote_functions=?');$q->execute([$input['after'],$input['role_id'],$input['before']]);
 if($q->rowCount()!==1)throw new Exception('changed');$pdo->commit();echo '{"updated":true}';
}catch(Throwable $e){if(isset($pdo)&&$pdo->inTransaction())$pdo->rollBack();exit(2);}
'''


class Refused(ValueError):
    pass


def require(value, code):
    if not value:
        raise Refused(code)


def step(stage, work):
    try:
        return work()
    except Refused:
        raise
    except Exception as error:
        raise Refused(stage + '_' + type(error).__name__) from None


def read_private(path, uid):
    path = Path(path)
    require(path.is_absolute() and path.parent.resolve() == path.parent, 'private_path_changed')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        info = os.fstat(fd)
        require(stat.S_ISREG(info.st_mode) and info.st_uid == uid and stat.S_IMODE(info.st_mode) == 0o600 and info.st_size <= 65536, 'private_file_boundary')
        return os.read(fd, 65537)
    finally:
        os.close(fd)


def protected_source(path, release, uid=0):
    path, release = Path(path), Path(release)
    require(path.is_relative_to(release), 'runtime_source_outside_release')
    current = path
    while True:
        info = current.lstat()
        require(not stat.S_ISLNK(info.st_mode) and info.st_uid == uid and not info.st_mode & 0o022, 'runtime_source_not_protected')
        require(stat.S_ISREG(info.st_mode) if current == path else stat.S_ISDIR(info.st_mode), 'runtime_source_type_changed')
        if current == release:
            break
        current = current.parent


def mail_template(samples, uid, gid, home):
    require(type(uid) is int and type(gid) is int and min(uid, gid) >= 500, 'vmail_identity_invalid')
    require(home == '/var/vmail' and Path(home).is_absolute(), 'vmail_home_needs_review')
    templates = []
    for row in samples:
        require(str(row.get('uid')) == str(uid) and str(row.get('gid')) == str(gid), 'mailbox_identity_mismatch')
        address = row.get('email', '')
        require(isinstance(address, str) and address.count('@') == 1, 'sample_address_invalid')
        local, domain = address.rsplit('@', 1)
        require(re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.+-]{0,63}', local) and re.fullmatch(r'[a-z0-9.-]+\.[a-z]{2,63}', domain), 'sample_address_invalid')
        parts = str(row.get('maildir', '')).rstrip('/').split('/')
        require(parts[:3] == ['', 'var', 'vmail'] and parts.count(domain) == 1 and parts.count(local) == 1 and parts.index(local) == parts.index(domain)+1, 'sample_maildir_needs_review')
        require(row.get('homedir') == home, 'sample_home_needs_review')
        parts[parts.index(domain)] = '{domain}'
        parts[parts.index(local)] = '{localpart}'
        require(all(re.fullmatch(r'[A-Za-z0-9_.-]+', x) and x not in ('.', '..') for x in parts[1:] if x not in ('{domain}', '{localpart}')), 'sample_maildir_needs_review')
        templates.append('/'.join(parts))
    require(templates and len(set(templates)) == 1, 'one_consistent_mailbox_template_required')
    return {'uid': uid, 'gid': gid, 'homedir': home, 'maildir': templates[0], 'postfix': 'y', 'access': 'y',
            'disabledeliver': 'n', 'disableimap': 'n', 'disablepop3': 'n', 'disablesmtp': 'y'}


def permission_delta(value):
    # ISPConfig checkPerm replaces semicolons with commas before splitting.
    # Preserve its exact stored bytes; append only missing method names.
    require(isinstance(value, str) and len(value) <= 32768, 'api_permission_format_needs_review')
    tokens = re.split(r'[;,]', value)
    require(all(not token or re.fullmatch(r'[a-z][a-z0-9_]{0,127}', token) for token in tokens),
            'api_permission_format_needs_review')
    existing = set(tokens) - {''}
    missing = [name for name in METHODS if name not in existing]
    if not missing:
        return value, []
    boundary = ';' if value and value[-1] not in ';,' else ''
    updated = value + boundary + ';'.join(missing) + ';'
    require(len(updated) <= 32768, 'api_permission_list_budget')
    return updated, missing


def php(payload):
    result = subprocess.run(['/usr/bin/php', '-r', PHP], input=json.dumps(payload).encode(), stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=15, check=False)
    require(result.returncode == 0 and 0 < len(result.stdout) <= 32768, 'provider_metadata_or_permission_step_failed')
    return json.loads(result.stdout)


def find_policy(directory, pin, reader, digest):
    candidates = sorted(Path(directory).glob('*.json'))
    require(len(candidates) <= 100, 'policy_directory_budget')
    for path in candidates:
        if path.is_symlink() or not path.is_file():
            continue
        try:
            value = json.loads(reader(path))
            if digest(value) == pin:
                return value
        except Exception:
            continue
    raise Refused('pinned_policy_missing')


def service_action(action, template, uid, gid):
    """Fork, drop privileges BEFORE loading the existing service application."""
    read_fd, write_fd = os.pipe()
    pid = os.fork()
    if pid == 0:
        os.close(read_fd)
        try:
            os.setgroups([]);os.setgid(gid);os.setuid(uid);os.chdir('/')
            signal.signal(signal.SIGALRM, lambda *_: (_ for _ in ()).throw(Refused('service_step_timed_out')))
            signal.alarm(100)
            result = enroll_as_service(action, template)
            packet = {'ok': True, 'result': result}
        except Exception as error:
            packet = {'ok': False, 'code': str(error) if isinstance(error, Refused) else 'service_step_refused', 'error_type': type(error).__name__}
        os.write(write_fd, json.dumps(packet).encode());os.close(write_fd);os._exit(0)
    os.close(write_fd)
    chunks = []
    try:
        while True:
            part = os.read(read_fd, 16384)
            if not part:break
            chunks.append(part)
            require(sum(map(len, chunks)) <= 32768, 'service_response_budget')
    finally:
        os.close(read_fd);os.waitpid(pid, 0)
    value = json.loads(b''.join(chunks))
    require(value.get('ok') is True, value.get('code', 'service_step_refused'))
    return value['result']


def enroll_as_service(action, template):
    sys.path.insert(0, str(CURRENT.resolve()))
    from scripts.services.service_runtime import assemble, private, provider_group
    from modules.hosting.app_provisioner import policy_digest, validate_policy
    from modules.hosting.ispconfig_json import ProvisioningJSONRemote
    from modules.hosting.managed import mailbox_directory
    config, db, managed, _, gateway, reserve = step('service_assembly', lambda: assemble(SETTINGS))
    try:
        require(config.get('state_dir') == str(STATE) and managed is not None and gateway.app_accounts is not None, 'enrolled_service_layout_required')
        require(callable(getattr(managed, 'process', None)) and 'approvals-managed' in (CURRENT / 'scripts/services/service_runtime.py').read_text(), 'installed_approval_protocol_not_supported')
        registry, _, pins, owner = gateway.app_accounts
        require(owner(ACTOR) is True, 'current_owner_write_required')
        account = registry.account(ACCOUNT, CLIENT)
        require(account['service'] == SERVICE and account['state'] == 'enforced', 'current_enforced_account_required')
        require(not db.execute("SELECT 1 FROM managed_jobs WHERE state IN ('queued','applying','uncertain') LIMIT 1").fetchone(), 'resolve_existing_requests_before_enrollment')
        require(not db.execute("SELECT 1 FROM managed_bindings WHERE kind='database' LIMIT 1").fetchone(), 'database_worker_scope_needs_review')
        pin = config['app_accounts']['packages'][account['package']]['policy_digest']
        policy = find_policy('/etc/housemysite-services/app-policies', pin, private, policy_digest)
        validate_policy(policy)
        require(policy['provider_server'] == 1, 'provider_server_changed')
        require(policy['package'] == account['package'] and policy['limits_digest'] == account['limits_digest'], 'policy_contract_mismatch')
        policy = dict(policy, mail_template=template)
        result = registry.managed_bindings(ACCOUNT, CLIENT, policy=policy, provider_server=policy['provider_server'])
        desired = result['email']
        require(desired is not None and desired['domain'] == DOMAIN and desired['smtp_locked'] is True and desired['max_resources'] == 5 and desired['max_quota_mb'] == 409, 'mail_contract_or_sending_policy_changed')
        mailbox_directory(desired, 'probe@' + DOMAIN)
        old = db.execute("SELECT client,config,enabled FROM managed_bindings WHERE service=? AND kind='email'", (SERVICE,)).fetchone()
        if old:
            require(old['client'] == CLIENT and json.loads(old['config']) == desired and old['enabled'] == 1, 'existing_binding_differs_do_not_overwrite')
        provider = config['provider']
        require(provider.get('wire_acceptance') == 'reviewed', 'provider_acceptance_required')
        remote = ProvisioningJSONRemote(provider['url'])
        session = step('provider_login', lambda: remote('login', private(provider['username_file']).decode().strip(), private(provider['password_file']).decode().strip()))
        try:
            row = step('provider_client_read', lambda: remote('client_get', session, desired['provider_client']))
            require(str(row.get('client_id')) == str(desired['provider_client']) and str(row.get('limit_mailbox')) == '5' and str(row.get('limit_mailquota')) == '2048' and int(row.get('limit_maildomain', 0)) >= 1 and step('provider_group_read', lambda: provider_group(desired['provider_client'])) == desired['group'], 'provider_client_limits_or_group_changed')
        finally:
            remote('logout', session)
        created = False
        backup = None
        if action == 'enroll' and not old:
            backup_bytes = db.execute('PRAGMA page_count').fetchone()[0] * db.execute('PRAGMA page_size').fetchone()[0]
            require(reserve(backup_bytes + 65536, 2) is True, 'storage_reserve_unavailable')
            backup = STATE / ('mail-enrollment-' + uuid.uuid4().hex + '.sqlite')
            fd = os.open(backup, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600);os.close(fd)
            dest = sqlite3.connect(backup)
            try:db.backup(dest)
            finally:dest.close()
            managed.enroll(SERVICE, CLIENT, 'email', desired, enabled=True)
            created = True
        inventory = managed.inventory(ACTOR, SERVICE, kind='email') if old or created else None
        if inventory:
            require(inventory['domain']['name'] == DOMAIN and inventory['limits']['max_resources'] == 5 and inventory['limits']['max_quota_mb'] == 409, 'binding_readback_failed')
        return {'service': SERVICE, 'domain': DOMAIN, 'created': created, 'already_enrolled': bool(old), 'mailboxes': 5, 'per_mailbox_mb': 409, 'total_plan_mail_mb': 2048, 'smtp_locked': True, 'backup': str(backup) if backup else None}
    finally:
        db.close()


def unit_files():
    service = '''[Unit]
Description=HouseMySite independently signed mailbox and database approvals
After=network-online.target housemysite-services.service
[Service]
Type=oneshot
User=hms-services
Group=hms-services
ExecStart=/usr/bin/python3 -I /opt/housemysite-services/current/scripts/services/service_runtime.py --settings /etc/housemysite-services/settings.json approvals-managed
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
CapabilityBoundingSet=
AmbientCapabilities=
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
ReadWritePaths=/var/lib/housemysite-services
MemoryMax=128M
MemorySwapMax=0
CPUQuota=25%
TasksMax=16
TimeoutStartSec=900
'''
    timer = '''[Unit]
Description=Check for independently signed HouseMySite management approvals
[Timer]
OnActiveSec=20s
OnUnitInactiveSec=20s
AccuracySec=5s
Persistent=no
[Install]
WantedBy=timers.target
'''
    return {UNIT + '.service': service, UNIT + '.timer': timer}


def command(*args):
    result = subprocess.run(list(args), stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=30, check=False)
    require(result.returncode == 0, 'systemd_step_failed')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--execute', action='store_true')
    args = parser.parse_args()
    require(os.geteuid() == 0, 'root_required')
    actor = pwd.getpwnam('hms-services');vmail = pwd.getpwnam('vmail')
    require(actor.pw_uid >= 500 and actor.pw_gid >= 500 and grp.getgrgid(actor.pw_gid).gr_name == 'hms-services', 'service_identity_invalid')
    release = CURRENT.resolve()
    require(release.parent == Path('/opt/housemysite-services/releases') and release.stat().st_uid == 0 and not release.stat().st_mode & 0o022, 'reviewed_release_required')
    for ancestor in (CURRENT.parent, release.parent):
        info = ancestor.lstat()
        require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and not info.st_mode & 0o022, 'runtime_ancestry_not_protected')
    for file in ('scripts/services/service_runtime.py', 'modules/hosting/managed.py'):
        protected_source(release / file, release)
    config = json.loads(read_private(SETTINGS, actor.pw_uid))
    username_file = Path(config['provider']['username_file'])
    require(username_file.is_relative_to(SETTINGS.parent), 'provider_username_path_needs_review')
    username = read_private(username_file, actor.pw_uid).decode().strip()
    metadata = php({'mode': 'inspect', 'username': username, 'uid': vmail.pw_uid, 'gid': vmail.pw_gid})
    template = mail_template(metadata['samples'], vmail.pw_uid, vmail.pw_gid, vmail.pw_dir)
    after, missing = permission_delta(metadata['functions'])
    planned = service_action('plan', template, actor.pw_uid, actor.pw_gid)
    units = unit_files()
    for name, content in units.items():
        path = Path('/etc/systemd/system') / name
        require(not path.is_symlink() and (not path.exists() or path.read_text() == content), 'existing_worker_unit_needs_review')
    if not args.execute:
        return {'read_only': True, 'plan': planned, 'mail_api_permissions_to_add': missing, 'provider_changes': 0, 'next': 'Run the same reviewed file with --execute for local enrollment and signed-request timer.'}
    backup = Path('/root') / ('hms-mail-enrollment-' + uuid.uuid4().hex)
    backup.mkdir(mode=0o700)
    record = {'role_id': metadata['role_id'], 'before': metadata['functions'], 'after': after, 'created_units': [], 'binding': None}
    manifest = backup / 'manifest.json'
    def save():
        fd = os.open(manifest, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'w') as stream:json.dump(record, stream);stream.flush();os.fsync(stream.fileno())
    save()
    try:
        if missing:
            php({'mode': 'grant', 'username': username, 'role_id': metadata['role_id'], 'before': metadata['functions'], 'after': after})
        record['binding_enrollment_attempted'] = True;save()
        record['binding'] = service_action('enroll', template, actor.pw_uid, actor.pw_gid);save()
        for name, content in units.items():
            path = Path('/etc/systemd/system') / name
            if not path.exists():
                fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o644)
                with os.fdopen(fd, 'w') as stream:stream.write(content);stream.flush();os.fsync(stream.fileno())
                record['created_units'].append(name);save()
        command('/usr/bin/systemd-analyze', 'verify', *[str(Path('/etc/systemd/system') / name) for name in units])
        command('/usr/bin/systemctl', 'daemon-reload')
        command('/usr/bin/systemctl', 'enable', '--now', UNIT + '.timer')
        command('/usr/bin/systemctl', 'is-active', UNIT + '.timer')
        return {'installed': True, 'binding': record['binding'], 'signed_approval_worker': 'timer_active', 'mail_api_permissions_added': missing, 'provider_configuration_changes': int(bool(missing)), 'mailboxes_created': 0, 'dns_changes': 0, 'sending_enabled': False, 'backup': str(backup), 'next': 'Open Email accounts, request mail domain setup, review and sign the request, then refresh after server confirmation.'}
    except Exception:
        # Never restore an old whole SQLite file over new portal jobs. Leave the
        # bounded binding/backup for review if the later unit step did not finish.
        if record['created_units']:
            subprocess.run(['/usr/bin/systemctl', 'disable', '--now', UNIT + '.timer'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False, timeout=30)
        for name in record['created_units']:
            path = Path('/etc/systemd/system') / name
            if path.is_file() and not path.is_symlink() and path.read_text() == units[name]:path.unlink()
        subprocess.run(['/usr/bin/systemctl', 'daemon-reload'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False, timeout=30)
        if missing:
            try:php({'mode': 'restore', 'username': username, 'role_id': metadata['role_id'], 'before': after, 'after': metadata['functions']})
            except Exception:pass
        raise Refused('installation_stopped_preserve_backup_' + backup.name)


if __name__ == '__main__':
    try:
        print(json.dumps(main()))
    except Exception as error:
        print(json.dumps({'installed': False, 'code': str(error) if isinstance(error, Refused) else 'enrollment_step_failed', 'error_type': type(error).__name__, 'mailboxes_created': 0, 'dns_changes': 0, 'sending_enabled': False}))
        raise SystemExit(2)
