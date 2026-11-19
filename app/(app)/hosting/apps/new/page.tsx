import Link from 'next/link';
import { requireHostingAdmin } from '@/lib/hosting/auth';
export default async function NewWebsite() { await requireHostingAdmin(); return <section className="hms-panel"><h1>Approve a client website</h1><p>Review the bank transfer first. Approval grants one website credit to that client. The client then chooses Upload or GitHub from their dashboard.</p><Link className="hms-dash-primary" href="/hosting/website-payments">Review website payments →</Link></section>; }
