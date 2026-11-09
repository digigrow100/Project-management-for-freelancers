import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { ScreenShareViewer } from "@/components/ScreenShareViewer";

export const dynamic = "force-dynamic";

export default async function ScreenSharePage({ params: routeParams }: { params: Promise<{ sessionId: string }> }) {
  const params = await routeParams;
  const profile = await getCurrentProfile();
  if (profile?.role !== "admin") notFound();
  return <ScreenShareViewer sessionId={params.sessionId} />;
}
