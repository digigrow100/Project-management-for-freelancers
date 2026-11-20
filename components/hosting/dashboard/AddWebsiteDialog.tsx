'use client';
import Link from 'next/link';
import { useId, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { WebsiteSettings } from '@/lib/hosting/websites/types';
import { price } from '@/lib/hosting/websites/types';
export function AddWebsiteDialog({ settings, credits, pending, readOnly = false }: {
    settings: WebsiteSettings | null;
    credits: number;
    pending: boolean;
    readOnly?: boolean;
}) {
    const titleId=useId();
    const dialog = useRef<HTMLDialogElement>(null), router = useRouter();
    const [busy, setBusy] = useState(false), [error, setError] = useState(''), [sent, setSent] = useState(false), key = useRef('');
    function open() {
        setError('');
        setSent(false);
        if (!key.current)
            key.current = crypto.randomUUID();
        dialog.current?.showModal();
    }
    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (busy)
            return;
        setBusy(true);
        setError('');
        const data = new FormData(event.currentTarget);
        data.set('request_key', key.current);
        data.set('revision', String(settings?.revision ?? 0));
        try {
            const response = await fetch('/api/hosting-websites/payments', { method: 'POST', body: data, signal: AbortSignal.timeout(30000) });
            const result = await response.json().catch(()=>({error:'The request was interrupted. Check Website billing before trying again.'}));
            if (!response.ok || !result.ok)
                throw new Error(result.error ?? 'Payment request could not be sent.');
            setSent(true);
            key.current = '';
            router.refresh();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'Check your connection and try again.');
        }
        finally {
            setBusy(false);
        }
    }
    return <><button type="button" className="hms-dash-primary" onClick={open} disabled={readOnly}>+ Add New Website</button>
 <dialog ref={dialog} className="website-dialog" aria-labelledby={titleId} onCancel={e => {
            if (busy)
                e.preventDefault();
        }} onClick={e => {
            if (e.target === e.currentTarget && !busy)
                dialog.current?.close();
        }}>
  <div className="website-dialog-content"><header><div><p className="hms-kicker">New website</p><h2 id={titleId}>Add a new website</h2></div><button type="button" className="website-close" aria-label="Close payment dialog" disabled={busy} onClick={() => dialog.current?.close()}>×</button></header>
   {credits > 0 ? <section className="website-checkout-success"><h3>Your website is approved</h3><p>You have {credits} unused website {credits === 1 ? 'credit' : 'credits'}. Each includes one website and 1 GB of content storage.</p><Link className="hms-dash-primary" href="/client/apps/new">Continue to website setup →</Link></section>
            : sent || pending ? <section className="website-checkout-success" role="status"><h3>Payment waiting for review</h3><p>The admin has your bank-transfer notice. Your website credit will appear here after approval. You can check the result in Website billing.</p><Link href="/client/website-billing">View payment status →</Link></section>
                : !settings?.enabled ? <section><h3>Checkout is not available yet</h3><p>The admin needs to configure the website price and bank account. No payment has been requested.</p><Link href="/client/tickets">Contact support →</Link></section>
                    : <form onSubmit={submit}><div className="website-order"><strong>1 website · 1 GB storage</strong><span>{price(settings.website_price_minor, settings.currency)}</span></div><p className="hms-muted">One website credit. Extra content storage is optional and billed by actual usage at {price(settings.extra_gb_month_minor, settings.currency)} per GB-month. No card or automatic charge.</p>
    <label className="website-payment-option"><input type="radio" name="method" value="bank_transfer" defaultChecked/>Bank Transfer</label>
    <section className="website-bank"><h3>Transfer to this bank account</h3><p>{settings.bank_details}</p><small>Send exactly {price(settings.website_price_minor, settings.currency)}. Then submit the notice below.</small></section>
    <label>Bank reference <span className="hms-muted">(optional)</span><input name="reference" maxLength={200} autoComplete="off" placeholder="Transaction or transfer reference"/></label>
    <label>Payment screenshot <span className="hms-muted">(optional)</span><input name="proof" type="file" accept="image/png,image/jpeg"/><small>PNG or JPEG, up to 2 MB. Keep unrelated account details out of the screenshot.</small></label>
    <label className="website-check"><input type="checkbox" name="bank_sent" value="yes" required/>I have sent this bank transfer. I understand that an admin must verify it.</label>
    {error ? <p className="website-error" role="alert">{error}</p> : null}
    <footer><button type="button" className="hms-dash-secondary" disabled={busy} onClick={() => dialog.current?.close()}>Cancel</button><button className="hms-dash-primary" disabled={busy}>{busy ? 'Sending notice…' : 'I have paid — notify admin'}</button></footer>
   </form>}
  </div>
 </dialog></>;
}
