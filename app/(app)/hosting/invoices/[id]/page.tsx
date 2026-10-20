import { adminInvoice } from "@/lib/hosting/store";
import { InvoiceView } from "@/components/hosting/InvoiceView";
import { Notice } from "@/components/hosting/ui";
export default async function InvoicePage({params,searchParams}:{params:{id:string};searchParams:{error?:string;saved?:string}}) {const data=await adminInvoice(params.id);return <div className="space-y-4"><Notice {...searchParams}/><InvoiceView data={data}/></div>;}
