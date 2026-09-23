"use client";

import { useState, useTransition } from "react";
import { Plus, Search, Trash2, X } from "lucide-react";
import type { CompetitorBacklink, KeywordPage } from "@/lib/types";
import {
  createCompetitorBacklinkAction,
  deleteCompetitorBacklinkAction,
  updateCompetitorBacklinkAction,
} from "@/lib/actions";

const STATUS_OPTIONS = ["new", "evaluating", "pursuing", "acquired", "rejected"];

export function CompetitorBacklinksPanel({
  projectId,
  backlinks,
  pages,
}: {
  projectId: string;
  backlinks: CompetitorBacklink[];
  pages: KeywordPage[];
}) {
  const [adding, setAdding] = useState(false);
  const pageById = Object.fromEntries(pages.map((p) => [p.id, p]));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Search size={16} className="text-accent-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Competitor Backlinks</h2>
        </div>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 text-xs text-accent-400 hover:text-accent-300"
          >
            <Plus size={13} />
            Log opportunity
          </button>
        )}
      </div>

      {adding && <NewCompetitorBacklinkForm projectId={projectId} pages={pages} onDone={() => setAdding(false)} />}

      {backlinks.length === 0 && !adding ? (
        <div className="flex flex-col items-center gap-2 rounded-xl2 border border-dashed border-base-700/60 p-8 text-center">
          <p className="text-sm text-neutral-400">No competitor backlinks logged yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {backlinks.map((entry) => (
            <CompetitorBacklinkRow
              key={entry.id}
              projectId={projectId}
              entry={entry}
              pages={pages}
              targetPage={entry.targetPageId ? pageById[entry.targetPageId] : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NewCompetitorBacklinkForm({
  projectId,
  pages,
  onDone,
}: {
  projectId: string;
  pages: KeywordPage[];
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <form
      action={(formData) => {
        formData.set("projectId", projectId);
        startTransition(async () => {
          await createCompetitorBacklinkAction(formData);
          onDone();
        });
      }}
      className="flex flex-col gap-2 rounded-lg border border-base-700/60 bg-base-850 p-3"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-400">New competitor backlink</span>
        <button type="button" onClick={onDone} className="text-neutral-500 hover:text-neutral-300">
          <X size={14} />
        </button>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          name="competitorUrl"
          required
          autoFocus
          placeholder="Competitor URL"
          className="w-full rounded-md border border-base-600 bg-base-900 px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none sm:col-span-2"
        />
        <input
          name="sourceBacklinkUrl"
          placeholder="Source backlink URL"
          className="w-full rounded-md border border-base-600 bg-base-900 px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none sm:col-span-2"
        />
        <select
          name="targetPageId"
          defaultValue=""
          className="w-full rounded-md border border-base-600 bg-base-900 px-2.5 py-1.5 text-sm text-neutral-300 focus:border-accent-500 focus:outline-none"
        >
          <option value="">No target page</option>
          {pages.map((page) => (
            <option key={page.id} value={page.id}>
              {page.name || page.url}
            </option>
          ))}
        </select>
      </div>
      <textarea
        name="opportunityNotes"
        placeholder="Opportunity notes"
        rows={2}
        className="w-full rounded-md border border-base-600 bg-base-900 px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
      />
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

function CompetitorBacklinkRow({
  projectId,
  entry,
  pages,
  targetPage,
}: {
  projectId: string;
  entry: CompetitorBacklink;
  pages: KeywordPage[];
  targetPage?: KeywordPage;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-base-600 bg-base-800 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-neutral-100">{entry.competitorUrl}</p>
        {entry.sourceBacklinkUrl && (
          <p className="mt-0.5 truncate text-xs text-neutral-500">from {entry.sourceBacklinkUrl}</p>
        )}
        {entry.opportunityNotes && <p className="mt-1 text-xs text-neutral-400">{entry.opportunityNotes}</p>}
        {targetPage && (
          <span className="mt-1 inline-block rounded-full bg-base-900 px-1.5 py-0.5 text-[10px] text-neutral-400">
            Target: {targetPage.name || targetPage.url}
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <select
          value={entry.status}
          disabled={isPending}
          onChange={(e) =>
            startTransition(() => updateCompetitorBacklinkAction(entry.id, projectId, { status: e.target.value }))
          }
          className="rounded-md border border-base-600 bg-base-900 px-2 py-1 text-[11px] capitalize text-neutral-300 focus:border-accent-500 focus:outline-none"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={entry.targetPageId ?? ""}
          disabled={isPending}
          onChange={(e) =>
            startTransition(() =>
              updateCompetitorBacklinkAction(entry.id, projectId, { targetPageId: e.target.value || null }),
            )
          }
          className="rounded-md border border-base-600 bg-base-900 px-2 py-1 text-[11px] text-neutral-300 focus:border-accent-500 focus:outline-none"
        >
          <option value="">No target page</option>
          {pages.map((page) => (
            <option key={page.id} value={page.id}>
              {page.name || page.url}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(() => deleteCompetitorBacklinkAction(entry.id, projectId))}
          className="rounded-md p-1 text-neutral-500 hover:text-rose-400 disabled:opacity-50"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}
