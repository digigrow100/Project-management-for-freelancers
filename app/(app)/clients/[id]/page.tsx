import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import {
  getClient,
  getClientBalance,
  getProjectProgressMap,
  getProjectsForClient,
  listClientServices,
  listInvoicesForClient,
  listPaymentsForClient,
  listServices,
} from "@/lib/store";
import { ClientDetailPanel } from "@/components/ClientDetailPanel";

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const profile = await getCurrentProfile();
  if (profile?.role !== "admin") notFound();

  const client = await getClient(params.id);
  if (!client) notFound();

  const canViewFinance = profile.role === "admin" || profile.canAccessFinance;

  const [projects, progress, invoices, payments, clientServices, services, balance] = await Promise.all([
    getProjectsForClient(client.id),
    getProjectProgressMap(),
    canViewFinance ? listInvoicesForClient(client.id) : Promise.resolve([]),
    canViewFinance ? listPaymentsForClient(client.id) : Promise.resolve([]),
    canViewFinance ? listClientServices(client.id) : Promise.resolve([]),
    canViewFinance ? listServices() : Promise.resolve([]),
    canViewFinance ? getClientBalance(client.id) : Promise.resolve(null),
  ]);

  return (
    <ClientDetailPanel
      client={client}
      projects={projects}
      progress={progress}
      canViewFinance={canViewFinance}
      balance={balance}
      invoices={invoices}
      payments={payments}
      clientServices={clientServices}
      services={services}
    />
  );
}
