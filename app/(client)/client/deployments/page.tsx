import Link from 'next/link';
import { requireHostingClient } from '@/lib/hosting/auth';
import { recentDeployments, listApps } from '@/lib/hosting/apps/store';
import { Pill } from '@/components/hosting/dashboard/present';
export default async function Deployments() { const session = await requireHostingClient(), [apps, rows] = await Promise.all([listApps(session.clientId), recentDeployments(session.clientId)]); return <div className="hms-dash"><header><h1>Deployments</h1><p className="hms-muted">Select a website for its full deployment history.</p></header><ul className="hms-feed">{rows.map(d => <li key={d.id}><Link href={`/client/apps/${d.app_id}?tab=deployments`}>{apps.find(a => a.id === d.app_id)?.display_name ?? 'Website'}</Link><Pill value={d.status}/><time>{new Date(d.created_at).toISOString()}</time></li>)}</ul>{!rows.length ? <p>No deployments yet.</p> : null}</div>; }
