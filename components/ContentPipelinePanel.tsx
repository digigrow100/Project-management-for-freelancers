"use client";

import { useState, useTransition } from "react";
import { FileEdit, Plus, Trash2, X } from "lucide-react";
import type { ContentItem, ContentStatus, Keyword, Profile, Task } from "@/lib/types";
import { createContentItemAction, deleteContentItemAction, updateContentItemAction } from "@/lib/actions";
import { cn } from "@/lib/utils";
import { TaskRow } from "@/components/TaskRow";
import { NewTaskForm } from "@/components/NewTaskForm";

const COLUMNS: { key: ContentStatus; label: string }[] = [
  { key: "idea", label: "Idea" },
  { key: "brief", label: "Brief" },
  { key: "writing", label: "Writing" },
  { key: "review", label: "Review" },
  { key: "published", label: "Published" },
];

export function ContentPipelinePanel({
  projectId,
  items,
  keywords,
  tasksByContentItem,
  assignableMembers,
}: {
  projectId: string;
  items: ContentItem[];
  keywords: Keyword[];
  tasksByContentItem: Record<string, Task[]>;
  assignableMembers: Profile[];
}) {
  const [adding, setAdding] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileEdit size={16} className="text-accent-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Content</h2>
        </div>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 text-xs text-accent-400 hover:text-accent-300"
          >
            <Plus size={13} />
            New content
          </button>
        )}
      </div>

      {adding && (
        <NewContentForm projectId={projectId} keywords={keywords} assignableMembers={assignableMembers} onDone={() => setAdding(false)} />
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {COLUMNS.map((col) => {
          const columnItems = items.filter((i) => i.status === col.key);
          return (
            <div key={col.key} className="flex flex-col gap-2 rounded-xl2 border border-base-700/60 bg-base-900/40 p-3">
              <div className="mb-1 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{col.label}</h3>
                <span className="text-[11px] text-neutral-600">{columnItems.length}</span>
              </div>
              {columnItems.map((item) => (
                <ContentCard
                  key={item.id}
                  projectId={projectId}
                  item={item}
                  keyword={keywords.find((k) => k.id === item.targetKeywordId) ?? null}
                  tasks={tasksByContentItem[item.id] ?? []}
                  assignableMembers={assignableMembers}
                  expanded={expandedId === item.id}
                  onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NewContentForm({
  projectId,
  keywords,
  assignableMembers,
  onDone,
}: {
  projectId: string;
  keywords: Keyword[];
  assignableMembers: Profile[];
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <form
      action={(formData) => {
        formData.set("projectId", projectId);
        startTransition(async () => {
          await createContentItemAction(formData);
          onDone();
        });
      }}
      className="flex flex-col gap-2 rounded-lg border border-base-700/60 bg-base-850 p-3"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-400">New content</span>
        <button type="button" onClick={onDone} className="text-neutral-500 hover:text-neutral-300">
          <X size={14} />
        </button>
      </div>
      <input
        name="topic"
        required
        autoFocus
        placeholder="Topic"
        className="w-full rounded-md border border-base-600 bg-base-900 px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
      />
      <div className="flex flex-wrap gap-2">
        <select
          name="targetKeywordId"
          defaultValue=""
          className="rounded-md border border-base-600 bg-base-900 px-2.5 py-1.5 text-xs text-neutral-300 focus:border-accent-500 focus:outline-none"
        >
          <option value="">No target keyword</option>
          {keywords.map((k) => (
            <option key={k.id} value={k.id}>
              {k.keyword}
            </option>
          ))}
        </select>
        <select
          name="assignedTo"
          defaultValue=""
          className="rounded-md border border-base-600 bg-base-900 px-2.5 py-1.5 text-xs text-neutral-300 focus:border-accent-500 focus:outline-none"
        >
          <option value="">Unassigned writer</option>
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
        {isPending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

function ContentCard({
  projectId,
  item,
  keyword,
  tasks,
  assignableMembers,
  expanded,
  onToggle,
}: {
  projectId: string;
  item: ContentItem;
  keyword: Keyword | null;
  tasks: Task[];
  assignableMembers: Profile[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="rounded-lg border border-base-600 bg-base-800 p-2.5">
      <button type="button" onClick={onToggle} className="w-full text-left">
        <p className="break-words text-sm font-medium text-neutral-100">{item.topic}</p>
        {keyword && <p className="mt-0.5 text-[11px] text-accent-400">{keyword.keyword}</p>}
        {item.assignedToName && <p className="mt-0.5 text-[11px] text-neutral-500">{item.assignedToName}</p>}
      </button>

      <div className="mt-2 flex items-center gap-1.5">
        <select
          value={item.status}
          disabled={isPending}
          onChange={(e) =>
            startTransition(() => updateContentItemAction(item.id, projectId, { status: e.target.value as ContentStatus }))
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
          onClick={() => startTransition(() => deleteContentItemAction(item.id, projectId))}
          className="shrink-0 rounded-md p-1 text-neutral-500 hover:text-rose-400 disabled:opacity-50"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {item.status === "published" && (
        <input
          defaultValue={item.url}
          placeholder="Published URL"
          onBlur={(e) =>
            e.target.value !== item.url && startTransition(() => updateContentItemAction(item.id, projectId, { url: e.target.value }))
          }
          className="mt-1.5 w-full rounded-md border border-base-600 bg-base-900 px-2 py-1 text-[11px] text-neutral-300 placeholder:text-neutral-600 focus:border-accent-500 focus:outline-none"
        />
      )}

      {expanded && (
        <div className="mt-2 flex flex-col gap-1.5 border-t border-base-700/60 pt-2">
          <p className="text-[11px] text-neutral-500">Related tasks</p>
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} assignableMembers={assignableMembers} />
          ))}
          <NewTaskForm
            projectId={projectId}
            stageId={null}
            assignableMembers={assignableMembers}
            seoModule="content"
            contentItemId={item.id}
          />
        </div>
      )}
    </div>
  );
}
