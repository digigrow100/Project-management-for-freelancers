"use client";

import { useState } from "react";
import type { Profile, Project, Task } from "@/lib/types";
import { TaskRow } from "./TaskRow";
import { NewTaskForm } from "./NewTaskForm";
import { ProgressBar } from "./ProgressBar";
import { AddStageForm } from "./AddStageForm";

export function SeoStageTabs({
  project,
  tasks,
  assignableMembers = [],
}: {
  project: Project;
  tasks: Task[];
  assignableMembers?: Profile[];
}) {
  const stages = [...project.stages].sort((a, b) => a.order - b.order);
  const [activeId, setActiveId] = useState(stages[0]?.id ?? "");

  const byStage = new Map<string, Task[]>();
  for (const task of tasks) {
    if (!task.stageId) continue;
    const list = byStage.get(task.stageId) ?? [];
    list.push(task);
    byStage.set(task.stageId, list);
  }

  const sortTasks = (list: Task[]) =>
    [...list].sort((a, b) => {
      if (a.status !== b.status) return a.status === "done" ? 1 : -1;
      return a.order - b.order;
    });

  const activeStage = stages.find((s) => s.id === activeId) ?? stages[0];
  const activeTasks = activeStage ? sortTasks(byStage.get(activeStage.id) ?? []) : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {stages.map((stage) => {
          const stageTasks = byStage.get(stage.id) ?? [];
          const done = stageTasks.filter((t) => t.status === "done").length;
          const isActive = stage.id === activeStage?.id;
          return (
            <button
              key={stage.id}
              onClick={() => setActiveId(stage.id)}
              className={
                isActive
                  ? "rounded-lg bg-accent-500/15 px-3 py-2 text-sm font-medium text-accent-300 shadow-glow"
                  : "rounded-lg px-3 py-2 text-sm text-neutral-400 hover:bg-base-800 hover:text-neutral-200"
              }
            >
              {stage.name}
              <span className="ml-1.5 text-[11px] text-neutral-500">
                {done}/{stageTasks.length}
              </span>
            </button>
          );
        })}
        <div className="ml-auto">
          <AddStageForm projectId={project.id} />
        </div>
      </div>

      {activeStage && (
        <div className="rounded-xl2 border border-base-700/60 bg-base-900/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-neutral-200">{activeStage.name}</h3>
            <span className="text-xs text-neutral-500">
              {activeTasks.filter((t) => t.status === "done").length}/{activeTasks.length} done
            </span>
          </div>
          <ProgressBar
            done={activeTasks.filter((t) => t.status === "done").length}
            total={activeTasks.length}
            color={project.color}
            className="mb-4"
          />
          <div className="flex flex-col gap-2">
            {activeTasks.map((task) => (
              <TaskRow key={task.id} task={task} stages={stages} assignableMembers={assignableMembers} />
            ))}
            <NewTaskForm projectId={project.id} stageId={activeStage.id} assignableMembers={assignableMembers} />
          </div>
        </div>
      )}
    </div>
  );
}
