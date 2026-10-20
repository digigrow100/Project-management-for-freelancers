import Link from "next/link";
import { clientOverview,clientRecords } from "@/lib/hosting/store";
import type { HostingService } from "@/lib/hosting/types";
import { money } from "@/lib/hosting/validation";
import { PageTitle } from "@/components/hosting/ui";
import { ClientServices } from "@/components/hosting/ClientServices";
export default async function ClientHome() {
 const [d,services]=await Promise.all([clientOverview(),clientRecords("services")]);
 return <div><PageTitle title="Your space." description="Your hosting, billing and support in one place."/><ClientServices services={services.records as HostingService[]}/>{services.total>25&&<Link href="/client/services" className="client-link inline-block mt-5">View all hosting →</Link>}<div className="client-summary-footer"><section><h2>Outstanding balance</h2>{d.outstanding.length?d.outstanding.map(({currency,outstanding_minor})=><p key={currency} className="text-2xl mb-3">{money(outstanding_minor,currency)}</p>):<p className="mb-3">Nothing due</p>}<Link href="/client/invoices">View invoices →</Link></section><section><h2>Need a hand?</h2><p className="mb-3 text-sm text-neutral-400">{d.tickets?`${d.tickets} open support tickets`:"We’re here to help with your hosting."}</p><Link href="/client/tickets">Contact support →</Link></section></div>{d.config.payment_instructions&&<section className="mt-14 border-t border-base-700 pt-6"><h2 className="text-sm font-medium">Payment instructions</h2><p className="mt-3 whitespace-pre-line text-sm text-neutral-400">{d.config.payment_instructions}</p></section>}</div>;
}
