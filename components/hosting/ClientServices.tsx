import Link from "next/link";
import {packageSnapshot} from "@/lib/hosting/packageLimits";
import {PackageLimits} from "./PackageCatalog";
import type { HostingService } from "@/lib/hosting/types";
import { money } from "@/lib/hosting/validation";
export function ClientServices({services}:{services:HostingService[]}) {
 if(!services.length)return <p className="client-empty">No hosting services yet. Contact support to discuss a plan.</p>;
 return <section aria-label="Your hosting services">{services.map(s=><article key={s.id} className="client-service"><div><h2 className="client-service-title">{s.primary_domain||s.name}</h2><small>{s.name}</small></div><p className="client-status">{s.status.replaceAll("_"," ")}</p><p className="text-sm text-neutral-400">Renews {s.next_due_date||"Not scheduled"}</p><details><summary>View hosting details →</summary><dl className="client-service-info"><div><dt>Price</dt><dd>{s.package_snapshot?.pricing_ready===false?"Price not set":`${money(s.price_minor,s.currency)} / ${s.billing_cycle.replaceAll("_"," ")}`}</dd></div><div><dt>Renewal invoicing</dt><dd>{s.auto_invoice?"Enabled":"Manual"}</dd></div><div><dt>Hosting controls</dt><dd>Server connection pending</dd></div><div><dt>Changes to your service</dt><dd><Link className="client-link" href="/client/tickets">Contact support for renewal, upgrade or cancellation →</Link></dd></div></dl>{packageSnapshot.safeParse(s.package_snapshot).success&&<div className="mt-4"><PackageLimits snapshot={packageSnapshot.parse(s.package_snapshot)}/></div>}<Link className="client-link mt-4 inline-block" href="/client/plans">View plans & limits →</Link></details></article>)}</section>;
}
