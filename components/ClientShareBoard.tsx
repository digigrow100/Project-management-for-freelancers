"use client";

import { useRef, useTransition } from "react";
import { Paperclip, Download, FileText } from "lucide-react";
import type { Stage, Task } from "@/lib/types";
import { addClientTaskFileAction, createClientTaskAction } from "@/lib/actions";
import { PriorityBadge } from "./Badges";
import { cn, formatFileSize } from "@/lib/utils";

const STATUS_STYLES: Record<Task["status"], string> = {
  todo: "bg-base-700/60 text-neutral-300",
  in_progress: "bg-sky-500/15 text-sky-400",
  done: "bg-accent-500/15 text-accent-300",
};

const STATUS_LABELS: Record<Task["status"], string> = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
};

type SharedTask = Pick<Task, "id" | "stageId" | "title" | "status" | "priority" | "notes" | "checklist" | "files">;

export function ClientShareBoard({
  stages: projectStages,
  tasks,
  shareToken,
}: {
  stages: Stage[];
  tasks: SharedTask[];
  shareToken: string;
}) {
  const stages = [...projectStages].sort((a, b) => a.order - b.order);
  const byStage = new Map<string, SharedTask[]>();
  const unstaged: SharedTask[] = [];
  for (const task of tasks) {
    if (!task.stageId) {
      unstaged.push(task);
      continue;
    }
    const list = byStage.get(task.stageId) ?? [];
    list.push(task);
    byStage.set(task.stageId, list);
  }

  return (
    <div className="flex flex-col gap-6">
      {stages.map((stage) => {
        const stageTasks = byStage.get(stage.id) ?? [];
        return (
          <div key={stage.id}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-400">{stage.name}</h2>
            <div className="flex flex-col gap-2">
              {stageTasks.length === 0 ? (
                <p className="rounded-lg border border-dashed border-base-700 p-3 text-xs text-neutral-500">
                  No tasks yet.
                </p>
              ) : (
                stageTasks.map((task) => <ClientTaskCard key={task.id} task={task} shareToken={shareToken} />)
              )}
            </div>
          </div>
        );
      })}

      {unstaged.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-400">Other</h2>
          <div className="flex flex-col gap-2">
            {unstaged.map((task) => (
              <ClientTaskCard key={task.id} task={task} shareToken={shareToken} />
            ))}
          </div>
        </div>
      )}

      <NewClientTaskForm shareToken={shareToken} stages={stages} />
    </div>
  );
}

function ClientTaskCard({ task, shareToken }: { task: SharedTask; shareToken: string }) {
  const [isPending, startTransition] = useTransition();

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    if (selected.length === 0) return;
    startTransition(async () => {
      for (const file of selected) {
        const formData = new FormData();
        formData.set("shareToken", shareToken);
        formData.set("taskId", task.id);
        formData.set("file", file);
        await addClientTaskFileAction(formData);
      }
    });
    e.target.value = "";
  }

  return (
    <div className="rounded-lg border border-base-700/50 bg-base-850/60 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className={cn("text-sm text-neutral-100", task.status === "done" && "text-neutral-500 line-through")}>
          {task.title}
        </p>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px]", STATUS_STYLES[task.status])}>
          {STATUS_LABELS[task.status]}
        </span>
      </div>

      <div className="mt-1.5 flex items-center gap-1.5">
        <PriorityBadge priority={task.priority} />
      </div>

      {task.notes && <p className="mt-1.5 text-xs text-neutral-500">{task.notes}</p>}

      {task.checklist.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {task.checklist.map((item) => (
            <li
              key={item.id}
              className={cn("text-xs", item.done ? "text-neutral-500 line-through" : "text-neutral-300")}
            >
              {item.done ? "☑" : "☐"} {item.text}
            </li>
          ))}
        </ul>
      )}

      {task.files.length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5">
          {task.files.map((file) => (
            <div
              key={file.url}
              className="flex items-center gap-2 rounded-md border border-base-600 bg-base-900 px-2.5 py-1.5"
            >
              <FileText size={13} className="shrink-0 text-neutral-500" />
              <span className="min-w-0 flex-1 truncate text-xs text-neutral-200">{file.name}</span>
              {file.size > 0 && (
                <span className="shrink-0 text-[11px] text-neutral-500">{formatFileSize(file.size)}</span>
              )}
              <a
                href={file.url}
                download={file.name}
                target="_blank"
                rel="noreferrer"
                title="Download"
                className="shrink-0 rounded-md p-1 text-neutral-400 hover:text-accent-300"
              >
                <Download size={13} />
              </a>
            </div>
          ))}
        </div>
      )}

      <label className="mt-2 flex w-fit cursor-pointer items-center gap-1.5 text-xs text-accent-400 hover:text-accent-300">
        <Paperclip size={13} />
        {isPending ? "Uploading…" : "Add files"}
        <input type="file" multiple onChange={handleFile} disabled={isPending} className="hidden" />
      </label>
    </div>
  );
}

function NewClientTaskForm({ shareToken, stages }: { shareToken: string; stages: Stage[] }) {
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={(formData) => {
        formData.set("shareToken", shareToken);
        startTransition(async () => {
          await createClientTaskAction(formData);
          formRef.current?.reset();
        });
      }}
      className="flex flex-col gap-2 rounded-lg border border-dashed border-base-600 p-4"
    >
      <p className="text-sm font-medium text-neutral-300">Add a task</p>
      <input
        name="title"
        required
        placeholder="What do you need?"
        className="w-full rounded-md border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
      />
      <textarea
        name="notes"
        rows={2}
        placeholder="Any details (optional)"
        className="w-full rounded-md border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
      />
      <div className="flex flex-wrap items-center gap-3">
        {stages.length > 0 && (
          <select
            name="stageId"
            className="rounded-md border border-base-600 bg-base-900 px-2 py-1.5 text-xs text-neutral-300 focus:border-accent-500 focus:outline-none"
          >
            <option value="">No stage</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-neutral-400">
          <Paperclip size={13} />
          Attach files
          <input type="file" name="attachmentFile" multiple className="hidden" />
        </label>
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="mt-1 w-fit rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-base-950 hover:bg-accent-400 disabled:opacity-60"
      >
        {isPending ? "Adding…" : "Add task"}
      </button>
    </form>
  );
}
