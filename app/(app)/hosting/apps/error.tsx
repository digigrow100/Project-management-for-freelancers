'use client';
import Link from 'next/link';
export default function WebsiteError({ reset }: {
    reset: () => void;
}) { return <section className="website-empty" role="alert"><h1>Website action needs review</h1><p>Check the latest server status before retrying. Existing website records are kept.</p><button className="hms-dash-primary" onClick={reset}>Reload status</button><Link href="/hosting/apps">All websites →</Link></section>; }
