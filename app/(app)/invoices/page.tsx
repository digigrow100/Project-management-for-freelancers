import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { listClients, listInvoiceItemsForInvoices, listInvoices, invoiceTotal } from "@/lib/store";
import { InvoicesPanel } from "@/components/InvoicesPanel";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "admin" && !profile.canAccessFinance)) notFound();

  const [invoices, clients] = await Promise.all([listInvoices(), listClients()]);
  const itemsByInvoice = await listInvoiceItemsForInvoices(invoices.map((i) => i.id));
  const totals: Record<string, number> = {};
  for (const invoice of invoices) totals[invoice.id] = invoiceTotal(itemsByInvoice[invoice.id] ?? []);

  return <InvoicesPanel invoices={invoices} clients={clients} totals={totals} />;
}
