import { notFound, unstable_rethrow } from "next/navigation";
import { requireHostingAdmin } from "@/lib/hosting/auth";
export const metadata = {title:"Hosting | House My Site"};
export default async function HostingLayout({ children }: { children: React.ReactNode }) {
  try { await requireHostingAdmin(); } catch(error) { unstable_rethrow(error);notFound(); }
  return <>{children}</>;
}

