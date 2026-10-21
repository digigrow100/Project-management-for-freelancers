import Link from "next/link";
import { notFound } from "next/navigation";
import { HOSTING_SECTIONS } from "@/lib/hostingWorkspace";
import { adminRecords,adminLookups,adminEditRecord,adminSettings,adminAccess,adminPackageServers,agencyClients,adminOverview,type HostingSectionKey } from "@/lib/hosting/store";
import { HostingEntityForm,HostingSettingsForm } from "@/components/hosting/EntityForm";
import { RecordsTable } from "@/components/hosting/RecordsTable";
import { InvoiceForm } from "@/components/hosting/InvoiceForm";
import { FinanceOverview } from "@/components/hosting/Overview";
import { PageTitle,Notice,Pagination,HostingForm,Hidden,Field,Select,Check,Area,cardClass,choices } from "@/components/hosting/ui";
export default async function HostingSectionPage({params,searchParams}:{params:{section:string};searchParams:{edit?:string;page?:string;error?:string;saved?:string;from?:string;to?:string}}) {
 const section=HOSTING_SECTIONS.find(s=>s.key===params.section);if(!section)notFound();
 const [lookups,settings]=await Promise.all([adminLookups(),adminSettings()]);
 if(section.key==='settings')return <div className="space-y-6"><PageTitle title="Hosting settings"/><Notice {...searchParams}/><HostingSettingsForm settings={settings}/><section className={cardClass}><h2 className="font-medium">Account security</h2><p className="mt-2 text-sm text-neutral-400">Manage the authenticator for your own account. Hosting access requires an enabled authenticator.</p><Link href="/login/security?manage=1" className="mt-4 inline-block text-sm text-blue-400">Manage authenticator →</Link></section></div>;
 if(section.key==='billing') {const summary=await adminOverview(searchParams.from,searchParams.to);return <div className="space-y-6"><PageTitle title="Hosting billing" description="Incoming payments, refunds, expenses and outstanding invoices."/><Notice {...searchParams}/><FinanceOverview {...summary}/></div>;}
 const key=section.key as HostingSectionKey;
 const [page,record,access,packageServers,agency]=await Promise.all([
 adminRecords(key,Number(searchParams.page)||1),
 searchParams.edit&&['servers','packages','clients','services','domains'].includes(key)?adminEditRecord(key,searchParams.edit):Promise.resolve(undefined),
 key==='clients'?adminAccess():Promise.resolve([]),key==='packages'?adminPackageServers():Promise.resolve([]),key==='clients'?agencyClients():Promise.resolve([]),
 ]);
 const path='/hosting/'+key;
 return <div className="space-y-6"><PageTitle title={section.label} description={section.description}/><Notice {...searchParams}/>
 {['servers','packages','clients','services','domains','expenses'].includes(key)&&<HostingEntityForm entity={key} defaultCurrency={settings.default_currency} record={record as unknown as Record<string,unknown>|undefined} lookups={lookups} packageServers={packageServers} agencyClients={agency}/>}
 {key==='servers'&&<p className="text-sm text-neutral-500">Capacity and availability are admin declarations. Registering a server does not install an agent or connect it. No root passwords or SSH keys are stored in this portal.</p>}
 {key==='invoices'&&<InvoiceForm lookups={lookups} settings={settings}/>}
 {key==='operations'&&<div className={cardClass}><h2 className="font-medium">Request a server operation</h2><p className="mt-2 text-sm text-neutral-400">Requests remain Awaiting connection. They do not execute commands or change your websites. Current VPS operator and evidence enrollment prerequisites still apply.</p><HostingForm action="job" returnPath={path} label="Queue reviewed request" className="mt-4"><Select label="Service" name="service_id" options={lookups.services.map(s=>({value:s.id,label:s.name}))}/><Select label="Operation" name="kind" options={choices('provision','deploy','rollback','suspend','resume','cancel')}/><Area label="Operator instructions (no secrets)" name="note"/></HostingForm></div>}
 <RecordsTable section={key} records={page.records} lookups={lookups}/><Pagination path={path} page={page.page} total={page.total}/>
 {key==='clients'&&<section className="space-y-4"><h2 className="font-medium">Client portal access</h2><p className="text-sm text-neutral-400">Client accounts are separate from staff accounts. Invitations go to the email saved on the selected client. Existing accounts can be linked by their verified Supabase user ID.</p>{lookups.clients.map(client=>{const a=access.find(r=>r.client_id===client.id);return <div key={client.id} className={cardClass}><p className="font-medium">{client.name}</p><p className="mt-1 text-sm text-neutral-400">{client.email}</p><div className="mt-4 grid gap-4 lg:grid-cols-3"><HostingForm action="invite" returnPath={path} label="Send client invitation"><Hidden name="client_id" value={client.id}/></HostingForm><HostingForm action="link_account" returnPath={path} label="Link existing account"><Hidden name="client_id" value={client.id}/><Field name="auth_user_id" label="Verified Supabase user ID" required/></HostingForm>{a&&<HostingForm action="access" returnPath={path} label="Update access"><Hidden name="id" value={a.id}/><Check label="Portal access enabled" name="enabled" checked={a.enabled}/></HostingForm>}</div></div>;})}</section>}
 </div>;
}
