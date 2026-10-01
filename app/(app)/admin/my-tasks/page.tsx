import { notFound } from "next/navigation";
import { ArrowLeft, ListTodo } from "lucide-react";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { getProjects, listAdminWorkItems } from "@/lib/store";
import { AdminMyTasksPanel } from "@/components/AdminMyTasksPanel";

export const dynamic = "force-dynamic";

export default async function AdminMyTasksPage() {
  const profile = await getCurrentProfile();
  if (profile?.role !== "admin") notFound();

  const [items, projects] = await Promise.all([
    listAdminWorkItems(profile.id, true),
    getProjects(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/admin" className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-300">
            <ArrowLeft size={13} /> Back to Admin
          </Link>
          <div className="mt-3 flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-500/10 text-accent-300">
              <ListTodo size={19} />
            </span>
            <div>
              <h1 className="text-2xl font-semibold text-neutral-50">My Tasks</h1>
              <p className="mt-1 text-sm text-neutral-500">
                Personal admin work and High Priority requests sent by the team.
              </p>
            </div>
          </div>
        </div>
      </div>

      <AdminMyTasksPanel items={items} projects={projects} />
    </div>
  );
}
