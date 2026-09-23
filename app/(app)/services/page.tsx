import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { listServices } from "@/lib/store";
import { ServicesPanel } from "@/components/ServicesPanel";

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const profile = await getCurrentProfile();
  if (profile?.role !== "admin") notFound();

  const services = await listServices();

  return <ServicesPanel services={services} />;
}
