"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Plus, Trash2, Wrench, X } from "lucide-react";
import type { Priority, Profile, TechnicalIssue, TechnicalIssueStatus } from "@/lib/types";
import {
  createFixTaskForIssueAction,
  createTechnicalIssueAction,
  deleteTechnicalIssueAction,
  updateTechnicalIssueAction,
} from "@/lib/actions";
import { cn } from "@/lib/utils";

const PRIORITY_STYLE: Record<Priority, string> = {
  low: "bg-base-700/60 text-neutral-400",
  medium: "bg-sky-500/15 text-sky-400",
  high: "bg-rose-500/15 text-rose-400",
};

const STATUS_LABEL: Record<TechnicalIssueStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  fixed: "Fixed",
};

const STATUS_STYLE: Record<TechnicalIssueStatus, string> = {
  open: "bg-rose-500/15 text-rose-400",
  in_progress: "bg-sky-500/15 text-sky-400",
  fixed: "bg-accent-500/15 text-accent-400",
};

export function TechnicalSeoPanel({
  projectId,
  issues,
  assignableMembers,
}: {
  projectId: string;
  issues: TechnicalIssue[];
  assignableMembers: Profile[];
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="rounded-xl2 border border-base-700/60 bg-base-850 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-accent-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Technical Issues</h2>
        </div>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 text-xs text-accent-400 hover:text-accent-300"
          >
            <Plus size={13} />
            New issue
          </button>
        )}
      </div>

      {adding && (
        <IssueForm
          projectId={projectId}
          assignableMembers={assignableMembers}
          onDone={() => setAdding(false)}
        />
      )}

      {issues.length === 0 && !adding && (
        <p className="rounded-lg border border-dashed border-base-700 p-6 text-center text-sm text-neutral-500">
          No technical issues logged yet.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {issues.map((issue) => (
          <IssueRow key={issue.id} projectId={projectId} issue={issue} />
        ))}
      </div>
    </div>
  );
}

function IssueForm({
  projectId,
  assignableMembers,
  onDone,
}: {
  projectId: string;
  assignableMembers: Profile[];
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <form
      action={(formData) => {
        formData.set("projectId", projectId);
        startTransition(async () => {
          await createTechnicalIssueAction(formData);
          onDone();
        });
      }}
      className="mb-3 flex flex-col gap-2 rounded-lg border border-base-700/60 bg-base-900 p-3"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-400">New issue</span>
        <button type="button" onClick={onDone} className="text-neutral-500 hover:text-neutral-300">
          <X size={14} />
        </button>
      </div>
      <input
        name="title"
        required
        autoFocus
        placeholder="Issue (e.g. duplicate meta titles on 4 pages)"
        className="w-full rounded-md border border-base-600 bg-base-950 px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
      />
      <input
        name="urlAffected"
        placeholder="URL affected (optional)"
        className="w-full rounded-md border border-base-600 bg-base-950 px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
      />
      <textarea
        name="description"
        rows={2}
        placeholder="Description (optional)"
        className="w-full rounded-md border border-base-600 bg-base-950 px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
      />
      <div className="flex flex-wrap gap-2">
        <select
          name="priority"
          defaultValue="medium"
          className="rounded-md border border-base-600 bg-base-950 px-2.5 py-1.5 text-xs text-neutral-100 focus:border-accent-500 focus:outline-none"
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        <select
          name="assignedTo"
          defaultValue=""
          className="rounded-md border border-base-600 bg-base-950 px-2.5 py-1.5 text-xs text-neutral-100 focus:border-accent-500 focus:outline-none"
        >
          <option value="">Unassigned</option>
          {assignableMembers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name || m.email}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="w-fit rounded-md bg-accent-500 px-3 py-1.5 text-xs font-medium text-base-950 hover:bg-accent-400 disabled:opacity-60"
      >
        {isPending ? "Saving…" : "Save issue"}
      </button>
    </form>
  );
}

function IssueRow({ projectId, issue }: { projectId: string; issue: TechnicalIssue }) {
  const [isPending, startTransition] = useTransition();

  function patch(fields: FormData) {
    fields.set("title", issue.title);
    fields.set("description", issue.description);
    fields.set("urlAffected", issue.urlAffected);
    fields.set("priority", issue.priority);
    fields.set("assignedTo", issue.assignedTo ?? "");
    fields.set("status", issue.status);
    startTransition(() => updateTechnicalIssueAction(issue.id, projectId, fields));
  }

  return (
    <div className="rounded-lg border border-base-600 bg-base-800 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words text-sm font-medium text-neutral-100">{issue.title}</p>
          {issue.urlAffected && <p className="mt-0.5 truncate text-xs text-neutral-500">{issue.urlAffected}</p>}
          {issue.description && <p className="mt-1 text-xs text-neutral-400">{issue.description}</p>}
          {issue.assignedToName && <p className="mt-1 text-[11px] text-neutral-500">Assigned to {issue.assignedToName}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", PRIORITY_STYLE[issue.priority])}>
            {issue.priority}
          </span>
          <select
            value={issue.status}
            disabled={isPending}
            onChange={(e) => {
              const fd = new FormData();
              fd.set("status", e.target.value);
              patch(fd);
            }}
            className={cn("rounded-full border-0 px-2 py-1 text-[11px] font-medium focus:outline-none", STATUS_STYLE[issue.status])}
          >
            {(Object.keys(STATUS_LABEL) as TechnicalIssueStatus[]).map((s) => (
              <option key={s} value={s} className="bg-base-900 text-neutral-100">
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          {!issue.fixTaskId && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => startTransition(() => createFixTaskForIssueAction(issue.id, projectId))}
              title="Create fix task"
              className="rounded-md p-1.5 text-neutral-400 hover:text-accent-300 disabled:opacity-50"
            >
              <Wrench size={13} />
            </button>
          )}
          <button
            type="button"
            disabled={isPending}
            onClick={() => startTransition(() => deleteTechnicalIssueAction(issue.id, projectId))}
            className="rounded-md p-1.5 text-neutral-400 hover:text-rose-400 disabled:opacity-50"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
