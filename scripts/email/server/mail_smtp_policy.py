"""Postfix END-OF-MESSAGE recipient limits for managed mailboxes only.
A socket-activated instance accepts only the local postfix peer. Other accounts
return DUNNO; this daemon never grants relay permission or sends any message.
"""
import hashlib
import json
import os
import pwd
import re
import socket
import sqlite3
import struct
import sys
import time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from mail_accounts import require
from mail_agent import private,POLICY,STATE

def decision(db,fields,policy,now):
    require(fields.get('request')=='smtpd_access_policy')
    user=fields.get('sasl_username','').strip().lower();sender=fields.get('sender','').strip().lower()
    sender_domain=sender.rsplit('@',1)[-1]if '@'in sender else''
    managed_sender=bool(db.execute('SELECT 1 FROM mail_accounts WHERE domain=? AND provider_domain IS NOT NULL',(sender_domain,)).fetchone())
    if not user:return '553 5.7.1 Authentication required for this sender'if managed_sender else'DUNNO'
    row=db.execute('SELECT b.id,b.service FROM mail_boxes b JOIN mail_accounts a ON a.service=b.service WHERE b.address=? AND a.provider_domain IS NOT NULL',(user,)).fetchone()
    if row is None:return '553 5.7.1 Sender is not assigned to this account'if managed_sender else'DUNNO'
    if sender!=user:
        alias=db.execute('SELECT 1 FROM mail_aliases WHERE resource=? AND name=?',(row[0],sender)).fetchone()
        if not alias:return '553 5.7.1 Sender does not match the mailbox'
    if fields.get('protocol_state')!='END-OF-MESSAGE':return '451 4.7.0 Sending policy stage mismatch'
    require(re.fullmatch(r'[0-9]{1,5}',fields.get('recipient_count','')));count=int(fields['recipient_count']);require(1<=count<=1000)
    instance=fields.get('instance','');require(re.fullmatch(r'[A-Za-z0-9_.:-]{1,200}',instance))
    token=hashlib.sha256((user+'|'+instance+'|'+fields.get('queue_id','')+'|'+str(now//86400)).encode()).hexdigest()
    db.execute('BEGIN IMMEDIATE')
    try:
        previous=db.execute('SELECT recipients FROM mail_send_events WHERE id=?',(token,)).fetchone()
        if previous:require(previous[0]==count);db.commit();return 'DUNNO'
        hour=db.execute('SELECT coalesce(sum(recipients),0) FROM mail_send_events WHERE resource=? AND created>?',(row[0],now-3600)).fetchone()[0]
        day=db.execute('SELECT coalesce(sum(recipients),0) FROM mail_send_events WHERE resource=? AND created>?',(row[0],now-86400)).fetchone()[0]
        total=db.execute('SELECT coalesce(sum(recipients),0) FROM mail_send_events WHERE service=? AND created>?',(row[1],now-3600)).fetchone()[0]
        if hour+count>policy['hourly_recipients']or day+count>policy['daily_recipients']or total+count>policy['service_hourly_recipients']:
            db.rollback();return '451 4.7.0 Sending limit reached. Try later'
        db.execute('INSERT INTO mail_send_events VALUES(?,?,?,?,?)',(token,row[0],row[1],now,count));db.execute('DELETE FROM mail_send_events WHERE created<?',(now-172800,));db.commit();return 'DUNNO'
    except BaseException:db.rollback();raise

def main():
    peer=socket.fromfd(0,socket.AF_UNIX,socket.SOCK_STREAM);peer.settimeout(15);_,uid,_=struct.unpack('3i',peer.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,12));require(uid in (0,pwd.getpwnam('postfix').pw_uid))
    stream=peer.makefile('rwb')
    policy=json.loads(private(POLICY));require(policy.get('sending_ready')is True);db=sqlite3.connect(STATE,isolation_level=None,timeout=5)
    for _ in range(20):
        fields={};size=0
        while True:
            line=stream.readline(4097)
            if not line:return
            size+=len(line);require(size<=16384 and len(line)<=4096)
            if line in (b'\n',b'\r\n'):break
            key,sep,value=line.rstrip(b'\r\n').partition(b'=');require(sep and b'\x00'not in value);fields[key.decode('ascii')]=value.decode('utf-8','replace')
        try:action=decision(db,fields,policy,int(time.time()))
        except Exception:action='451 4.7.0 Sending policy unavailable'
        stream.write(('action='+action+'\n\n').encode());stream.flush()
if __name__=='__main__':
    try:main()
    except Exception:raise SystemExit(1)
