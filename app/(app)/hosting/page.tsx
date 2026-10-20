import Link from "next/link";
import { adminOverview } from "@/lib/hosting/store";
import { FinanceOverview,HostingCounts } from "@/components/hosting/Overview";
import { PageTitle,Notice,HostingForm,cardClass } from "@/components/hosting/ui";
export default async function HostingOverviewPage({searchParams}:{searchParams:{from?:string;to?:string;error?:string;saved?:string}}) {
 const data=await adminOverview(searchParams.from,searchParams.to);
 return <div className="space-y-6"><PageTitle title="Hosting" description="Manage your hosting customers, services and money in one place."/><Notice {...searchParams}/><HostingCounts counts={data.counts}/><div className={`${cardClass} flex flex-wrap items-center justify-between gap-4`}><div><h2 className="font-medium">Renewal invoices</h2><p className="mt-1 text-sm text-neutral-400">Generate invoices for active services approaching their next due date. Repeating this will not duplicate a billing period.</p></div><HostingForm action="renewals" returnPath="/hosting" label="Generate renewals"/></div><FinanceOverview {...data}/><p className="text-sm text-neutral-500">Server operations wait for a reviewed connector. <Link className="text-accent-300 underline" href="/hosting/operations">View operation requests</Link></p></div>;
}
