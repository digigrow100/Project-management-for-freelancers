import { adminTicket } from "@/lib/hosting/store";
import { TicketView } from "@/components/hosting/TicketView";
import { Notice } from "@/components/hosting/ui";
export default async function TicketPage({params: routeParams,searchParams: queryParams}:{params:Promise<{id:string}>;searchParams:Promise<{error?:string;saved?:string}>}) {
  const params = await routeParams;
  const searchParams = await queryParams;
 const data=await adminTicket(params.id);return <div className="space-y-4"><Notice {...searchParams}/><TicketView data={data}/></div>;}
