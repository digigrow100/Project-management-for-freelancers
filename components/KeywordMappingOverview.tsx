"use client";

import { useMemo, useTransition } from "react";
import { AlertTriangle, FilePlus2, Link2, Layers3, Target, Unlink, CheckCircle2 } from "lucide-react";
import type { Keyword, KeywordGroup, KeywordPage } from "@/lib/types";
import { createKeywordSeoTaskAction } from "@/lib/actions";
import { cn } from "@/lib/utils";

export function KeywordMappingOverview({
  projectId,
  keywords,
  groups,
  pagesByGroup,
}: {
  projectId: string;
  keywords: Keyword[];
  groups: KeywordGroup[];
  pagesByGroup: Record<string, KeywordPage[]>;
}) {
  const [isPending, startTransition] = useTransition();
  const allPages = useMemo(() => Object.values(pagesByGroup).flat(), [pagesByGroup]);

  const mapped = keywords.filter((keyword) => keyword.primaryPageId || keyword.pageIds.length > 0);
  const unmapped = keywords.filter(
    (keyword) => keyword.targetMode === "existing_page" && !keyword.primaryPageId && keyword.pageIds.length === 0,
  );
  const newPages = keywords.filter((keyword) => keyword.targetMode === "new_page_required");
  const targetedPageIds = new Set(keywords.flatMap((keyword) => keyword.pageIds));
  const pagesWithoutPrimary = allPages.filter((page) => !page.primaryKeywordId);
  const conflicts = keywords.filter(
    (keyword) =>
      keyword.targetMode === "existing_page" &&
      keyword.pageIds.length > 1 &&
      (!keyword.primaryPageId || !keyword.pageIds.includes(keyword.primaryPageId)),
  );
  const totalVolume = keywords.reduce((sum, keyword) => sum + (keyword.searchVolume ?? 0), 0);
  const difficulties = keywords.map((keyword) => keyword.difficulty).filter((value): value is number => value !== null);
  const avgKd = difficulties.length
    ? Math.round(difficulties.reduce((sum, value) => sum + value, 0) / difficulties.length)
    : null;

  const cards = [
    { label: "Total keywords", value: keywords.length, icon: Target, tone: "text-accent-300" },
    { label: "Mapped", value: mapped.length, icon: Link2, tone: "text-sky-300" },
    { label: "Unmapped", value: unmapped.length, icon: Unlink, tone: unmapped.length ? "text-amber-300" : "text-neutral-400" },
    { label: "Pages targeted", value: targetedPageIds.size, icon: Layers3, tone: "text-violet-300" },
    { label: "New pages", value: newPages.length, icon: FilePlus2, tone: newPages.length ? "text-amber-300" : "text-neutral-400" },
    { label: "Conflicts", value: conflicts.length, icon: AlertTriangle, tone: conflicts.length ? "text-rose-300" : "text-neutral-400" },
  ];

  return (
    <section className="rounded-xl2 border border-base-700/60 bg-base-850 p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-neutral-100">Keyword Mapping Overview</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Import → cluster → choose a primary target page → assign supporting keywords → create SEO work.
          </p>
        </div>
        <div className="flex gap-2 text-[11px] text-neutral-500">
          <span className="rounded-full bg-base-900 px-2.5 py-1">Volume {totalVolume.toLocaleString()}</span>
          <span className="rounded-full bg-base-900 px-2.5 py-1">Avg KD {avgKd ?? "—"}</span>
          <span className="rounded-full bg-base-900 px-2.5 py-1">{groups.length} clusters</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        {cards.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="rounded-lg border border-base-700/70 bg-base-900/55 p-3">
            <div className="flex items-center justify-between gap-2">
              <Icon size={15} className={tone} />
              <span className={cn("text-lg font-semibold", tone)}>{value}</span>
            </div>
            <p className="mt-2 text-[11px] text-neutral-500">{label}</p>
          </div>
        ))}
      </div>

      {(unmapped.length > 0 || newPages.length > 0 || conflicts.length > 0 || pagesWithoutPrimary.length > 0) && (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {unmapped.length > 0 && (
            <IssueBox
              title={"Unmapped Keywords (" + unmapped.length + ")"}
              description="These keywords still need a target page."
              tone="amber"
              items={unmapped.slice(0, 6).map((keyword) => keyword.keyword)}
            />
          )}

          {conflicts.length > 0 && (
            <IssueBox
              title={"Potential Cannibalization (" + conflicts.length + ")"}
              description="These keywords are linked to multiple pages without one clear primary target."
              tone="rose"
              items={conflicts.slice(0, 6).map((keyword) => keyword.keyword)}
            />
          )}

          {pagesWithoutPrimary.length > 0 && (
            <IssueBox
              title={"Pages Without Primary Keyword (" + pagesWithoutPrimary.length + ")"}
              description="Choose one primary keyword for each important SEO page."
              tone="sky"
              items={pagesWithoutPrimary.slice(0, 6).map((page) => page.name)}
            />
          )}

          {newPages.length > 0 && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs font-semibold text-amber-300">New Pages Required ({newPages.length})</h3>
                  <p className="mt-0.5 text-[11px] text-neutral-500">Create a task directly from any missing-page keyword.</p>
                </div>
                <FilePlus2 size={16} className="text-amber-300" />
              </div>
              <div className="mt-2 space-y-1.5">
                {newPages.slice(0, 6).map((keyword) => (
                  <div key={keyword.id} className="flex items-center gap-2 rounded-md bg-base-900/50 px-2.5 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-neutral-200">{keyword.suggestedPageName || keyword.keyword}</p>
                      <p className="truncate text-[10px] text-neutral-600">{keyword.keyword}</p>
                    </div>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => startTransition(() => createKeywordSeoTaskAction(keyword.id, projectId))}
                      className="rounded-md border border-amber-500/30 px-2 py-1 text-[10px] font-medium text-amber-300 hover:bg-amber-500/10 disabled:opacity-50"
                    >
                      Create task
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {keywords.length > 0 && unmapped.length === 0 && newPages.length === 0 && conflicts.length === 0 && pagesWithoutPrimary.length === 0 && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-300">
          <CheckCircle2 size={15} />
          Keyword mapping is clean: every keyword and page has a clear target.
        </div>
      )}
    </section>
  );
}

function IssueBox({
  title,
  description,
  items,
  tone,
}: {
  title: string;
  description: string;
  items: string[];
  tone: "amber" | "rose" | "sky";
}) {
  const toneClass =
    tone === "rose"
      ? "border-rose-500/20 bg-rose-500/5 text-rose-300"
      : tone === "sky"
        ? "border-sky-500/20 bg-sky-500/5 text-sky-300"
        : "border-amber-500/20 bg-amber-500/5 text-amber-300";

  return (
    <div className={cn("rounded-lg border p-3", toneClass)}>
      <h3 className="text-xs font-semibold">{title}</h3>
      <p className="mt-0.5 text-[11px] text-neutral-500">{description}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span key={item} className="max-w-full truncate rounded-full bg-base-900/70 px-2 py-1 text-[10px] text-neutral-300">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
