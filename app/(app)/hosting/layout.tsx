import { notFound } from "next/navigation";
import { requireHostingAdmin } from "@/lib/hosting/auth";
export default async function HostingLayout({ children }: { children: React.ReactNode }) {
  try { await requireHostingAdmin(); } catch { notFound(); }
  return <>{children}</>;
}
