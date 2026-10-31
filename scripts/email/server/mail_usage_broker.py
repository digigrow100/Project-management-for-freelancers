"""Root socket helper. One fixed, read-only doveadm quota query for an enrolled
mailbox. No paths, shell, message content, passwords or arbitrary commands.
"""
import json
import os
import pwd
import re
import socket
import sqlite3
import stat
import struct
import subprocess
import sys
from pathlib import Path

def parse(raw):
    rows=[line.split('\t')for line in raw.decode('utf-8').splitlines()];values=[]
    for row in rows:
        if len(row)==5 and row[1]=='STORAGE'and re.fullmatch('[0-9]{1,15}',row[2]):values.append(int(row[2])*1024)
    if len(values)!=1:raise ValueError('Quota not measured')
    return values[0]

def main():
    peer=socket.fromfd(0,socket.AF_UNIX,socket.SOCK_STREAM);peer.settimeout(10);_,uid,_=struct.unpack('3i',peer.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,12));actor=pwd.getpwnam('hms-services')
    if uid!=actor.pw_uid:raise ValueError('Denied')
    stream=peer.makefile('rwb');raw=stream.readline(256)
    if len(raw)>254 or not raw.endswith(b'\n'):raise ValueError('Denied')
    address=raw[:-1].decode('ascii')
    if not re.fullmatch(r'[a-z][a-z0-9_.+-]{0,63}@[a-z0-9.-]{4,189}',address):raise ValueError('Denied')
    path=Path('/var/lib/housemysite-services/mail-services.sqlite');info=path.lstat()
    if not stat.S_ISREG(info.st_mode)or info.st_uid!=actor.pw_uid or stat.S_IMODE(info.st_mode)!=0o600:raise ValueError('Denied')
    db=sqlite3.connect('file:'+str(path)+'?mode=ro',uri=True,timeout=5)
    try:
        if not db.execute('SELECT 1 FROM mail_boxes WHERE address=?',(address,)).fetchone():raise ValueError('Denied')
    finally:db.close()
    result=subprocess.run(['/usr/bin/doveadm','-f','tab','quota','get','-u',address],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=10,check=False)
    if result.returncode or len(result.stdout)>8192:raise ValueError('Unavailable')
    stream.write((json.dumps({'used_bytes':parse(result.stdout)})+'\n').encode());stream.flush()
if __name__=='__main__':
    try:main()
    except Exception:sys.stdout.write('{"used_bytes":null}\n');raise SystemExit(1)
