import 'server-only';
import Link from 'next/link';
import {HOSTING_SECTIONS} from '@/lib/hostingWorkspace';
import {PANEL_GROUPS,PANEL_GUIDES,panelFeatureState,type PanelSection,type PanelFeature} from '@/lib/hosting/panelCatalog';

const names=new Map(HOSTING_SECTIONS.map(s=>[s.key,s.label]));
const badge='inline-flex rounded-full border px-2.5 py-1 text-xs font-medium';
function FeatureBadge({feature}:{feature:PanelFeature}){
 const state=panelFeatureState(feature,process.env);
 return <span className={`${badge} ${state.enabled?'border-blue-500/30 text-blue-300':'border-amber-500/30 text-amber-300'}`}>{state.label}</span>;
}

// Owner workspace only. All routes keep their existing server authorization.
export function PanelGuide({section}:{section:PanelSection}){
 const guide=PANEL_GUIDES[section];
 return <details aria-label={`${names.get(section)} guide`} className="hms-help"><summary>Page help & connection status</summary>
  <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-medium">What you can manage here</h2>{guide.feature?<FeatureBadge feature={guide.feature}/>:<span className={`${badge} border-neutral-600 text-neutral-300`}>Saved records</span>}</div>
  <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-neutral-300">{guide.items.map(item=><li key={item}>• {item}</li>)}</ul>
  <p className="mt-4 text-sm leading-6 text-neutral-400">{guide.next}</p>
  <nav aria-label="Related hosting pages" className="mt-4 flex flex-wrap gap-x-5 gap-y-2">{guide.related.map(key=><Link key={key} href={`/hosting/${key}`} prefetch={false} className="text-sm text-blue-300 underline-offset-4 hover:underline">{names.get(key)} →</Link>)}</nav>
 </details>;
}

export function IntegrationOverview(){
 const features:[PanelFeature,string][]=[['services','VPS service controls'],['provisioning','Hosting creation'],['domains','Primary domain & SSL'],['sources','Website source'],['uploads','ZIP uploads'],['publishing','Publish & rollback'],['github','GitHub connection'],['nextjs','Next.js hosting'],['autodeploy','Automatic deployment'],['backups','Backup & restore']];
 return <section className="rounded-xl border border-neutral-700 p-5" aria-label="Owner integration settings"><h2 className="font-medium">Connections & feature controls</h2><p className="mt-2 text-sm leading-6 text-neutral-400">These labels describe portal configuration only. They do not confirm a running worker, server enrollment, valid SSL or a recoverable backup. Private connection setup is completed by the operator; credentials never appear here.</p><ul className="mt-4 grid gap-3 sm:grid-cols-2">{features.map(([feature,label])=><li key={feature} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-700/70 p-3 text-sm"><span>{label}</span><FeatureBadge feature={feature}/></li>)}</ul><Link href="/hosting/operations" prefetch={false} className="mt-4 inline-block text-sm text-blue-300">Review requests and client release settings →</Link></section>;
}

export function HostingControlCenter(){
 return <section aria-label="Hosting control center" className="space-y-5"><div><h2 className="text-lg font-semibold">Hosting control center</h2><p className="mt-1 text-sm text-neutral-400">Start with clients, packages and a service. Open each area to manage its records and available controls.</p></div>{PANEL_GROUPS.map(group=><div key={group}><h3 className="mb-3 text-sm font-medium text-neutral-400">{group}</h3><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{HOSTING_SECTIONS.filter(section=>PANEL_GUIDES[section.key].group===group).map(section=>{const guide=PANEL_GUIDES[section.key];return <Link key={section.key} href={`/hosting/${section.key}`} prefetch={false} className="rounded-xl border border-neutral-700 bg-base-900 p-4 transition-colors hover:border-blue-500/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-medium">{section.label}</h4>{guide.feature?<FeatureBadge feature={guide.feature}/>:null}</div><p className="mt-3 text-sm leading-6 text-neutral-400">{section.description}</p></Link>;})}</div></div>)}</section>;
}

export function SetupRequired({section}:{section:PanelSection}){
 return <div role="status" className="rounded-xl border border-amber-500/30 p-5"><h2 className="font-medium text-amber-300">Connection setup needed</h2><p className="mt-2 text-sm leading-6 text-neutral-400">{names.get(section)} controls are not enabled for this portal. Complete the private connection and verification before enabling them. No request has been sent to the VPS.</p><Link href="/hosting/settings" prefetch={false} className="mt-4 inline-block text-sm text-blue-300">View connection settings →</Link></div>;
}
