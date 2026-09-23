import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import {
  listApprovedSeoReportsForClient,
  listClients,
  listClientServices,
  listInvoiceItemsForInvoices,
  listInvoices,
  invoiceTotal,
} from "@/lib/store";
import type { ClientService, SeoReport } from "@/lib/types";
import { InvoicesPanel } from "@/components/InvoicesPanel";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "admin" && !profile.canAccessFinance)) notFound();

  const [invoices, clients] = await Promise.all([listInvoices(), listClients()]);
  const itemsByInvoice = await listInvoiceItemsForInvoices(invoices.map((i) => i.id));
  const totals: Record<string, number> = {};
  for (const invoice of invoices) totals[invoice.id] = invoiceTotal(itemsByInvoice[invoice.id] ?? []);

  const clientServicesByClient: Record<string, ClientService[]> = {};
  const seoReportsByClient: Record<string, SeoReport[]> = {};
  await Promise.all(
    clients.map(async (client) => {
      const [services, reports] = await Promise.all([
        listClientServices(client.id),
        listApprovedSeoReportsForClient(client.id),
      ]);
      clientServicesByClient[client.id] = services.filter((s) => s.status === "active");
      seoReportsByClient[client.id] = reports;
    }),
  );

  return (
    <InvoicesPanel
      invoices={invoices}
      clients={clients}
      totals={totals}
      clientServicesByClient={clientServicesByClient}
      seoReportsByClient={seoReportsByClient}
    />
  );
}
