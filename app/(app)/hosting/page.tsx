import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { HOSTING_SECTIONS } from "@/lib/hostingWorkspace";

export default function HostingOverviewPage() {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-wider text-accent-400">HouseMySite</p>
        <h1 className="mt-2 text-2xl font-semibold text-neutral-100">Hosting</h1>
        <p className="mt-2 text-sm text-neutral-400">Your workspace for hosting services, servers and billing.</p>
      </header>
      <div className="rounded-xl border border-base-700/60 bg-base-850 p-4 text-sm text-neutral-400">
        Hosting management is being set up. Server connections, hosting plans and client access are not configured here yet.
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {HOSTING_SECTIONS.map(({ key, label, description }) => (
          <Link key={key} href={`/hosting/${key}`} prefetch={false}
            className="group rounded-xl border border-base-700/60 bg-base-850 p-5 transition-colors hover:border-accent-500/50">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-medium text-neutral-100">{label}</h2>
              <ArrowUpRight size={16} aria-hidden="true" className="text-neutral-500 group-hover:text-accent-400" />
            </div>
            <p className="mt-2 text-sm text-neutral-400">{description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
