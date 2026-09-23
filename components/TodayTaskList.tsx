"use client";

import type { Profile, Project, Task } from "@/lib/types";
import { TaskRow } from "./TaskRow";

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Filters to the browser's own local "today" rather than the server's, so
 * it's never a day off near midnight. Includes anything scheduled for today
 * or earlier — an overdue task doesn't just vanish, it rolls forward until
 * it's done.
 */
export function TodayTaskList({
  tasks,
  projects,
  assignableMembers = [],
}: {
  tasks: Task[];
  projects: Project[];
  assignableMembers?: Profile[];
}) {
  const today = todayKey();
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const todayTasks = tasks.filter((t) => t.scheduledFor && t.scheduledFor <= today);

  if (todayTasks.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-base-700 p-8 text-center text-sm text-neutral-500">
        Nothing scheduled for today yet. Go to a project and star a task, or set it from the task details.
      </p>
    );
  }

  const overdueCount = todayTasks.filter((t) => t.scheduledFor !== today).length;
  const dueTodayCount = todayTasks.length - overdueCount;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400">
        <span className="rounded-full border border-base-600 px-2.5 py-1">{dueTodayCount} due today</span>
        {overdueCount > 0 && (
          <span className="rounded-full border border-rose-500/50 px-2.5 py-1 text-rose-400">
            {overdueCount} overdue
          </span>
        )}
      </div>
      {todayTasks.map((task) => {
        const project = projectById.get(task.projectId);
        const stageName = project?.stages.find((s) => s.id === task.stageId)?.name ?? null;
        return (
          <TaskRow
            key={task.id}
            task={task}
            stageName={stageName}
            stages={project?.stages ?? []}
            showProject
            projectName={project?.name}
            assignableMembers={assignableMembers}
          />
        );
      })}
    </div>
  );
}
