import Link from "next/link";
import { clientOverview } from "@/lib/hosting/store";
import { money } from "@/lib/hosting/validation";
import { PageTitle,cardClass } from "@/components/hosting/ui";
export default async function ClientHome() {
 const d=await clientOverview();
 return <div className="space-y-6"><PageTitle title="Your hosting" description="View your services, invoices and support requests."/><div className="grid gap-4 sm:grid-cols-3"><Link className={cardClass} href="/client/services"><p className="text-sm text-neutral-400">My services</p><p className="mt-2 text-2xl">{d.services}</p></Link><Link className={cardClass} href="/client/invoices"><p className="text-sm text-neutral-400">Outstanding invoices</p>{d.outstanding.length?d.outstanding.map(({currency:c,outstanding_minor:v})=><p key={c} className="mt-2 text-lg">{money(v,c)}</p>):<p className="mt-2 text-lg">Nothing due</p>}</Link><Link className={cardClass} href="/client/tickets"><p className="text-sm text-neutral-400">Open support tickets</p><p className="mt-2 text-2xl">{d.tickets}</p></Link></div><section className={cardClass}><h2 className="font-medium">Payment instructions</h2><p className="mt-3 whitespace-pre-line text-sm text-neutral-400">{d.config.payment_instructions||'Contact support for payment instructions.'}</p></section></div>;
}
