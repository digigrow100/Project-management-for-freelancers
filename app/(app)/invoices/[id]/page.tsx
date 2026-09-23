import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import {
  getBusinessProfile,
  getClient,
  getInvoice,
  getProjectsForClient,
  getSeoReport,
  listApprovedSeoReportsForClient,
  listInvoiceItems,
  listPaymentsForInvoice,
} from "@/lib/store";
import { InvoiceDetailPanel } from "@/components/InvoiceDetailPanel";

export const dynamic = "force-dynamic";

export default async function InvoiceDetailPage({ params }: { params: { id: string } }) {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "admin" && !profile.canAccessFinance)) notFound();

  const invoice = await getInvoice(params.id);
  if (!invoice) notFound();

  const client = await getClient(invoice.clientId);
  if (!client) notFound();

  const [items, payments, projects, businessProfile, availableReports, attachedReport] = await Promise.all([
    listInvoiceItems(invoice.id),
    listPaymentsForInvoice(invoice.id),
    getProjectsForClient(client.id),
    getBusinessProfile(),
    listApprovedSeoReportsForClient(client.id),
    invoice.seoReportId ? getSeoReport(invoice.seoReportId) : Promise.resolve(null),
  ]);

  return (
    <InvoiceDetailPanel
      invoice={invoice}
      items={items}
      client={client}
      businessProfile={businessProfile}
      payments={payments}
      projects={projects}
      attachedReport={attachedReport}
      availableReports={availableReports}
    />
  );
}
