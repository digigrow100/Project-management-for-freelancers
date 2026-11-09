import { getBusinessProfile, getProjectByShareToken, getTasksByProject } from "@/lib/store";
import { PROJECT_THEME } from "@/lib/projectTheme";
import { ClientShareBoard } from "@/components/ClientShareBoard";

export const dynamic = "force-dynamic";

export default async function ShareTokenPage({ params: routeParams }: { params: Promise<{ token: string }> }) {
  const params = await routeParams;
  const project = await getProjectByShareToken(params.token);

  if (!project) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-base-950 px-4 text-center">
        <div>
          <h1 className="text-xl font-semibold text-neutral-100">This link isn&apos;t active</h1>
          <p className="mt-2 text-sm text-neutral-500">Ask whoever sent you this link for a new one.</p>
        </div>
      </div>
    );
  }

  const [tasks, businessProfile] = await Promise.all([
    getTasksByProject(project.id),
    getBusinessProfile(),
  ]);

  const sharedTasks = tasks.map(({ id, stageId, title, status, priority, notes, checklist, files }) => ({
    id, stageId, title, status, priority, notes, checklist,
    files: files.map((file) => file.url.startsWith("/api/attachments/")
      ? { ...file, url: `${file.url}?share=${encodeURIComponent(params.token)}` }
      : file),
  }));
  const theme = PROJECT_THEME[project.type];
  const Icon = theme.icon;

  return (
    <div className="min-h-screen bg-base-950 font-sans text-neutral-200 antialiased">
      <div className="mx-auto max-w-3xl px-4 py-8 md:px-8">
        <div className="mb-6 flex items-center gap-3">
          <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${theme.iconBg} ${theme.iconText}`}>
            <Icon size={20} />
          </span>
          <div>
            <h1 className="text-xl font-semibold text-neutral-50">{project.name}</h1>
            <p className="text-sm text-neutral-500">
              {businessProfile.companyName ? `Shared by ${businessProfile.companyName}` : "Project task board"}
            </p>
          </div>
        </div>

        {project.description && <p className="mb-6 text-sm text-neutral-400">{project.description}</p>}

        <ClientShareBoard stages={project.stages} tasks={sharedTasks} shareToken={params.token} />
      </div>
    </div>
  );
}
