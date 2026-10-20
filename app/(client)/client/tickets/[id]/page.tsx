import { clientTicket } from "@/lib/hosting/store";
import { TicketView } from "@/components/hosting/TicketView";
import { Notice } from "@/components/hosting/ui";
export default async function ClientTicketPage({params,searchParams}:{params:{id:string};searchParams:{error?:string;saved?:string}}) {const data=await clientTicket(params.id);return <div className="space-y-4"><Notice {...searchParams}/><TicketView data={data} client/></div>;}
