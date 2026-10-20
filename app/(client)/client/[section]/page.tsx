import Link from "next/link";
import { ClientServices } from "@/components/hosting/ClientServices";
import { requireHostingClient } from "@/lib/hosting/auth";
import { notFound } from "next/navigation";
import { clientRecords,type ClientSection } from "@/lib/hosting/store";
import type { HostingService } from "@/lib/hosting/types";
import { RecordsTable } from "@/components/hosting/RecordsTable";
import { PageTitle,Notice,Pagination,HostingForm,Field,Select,Area,cardClass,choices } from "@/components/hosting/ui";
const titles={services:'Your hosting',domains:'Your domains',invoices:'Billing',payments:'Payments',tickets:'How can we help?'};
export default async function ClientSectionPage({params,searchParams}:{params:{section:string};searchParams:{page?:string;error?:string;saved?:string}}) {
 if(!Object.prototype.hasOwnProperty.call(titles,params.section))notFound();
 const session=await requireHostingClient();
 const section=params.section as ClientSection,data=await clientRecords(section,Number(searchParams.page)||1);
 const services=section==='tickets'?await clientRecords('services'):null;
 return <div className="space-y-6"><PageTitle title={titles[section]}/><Notice {...searchParams}/>{["invoices","payments"].includes(section)&&<nav aria-label="Billing sections" className="client-billing-tabs"><Link href="/client/invoices" aria-current={section==="invoices"?"page":undefined}>Invoices</Link><Link href="/client/payments" aria-current={section==="payments"?"page":undefined}>Payment history</Link></nav>}{section==='tickets'&&!session.adminView&&<details className={cardClass}><summary className="cursor-pointer font-medium">Open a support ticket</summary><HostingForm action="new_ticket" returnPath="/client/tickets" client label="Open ticket" className="mt-5"><Field label="Subject" name="subject" required/><Select label="Related service" name="service_id" optional options={(services?.records as HostingService[]??[]).map(s=>({value:s.id,label:s.name}))}/><Select label="Priority" name="priority" value="normal" options={choices('low','normal','high')}/><Area label="How can we help?" name="body"/></HostingForm></details>}{section==="services"?<ClientServices services={data.records as HostingService[]}/>:<RecordsTable section={section} records={data.records} client/>}<Pagination path={'/client/'+section} page={data.page} total={data.total}/></div>;
}
