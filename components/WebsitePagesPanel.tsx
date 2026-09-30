"use client";

import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, Circle, ExternalLink, FileText, Plus, Trash2 } from "lucide-react";
import type { Keyword, KeywordPage, PageAuditCheck, PageAuditStatus, ProjectPage, ProjectPageType } from "@/lib/types";
import { createProjectPageAction, deleteProjectPageAction, updatePageAuditCheckAction } from "@/lib/actions";
import { cn } from "@/lib/utils";

const PAGE_TYPES: Array<[ProjectPageType, string]> = [
  ["home","Home"],["service","Service"],["location","Location"],["blog","Blog"],
  ["landing","Landing"],["legal","Legal"],["contact","Contact"],["other","Other"],
];

function normalizePageUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://example.com${trimmed.startsWith("/") ? "" : "/"}${trimmed}`);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    return path.toLowerCase();
  } catch {
    return trimmed.replace(/^https?:\/\/[^/]+/i, "").replace(/\/+$/, "").toLowerCase() || "/";
  }
}

function keywordBelongsToPage(keyword: Keyword, page: ProjectPage, keywordPageById: Map<string, KeywordPage>) {
  const candidateIds = [keyword.primaryPageId, ...keyword.pageIds].filter(Boolean) as string[];
  if (candidateIds.length === 0) return false;

  const pageUrl = normalizePageUrl(page.url);
  const pageName = page.name.trim().toLowerCase();

  return candidateIds.some((id) => {
    const mappedPage = keywordPageById.get(id);
    if (!mappedPage) return false;
    const mappedUrl = normalizePageUrl(mappedPage.url);
    const mappedName = mappedPage.name.trim().toLowerCase();
    return (pageUrl && mappedUrl && pageUrl === mappedUrl) || (pageName && mappedName && pageName === mappedName);
  });
}

export function WebsitePagesPanel({
  projectId,
  pages,
  checks,
  periodMonth,
  keywords,
  keywordPages,
}: {
  projectId: string;
  pages: ProjectPage[];
  checks: PageAuditCheck[];
  periodMonth: string;
  keywords: Keyword[];
  keywordPages: KeywordPage[];
}) {
  const [adding, setAdding] = useState(false);
  const [isPending, startTransition] = useTransition();
  const checksByPage = useMemo(() => {
    const map: Record<string, PageAuditCheck[]> = {};
    for (const check of checks) (map[check.pageId] ??= []).push(check);
    return map;
  }, [checks]);

  const visibleChecks = checks.filter((check) => check.checkKey !== "main_keyword" && check.checkKey !== "main_keyword_rank");
  const totalChecks = visibleChecks.length;
  const doneChecks = visibleChecks.filter((c) => c.status === "done" || c.status === "not_applicable").length;
  const keywordPageById = useMemo(() => new Map(keywordPages.map((page) => [page.id, page])), [keywordPages]);
  const progress = totalChecks === 0 ? 0 : Math.round((doneChecks / totalChecks) * 100);

  function changeStatus(check: PageAuditCheck, status: PageAuditStatus) {
    startTransition(() =>
      updatePageAuditCheckAction({
        projectId,
        pageId: check.pageId,
        periodMonth,
        checkKey: check.checkKey,
        status,
      }),
    );
  }

  function saveTextValue(check: PageAuditCheck, value: string) {
    const clean = value.trim();
    startTransition(() =>
      updatePageAuditCheckAction({
        projectId,
        pageId: check.pageId,
        periodMonth,
        checkKey: check.checkKey,
        status: clean ? "done" : "pending",
        value: clean,
      }),
    );
  }

  return (
    <div className={cn("space-y-5", isPending && "opacity-80")}>
      <section className="rounded-xl2 border border-base-700/60 bg-base-850 p-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-neutral-100">Website Pages</h2>
            <p className="mt-1 text-xs text-neutral-500">
              Pages, mapped keywords, search volume, current ranking and monthly SEO checks for {periodMonth}.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg bg-accent-500 px-3 py-2 text-xs font-semibold text-base-950 hover:bg-accent-400"
          >
            <Plus size={14} /> Add Page
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Pages" value={pages.length.toString()} />
          <Stat label="Checks" value={totalChecks.toString()} />
          <Stat label="Completed" value={doneChecks.toString()} />
          <Stat label="Progress" value={progress + "%"} />
        </div>

        {adding && (
          <form
            action={(formData) => {
              formData.set("projectId", projectId);
              startTransition(async () => {
                await createProjectPageAction(formData);
                setAdding(false);
              });
            }}
            className="mt-4 grid gap-2 rounded-lg border border-base-700 bg-base-900/60 p-3 md:grid-cols-[1fr_1.4fr_160px_auto]"
          >
            <input name="name" required placeholder="Page name" className="rounded-md border border-base-600 bg-base-950 px-3 py-2 text-sm text-neutral-100" />
            <input name="url" placeholder="https://..." className="rounded-md border border-base-600 bg-base-950 px-3 py-2 text-sm text-neutral-100" />
            <select name="pageType" defaultValue="other" className="rounded-md border border-base-600 bg-base-950 px-3 py-2 text-sm text-neutral-100">
              {PAGE_TYPES.map(([value,label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <button className="rounded-md bg-accent-500 px-3 py-2 text-xs font-semibold text-base-950">Save</button>
          </form>
        )}
      </section>

      <div className="space-y-3">
        {pages.map((page, index) => {
          const pageChecks = (checksByPage[page.id] ?? []).filter(
            (check) => check.checkKey !== "main_keyword" && check.checkKey !== "main_keyword_rank",
          );
          const mappedKeywords = keywords
            .filter((keyword) => keywordBelongsToPage(keyword, page, keywordPageById))
            .sort((a, b) => {
              const roleOrder = { primary: 0, secondary: 1, supporting: 2, long_tail: 3 } as const;
              return roleOrder[a.keywordRole] - roleOrder[b.keywordRole] || a.keyword.localeCompare(b.keyword);
            });
          const completed = pageChecks.filter((c) => c.status === "done" || c.status === "not_applicable").length;
          const pageProgress = pageChecks.length ? Math.round((completed / pageChecks.length) * 100) : 0;

          return (
            <section key={page.id} className="rounded-xl2 border border-base-700/60 bg-base-850 p-4 shadow-card">
              <div className="overflow-x-auto">
                <div className="min-w-[820px]">
                  <div className="grid grid-cols-[minmax(260px,1.6fr)_minmax(220px,1.35fr)_90px_90px_90px_36px] gap-3 border-b border-base-700/50 pb-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-600">
                    <span>Page</span>
                    <span>Keywords</span>
                    <span>Volume</span>
                    <span>Ranking</span>
                    <span>Progress</span>
                    <span />
                  </div>
                  <div className="grid grid-cols-[minmax(260px,1.6fr)_minmax(220px,1.35fr)_90px_90px_90px_36px] gap-3 pt-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-base-900 text-xs font-semibold text-neutral-400">{index + 1}</span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-sm font-semibold text-neutral-100">{page.name}</h3>
                          <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-300">{page.pageType}</span>
                        </div>
                        {page.url ? (
                          <a href={page.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-xs text-neutral-500 hover:text-accent-300">
                            {page.url}<ExternalLink size={11} />
                          </a>
                        ) : (
                          <p className="mt-1 text-xs text-amber-400">URL not added yet</p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      {mappedKeywords.length > 0 ? mappedKeywords.map((keyword) => (
                        <div key={keyword.id} className="flex min-h-6 items-center gap-1.5">
                          <span className="truncate text-xs text-neutral-200" title={keyword.keyword}>{keyword.keyword}</span>
                          {keyword.keywordRole === "primary" && (
                            <span className="shrink-0 rounded-full bg-accent-500/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase text-accent-300">Primary</span>
                          )}
                        </div>
                      )) : (
                        <p className="text-xs text-neutral-600">No mapped keywords</p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      {mappedKeywords.length > 0 ? mappedKeywords.map((keyword) => (
                        <div key={keyword.id} className="flex min-h-6 items-center text-xs text-neutral-400">
                          {keyword.searchVolume ?? "—"}
                        </div>
                      )) : <span className="text-xs text-neutral-700">—</span>}
                    </div>

                    <div className="space-y-1.5">
                      {mappedKeywords.length > 0 ? mappedKeywords.map((keyword) => (
                        <div key={keyword.id} className="flex min-h-6 items-center">
                          <span className={cn(
                            "text-xs font-semibold",
                            keyword.currentRank === null ? "text-neutral-600" : keyword.currentRank <= 10 ? "text-emerald-300" : keyword.currentRank <= 30 ? "text-amber-300" : "text-neutral-300",
                          )}>
                            {keyword.currentRank === null ? "Not ranking" : `#${keyword.currentRank}`}
                          </span>
                        </div>
                      )) : <span className="text-xs text-neutral-700">—</span>}
                    </div>

                    <div className="pt-0.5">
                      <p className="text-xs font-semibold text-neutral-200">{pageProgress}%</p>
                      <p className="mt-0.5 text-[10px] text-neutral-600">{completed}/{pageChecks.length} checks</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (!window.confirm("Delete this page and its checklist history?")) return;
                        startTransition(() => deleteProjectPageAction(page.id, projectId));
                      }}
                      className="h-8 rounded-md p-2 text-neutral-600 hover:bg-rose-500/10 hover:text-rose-400"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-2 md:grid-cols-2">
                {pageChecks.map((check) =>
                  check.inputType === "text" ? (
                    <div key={check.id} className="rounded-lg border border-base-700/60 bg-base-900/50 px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <CheckCircle2
                          size={16}
                          className={check.status === "done" ? "shrink-0 text-emerald-400" : "shrink-0 text-neutral-600"}
                        />
                        <p className="text-xs font-medium text-neutral-200">{check.label}</p>
                      </div>
                      <input
                        key={check.value}
                        defaultValue={check.value}
                        onBlur={(e) => saveTextValue(check, e.currentTarget.value)}
                        placeholder={check.checkKey === "main_keyword_rank" ? "e.g. 8 or Not Ranking" : "Enter main keyword"}
                        className="mt-2 w-full rounded-md border border-base-700 bg-base-950 px-2.5 py-2 text-xs text-neutral-100 placeholder:text-neutral-600 focus:border-accent-500 focus:outline-none"
                      />
                      <p className="mt-1 text-[10px] text-neutral-600">
                        {check.value ? "Saved for this month" : "Required for this monthly check"}
                      </p>
                    </div>
                  ) : (
                    <button
                      key={check.id}
                      type="button"
                      onClick={() => changeStatus(check, check.status === "done" ? "pending" : "done")}
                      className="flex w-full items-center gap-3 rounded-lg border border-base-700/60 bg-base-900/50 px-3 py-2.5 text-left transition-colors hover:border-base-600 hover:bg-base-900"
                    >
                      <span className={cn("shrink-0", check.status === "done" ? "text-emerald-400" : "text-neutral-600")}>
                        {check.status === "done" ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-neutral-200">{check.label}</p>
                        <p className="mt-0.5 text-[10px] text-neutral-600">{check.status === "done" ? "Done" : "Pending"}</p>
                      </div>
                    </button>
                  ),
                )}
              </div>
            </section>
          );
        })}

        {pages.length === 0 && (
          <div className="rounded-xl2 border border-dashed border-base-700 p-10 text-center">
            <FileText size={30} className="mx-auto text-neutral-600" />
            <p className="mt-2 text-sm text-neutral-400">No website pages added yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-base-700/60 bg-base-900/55 p-3">
      <p className="text-lg font-semibold text-neutral-100">{value}</p>
      <p className="mt-1 text-[10px] uppercase tracking-wide text-neutral-600">{label}</p>
    </div>
  );
}
