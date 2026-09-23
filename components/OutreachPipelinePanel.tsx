"use client";

import { useState, useTransition } from "react";
import { Mail, Plus, Trash2, X } from "lucide-react";
import type { OutreachProspect, OutreachStatus, Profile, Task } from "@/lib/types";
import {
  createFollowUpTaskForProspectAction,
  createOutreachProspectAction,
  deleteOutreachProspectAction,
  updateOutreachProspectAction,
} from "@/lib/actions";
import { TaskRow } from "@/components/TaskRow";

const COLUMNS: { key: OutreachStatus; label: string }[] = [
  { key: "prospect_found", label: "Prospect Found" },
  { key: "contacted", label: "Contacted" },
  { key: "follow_up_1", label: "Follow Up 1" },
  { key: "follow_up_2", label: "Follow Up 2" },
  { key: "accepted", label: "Accepted" },
  { key: "article_sent", label: "Article Sent" },
  { key: "published", label: "Published" },
  { key: "live", label: "Live" },
];

export function OutreachPipelinePanel({
  projectId,
  prospects,
  tasksByProspect,
  assignableMembers,
}: {
  projectId: string;
  prospects: OutreachProspect[];
  tasksByProspect: Record<string, Task[]>;
  assignableMembers: Profile[];
}) {
  const [adding, setAdding] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mail size={16} className="text-accent-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Guest Post & Outreach</h2>
        </div>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 text-xs text-accent-400 hover:text-accent-300"
          >
            <Plus size={13} />
            New prospect
          </button>
        )}
      </div>

      {adding && <NewProspectForm projectId={projectId} onDone={() => setAdding(false)} />}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {COLUMNS.map((col) => {
          const columnProspects = prospects.filter((p) => p.status === col.key);
          return (
            <div key={col.key} className="flex flex-col gap-2 rounded-xl2 border border-base-700/60 bg-base-900/40 p-3">
              <div className="mb-1 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{col.label}</h3>
                <span className="text-[11px] text-neutral-600">{columnProspects.length}</span>
              </div>
              {columnProspects.map((prospect) => (
                <ProspectCard
                  key={prospect.id}
                  projectId={projectId}
                  prospect={prospect}
                  tasks={tasksByProspect[prospect.id] ?? []}
                  assignableMembers={assignableMembers}
                  expanded={expandedId === prospect.id}
                  onToggle={() => setExpandedId(expandedId === prospect.id ? null : prospect.id)}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NewProspectForm({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const [isPending, startTransition] = useTransition();
  return (
    <form
      action={(formData) => {
        formData.set("projectId", projectId);
        startTransition(async () => {
          await createOutreachProspectAction(formData);
          onDone();
        });
      }}
      className="flex flex-col gap-2 rounded-lg border border-base-700/60 bg-base-850 p-3"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-400">New prospect</span>
        <button type="button" onClick={onDone} className="text-neutral-500 hover:text-neutral-300">
          <X size={14} />
        </button>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          name="website"
          required
          autoFocus
          placeholder="Website"
          className="w-full rounded-md border border-base-600 bg-base-900 px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
        />
        <input
          name="contactPerson"
          placeholder="Contact person"
          className="w-full rounded-md border border-base-600 bg-base-900 px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
        />
        <input
          name="contactEmail"
          type="email"
          placeholder="Contact email"
          className="w-full rounded-md border border-base-600 bg-base-900 px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
        />
        <div className="flex gap-2">
          <input
            name="drDa"
            type="number"
            min="0"
            placeholder="DR/DA"
            className="w-full rounded-md border border-base-600 bg-base-900 px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
          />
          <input
            name="price"
            type="number"
            min="0"
            step="0.01"
            placeholder="Price"
            className="w-full rounded-md border border-base-600 bg-base-900 px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
          />
        </div>
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="w-fit rounded-md bg-accent-500 px-3 py-1.5 text-xs font-medium text-base-950 hover:bg-accent-400 disabled:opacity-60"
      >
        {isPending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

function ProspectCard({
  projectId,
  prospect,
  tasks,
  assignableMembers,
  expanded,
  onToggle,
}: {
  projectId: string;
  prospect: OutreachProspect;
  tasks: Task[];
  assignableMembers: Profile[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="rounded-lg border border-base-600 bg-base-800 p-2.5">
      <button type="button" onClick={onToggle} className="w-full text-left">
        <p className="break-words text-sm font-medium text-neutral-100">{prospect.website}</p>
        {prospect.contactPerson && <p className="mt-0.5 text-[11px] text-neutral-400">{prospect.contactPerson}</p>}
        <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-neutral-500">
          {prospect.drDa !== null && <span className="rounded-full bg-base-900 px-1.5 py-0.5">DR/DA {prospect.drDa}</span>}
          {prospect.price !== null && <span className="rounded-full bg-base-900 px-1.5 py-0.5">${prospect.price}</span>}
          {prospect.nextFollowUp && (
            <span className="rounded-full bg-base-900 px-1.5 py-0.5">Next: {prospect.nextFollowUp}</span>
          )}
        </div>
      </button>

      <div className="mt-2 flex items-center gap-1.5">
        <select
          value={prospect.status}
          disabled={isPending}
          onChange={(e) =>
            startTransition(() =>
              updateOutreachProspectAction(prospect.id, projectId, { status: e.target.value as OutreachStatus }),
            )
          }
          className="flex-1 rounded-md border border-base-600 bg-base-900 px-2 py-1 text-[11px] text-neutral-300 focus:border-accent-500 focus:outline-none"
        >
          {COLUMNS.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(() => createFollowUpTaskForProspectAction(prospect.id, projectId))}
          title="Create follow-up task"
          className="shrink-0 rounded-md p-1 text-neutral-500 hover:text-accent-300 disabled:opacity-50"
        >
          <Mail size={12} />
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(() => deleteOutreachProspectAction(prospect.id, projectId))}
          className="shrink-0 rounded-md p-1 text-neutral-500 hover:text-rose-400 disabled:opacity-50"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {expanded && (
        <div className="mt-2 flex flex-col gap-1.5 border-t border-base-700/60 pt-2">
          <div className="grid grid-cols-2 gap-1.5">
            <input
              type="date"
              defaultValue={prospect.nextFollowUp ?? ""}
              onBlur={(e) =>
                startTransition(() =>
                  updateOutreachProspectAction(prospect.id, projectId, { nextFollowUp: e.target.value || null }),
                )
              }
              title="Next follow-up"
              className="w-full rounded-md border border-base-600 bg-base-900 px-2 py-1 text-[11px] text-neutral-300 focus:border-accent-500 focus:outline-none"
            />
            <input
              defaultValue={prospect.response}
              placeholder="Response"
              onBlur={(e) =>
                e.target.value !== prospect.response &&
                startTransition(() => updateOutreachProspectAction(prospect.id, projectId, { response: e.target.value }))
              }
              className="w-full rounded-md border border-base-600 bg-base-900 px-2 py-1 text-[11px] text-neutral-300 placeholder:text-neutral-600 focus:border-accent-500 focus:outline-none"
            />
          </div>
          <p className="mt-1 text-[11px] text-neutral-500">Related tasks</p>
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} assignableMembers={assignableMembers} />
          ))}
        </div>
      )}
    </div>
  );
}
