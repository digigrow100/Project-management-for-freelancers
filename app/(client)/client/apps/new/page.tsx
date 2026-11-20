import Link from 'next/link';
import { requireHostingClient } from '@/lib/hosting/auth';
import { clientCheckout } from '@/lib/hosting/websites/store';
import { createHostingApp } from '@/lib/hosting/apps/actions';
import { NewAppWizard } from '@/components/hosting/dashboard/NewAppWizard';
export default async function NewWebsite({ searchParams }: {
    searchParams: Promise<{
        error?: string;
    }>;
}) {
    const session = await requireHostingClient(), query = await searchParams;
    if (session.adminView || session.client.status !== 'active')
        return <p>This account is read only.</p>;
    const checkout = await clientCheckout(session.clientId);
    if (!checkout.credits.length)
        return <section className="website-empty"><h1>Website approval needed</h1><p>Start from your dashboard to submit a bank transfer for one website.</p><Link className="hms-dash-primary" href="/client">Back to dashboard →</Link></section>;
    return <>{query.error ? <p role="alert" className="hms-banner">Website setup failed. Check your choices and unused credit, then try again.</p> : null}<NewAppWizard action={createHostingApp} credits={checkout.credits}/></>;
}
