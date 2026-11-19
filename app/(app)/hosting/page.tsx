import Link from 'next/link';
import {requireHostingAdmin} from '@/lib/hosting/auth';
import {listApps,recentDeployments} from '@/lib/hosting/apps/store';
import {pendingWebsitePayments} from '@/lib/hosting/websites/store';
import {AppCard,Pill} from '@/components/hosting/dashboard/present';
import type {HostingApp,HostingDeployment} from '@/lib/hosting/apps/types';
export default async function HostingHome(){
 await requireHostingAdmin();let apps:HostingApp[]=[],deployments:HostingDeployment[]=[],pending=0,note='';
 try{[apps,deployments,pending]=await Promise.all([listApps(null),recentDeployments(null),pendingWebsitePayments()]);}catch{note='Apply the website migrations and configure bank checkout before accepting new websites. Existing hosting records remain in their original sections.';}
 return <div className="hms-dash"><header className="website-page-head"><div><p className="hms-kicker">Hosting workspace</p><h1>Websites</h1><p>Review payments, manage client websites and follow their deployments.</p></div><Link className="hms-dash-primary" href="/hosting/website-payments">Review bank transfers{pending?` · ${pending}`:''}</Link></header>
 {note?<p className="hms-banner">{note}</p>:null}<Link href="/hosting/website-payments" className="website-notification"><span>{pending} bank-transfer notices waiting for review</span><span>Open pending payments →</span></Link>
 <div className="website-metrics"><section><span>Client websites</span><strong>{apps.length}</strong></section><section><span>Running</span><strong>{apps.filter(a=>a.status==='running').length}</strong></section><section><span>Pending bank payments</span><strong>{pending}</strong></section></div>
 <section><div className="website-section-head"><h2>Projects & websites</h2><Link href="/hosting/apps">All websites →</Link></div><div className="website-project-grid">{apps.slice(0,12).map(app=><AppCard key={app.id} base="/hosting/apps" app={app}/>)}</div>{!apps.length?<div className="website-empty"><h2>Ready for your first client website</h2><p>Configure the bank account and prices. Clients submit a bank-transfer notice from Add New Website. After approval they can upload files or connect GitHub.</p><Link href="/hosting/website-payments" className="hms-dash-primary">Set up website checkout →</Link></div>:null}</section>
 <section className="hms-panel"><h2>Recent deployments</h2><ul className="hms-feed">{deployments.map(d=><li key={d.id}><Link href={`/hosting/apps/${d.app_id}?tab=deployments`}>{apps.find(a=>a.id===d.app_id)?.display_name??'Website'}</Link><Pill value={d.status}/><time>{new Date(d.created_at).toISOString()}</time></li>)}</ul>{!deployments.length?<p className="hms-muted">No new website deployments yet.</p>:null}</section>
 <section className="hms-panel hms-secondary"><h2>Existing hosting records</h2><p><Link href="/hosting/clients">Clients & portal access</Link> · <Link href="/hosting/services">Plan assignments</Link> · <Link href="/hosting/billing">Invoices & billing</Link> · <Link href="/hosting/servers">Servers</Link></p><p className="website-note">These existing records stay separate. No old service is automatically migrated or deployed.</p></section></div>;
}
