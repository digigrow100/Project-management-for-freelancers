import Link from "next/link";
import { requireHostingClient } from "@/lib/hosting/auth";
import { PageTitle } from "@/components/hosting/ui";
export default async function ClientAccount(){
 const {client}=await requireHostingClient();
 return <div><PageTitle title="Your account" description="Your contact and billing details."/><dl className="client-profile">{[["Full name",client.name],["Email",client.email],["Account status",client.status]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||"Not provided"}</dd></div>)}</dl><section className="mt-12 border-t border-base-700 pt-6"><h2 className="font-medium">Need to update your details?</h2><p className="mt-3 text-sm text-neutral-400">Contact support to request a change to your contact details or account access.</p><Link href="/client/tickets" className="client-link mt-4 inline-block">Contact support →</Link></section></div>;
}
