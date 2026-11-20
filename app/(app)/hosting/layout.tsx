import Link from "next/link";
import {pendingWebsitePayments} from "@/lib/hosting/websites/store";
import "@/components/hosting/dashboard/dashboard.css";
import "@/components/hosting/dashboard/website.css";
import { notFound, unstable_rethrow } from "next/navigation";
import { requireHostingAdmin } from "@/lib/hosting/auth";
export const metadata = {title:"Hosting | House My Site"};
export default async function HostingLayout({ children }: { children: React.ReactNode }) {
  try { await requireHostingAdmin(); } catch(error) { unstable_rethrow(error);notFound(); }
  const pending=await pendingWebsitePayments().catch(()=>0);
  return <>{pending>0?<Link href="/hosting/website-payments" className="website-notification" role="status">{pending} bank-transfer notices need your review →</Link>:null}{children}</>;
}

