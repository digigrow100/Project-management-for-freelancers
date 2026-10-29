import {HostingForm,Field,Hidden} from './ui';
import {AppAccountActions} from './AppAccountActions';
import {UsageTable} from './AppUsageTable';
import type {AppAccountView} from '@/lib/hosting/store';
const stateLabel:Record<string,string>={requested:'Waiting for setup request',provisioning:'Being set up (owner approval and VPS worker)',uncertain:'Outcome uncertain: review before retrying',provider_confirmed:'Provider objects created; storage control not yet verified',enforced:'Controls verified on the server',suspended:'Suspended'};
// Server component: the forms use server actions; only the buttons that call the private service are a client component.
export function AppAccountPanel({accounts,needAccount}:{accounts:AppAccountView[];needAccount:{id:string;name:string}[]}){
 return <section className="space-y-5 rounded-xl border border-base-700/60 bg-base-850 p-5" aria-label="App Hosting accounts">
  <h2 className="font-medium">App Hosting accounts</h2>
  <p className="text-sm text-neutral-400">One account per assigned contract. All of its websites share the package limits. Nothing is Active until the server returns a verified receipt for this contract.</p>
  {needAccount.map(s=><div key={s.id} className="flex flex-wrap items-center gap-3"><span className="text-sm">{s.name}</span><HostingForm action="app_open_account" returnPath="/hosting/services" label="Open account"><Hidden name="service_id" value={s.id}/></HostingForm></div>)}
  {accounts.map(a=><article key={a.id} className="space-y-3 border-t border-base-700/60 pt-4">
   <h3 className="font-medium">{a.service_name}</h3>
   <p className="text-sm">{stateLabel[a.status]??a.status}{a.receipt_digest&&<span className="ml-2 break-all text-xs text-neutral-500">receipt {a.receipt_digest.slice(0,16)}…</span>}</p>
   {a.blocked_features.length>0&&<p className="text-sm text-amber-400">Not available for this account yet: {a.blocked_features.join(', ')}. These stay blocked until their enforcement control exists.</p>}
   <AppAccountActions service={a.service_id} status={a.status} sites={a.sites}/>
   {a.status==='enforced'&&<HostingForm action="app_add_site" returnPath="/hosting/services" label="Reserve website"><Hidden name="account_id" value={a.id}/><Field label="Hostname of an additional website" name="hostname" required placeholder="shop.example.com"/></HostingForm>}
   {a.usage&&<UsageTable usage={a.usage} at={a.usage_at}/>}
  </article>)}
 </section>;
}
