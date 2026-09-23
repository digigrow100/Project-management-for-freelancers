"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ChevronRight, FileText, X } from "lucide-react";
import type { ChecklistItem, Keyword, KeywordGroup, KeywordPage, OnPageStatus, PageType, Profile, Task } from "@/lib/types";
import { setPrimaryKeywordForPageAction, updateKeywordPageAction } from "@/lib/actions";
import { cn } from "@/lib/utils";
import { TaskRow } from "@/components/TaskRow";
import { NewTaskForm } from "@/components/NewTaskForm";

const PAGE_TYPE_LABEL: Record<PageType, string> = {
  service: "Service",
  location: "Location",
  blog: "Blog",
  landing: "Landing",
  other: "Other",
};

const STATUS_LABEL: Record<OnPageStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  done: "Done",
};

const STATUS_STYLE: Record<OnPageStatus, string> = {
  not_started: "bg-base-700/60 text-neutral-400",
  in_progress: "bg-sky-500/15 text-sky-400",
  done: "bg-accent-500/15 text-accent-400",
};

const STATUS_FIELDS: { key: "contentStatus" | "internalLinkingStatus" | "imageSeoStatus" | "schemaStatus"; label: string }[] = [
  { key: "contentStatus", label: "Content" },
  { key: "internalLinkingStatus", label: "Internal linking" },
  { key: "imageSeoStatus", label: "Image SEO" },
  { key: "schemaStatus", label: "Schema" },
];

export function OnPageSeoPanel({
  projectId,
  groups,
  pagesByGroup,
  keywords,
  tasksByPage,
  assignableMembers,
}: {
  projectId: string;
  groups: KeywordGroup[];
  pagesByGroup: Record<string, KeywordPage[]>;
  keywords: Keyword[];
  tasksByPage: Record<string, Task[]>;
  assignableMembers: Profile[];
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const allPages = Object.values(pagesByGroup).flat();

  if (allPages.length === 0) {
    return (
      <div className="rounded-xl2 border border-dashed border-base-700 p-8 text-center text-sm text-neutral-500">
        No pages yet. Create a Page inside a Keyword Group (Keywords tab) to start its on-page SEO workspace.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => {
        const pages = pagesByGroup[group.id] ?? [];
        if (pages.length === 0) return null;
        return (
          <section key={group.id}>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              <FileText size={13} />
              {group.name}
            </h3>
            <div className="flex flex-col gap-2">
              {pages.map((page) => (
                <PageCard
                  key={page.id}
                  projectId={projectId}
                  page={page}
                  keywords={keywords.filter((k) => k.pageIds.includes(page.id))}
                  tasks={tasksByPage[page.id] ?? []}
                  assignableMembers={assignableMembers}
                  expanded={expandedId === page.id}
                  onToggle={() => setExpandedId(expandedId === page.id ? null : page.id)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function PageCard({
  projectId,
  page,
  keywords,
  tasks,
  assignableMembers,
  expanded,
  onToggle,
}: {
  projectId: string;
  page: KeywordPage;
  keywords: Keyword[];
  tasks: Task[];
  assignableMembers: Profile[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [checklist, setChecklist] = useState<ChecklistItem[]>(page.checklist);
  const primaryKeyword = keywords.find((k) => k.id === page.primaryKeywordId) ?? null;
  const secondaryKeywords = keywords.filter((k) => k.id !== page.primaryKeywordId);

  function patch(fields: Parameters<typeof updateKeywordPageAction>[2]) {
    startTransition(() => updateKeywordPageAction(page.id, projectId, fields));
  }

  function saveChecklist() {
    startTransition(() => updateKeywordPageAction(page.id, projectId, { checklist }));
  }

  return (
    <div className="rounded-xl2 border border-base-700/60 bg-base-850">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full flex-wrap items-center gap-2 px-4 py-3 text-left"
      >
        {expanded ? <ChevronDown size={15} className="shrink-0 text-neutral-500" /> : <ChevronRight size={15} className="shrink-0 text-neutral-500" />}
        <span className="font-medium text-neutral-100">{page.name}</span>
        <span className="rounded-full bg-base-800 px-2 py-0.5 text-[11px] text-neutral-400">{PAGE_TYPE_LABEL[page.pageType]}</span>
        {primaryKeyword && (
          <span className="rounded-full bg-accent-500/10 px-2 py-0.5 text-[11px] text-accent-400">{primaryKeyword.keyword}</span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {STATUS_FIELDS.map(({ key, label }) => (
            <span
              key={key}
              title={label}
              className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", STATUS_STYLE[page[key]])}
            >
              {STATUS_LABEL[page[key]]}
            </span>
          ))}
        </div>
      </button>

      {expanded && (
        <div className="flex flex-col gap-4 border-t border-base-700/60 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="URL">
              <input
                defaultValue={page.url}
                onBlur={(e) => e.target.value !== page.url && patch({ url: e.target.value })}
                className="w-full rounded-md border border-base-600 bg-base-900 px-2.5 py-1.5 text-sm text-neutral-100 focus:border-accent-500 focus:outline-none"
              />
            </Field>
            <Field label="Page type">
              <select
                defaultValue={page.pageType}
                onChange={(e) => patch({ pageType: e.target.value as PageType })}
                className="w-full rounded-md border border-base-600 bg-base-900 px-2.5 py-1.5 text-sm text-neutral-100 focus:border-accent-500 focus:outline-none"
              >
                {(Object.keys(PAGE_TYPE_LABEL) as PageType[]).map((t) => (
                  <option key={t} value={t}>
                    {PAGE_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Meta title">
            <input
              defaultValue={page.metaTitle}
              onBlur={(e) => e.target.value !== page.metaTitle && patch({ metaTitle: e.target.value })}
              className="w-full rounded-md border border-base-600 bg-base-900 px-2.5 py-1.5 text-sm text-neutral-100 focus:border-accent-500 focus:outline-none"
            />
          </Field>
          <Field label="Meta description">
            <textarea
              rows={2}
              defaultValue={page.metaDescription}
              onBlur={(e) => e.target.value !== page.metaDescription && patch({ metaDescription: e.target.value })}
              className="w-full rounded-md border border-base-600 bg-base-900 px-2.5 py-1.5 text-sm text-neutral-100 focus:border-accent-500 focus:outline-none"
            />
          </Field>
          <Field label="H1">
            <input
              defaultValue={page.h1}
              onBlur={(e) => e.target.value !== page.h1 && patch({ h1: e.target.value })}
              className="w-full rounded-md border border-base-600 bg-base-900 px-2.5 py-1.5 text-sm text-neutral-100 focus:border-accent-500 focus:outline-none"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {STATUS_FIELDS.map(({ key, label }) => (
              <Field key={key} label={label}>
                <select
                  value={page[key]}
                  onChange={(e) => patch({ [key]: e.target.value as OnPageStatus })}
                  className="w-full rounded-md border border-base-600 bg-base-900 px-2.5 py-1.5 text-sm text-neutral-100 focus:border-accent-500 focus:outline-none"
                >
                  {(Object.keys(STATUS_LABEL) as OnPageStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
          </div>

          <div>
            <label className="mb-1 block text-[11px] text-neutral-500">Primary keyword</label>
            {keywords.length === 0 ? (
              <p className="text-xs text-neutral-600">No keywords linked to this page yet — assign some from the Keywords tab.</p>
            ) : (
              <select
                value={page.primaryKeywordId ?? ""}
                onChange={(e) =>
                  startTransition(() => setPrimaryKeywordForPageAction(page.id, projectId, e.target.value || null))
                }
                className="w-full rounded-md border border-base-600 bg-base-900 px-2.5 py-1.5 text-sm text-neutral-100 focus:border-accent-500 focus:outline-none sm:w-72"
              >
                <option value="">None set</option>
                {keywords.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.keyword}
                  </option>
                ))}
              </select>
            )}
            {secondaryKeywords.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {secondaryKeywords.map((k) => (
                  <span key={k.id} className="rounded-full bg-base-800 px-2 py-0.5 text-[11px] text-neutral-400">
                    {k.keyword}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-[11px] text-neutral-500">SEO checklist</label>
              <button
                type="button"
                onClick={() => setChecklist((items) => [...items, { id: crypto.randomUUID(), text: "", done: false }])}
                className="text-[11px] text-accent-400 hover:text-accent-300"
              >
                + Add item
              </button>
            </div>
            <div className="flex flex-col gap-1.5">
              {checklist.map((item) => (
                <div key={item.id} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={() => {
                      setChecklist((items) => items.map((it) => (it.id === item.id ? { ...it, done: !it.done } : it)));
                      saveChecklist();
                    }}
                    className="accent-accent-500"
                  />
                  <input
                    value={item.text}
                    onChange={(e) =>
                      setChecklist((items) => items.map((it) => (it.id === item.id ? { ...it, text: e.target.value } : it)))
                    }
                    onBlur={saveChecklist}
                    placeholder="Checklist item"
                    className="w-full rounded-md border border-base-600 bg-base-900 px-2.5 py-1.5 text-xs text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setChecklist((items) => items.filter((it) => it.id !== item.id));
                      saveChecklist();
                    }}
                    className="shrink-0 text-neutral-500 hover:text-rose-400"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] text-neutral-500">Related tasks</label>
            <div className="flex flex-col gap-2">
              {tasks.map((task) => (
                <TaskRow key={task.id} task={task} assignableMembers={assignableMembers} />
              ))}
              <NewTaskForm
                projectId={projectId}
                stageId={null}
                assignableMembers={assignableMembers}
                seoModule="on_page"
                pageId={page.id}
              />
            </div>
          </div>

          {isPending && <p className="text-[11px] text-neutral-600">Saving…</p>}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] text-neutral-500">{label}</label>
      {children}
    </div>
  );
}
