import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, BarChart3, ExternalLink, FileText, PanelsTopLeft } from "lucide-react";
import { getCurrentProfile } from "@/lib/auth";
import { getProjectsForProfile, listProjectPages } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function SeoPagesIndexPage() {
  const profile = await getCurrentProfile();
  if (!profile) notFound();

  const projects = (await getProjectsForProfile(profile))
    .filter((project) => project.type === "seo" && !project.archived)
    .sort((a, b) => a.name.localeCompare(b.name));

  const pageLists = await Promise.all(projects.map((project) => listProjectPages(project.id)));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-2">
          <PanelsTopLeft size={20} className="text-accent-400" />
          <h1 className="text-2xl font-semibold text-neutral-50">SEO Website Pages</h1>
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          Open the Website Pages checklist or reports for any active SEO project from one place.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {projects.map((project, index) => {
          const pages = pageLists[index] ?? [];
          return (
            <div key={project.id} className="rounded-xl2 border border-base-700/60 bg-base-850 p-4 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-neutral-100">{project.name}</h2>
                  <p className="mt-1 text-xs text-neutral-500">{pages.length} website pages tracked</p>
                </div>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-sky-500/10 text-sky-300">
                  <FileText size={17} />
                </span>
              </div>

              {project.websiteUrl && (
                <a
                  href={project.websiteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 flex items-center gap-1.5 truncate text-xs text-neutral-500 hover:text-neutral-300"
                >
                  <ExternalLink size={12} />
                  <span className="truncate">{project.websiteUrl}</span>
                </a>
              )}

              <div className="mt-4 grid grid-cols-2 gap-2">
                <Link
                  href={`/projects/${project.id}?seoTab=pages`}
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-accent-500 px-3 py-2 text-xs font-semibold text-base-950 hover:bg-accent-400"
                >
                  Website Pages <ArrowRight size={12} />
                </Link>
                <Link
                  href={`/projects/${project.id}?seoTab=reporting`}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-base-600 bg-base-900 px-3 py-2 text-xs font-medium text-neutral-300 hover:border-violet-500/50 hover:text-violet-300"
                >
                  <BarChart3 size={13} />
                  Reports
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      {projects.length === 0 && (
        <div className="rounded-xl border border-dashed border-base-700 p-10 text-center text-sm text-neutral-500">
          No active SEO projects are available for this account.
        </div>
      )}
    </div>
  );
}
