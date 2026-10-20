import Link from "next/link";
import { notFound } from "next/navigation";
import { HOSTING_SECTIONS } from "@/lib/hostingWorkspace";

export default function HostingSectionPage({ params }: { params: { section: string } }) {
  const section = HOSTING_SECTIONS.find(({ key }) => key === params.section);
  if (!section) notFound();

  return (
    <div className="space-y-6">
      <header>
        <Link href="/hosting" className="text-xs text-accent-400 hover:underline">Hosting overview</Link>
        <h1 className="mt-3 text-2xl font-semibold text-neutral-100">{section.label}</h1>
        <p className="mt-2 text-sm text-neutral-400">{section.description}</p>
      </header>
      <section className="rounded-xl border border-base-700/60 bg-base-850 p-6">
        <h2 className="font-medium text-neutral-100">Not configured yet</h2>
        <p className="mt-2 max-w-xl text-sm text-neutral-400">
          This section is ready for hosting setup. No hosting records or server controls have been connected yet.
          Existing clients, invoices and team settings are still available in Team Management.
        </p>
      </section>
    </div>
  );
}
