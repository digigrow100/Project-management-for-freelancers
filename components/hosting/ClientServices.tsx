import Link from "next/link";
import type { HostingService } from "@/lib/hosting/types";
import { money } from "@/lib/hosting/validation";
export function ClientServices({services}:{services:HostingService[]}) {
 if(!services.length)return <p className="client-empty">No hosting services yet. Contact support to discuss a plan.</p>;
 return <section aria-label="Your hosting services">{services.map(s=><article key={s.id} className="client-service"><div><h2 className="client-service-title">{s.primary_domain||s.name}</h2><small>{s.name}</small></div><p className="client-status">{s.status.replaceAll("_"," ")}</p><p className="text-sm text-neutral-400">Renews {s.next_due_date||"Not scheduled"}</p><details><summary>View hosting details →</summary><dl className="client-service-info"><div><dt>Price</dt><dd>{money(s.price_minor,s.currency)} / {s.billing_cycle.replaceAll("_"," ")}</dd></div><div><dt>Renewal invoicing</dt><dd>{s.auto_invoice?"Enabled":"Manual"}</dd></div><div><dt>Hosting controls</dt><dd>Server connection pending</dd></div><div><dt>Changes to your service</dt><dd><Link className="client-link" href="/client/tickets">Contact support for renewal, upgrade or cancellation →</Link></dd></div></dl></details></article>)}</section>;
}
