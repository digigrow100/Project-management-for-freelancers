import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { getProjectsForProfile, listNoteFolders, listNotes, markSectionSeen } from "@/lib/store";
import { NotesPanel } from "@/components/NotesPanel";

export const dynamic = "force-dynamic";

export default async function NotesPage({
  searchParams: queryParams,
}: {
  searchParams: Promise<{ project?: string; folder?: string }>;
}) {
  const searchParams = await queryParams;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const isAdmin = profile.role === "admin";
  const projects = await getProjectsForProfile(profile);
  const [notes, folders] = await Promise.all([listNotes(profile.id, isAdmin), listNoteFolders(projects.map((p) => p.id))]);
  await markSectionSeen(profile.id, "notes");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-50">Notes</h1>
        <p className="mt-1 text-sm text-neutral-500">
          A shared docs space for the team — write articles, tables, and plans right here instead of a separate
          doc tool. Organized by project, with folders for anything that needs more structure.
        </p>
      </div>

      <NotesPanel
        notes={notes}
        folders={folders}
        projects={projects}
        currentUserId={profile.id}
        isAdmin={isAdmin}
        initialProjectId={searchParams.project ?? null}
        initialFolderId={searchParams.folder ?? null}
      />
    </div>
  );
}
