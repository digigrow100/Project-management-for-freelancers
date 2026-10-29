import { isRedirectError } from "next/dist/client/components/redirect";
import { notFound } from "next/navigation";
import { requireHostingAdmin } from "@/lib/hosting/auth";
export const metadata = {title:"Hosting | House My Site"};
export default async function HostingLayout({ children }: { children: React.ReactNode }) {
  try { await requireHostingAdmin(); } catch(error) { if(isRedirectError(error))throw error;notFound(); }
  return <>{children}</>;
}

