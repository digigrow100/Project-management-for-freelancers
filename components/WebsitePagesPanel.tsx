"use client";

import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, Circle, ExternalLink, FileText, Plus, Trash2 } from "lucide-react";
import type { Keyword, KeywordPage, PageAuditCheck, PageAuditStatus, ProjectPage, ProjectPageType } from "@/lib/types";
import {
  createProjectPageAction,
  deleteProjectPageAction,
  updateKeywordRankAction,
  updatePageAuditCheckAction,
} from "@/lib/actions";
import { cn } from "@/lib/utils";

const PAGE_TYPES: Array<[ProjectPageType, string]> = [
  ["home", "Home"],
  ["service", "Service"],
  ["location", "Location"],
  ["blog", "Blog"],
  ["landing", "Landing"],
  ["legal", "Legal"],
  ["contact", "Contact"],
  ["other", "Other"],
];

const ON_PAGE_KEYS = [
  "page_link",
  "meta_tags",
  "image_optimization",
  "internal_linking",
  "heading_structure",
  "unique_content",
] as const;

const TECHNICAL_KEYS = [
  "pagespeed_90",
  "canonical_url",
  "google_indexing",
  "schema_markup",
  "mobile_friendly",
  "technical_check",
] as const;

const SHORT_LABELS: Record<string, string> = {
  page_link: "Page Link",
  meta_tags: "Meta Tags",
  image_optimization: "Images",
  internal_linking: "Internal Links",
  heading_structure: "H1 / H2 / H3",
  unique_content: "Unique Content",
  pagespeed_90: "PageSpeed 90+",
  canonical_url: "Canonical URL",
  google_indexing: "Google Indexed",
  schema_markup: "Schema",
  mobile_friendly: "Mobile Friendly",
  technical_check: "Technical Health",
};

function normalizePageUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(
      trimmed.startsWith("http")
        ? trimmed
        : `https://example.com${trimmed.startsWith("/") ? "" : "/"}${trimmed}`,
    );
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

  const keywordPageById = useMemo(
    () => new Map(keywordPages.map((page) => [page.id, page])),
    [keywordPages],
  );

  const trackedChecks = checks.filter(
    (check) =>
      (ON_PAGE_KEYS as readonly string[]).includes(check.checkKey) ||
      (TECHNICAL_KEYS as readonly string[]).includes(check.checkKey),
  );
  const totalChecks = trackedChecks.length;
  const doneChecks = trackedChecks.filter((check) => check.status === "done" || check.status === "not_applicable").length;
  const progress = totalChecks ? Math.round((doneChecks / totalChecks) * 100) : 0;

  function setCheckStatus(check: PageAuditCheck, status: PageAuditStatus) {
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

  function toggleCheck(check: PageAuditCheck) {
    const status: PageAuditStatus = check.status === "done" ? "pending" : "done";
    setCheckStatus(check, status);
  }

  function saveRank(keyword: Keyword, rawValue: string) {
    const clean = rawValue.trim();
    const parsed = clean === "" ? null : Number(clean);
    if (clean !== "" && (!Number.isFinite(parsed) || parsed! < 1)) return;

    startTransition(() =>
      updateKeywordRankAction({
        projectId,
        keywordId: keyword.id,
        currentRank: parsed === null ? null : Math.round(parsed),
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
              On-page SEO, technical SEO, mapped keywords, volume and manual ranking for {periodMonth}.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAdding((value) => !value)}
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
            <input
              name="name"
              required
              placeholder="Page name"
              className="rounded-md border border-base-600 bg-base-950 px-3 py-2 text-sm text-neutral-100"
            />
            <input
              name="url"
              placeholder="https://..."
              className="rounded-md border border-base-600 bg-base-950 px-3 py-2 text-sm text-neutral-100"
            />
            <select
              name="pageType"
              defaultValue="other"
              className="rounded-md border border-base-600 bg-base-950 px-3 py-2 text-sm text-neutral-100"
            >
              {PAGE_TYPES.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <button className="rounded-md bg-accent-500 px-3 py-2 text-xs font-semibold text-base-950">
              Save
            </button>
          </form>
        )}
      </section>

      <div className="space-y-3">
        {pages.map((page, index) => {
          const allPageChecks = checksByPage[page.id] ?? [];
          const onPageChecks = ON_PAGE_KEYS
            .map((key) => allPageChecks.find((check) => check.checkKey === key))
            .filter(Boolean) as PageAuditCheck[];
          const technicalChecks = TECHNICAL_KEYS
            .map((key) => allPageChecks.find((check) => check.checkKey === key))
            .filter(Boolean) as PageAuditCheck[];

          const pageChecks = [...onPageChecks, ...technicalChecks];
          const completed = pageChecks.filter((check) => check.status === "done" || check.status === "not_applicable").length;
          const pageProgress = pageChecks.length ? Math.round((completed / pageChecks.length) * 100) : 0;

          const mappedKeywords = keywords
            .filter((keyword) => keywordBelongsToPage(keyword, page, keywordPageById))
            .sort((a, b) => {
              const roleOrder = { primary: 0, secondary: 1, supporting: 2, long_tail: 3 } as const;
              return roleOrder[a.keywordRole] - roleOrder[b.keywordRole] || a.keyword.localeCompare(b.keyword);
            });

          return (
            <section key={page.id} className="rounded-xl2 border border-base-700/60 bg-base-850 p-4 shadow-card">
              <div className="flex flex-wrap items-start gap-3 border-b border-base-700/50 pb-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-base-900 text-xs font-semibold text-neutral-400">
                  {index + 1}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-neutral-100">{page.name}</h3>
                    <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-300">
                      {page.pageType}
                    </span>
                  </div>

                  {page.url ? (
                    <a
                      href={page.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-xs text-neutral-500 hover:text-accent-300"
                    >
                      {page.url}<ExternalLink size={11} />
                    </a>
                  ) : (
                    <p className="mt-1 text-xs text-amber-400">URL not added yet</p>
                  )}
                </div>

                <div className="text-right">
                  <p className="text-xs font-semibold text-neutral-200">{pageProgress}%</p>
                  <p className="text-[10px] text-neutral-600">{completed}/{pageChecks.length} checks</p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (!window.confirm("Delete this page and its checklist history?")) return;
                    startTransition(() => deleteProjectPageAction(page.id, projectId));
                  }}
                  className="rounded-md p-2 text-neutral-600 hover:bg-rose-500/10 hover:text-rose-400"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="mt-4 grid gap-3 xl:grid-cols-3">
                <ChecklistColumn title="On-Page SEO" checks={onPageChecks} onToggle={toggleCheck} onStatus={setCheckStatus} />
                <ChecklistColumn title="Technical SEO" checks={technicalChecks} onToggle={toggleCheck} onStatus={setCheckStatus} />

                <div className="rounded-xl border border-base-700/60 bg-base-900/35 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Keywords</h4>
                    <span className="text-[10px] text-neutral-600">{mappedKeywords.length} mapped</span>
                  </div>

                  {mappedKeywords.length > 0 ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-[minmax(0,1fr)_64px_72px] gap-2 px-1 text-[9px] font-semibold uppercase tracking-wide text-neutral-600">
                        <span>Keyword</span>
                        <span>Volume</span>
                        <span>Rank</span>
                      </div>

                      {mappedKeywords.map((keyword) => (
                        <div
                          key={keyword.id}
                          className="grid grid-cols-[minmax(0,1fr)_64px_72px] items-center gap-2 rounded-lg border border-base-700/50 bg-base-950/55 px-2.5 py-2"
                        >
                          <div className="min-w-0">
                            <div className="flex min-w-0 items-center gap-1.5">
                              <span className="truncate text-[11px] text-neutral-200" title={keyword.keyword}>
                                {keyword.keyword}
                              </span>
                              {keyword.keywordRole === "primary" && (
                                <span className="shrink-0 rounded-full bg-accent-500/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase text-accent-300">
                                  P
                                </span>
                              )}
                            </div>
                          </div>

                          <span className="text-[11px] text-neutral-500">
                            {keyword.searchVolume ?? "—"}
                          </span>

                          <input
                            type="number"
                            min="1"
                            defaultValue={keyword.currentRank ?? ""}
                            onBlur={(event) => saveRank(keyword, event.currentTarget.value)}
                            placeholder="—"
                            aria-label={`Ranking for ${keyword.keyword}`}
                            className="w-full rounded-md border border-base-700 bg-base-950 px-2 py-1.5 text-center text-[11px] font-semibold text-neutral-100 placeholder:text-neutral-700 focus:border-accent-500 focus:outline-none"
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-lg border border-dashed border-base-700 p-4 text-center text-xs text-neutral-600">
                      No keywords mapped to this page.
                    </p>
                  )}

                  <p className="mt-2 text-[9px] text-neutral-700">
                    Ranking saves when you leave the field.
                  </p>
                </div>
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

function ChecklistColumn({
  title,
  checks,
  onToggle,
  onStatus,
}: {
  title: string;
  checks: PageAuditCheck[];
  onToggle: (check: PageAuditCheck) => void;
  onStatus: (check: PageAuditCheck, status: PageAuditStatus) => void;
}) {
  return (
    <div className="rounded-xl border border-base-700/60 bg-base-900/35 p-3">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">{title}</h4>
      <div className="grid gap-1.5">
        {checks.map((check) => (
          <div
            key={check.id}
            className="flex items-center gap-2 rounded-lg border border-base-700/50 bg-base-950/55 px-2.5 py-2"
          >
            <button
              type="button"
              onClick={() => onToggle(check)}
              className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
            >
              <span
                className={cn(
                  "shrink-0",
                  check.status === "done"
                    ? "text-emerald-400"
                    : check.status === "not_applicable"
                      ? "text-amber-400"
                      : "text-neutral-600",
                )}
              >
                {check.status === "done" || check.status === "not_applicable"
                  ? <CheckCircle2 size={16} />
                  : <Circle size={16} />}
              </span>
              <span className={cn(
                "min-w-0 flex-1 truncate text-[11px] font-medium",
                check.status === "not_applicable" ? "text-amber-300" : "text-neutral-200",
              )}>
                {SHORT_LABELS[check.checkKey] ?? check.label}
              </span>
            </button>
            {check.status === "not_applicable" ? (
              <button
                type="button"
                onClick={() => onStatus(check, "pending")}
                className="shrink-0 rounded-md bg-amber-500/10 px-2 py-1 text-[9px] font-semibold text-amber-300"
                title="Mark this check as required again"
              >
                Not Required
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onStatus(check, "not_applicable")}
                className="shrink-0 rounded-md border border-base-700 px-2 py-1 text-[9px] text-neutral-500 hover:border-amber-500/30 hover:text-amber-300"
              >
                Not Required for This Page
              </button>
            )}
          </div>
        ))}
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
