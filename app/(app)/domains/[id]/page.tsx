import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { getDomain, listDomainClients, listDomainDnsRecords } from "@/lib/store";
import { DomainDetailPanel } from "@/components/DomainDetailPanel";

export const dynamic = "force-dynamic";

export default async function DomainDetailPage({ params: routeParams }: { params: Promise<{ id: string }> }) {
  const params = await routeParams;
  const profile = await getCurrentProfile();
  if (profile?.role !== "admin") notFound();

  const domain = await getDomain(params.id);
  if (!domain) notFound();

  const [dnsRecords, domainClients] = await Promise.all([listDomainDnsRecords(domain.id), listDomainClients()]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-50">{domain.name}</h1>
        <p className="mt-1 text-sm text-neutral-500">Manage this domain&rsquo;s inventory details, DNS, and lock status.</p>
      </div>

      <DomainDetailPanel domain={domain} dnsRecords={dnsRecords} domainClients={domainClients} />
    </div>
  );
}
