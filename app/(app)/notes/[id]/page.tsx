import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { getNote, getProjectsForProfile, listNoteFolders, listTeamMembers } from "@/lib/store";
import { NoteEditor } from "@/components/NoteEditor";

export const dynamic = "force-dynamic";

export default async function NoteDetailPage({ params: routeParams }: { params: Promise<{ id: string }> }) {
  const params = await routeParams;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const note = await getNote(params.id);
  if (!note) notFound();

  const isAdmin = profile.role === "admin";
  const canView = isAdmin || note.authorId === profile.id || note.assignedToUserId === profile.id;
  if (!canView) notFound();

  const canEdit = isAdmin || note.authorId === profile.id || (note.assignedToUserId === profile.id && note.editableByAssignee);

  const projects = await getProjectsForProfile(profile);
  const [folders, members] = await Promise.all([
    listNoteFolders(projects.map((p) => p.id)),
    isAdmin ? listTeamMembers() : Promise.resolve([]),
  ]);

  return (
    <NoteEditor
      note={note}
      projects={projects}
      folders={folders}
      members={members}
      isAdmin={isAdmin}
      canEdit={canEdit}
      currentUserId={profile.id}
    />
  );
}
