'use client';
import Link from 'next/link';
export function WebsiteError({ reset }: {
    reset: () => void;
}) { return <section className="website-empty" role="alert"><h1>That action could not be completed</h1><p>Check the website or payment status before trying again. Your existing website and approved credit are kept. If this continues, contact support.</p><div className="website-toolbar"><button className="hms-dash-primary" onClick={reset}>Reload status</button><Link href="/client" className="hms-dash-secondary">Client dashboard</Link></div></section>; }
