"use client";

import { useMemo, useTransition } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Globe2,
  ListTodo,
  Plus,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import type { AdminWorkItem, Project, TaskPriority } from "@/lib/types";
import {
  completeAdminWorkItemAction,
  createAdminPersonalTaskAction,
  snoozeAdminWorkItemAction,
} from "@/lib/actions";
import { cn } from "@/lib/utils";

const priorityClass: Record<TaskPriority, string> = {
  high: "bg-rose-500/12 text-rose-300",
  medium: "bg-amber-500/12 text-amber-300",
  low: "bg-base-700 text-neutral-400",
};

export function AdminMyTasksPanel({
  items,
  projects,
}: {
  items: AdminWorkItem[];
  projects: Project[];
}) {
  const [isPending, startTransition] = useTransition();
  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const pending = items.filter((item) => item.status === "pending");
  const done = items.filter((item) => item.status === "done");

  return (
    <div className={cn("space-y-5", isPending && "opacity-80")}>
      <section className="rounded-xl2 border border-base-700/60 bg-base-850 p-4 shadow-card">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-500/10 text-accent-300">
            <Plus size={18} />
          </span>
          <div>
            <h2 className="text-base font-semibold text-neutral-100">Add My Task</h2>
            <p className="mt-1 text-xs text-neutral-500">
              Quick personal admin task. Team requests are added here automatically as High Priority.
            </p>
          </div>
        </div>

        <form
          action={(formData) => {
            startTransition(async () => {
              await createAdminPersonalTaskAction(formData);
            });
          }}
          className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_150px_160px_auto]"
        >
          <div className="lg:col-span-1">
            <input
              name="title"
              required
              placeholder="Task title"
              className="w-full rounded-lg border border-base-700 bg-base-950 px-3 py-2.5 text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-accent-500/60"
            />
          </div>
          <select
            name="priority"
            defaultValue="medium"
            className="rounded-lg border border-base-700 bg-base-950 px-3 py-2.5 text-sm text-neutral-100 outline-none"
          >
            <option value="high">High Priority</option>
            <option value="medium">Medium Priority</option>
            <option value="low">Low Priority</option>
          </select>
          <input
            name="dueDate"
            type="date"
            className="rounded-lg border border-base-700 bg-base-950 px-3 py-2.5 text-sm text-neutral-100 outline-none"
          />
          <button
            type="submit"
            className="rounded-lg bg-accent-500 px-4 py-2.5 text-sm font-semibold text-base-950 hover:bg-accent-400"
          >
            Add Task
          </button>
          <textarea
            name="details"
            rows={3}
            placeholder="Short details (optional)"
            className="lg:col-span-4 w-full resize-y rounded-lg border border-base-700 bg-base-950 px-3 py-2.5 text-sm text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-accent-500/60"
          />
        </form>
      </section>

      <section className="rounded-xl2 border border-base-700/60 bg-base-850 shadow-card">
        <div className="flex items-center justify-between gap-3 border-b border-base-700/60 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-neutral-100">Open Tasks</h2>
            <p className="mt-0.5 text-[11px] text-neutral-600">{pending.length} pending</p>
          </div>
          <span className="rounded-full bg-accent-500/10 px-2.5 py-1 text-xs font-semibold text-accent-300">
            {pending.length}
          </span>
        </div>

        <div className="divide-y divide-base-700/50">
          {pending.map((item) => (
            <div key={item.id} className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_160px_220px] lg:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn(
                    "grid h-7 w-7 place-items-center rounded-lg",
                    item.source === "team_request"
                      ? "bg-rose-500/10 text-rose-300"
                      : item.source === "domain_expiry"
                        ? "bg-amber-500/10 text-amber-300"
                        : "bg-accent-500/10 text-accent-300",
                  )}>
                    {item.source === "team_request"
                      ? <ShieldAlert size={14} />
                      : item.source === "domain_expiry"
                        ? <Globe2 size={14} />
                        : <UserRound size={14} />}
                  </span>
                  <p className="min-w-0 truncate text-sm font-semibold text-neutral-100">{item.title}</p>
                  <span className={cn("rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase", priorityClass[item.priority])}>
                    {item.priority}
                  </span>
                  {item.source === "team_request" && (
                    <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase text-rose-300">
                      Team Request
                    </span>
                  )}
                  {item.source === "domain_expiry" && (
                    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase text-amber-300">
                      Domain Expiry
                    </span>
                  )}
                </div>

                <p className="mt-2 line-clamp-2 text-xs leading-5 text-neutral-500">
                  {item.source === "team_request"
                    ? item.sentNote || item.details || "Admin action required."
                    : item.details || "No extra details."}
                </p>

                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-neutral-600">
                  {item.projectId && <span>{projectById.get(item.projectId)?.name ?? "Project"}</span>}
                  {item.sentByName && <span>From: {item.sentByName}</span>}
                  {item.dueDate && <span>Due: {item.dueDate}</span>}
                  {item.snoozedUntil && <span>Snoozed until {new Date(item.snoozedUntil).toLocaleTimeString()}</span>}
                  {item.resumeMode === "after_next_task" && <span>Returns after next task</span>}
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-neutral-500">
                <CalendarDays size={13} />
                <span>{item.dueDate ?? "No due date"}</span>
              </div>

              <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => startTransition(() => completeAdminWorkItemAction(item.id))}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-base-950 hover:bg-emerald-400"
                >
                  <CheckCircle2 size={14} />
                  {item.source === "team_request" ? "Done & Return" : "Done"}
                </button>
                <button
                  type="button"
                  onClick={() => startTransition(() => snoozeAdminWorkItemAction(item.id, "30m"))}
                  className="rounded-lg border border-base-600 px-2.5 py-2 text-[10px] text-neutral-400 hover:text-neutral-200"
                >
                  30m
                </button>
                <button
                  type="button"
                  onClick={() => startTransition(() => snoozeAdminWorkItemAction(item.id, "1h"))}
                  className="rounded-lg border border-base-600 px-2.5 py-2 text-[10px] text-neutral-400 hover:text-neutral-200"
                >
                  1h
                </button>
              </div>
            </div>
          ))}
          {pending.length === 0 && (
            <div className="px-4 py-10 text-center">
              <ListTodo size={28} className="mx-auto text-neutral-700" />
              <p className="mt-2 text-sm text-neutral-500">No open admin tasks.</p>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-xl2 border border-base-700/60 bg-base-850 shadow-card">
        <div className="flex items-center gap-2 border-b border-base-700/60 px-4 py-3">
          <Clock3 size={15} className="text-neutral-500" />
          <h2 className="text-sm font-semibold text-neutral-100">Recently Done</h2>
        </div>
        <div className="divide-y divide-base-700/50">
          {done.slice(0, 20).map((item) => (
            <div key={item.id} className="flex items-center gap-3 px-4 py-3">
              <CheckCircle2 size={15} className="shrink-0 text-emerald-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-neutral-300">{item.title}</p>
                <p className="mt-0.5 text-[10px] text-neutral-600">
                  {item.source === "team_request"
                    ? "Team request resolved"
                    : item.source === "domain_expiry"
                      ? "Domain reminder completed"
                      : "Personal task"} · {item.completedAt ? new Date(item.completedAt).toLocaleString() : "Done"}
                </p>
              </div>
            </div>
          ))}
          {done.length === 0 && <p className="px-4 py-6 text-center text-xs text-neutral-600">Nothing completed yet.</p>}
        </div>
      </section>
    </div>
  );
}
