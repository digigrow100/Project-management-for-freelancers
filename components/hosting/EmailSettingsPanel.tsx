'use client';
import {useRef,useState} from 'react';
import {emailAction} from '@/lib/hosting/email/actions';
import type {EmailSettings} from '@/lib/hosting/email/schema';
export function EmailSettingsPanel({settings}:{settings:EmailSettings}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');const lock=useRef(false);
 return <section className="hms-email-card"><h2>Email server settings</h2><p>Use the connection details and public-key fingerprint verified on your mail server. Saving these details does not enroll mailboxes or enable sending.</p><form className="hms-domain-form" onSubmit={async e=>{e.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setMessage('');try{const f=new FormData(e.currentTarget);f.set('action','settings');const r=await emailAction(f);setMessage(r.ok?r.message:r.error);}catch{setMessage('Could not confirm the save. Refresh to check the saved settings.');}finally{lock.current=false;setBusy(false);}}}>
 <div className="hms-email-settings-grid">{([{key:'mx_host',label:'Mail delivery hostname (MX)',placeholder:'Enter the verified mail server hostname'},{key:'imap_host',label:'Incoming mail hostname (IMAP)',placeholder:'Verified hostname'},{key:'smtp_host',label:'Outgoing mail hostname (SMTP)',placeholder:'Verified hostname'},{key:'webmail_url',label:'Webmail address',placeholder:'https://your-verified-webmail-address'}] as const).map(f=><label key={f.key}>{f.label}<input name={f.key} defaultValue={settings[f.key]} placeholder={f.placeholder} disabled={busy} autoComplete="off"/></label>)}</div>
 <label>Mailbox encryption fingerprint<input name="host_fingerprint" defaultValue={settings.host_fingerprint} maxLength={64} pattern="[a-fA-F0-9]{64}|" disabled={busy} autoComplete="off"/><small>The 64-character SHA-256 fingerprint, obtained independently from the server. Never enter a private key, API key or password here.</small></label>
 <p>Use IMAP port 993 with TLS and SMTP port 587 with STARTTLS only after those server endpoints have been verified. DKIM records must come from each domain’s server-generated key.</p><button className="hms-primary" disabled={busy}>{busy?'Saving…':'Save email settings'}</button><a href="/hosting/email">Open email accounts</a>
 </form>{message&&<p role="status">{message}</p>}</section>;
}
