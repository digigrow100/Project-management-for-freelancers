import { clientInvoice } from "@/lib/hosting/store";
import { InvoiceView } from "@/components/hosting/InvoiceView";
import { Notice } from "@/components/hosting/ui";
export default async function ClientInvoicePage({params: routeParams,searchParams: queryParams}:{params:Promise<{id:string}>;searchParams:Promise<{error?:string;saved?:string}>}) {
  const params = await routeParams;
  const searchParams = await queryParams;
 const data=await clientInvoice(params.id);return <div className="space-y-4"><Notice {...searchParams}/><InvoiceView data={data} client readOnly={data.readOnly}/></div>;}
