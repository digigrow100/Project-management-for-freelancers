import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { canAccessHosting } from "@/lib/hostingWorkspace";

export default async function HostingLayout({ children }: { children: React.ReactNode }) {
  // Check effective permissions, including when an admin is viewing as a member.
  if (!canAccessHosting(await getCurrentProfile())) notFound();
  return <>{children}</>;
}
