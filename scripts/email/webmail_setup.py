"""Guarded Roundcube setup for Ubuntu 24.04. Uses a separate PHP-FPM pool,
non-login account and internal database. Never changes customer mail passwords.
No existing webmail configuration, database or PHP pool is overwritten.
"""
import grp
import json
import os
from pathlib import Path
import pwd
import re
import secrets
import stat
import subprocess

PACKAGES=('roundcube-core','roundcube-mysql','php8.3-fpm','php8.3-mysql','php8.3-mbstring','php8.3-xml','php8.3-intl','php8.3-curl','php8.3-zip')
POOL=Path('/etc/php/8.3/fpm/pool.d/housemysite-webmail.conf')
CONFIG=Path('/etc/housemysite-webmail/config.inc.php')
PUBLIC=Path('/opt/housemysite-webmail/public')
STATE=Path('/var/lib/housemysite-webmail')
CLIENTDB=Path('/usr/local/ispconfig/server/lib/mysql_clientdb.conf')
SAFE_CODES=frozenset(('webmail_configuration_conflict','webmail_account_exists',
    'mysql_admin_credentials_untrusted','mysql_admin_credentials_format',
    'mysql_admin_host_not_local','mysql_admin_auth_failed','mysql_socket_unavailable',
    'mysql_client_missing','mysql_operation_failed','mysql_secure_channel_unavailable'))
class WebmailRefused(ValueError):
    def __init__(self,code='webmail_configuration_conflict'):
        self.code=code if code in SAFE_CODES else 'webmail_configuration_conflict'
        super().__init__(self.code)

def need(v):
    if not v:raise WebmailRefused()
def run(args,*,data=None,timeout=60):
    r=subprocess.run(args,input=data,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=timeout,check=True);return r.stdout.decode()
def native_text(path=CLIENTDB):
    """Read protected local data only. Never include/evaluate the PHP file."""
    try:
        for parent in path.parents:
            info=parent.lstat()
            if stat.S_ISLNK(info.st_mode)or info.st_uid!=0 or info.st_mode&0o022:
                raise WebmailRefused('mysql_admin_credentials_untrusted')
        fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
        try:
            info=os.fstat(fd);mode=stat.S_IMODE(info.st_mode)
            if not stat.S_ISREG(info.st_mode)or info.st_uid!=0 or info.st_nlink!=1 or info.st_size>16384 or not(mode==0o600 or mode==0o640 and info.st_gid==0):
                raise WebmailRefused('mysql_admin_credentials_untrusted')
            return os.read(fd,16385).decode('utf-8')
        finally:os.close(fd)
    except WebmailRefused:raise
    except Exception:raise WebmailRefused('mysql_admin_credentials_untrusted')from None

def php_string(literal):
    quote=literal[0];text=literal[1:-1];out=[];i=0
    escapes={'n':'\n','r':'\r','t':'\t','v':'\v','e':'\x1b','f':'\f','\\':'\\','"':'"','$':'$'}
    while i<len(text):
        char=text[i]
        if quote=='"'and char=='$':raise WebmailRefused('mysql_admin_credentials_format')
        if char=='\\'and i+1<len(text):
            nxt=text[i+1]
            if quote=="'":
                if nxt in("'",'\\'):out.append(nxt);i+=2;continue
            else:
                if nxt not in escapes:raise WebmailRefused('mysql_admin_credentials_format')
                out.append(escapes[nxt]);i+=2;continue
        out.append(char);i+=1
    return ''.join(out)

def parse_native(text):
    if not isinstance(text,str)or len(text.encode())>16384:raise WebmailRefused('mysql_admin_credentials_format')
    pos=0;values={};skip=re.compile(r'(?:\s+|//[^\n]*|\#[^\n]*|/\*[\s\S]*?\*/)*')
    pos=skip.match(text,pos).end()
    if not text.startswith('<?php',pos):raise WebmailRefused('mysql_admin_credentials_format')
    pos+=5
    assignment=re.compile(r'''\$clientdb_(host|user|password)\s*=\s*('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")\s*;''')
    while True:
        pos=skip.match(text,pos).end()
        if text.startswith('?>',pos):pos=skip.match(text,pos+2).end();break
        if pos==len(text):break
        match=assignment.match(text,pos)
        if not match or match[1]in values:raise WebmailRefused('mysql_admin_credentials_format')
        values[match[1]]=php_string(match[2]);pos=match.end()
    if pos!=len(text)or set(values)!={'host','user','password'} or not values['user']or not values['password']:
        raise WebmailRefused('mysql_admin_credentials_format')
    if any(len(v.encode())>4096 or any(ord(c)<32 and c not in '\n\r\t'for c in v)for v in values.values()):
        raise WebmailRefused('mysql_admin_credentials_format')
    if values['host']not in('localhost','127.0.0.1','::1'):raise WebmailRefused('mysql_admin_host_not_local')
    return values

def option_value(value):
    return '"'+value.replace('\\','\\\\').replace('"','\\"').replace('\n','\\n').replace('\r','\\r').replace('\t','\\t')+'"'

def mysql(sql,database=None):
    fd=None
    try:
        # Use ISPConfig's existing admin enrollment when present; never reset a
        # password or execute its PHP config. A memory-only 0600 option file
        # keeps credentials out of argv, environment, disk and error output.
        options=['--no-defaults']
        if CLIENTDB.exists()or CLIENTDB.is_symlink():
            values=parse_native(native_text())
            if not hasattr(os,'memfd_create'):raise WebmailRefused('mysql_secure_channel_unavailable')
            fd=os.memfd_create('hms-webmail-admin',os.MFD_CLOEXEC);os.fchmod(fd,0o600)
            body='[client]\nuser='+option_value(values['user'])+'\npassword='+option_value(values['password'])+'\n'
            with os.fdopen(os.dup(fd),'wb')as stream:stream.write(body.encode());stream.flush()
            os.lseek(fd,0,os.SEEK_SET);options=['--defaults-file=/proc/self/fd/'+str(fd)]
        env={k:v for k,v in os.environ.items()if k not in('MYSQL_PWD','MYSQL_TEST_LOGIN_FILE')}
        args=['/usr/bin/mysql',*options,'--host=localhost','--protocol=socket','--batch','--skip-column-names']+([database]if database else[])
        result=subprocess.run(args,input=sql.encode(),stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=env,pass_fds=()if fd is None else(fd,),timeout=60,check=False)
        if result.returncode:
            match=re.search(rb'\bERROR\s+(\d{4})\b',result.stderr)
            number=match[1]if match else b''
            code='mysql_admin_auth_failed'if number in(b'1045',b'1698',b'1130')else'mysql_socket_unavailable'if number in(b'2002',b'2003')else'mysql_operation_failed'
            raise WebmailRefused(code)
        return result.stdout.decode()
    except WebmailRefused:raise
    except FileNotFoundError:raise WebmailRefused('mysql_client_missing')from None
    except Exception:raise WebmailRefused('mysql_operation_failed')from None
    finally:
        if fd is not None:os.close(fd)
def existing(request):
    try:
        status,body,_=request('GET','/housemysite-webmail/')
        if status==200 and b'rcmail' in body and b'_user' in body and b'_pass' in body:
            return {'url':'https://server1.housemysite.com/housemysite-webmail/','existing':True,'internal_database_created':False}
    except Exception:pass
    return None

def preflight():
    need(not POOL.exists()and not POOL.is_symlink()and not STATE.exists())
    need(not CONFIG.parent.exists()and not PUBLIC.parent.exists())
    need(mysql("SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='hms_webmail';").strip()=='')
    need(mysql("SELECT User FROM mysql.user WHERE User='hms_webmail';").strip()=='')
    try:pwd.getpwnam('hms-webmail');raise WebmailRefused('webmail_account_exists')
    except KeyError:pass
    result=run(['apt-get','-s','--no-upgrade','--no-install-recommends','install',*PACKAGES],timeout=120)
    need(not re.search(r'^Remv ',result,re.M)and not re.search(r'^Inst \S+ \[',result,re.M))
    return {'packages':list(PACKAGES),'url':'https://server1.housemysite.com/housemysite-webmail/'}

def install(atomic,backup):
    preflight()
    # Avoid distro post-install webserver/database configuration. We create an
    # isolated pool and database below, preserving every existing PHP pool.
    installed=subprocess.run(['dpkg-query','-W','-f=${Status}','roundcube-core'],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,check=False).stdout.strip()==b'install ok installed'
    if not installed:run(['debconf-set-selections'],data=b'roundcube-core roundcube/dbconfig-install boolean false\nroundcube-core roundcube/reconfigure-webserver multiselect\n')
    env=dict(os.environ,DEBIAN_FRONTEND='noninteractive')
    subprocess.run(['apt-get','-y','--no-upgrade','--no-install-recommends','install',*PACKAGES],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=900,check=True)
    need(not POOL.exists()and not STATE.exists())
    root=Path('/usr/share/roundcube');need(root.is_dir()and (root/'index.php').is_file())
    schema=Path('/usr/share/roundcube/SQL/mysql.initial.sql');need(schema.is_file()and schema.stat().st_uid==0)
    run(['useradd','--system','--user-group','--home-dir',str(STATE),'--shell','/usr/sbin/nologin','hms-webmail'])
    user=pwd.getpwnam('hms-webmail')
    CONFIG.parent.mkdir(mode=0o750);os.chown(CONFIG.parent,0,user.pw_gid)
    defaults=next((p for p in (root/'config/defaults.inc.php',Path('/etc/roundcube/defaults.inc.php'))if p.is_file()),None);need(defaults is not None)
    atomic(CONFIG.parent/'defaults.inc.php',defaults.read_bytes(),0o640,owner=(0,user.pw_gid))
    PUBLIC.parent.mkdir(mode=0o755);PUBLIC.parent.chmod(0o755);PUBLIC.mkdir(mode=0o755);PUBLIC.chmod(0o755)
    entry=b"<?php\ndefine('INSTALL_PATH','/usr/share/roundcube/');\ndefine('RCMAIL_CONFIG_DIR','/etc/housemysite-webmail');\nrequire '/usr/share/roundcube/index.php';\n"
    atomic(PUBLIC/'index.php',entry,0o644)
    for name in ('program','skins','plugins'):
        need((root/name).is_dir());os.symlink(root/name,PUBLIC/name)
    STATE.mkdir(mode=0o700);os.chown(STATE,user.pw_uid,user.pw_gid)
    for name in ('temp','logs','sessions'):
        p=STATE/name;p.mkdir(mode=0o700);os.chown(p,user.pw_uid,user.pw_gid)
    password='Aa1!'+secrets.token_hex(32);key=secrets.token_urlsafe(24)[:24]
    mysql("CREATE DATABASE hms_webmail CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;CREATE USER 'hms_webmail'@'localhost' IDENTIFIED BY '"+password+"';GRANT SELECT,INSERT,UPDATE,DELETE,CREATE,ALTER,INDEX,DROP ON hms_webmail.* TO 'hms_webmail'@'localhost';")
    mysql(schema.read_text(),'hms_webmail')
    config="""<?php
$config['db_dsnw'] = 'mysql://hms_webmail:PASSWORD@localhost/hms_webmail';
$config['imap_host'] = 'ssl://server1.housemysite.com:993';
$config['smtp_host'] = 'tls://server1.housemysite.com:587';
$config['smtp_user'] = '%u';
$config['smtp_pass'] = '%p';
$config['des_key'] = 'DESKEY';
$config['product_name'] = 'HouseMySite Webmail';
$config['support_url'] = 'https://web.housemysite.com/client/support';
$config['enable_installer'] = false;
$config['plugins'] = [];
$config['temp_dir'] = '/var/lib/housemysite-webmail/temp/';
$config['log_dir'] = '/var/lib/housemysite-webmail/logs/';
$config['imap_debug'] = false;
$config['smtp_debug'] = false;
$config['show_images'] = 0;
$config['imap_conn_options'] = ['ssl'=>['verify_peer'=>true,'verify_peer_name'=>true]];
$config['smtp_conn_options'] = ['ssl'=>['verify_peer'=>true,'verify_peer_name'=>true]];
""".replace('PASSWORD',password.replace('!','%21')).replace('DESKEY',key)
    atomic(CONFIG,config.encode(),0o640,owner=(0,user.pw_gid));atomic(backup/'roundcube-recovery-config.php',config.encode(),0o600)
    pool='''[housemysite-webmail]
user = hms-webmail
group = hms-webmail
listen = /run/php/housemysite-webmail.sock
listen.owner = www-data
listen.group = www-data
listen.mode = 0660
pm = ondemand
pm.max_children = 4
pm.process_idle_timeout = 20s
request_terminate_timeout = 60s
clear_env = yes
security.limit_extensions = .php
env[ROUNDCUBE_CONFIG_DIR] = /etc/housemysite-webmail
php_admin_value[session.save_path] = /var/lib/housemysite-webmail/sessions
php_admin_value[upload_tmp_dir] = /var/lib/housemysite-webmail/temp
php_admin_value[open_basedir] = /usr/share/roundcube:/opt/housemysite-webmail:/etc/housemysite-webmail:/var/lib/housemysite-webmail:/usr/share/php:/etc/ssl
php_admin_value[disable_functions] = exec,passthru,shell_exec,system,proc_open,popen,mail
php_admin_flag[display_errors] = off
php_admin_flag[log_errors] = on
php_admin_value[error_log] = /var/lib/housemysite-webmail/logs/php.log
'''
    atomic(POOL,pool.encode(),0o644);run(['/usr/sbin/php-fpm8.3','-t']);run(['systemctl','reload-or-restart','php8.3-fpm'])
    # The distro alias must not expose an extra unreviewed global entry point.
    enabled=Path('/etc/apache2/conf-enabled/roundcube.conf')
    if not installed and enabled.exists():run(['a2disconf','roundcube'])
    run(['a2enmod','proxy_fcgi'])
    return {'url':'https://server1.housemysite.com/housemysite-webmail/','internal_database_created':True,'packages_installed':list(PACKAGES),'source_root':str(root)}

def apache_block():
    return '''
    # BEGIN HOUSEMYSITE WEBMAIL
    RedirectMatch 302 ^/housemysite-webmail$ /housemysite-webmail/
    Alias /housemysite-webmail /opt/housemysite-webmail/public
    <Directory /opt/housemysite-webmail/public>
        Options -Indexes +FollowSymLinks
        AllowOverride None
        Require all granted
        DirectoryIndex index.php
        <FilesMatch "\\.php$">
            SetHandler "proxy:unix:/run/php/housemysite-webmail.sock|fcgi://localhost/"
        </FilesMatch>
    </Directory>
    <LocationMatch "^/housemysite-webmail/(?:config|temp|logs|SQL|bin|installer|vendor|tests|program/include|program/lib|program/actions|program/localization)(?:/|$)">
        Require all denied
    </LocationMatch>
    <LocationMatch "^/housemysite-webmail/(?!index[.]php$).*?[.]php(?:/|$)">
        Require all denied
    </LocationMatch>
    # END HOUSEMYSITE WEBMAIL
'''
