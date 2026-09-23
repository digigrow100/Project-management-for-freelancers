import type { Profile, Project, Task } from "@/lib/types";
import { TaskRow } from "./TaskRow";
import { NewTaskForm } from "./NewTaskForm";
import { ProgressBar } from "./ProgressBar";
import { AddStageForm } from "./AddStageForm";

export function StageBoard({
  project,
  tasks,
  assignableMembers = [],
}: {
  project: Project;
  tasks: Task[];
  assignableMembers?: Profile[];
}) {
  const stages = [...project.stages].sort((a, b) => a.order - b.order);
  const byStage = new Map<string, Task[]>();
  const unstaged: Task[] = [];

  for (const task of tasks) {
    if (!task.stageId) {
      unstaged.push(task);
      continue;
    }
    const list = byStage.get(task.stageId) ?? [];
    list.push(task);
    byStage.set(task.stageId, list);
  }

  const sortTasks = (list: Task[]) =>
    [...list].sort((a, b) => {
      if (a.status !== b.status) return a.status === "done" ? 1 : -1;
      return a.order - b.order;
    });

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {stages.map((stage) => {
        const stageTasks = sortTasks(byStage.get(stage.id) ?? []);
        const done = stageTasks.filter((t) => t.status === "done").length;
        return (
          <div key={stage.id} className="flex flex-col rounded-xl2 border border-base-700/60 bg-base-900/40 p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-neutral-200">{stage.name}</h3>
              <span className="text-xs text-neutral-500">
                {done}/{stageTasks.length}
              </span>
            </div>
            <ProgressBar done={done} total={stageTasks.length} color={project.color} className="mb-3" />
            <div className="flex flex-col gap-2">
              {stageTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  stageName={stage.name}
                  stages={stages}
                  assignableMembers={assignableMembers}
                />
              ))}
              <NewTaskForm projectId={project.id} stageId={stage.id} assignableMembers={assignableMembers} />
            </div>
          </div>
        );
      })}

      {unstaged.length > 0 && (
        <div className="flex flex-col rounded-xl2 border border-base-700/60 bg-base-900/40 p-3">
          <h3 className="mb-2 text-sm font-semibold text-neutral-200">No Stage</h3>
          <div className="flex flex-col gap-2">
            {sortTasks(unstaged).map((task) => (
              <TaskRow key={task.id} task={task} stages={stages} assignableMembers={assignableMembers} />
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col justify-center rounded-xl2 border border-dashed border-base-600 p-3">
        <AddStageForm projectId={project.id} />
      </div>
    </div>
  );
}
