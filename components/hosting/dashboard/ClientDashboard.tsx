import Link from 'next/link';
import { Globe, GitBranch, ArrowUpRight, HardDrive } from 'lucide-react';
import type { HostingApp, HostingDeployment } from '@/lib/hosting/apps/types';
import type { WebsiteSettings } from '@/lib/hosting/websites/types';
import { gbLabel } from '@/lib/hosting/websites/types';
import { AddWebsiteDialog } from './AddWebsiteDialog';
import { Pill } from './present';
export function ClientDashboard({ name, apps, deployments, settings, credits, pending, readOnly, note }: {
    name: string;
    apps: HostingApp[];
    deployments: HostingDeployment[];
    settings: WebsiteSettings | null;
    credits: number;
    pending: boolean;
    readOnly: boolean;
    note?: string;
}) {
    return <div className="website-dashboard"><header className="website-page-head"><div><p className="hms-kicker">Your workspace</p><h1>Overview</h1><p>Welcome, {name}. Your websites, releases and domains in one place.</p></div><AddWebsiteDialog settings={settings} credits={credits} pending={pending} readOnly={readOnly}/></header>
  {note ? <p className="hms-banner" role="status">{note}</p> : null}{pending ? <Link href="/client/website-billing" className="website-notification">Bank transfer submitted · Awaiting admin review <ArrowUpRight size={15}/></Link> : null}
  <div className="website-metrics"><section><Globe size={17}/><span>Websites</span><strong>{apps.length}</strong></section><section><GitBranch size={17}/><span>Recent deployments</span><strong>{deployments.length}</strong></section><section><HardDrive size={17}/><span>Approved website credits</span><strong>{credits}</strong></section></div>
  <section><div className="website-section-head"><h2>Projects & websites</h2><Link href="/client/apps">View all →</Link></div>
   {apps.length ? <div className="website-project-grid">{apps.slice(0, 12).map(app => <Link href={`/client/apps/${app.id}`} className="website-project" key={app.id}><div><span className="website-project-icon"><Globe size={20}/></span><Pill value={app.status}/></div><h3>{app.display_name}</h3><p>{app.source_kind === 'git' ? app.source_url.replace('https://github.com/', '') : 'Direct upload'}</p><footer><span>{app.framework}</span><span>{gbLabel(app.storage_used_bytes)} / {gbLabel(Number(app.storage_limit_bytes))}</span></footer></Link>)}</div>
            : <div className="website-empty"><Globe size={28}/><h3>Your next website starts here</h3><p>Choose Add New Website, send a bank-transfer notice and wait for approval. Then upload your files or connect GitHub.</p><AddWebsiteDialog settings={settings} credits={credits} pending={pending} readOnly={readOnly}/></div>}
  </section><section className="website-deployments"><div className="website-section-head"><h2>Latest deployments</h2><Link href="/client/deployments">View deployments →</Link></div>{deployments.length ? <ul>{deployments.map(d => <li key={d.id}><span className="website-deployment-dot"/><Link href={`/client/apps/${d.app_id}?tab=deployments`}>{apps.find(a => a.id === d.app_id)?.display_name ?? 'Website'}</Link><Pill value={d.status}/><time dateTime={d.created_at}>{new Date(d.created_at).toISOString().replace('T', ' ').slice(0, 16)} UTC</time></li>)}</ul> : <p className="hms-muted">Your deployment history will appear after you upload or connect a repository.</p>}</section>
 </div>;
}
