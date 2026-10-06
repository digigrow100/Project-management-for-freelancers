import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock3 } from "lucide-react";
import { getCurrentProfile } from "@/lib/auth";
import { getAdminTimeTrackingEntries } from "@/lib/store";
import { AdminTimeTracking } from "@/components/AdminTimeTracking";

export const dynamic = "force-dynamic";

export default async function AdminTimeTrackingPage() {
  const profile = await getCurrentProfile();
  if (profile?.role !== "admin") notFound();

  const entries = await getAdminTimeTrackingEntries();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <Clock3 size={14} className="text-accent-400" />
            Admin · Time Tracking
          </div>
          <h1 className="mt-2 text-2xl font-semibold text-neutral-50">Team Work Reports</h1>
          <p className="mt-1 max-w-3xl text-sm text-neutral-500">
            Review daily, weekly, monthly or custom-range work time, project allocation, task outcomes and the full session timeline.
          </p>
        </div>
        <Link href="/admin" className="flex items-center gap-1.5 rounded-lg border border-base-700 bg-base-850 px-3 py-2 text-xs text-neutral-400 hover:text-neutral-200">
          <ArrowLeft size={13} />
          Admin team
        </Link>
      </div>

      <AdminTimeTracking entries={entries} />
    </div>
  );
}
