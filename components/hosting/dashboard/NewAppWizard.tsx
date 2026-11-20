'use client';
import { useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { WebsiteCredit } from '@/lib/hosting/websites/types';
import { price } from '@/lib/hosting/websites/types';
function Submit() { const { pending } = useFormStatus(); return <button className="hms-dash-primary" disabled={pending}>{pending ? 'Creating website…' : 'Create website →'}</button>; }
export function NewAppWizard({ action, credits }: {
    action: (form: FormData) => void | Promise<void>;
    credits: WebsiteCredit[];
}) {
    const [kind, setKind] = useState('upload'), [extra, setExtra] = useState(0), [creditId, setCreditId] = useState(credits[0]?.id ?? '');
    const key = useRef(''), credit = credits.find(c => c.id === creditId);
    return <form className="hms-dash hms-wizard website-setup" action={form => {
            if (!key.current)
                key.current = crypto.randomUUID();
            form.set('request_key', key.current);
            return action(form);
        }}>
  <header><p className="hms-kicker">Approved website</p><h1>Set up your website</h1><p>Choose a name and how you want to deploy. Your approved credit includes 1 GB.</p></header>
  <input type="hidden" name="return_base" value="/client/apps"/>
  <label>Approved credit<select name="credit_id" value={creditId} onChange={e => { setCreditId(e.target.value); setExtra(0); }}>{credits.map(c => <option key={c.id} value={c.id}>Website credit · 1 GB included</option>)}</select></label>
  <label>Website name<input name="display_name" required maxLength={80} placeholder="My business website"/></label>
  <fieldset><legend>Deployment source</legend><div className="website-source-options"><label><input type="radio" name="source_kind" value="upload" checked={kind === 'upload'} onChange={() => setKind('upload')}/><strong>Direct upload</strong><small>ZIP, files or a folder. Upload up to 1 GB on the next screen.</small></label><label><input type="radio" name="source_kind" value="git" checked={kind === 'git'} onChange={() => setKind('git')}/><strong>GitHub repository</strong><small>Connect a repository and deploy its selected branch.</small></label></div></fieldset>
  {kind === 'git' ? <><label>GitHub repository URL<input name="source_url" type="url" required placeholder="https://github.com/owner/repository"/></label><label>Branch<input name="git_ref" maxLength={128} defaultValue="main" required/></label><label>GitHub access token <span className="hms-muted">(private repos only)</span><input name="git_token" type="password" autoComplete="off" maxLength={300}/><small>Use a fine-grained, read-only token for this repository. It is encrypted and never shown again.</small></label></> : null}
  <label>Build preset<select name="framework" defaultValue="static"><option value="static">Static HTML / prebuilt files</option><option value="react">React / Vite</option><option value="vue">Vue / Vite</option><option value="nextjs">Next.js</option><option value="nuxt">Nuxt</option><option value="node">Node.js</option></select><small>Node builds need package-lock.json and npm scripts. Existing Dockerfiles are not executed.</small></label>
  <section className="website-bank"><h2>Storage</h2><p>1 GB included. Every upload is limited to 1 GB, including the total of multiple files. Expanded content must fit the selected website limit.</p>
   {credit && credit.extra_gb_month_minor > 0 && credit.max_extra_gb > 0 ? <><label>Extra storage cap<select name="extra_gb" value={extra} onChange={e => setExtra(Number(e.target.value))}>{Array.from({ length: credit.max_extra_gb + 1 }, (_, n) => <option key={n} value={n}>{n === 0 ? 'No extra storage — hard limit 1 GB' : `${1 + n} GB total cap`}</option>)}</select></label><p>{price(credit.extra_gb_month_minor, credit.currency)} per extra GB-month, prorated by actual content size and time. Reserved capacity is not charged.</p>{extra > 0 ? <label className="website-check"><input type="checkbox" name="storage_consent" value="yes" required/>I agree to usage-based storage billing up to this cap.</label> : null}</> : <input type="hidden" name="extra_gb" value="0"/>}
  </section><Submit />
 </form>;
}
