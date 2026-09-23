"use client";

import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Search, Trash2, Pencil, Plus, X, Download, Upload, History, ChevronDown, ArrowUp, ArrowDown, Minus, LineChart, Check, FolderInput, FolderMinus, List } from "lucide-react";
import type {
  Keyword,
  KeywordGroup,
  KeywordMonthlyPosition,
  KeywordPage,
  KeywordRankHistoryEntry,
  KeywordStatus,
  Priority,
  SearchIntent,
} from "@/lib/types";
import {
  addKeywordToPageAction,
  bulkAssignKeywordsToPageAction,
  bulkDeleteKeywordsAction,
  bulkRemoveKeywordsFromPageAction,
  createKeywordAction,
  deleteKeywordAction,
  importKeywordsAction,
  removeKeywordFromPageAction,
  setKeywordTrackedAction,
  updateKeywordAction,
} from "@/lib/actions";
import { cn, formatDateKey } from "@/lib/utils";
import { MonthlyPositionTracker } from "@/components/MonthlyPositionTracker";
import { KeywordGroupsCarousel } from "@/components/KeywordGroupsCarousel";

type SortMode = "default" | "rank_asc" | "rank_desc";

const SORT_LABEL: Record<SortMode, string> = {
  default: "Default order",
  rank_asc: "Rank: best (#1) first",
  rank_desc: "Rank: worst first",
};

function sortKeywords(keywords: Keyword[], mode: SortMode): Keyword[] {
  if (mode === "default") return keywords;
  return [...keywords].sort((a, b) => {
    if (a.currentRank === null && b.currentRank === null) return 0;
    if (a.currentRank === null) return 1;
    if (b.currentRank === null) return -1;
    return mode === "rank_asc" ? a.currentRank - b.currentRank : b.currentRank - a.currentRank;
  });
}

const STATUS_LABEL: Record<KeywordStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  ranking: "Ranking",
  achieved: "Achieved",
};

const STATUS_STYLE: Record<KeywordStatus, string> = {
  not_started: "bg-base-700/60 text-neutral-400",
  in_progress: "bg-sky-500/15 text-sky-400",
  ranking: "bg-amber-500/15 text-amber-400",
  achieved: "bg-accent-500/15 text-accent-400",
};

const EXPORT_COLUMNS = [
  "Keyword",
  "Target Page",
  "Search Volume",
  "Difficulty",
  "Current Rank",
  "Target Rank",
  "Status",
  "Notes",
] as const;

function normalizeStatus(value: unknown): KeywordStatus {
  const key = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return key in STATUS_LABEL ? (key as KeywordStatus) : "not_started";
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function exportKeywords(projectName: string, keywords: Keyword[]) {
  const XLSX = await import("xlsx");
  const rows = keywords.map((k) => ({
    Keyword: k.keyword,
    "Target Page": k.targetPage,
    "Search Volume": k.searchVolume ?? "",
    Difficulty: k.difficulty ?? "",
    "Current Rank": k.currentRank ?? "",
    "Target Rank": k.targetRank ?? "",
    Status: STATUS_LABEL[k.status],
    Notes: k.notes,
  }));
  const sheet = XLSX.utils.json_to_sheet(rows, { header: [...EXPORT_COLUMNS] });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Keywords");
  const safeName = projectName.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "project";
  XLSX.writeFile(workbook, `${safeName}-keywords.xlsx`);
}

/** Reads any sheet column name case-insensitively, tolerating the header variants a keyword-tracker spreadsheet is likely to use. */
function pick(row: Record<string, unknown>, ...names: string[]): unknown {
  const lower = new Map(Object.entries(row).map(([k, v]) => [k.trim().toLowerCase(), v]));
  for (const name of names) {
    const value = lower.get(name.toLowerCase());
    if (value !== undefined) return value;
  }
  return undefined;
}

async function parseKeywordFile(file: File) {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
  if (!firstSheet) return [];

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: "" });
  return rows.map((row) => ({
    keyword: String(pick(row, "keyword", "keywords") ?? "").trim(),
    targetPage: String(pick(row, "target page", "targetpage", "page", "url") ?? "").trim(),
    searchVolume: toNumberOrNull(pick(row, "search volume", "volume")),
    difficulty: toNumberOrNull(pick(row, "difficulty", "kd")),
    currentRank: toNumberOrNull(pick(row, "current rank", "rank")),
    targetRank: toNumberOrNull(pick(row, "target rank", "goal rank")),
    status: normalizeStatus(pick(row, "status")),
    notes: String(pick(row, "notes", "note") ?? "").trim(),
  }));
}

export function KeywordsPanel({
  projectId,
  projectName,
  keywords,
  rankHistory,
  monthlyPositions,
  groups,
  pagesByGroup,
  taskCountByKeyword = {},
}: {
  projectId: string;
  projectName: string;
  keywords: Keyword[];
  rankHistory: Record<string, KeywordRankHistoryEntry[]>;
  monthlyPositions: Record<string, KeywordMonthlyPosition[]>;
  groups: KeywordGroup[];
  pagesByGroup: Record<string, KeywordPage[]>;
  /** How many tasks link to each keyword (via task.keywordId) — shown as a "related tasks" badge. */
  taskCountByKeyword?: Record<string, number>;
}) {
  const [isPending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("default");
  const [modalPage, setModalPage] = useState<KeywordPage | null>(null);
  const [selectedUngrouped, setSelectedUngrouped] = useState<Set<string>>(new Set());
  const [selectedInModal, setSelectedInModal] = useState<Set<string>>(new Set());
  const [addingInModal, setAddingInModal] = useState(false);
  const [allKeywordsOpen, setAllKeywordsOpen] = useState(false);
  const [selectedAll, setSelectedAll] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  function toggleSelected(setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll(setter: React.Dispatch<React.SetStateAction<Set<string>>>, ids: string[]) {
    setter((prev) => {
      const allSelected = ids.length > 0 && ids.every((id) => prev.has(id));
      return allSelected ? new Set() : new Set(ids);
    });
  }

  function openPage(page: KeywordPage | null) {
    setSelectedInModal(new Set());
    setAddingInModal(false);
    setModalPage(page);
  }

  const ungroupedKeywords = useMemo(() => keywords.filter((k) => k.pageIds.length === 0), [keywords]);
  const sortedKeywords = useMemo(() => sortKeywords(ungroupedKeywords, sortMode), [ungroupedKeywords, sortMode]);
  const trackedKeywords = useMemo(() => keywords.filter((k) => k.isTracked), [keywords]);
  const modalKeywords = useMemo(
    () => (modalPage ? sortKeywords(keywords.filter((k) => k.pageIds.includes(modalPage.id)), sortMode) : []),
    [keywords, modalPage, sortMode],
  );

  function togglePage(keyword: Keyword, pageId: string, assign: boolean) {
    startTransition(() =>
      assign
        ? addKeywordToPageAction(keyword.id, projectId, pageId)
        : removeKeywordFromPageAction(keyword.id, projectId, pageId),
    );
  }

  function renderKeywordRow(keyword: Keyword) {
    return editingId === keyword.id ? (
      <KeywordForm
        key={keyword.id}
        projectId={projectId}
        keyword={keyword}
        onCancel={() => setEditingId(null)}
        onSaved={() => setEditingId(null)}
      />
    ) : (
      <KeywordRow
        key={keyword.id}
        keyword={keyword}
        taskCount={taskCountByKeyword[keyword.id] ?? 0}
        history={rankHistory[keyword.id] ?? []}
        groups={groups}
        pagesByGroup={pagesByGroup}
        isPending={isPending}
        selected={selectedUngrouped.has(keyword.id)}
        onToggleSelect={() => toggleSelected(setSelectedUngrouped, keyword.id)}
        historyOpen={historyId === keyword.id}
        onToggleHistory={() => setHistoryId(historyId === keyword.id ? null : keyword.id)}
        onEdit={() => setEditingId(keyword.id)}
        onDelete={() => startTransition(() => deleteKeywordAction(keyword.id, projectId))}
        onTogglePage={(pageId, assign) => togglePage(keyword, pageId, assign)}
        onRankChange={(rank) => {
          const formData = new FormData();
          formData.set("id", keyword.id);
          formData.set("projectId", projectId);
          formData.set("keyword", keyword.keyword);
          formData.set("targetPage", keyword.targetPage);
          formData.set("searchVolume", keyword.searchVolume?.toString() ?? "");
          formData.set("difficulty", keyword.difficulty?.toString() ?? "");
          formData.set("currentRank", rank);
          formData.set("targetRank", keyword.targetRank?.toString() ?? "");
          formData.set("status", keyword.status);
          formData.set("notes", keyword.notes);
          startTransition(() => updateKeywordAction(formData));
        }}
        onStatusChange={(status) => {
          const formData = new FormData();
          formData.set("id", keyword.id);
          formData.set("projectId", projectId);
          formData.set("keyword", keyword.keyword);
          formData.set("targetPage", keyword.targetPage);
          formData.set("searchVolume", keyword.searchVolume?.toString() ?? "");
          formData.set("difficulty", keyword.difficulty?.toString() ?? "");
          formData.set("currentRank", keyword.currentRank?.toString() ?? "");
          formData.set("targetRank", keyword.targetRank?.toString() ?? "");
          formData.set("status", status);
          formData.set("notes", keyword.notes);
          startTransition(() => updateKeywordAction(formData));
        }}
        onToggleTracked={() => startTransition(() => setKeywordTrackedAction(keyword.id, projectId, !keyword.isTracked))}
      />
    );
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setImportMessage(null);
    try {
      const rows = await parseKeywordFile(file);
      const withKeyword = rows.filter((r) => r.keyword);
      if (withKeyword.length === 0) {
        setImportMessage("No rows with a keyword found in that file.");
        return;
      }
      startTransition(async () => {
        const count = await importKeywordsAction(projectId, withKeyword);
        setImportMessage(`Imported ${count} keyword${count === 1 ? "" : "s"}.`);
      });
    } catch {
      setImportMessage("Couldn't read that file — make sure it's a .csv or .xlsx export.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <KeywordGroupsCarousel
        projectId={projectId}
        groups={groups}
        pagesByGroup={pagesByGroup}
        keywords={keywords}
        rankHistory={rankHistory}
        onOpenPage={openPage}
      />

      <MonthlyPositionTracker
        projectId={projectId}
        projectName={projectName}
        keywords={trackedKeywords}
        positions={monthlyPositions}
      />

    <div className="rounded-xl2 border border-base-700/60 bg-base-850 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Search size={16} className="text-accent-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Keywords</h2>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setAllKeywordsOpen(true)}
            disabled={keywords.length === 0}
            className="flex items-center gap-1 text-xs text-neutral-400 hover:text-accent-300 disabled:opacity-40 disabled:hover:text-neutral-400"
          >
            <List size={13} />
            All keywords
          </button>
          <button
            type="button"
            onClick={() => exportKeywords(projectName, keywords)}
            disabled={keywords.length === 0}
            className="flex items-center gap-1 text-xs text-neutral-400 hover:text-accent-300 disabled:opacity-40 disabled:hover:text-neutral-400"
          >
            <Download size={13} />
            Export
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 text-xs text-neutral-400 hover:text-accent-300 disabled:opacity-50"
          >
            <Upload size={13} />
            Import
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleImport}
            className="hidden"
          />
          {!adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex items-center gap-1 text-xs text-accent-400 hover:text-accent-300"
            >
              <Plus size={13} />
              Add keyword
            </button>
          )}
        </div>
      </div>

      {groups.length > 0 && (
        <p className="mb-3 text-xs text-neutral-500">
          Showing ungrouped keywords only. Keywords assigned to a group/page appear in that page&rsquo;s popup above.
        </p>
      )}

      {ungroupedKeywords.length > 1 && (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-[11px] text-neutral-500">
            <input
              type="checkbox"
              checked={sortedKeywords.length > 0 && sortedKeywords.every((k) => selectedUngrouped.has(k.id))}
              onChange={() => toggleSelectAll(setSelectedUngrouped, sortedKeywords.map((k) => k.id))}
              className="accent-accent-500"
            />
            Select all
          </label>
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-neutral-500">Sort</label>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="rounded-md border border-base-600 bg-base-900 px-2 py-1 text-xs text-neutral-300 focus:border-accent-500 focus:outline-none"
            >
              {(Object.keys(SORT_LABEL) as SortMode[]).map((mode) => (
                <option key={mode} value={mode}>
                  {SORT_LABEL[mode]}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {importMessage && <p className="mb-3 text-xs text-neutral-400">{importMessage}</p>}

      {adding && (
        <div className="mb-3">
          <KeywordForm projectId={projectId} keyword={null} onCancel={() => setAdding(false)} onSaved={() => setAdding(false)} />
        </div>
      )}

      {sortedKeywords.length === 0 && !adding && (
        <p className="rounded-lg border border-dashed border-base-700 p-6 text-center text-sm text-neutral-500">
          {keywords.length === 0
            ? "No keywords tracked yet. Add one to start tracking its rank over time."
            : "All keywords are assigned to a group. Open a page above to view them."}
        </p>
      )}

      {sortedKeywords.length > 0 && (
        <BulkActionsBar
          selectedCount={selectedUngrouped.size}
          groups={groups}
          pagesByGroup={pagesByGroup}
          assignLabel="Add to group"
          onAssign={(pageId) => {
            const ids = [...selectedUngrouped];
            startTransition(async () => {
              await bulkAssignKeywordsToPageAction(ids, projectId, pageId);
              setSelectedUngrouped(new Set());
            });
          }}
          onExport={() => exportKeywords(projectName, sortedKeywords.filter((k) => selectedUngrouped.has(k.id)))}
          onDelete={() => {
            if (!confirm(`Delete ${selectedUngrouped.size} keyword${selectedUngrouped.size === 1 ? "" : "s"}? This can't be undone.`)) return;
            const ids = [...selectedUngrouped];
            startTransition(async () => {
              await bulkDeleteKeywordsAction(ids, projectId);
              setSelectedUngrouped(new Set());
            });
          }}
          onClear={() => setSelectedUngrouped(new Set())}
          isPending={isPending}
        />
      )}

      <div className="flex flex-col gap-4">{sortedKeywords.map((keyword) => renderKeywordRow(keyword))}</div>
    </div>

    {modalPage && (
      <div
        className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-10 backdrop-blur-sm"
        onClick={() => openPage(null)}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-5xl rounded-xl2 border border-base-700/60 bg-base-850 p-5 shadow-card"
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-neutral-500">Page keywords</p>
              <h3 className="mt-0.5 truncate text-lg font-semibold text-neutral-100">{modalPage.name}</h3>
              {modalPage.url && <p className="mt-0.5 truncate text-xs text-neutral-500">{modalPage.url}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => exportKeywords(`${projectName}-${modalPage.name}`, modalKeywords)}
                disabled={modalKeywords.length === 0}
                className="flex items-center gap-1 text-xs text-neutral-400 hover:text-accent-300 disabled:opacity-40"
              >
                <Download size={13} />
                Export
              </button>
              {!addingInModal && (
                <button
                  type="button"
                  onClick={() => setAddingInModal(true)}
                  className="flex items-center gap-1 text-xs text-accent-400 hover:text-accent-300"
                >
                  <Plus size={13} />
                  Add keyword
                </button>
              )}
              <button
                onClick={() => openPage(null)}
                className="rounded-md p-1 text-neutral-500 hover:bg-base-700/60 hover:text-neutral-300"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {addingInModal && (
            <div className="mb-3">
              <KeywordForm
                projectId={projectId}
                keyword={null}
                defaultPageId={modalPage.id}
                onCancel={() => setAddingInModal(false)}
                onSaved={() => setAddingInModal(false)}
              />
            </div>
          )}

          {modalKeywords.length === 0 ? (
            <p className="rounded-lg border border-dashed border-base-700 p-6 text-center text-sm text-neutral-500">
              No keywords assigned to this page yet. Assign one from the Keywords list below, or add one directly above.
            </p>
          ) : (
            <div className="max-h-[65vh] overflow-y-auto">
              <BulkActionsBar
                selectedCount={selectedInModal.size}
                groups={groups}
                pagesByGroup={pagesByGroup}
                excludePageId={modalPage.id}
                assignLabel="Move to group"
                onAssign={(pageId) => {
                  const ids = [...selectedInModal];
                  startTransition(async () => {
                    await bulkAssignKeywordsToPageAction(ids, projectId, pageId);
                    await bulkRemoveKeywordsFromPageAction(ids, projectId, modalPage.id);
                    setSelectedInModal(new Set());
                  });
                }}
                onRemoveFromGroup={() => {
                  const ids = [...selectedInModal];
                  startTransition(async () => {
                    await bulkRemoveKeywordsFromPageAction(ids, projectId, modalPage.id);
                    setSelectedInModal(new Set());
                  });
                }}
                onExport={() => exportKeywords(`${projectName}-${modalPage.name}`, modalKeywords.filter((k) => selectedInModal.has(k.id)))}
                onDelete={() => {
                  if (!confirm(`Delete ${selectedInModal.size} keyword${selectedInModal.size === 1 ? "" : "s"}? This can't be undone.`))
                    return;
                  const ids = [...selectedInModal];
                  startTransition(async () => {
                    await bulkDeleteKeywordsAction(ids, projectId);
                    setSelectedInModal(new Set());
                  });
                }}
                onClear={() => setSelectedInModal(new Set())}
                isPending={isPending}
              />
              <PageKeywordsTable
                keywords={modalKeywords}
                rankHistory={rankHistory}
                groups={groups}
                pagesByGroup={pagesByGroup}
                projectId={projectId}
                isPending={isPending}
                editingId={editingId}
                selectedIds={selectedInModal}
                onToggleSelect={(id) => toggleSelected(setSelectedInModal, id)}
                onToggleSelectAll={() => toggleSelectAll(setSelectedInModal, modalKeywords.map((k) => k.id))}
                onEdit={setEditingId}
                onCancelEdit={() => setEditingId(null)}
                onSaved={() => setEditingId(null)}
                historyId={historyId}
                onToggleHistory={(id) => setHistoryId(historyId === id ? null : id)}
                onDelete={(keyword) => startTransition(() => deleteKeywordAction(keyword.id, projectId))}
                onTogglePage={togglePage}
                onToggleTracked={(keyword) =>
                  startTransition(() => setKeywordTrackedAction(keyword.id, projectId, !keyword.isTracked))
                }
                onRankChange={(keyword, rank) => {
                  const formData = new FormData();
                  formData.set("id", keyword.id);
                  formData.set("projectId", projectId);
                  formData.set("keyword", keyword.keyword);
                  formData.set("targetPage", keyword.targetPage);
                  formData.set("searchVolume", keyword.searchVolume?.toString() ?? "");
                  formData.set("difficulty", keyword.difficulty?.toString() ?? "");
                  formData.set("currentRank", rank);
                  formData.set("targetRank", keyword.targetRank?.toString() ?? "");
                  formData.set("status", keyword.status);
                  formData.set("notes", keyword.notes);
                  startTransition(() => updateKeywordAction(formData));
                }}
                onStatusChange={(keyword, status) => {
                  const formData = new FormData();
                  formData.set("id", keyword.id);
                  formData.set("projectId", projectId);
                  formData.set("keyword", keyword.keyword);
                  formData.set("targetPage", keyword.targetPage);
                  formData.set("searchVolume", keyword.searchVolume?.toString() ?? "");
                  formData.set("difficulty", keyword.difficulty?.toString() ?? "");
                  formData.set("currentRank", keyword.currentRank?.toString() ?? "");
                  formData.set("targetRank", keyword.targetRank?.toString() ?? "");
                  formData.set("status", status);
                  formData.set("notes", keyword.notes);
                  startTransition(() => updateKeywordAction(formData));
                }}
              />
            </div>
          )}
        </div>
      </div>
    )}

    {allKeywordsOpen && (
      <div
        className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-10 backdrop-blur-sm"
        onClick={() => {
          setAllKeywordsOpen(false);
          setSelectedAll(new Set());
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-5xl rounded-xl2 border border-base-700/60 bg-base-850 p-5 shadow-card"
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-neutral-500">{projectName}</p>
              <h3 className="mt-0.5 text-lg font-semibold text-neutral-100">
                All keywords ({keywords.length})
              </h3>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => exportKeywords(projectName, keywords)}
                disabled={keywords.length === 0}
                className="flex items-center gap-1 text-xs text-neutral-400 hover:text-accent-300 disabled:opacity-40"
              >
                <Download size={13} />
                Export all
              </button>
              <button
                onClick={() => {
                  setAllKeywordsOpen(false);
                  setSelectedAll(new Set());
                }}
                className="rounded-md p-1 text-neutral-500 hover:bg-base-700/60 hover:text-neutral-300"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {keywords.length === 0 ? (
            <p className="rounded-lg border border-dashed border-base-700 p-6 text-center text-sm text-neutral-500">
              No keywords tracked yet.
            </p>
          ) : (
            <div className="max-h-[70vh] overflow-y-auto">
              <BulkActionsBar
                selectedCount={selectedAll.size}
                groups={groups}
                pagesByGroup={pagesByGroup}
                assignLabel="Add to group"
                onAssign={(pageId) => {
                  const ids = [...selectedAll];
                  startTransition(async () => {
                    await bulkAssignKeywordsToPageAction(ids, projectId, pageId);
                    setSelectedAll(new Set());
                  });
                }}
                onExport={() => exportKeywords(projectName, keywords.filter((k) => selectedAll.has(k.id)))}
                onDelete={() => {
                  if (!confirm(`Delete ${selectedAll.size} keyword${selectedAll.size === 1 ? "" : "s"}? This can't be undone.`)) return;
                  const ids = [...selectedAll];
                  startTransition(async () => {
                    await bulkDeleteKeywordsAction(ids, projectId);
                    setSelectedAll(new Set());
                  });
                }}
                onClear={() => setSelectedAll(new Set())}
                isPending={isPending}
              />
              <PageKeywordsTable
                keywords={sortKeywords(keywords, sortMode)}
                rankHistory={rankHistory}
                groups={groups}
                pagesByGroup={pagesByGroup}
                projectId={projectId}
                isPending={isPending}
                editingId={editingId}
                selectedIds={selectedAll}
                onToggleSelect={(id) => toggleSelected(setSelectedAll, id)}
                onToggleSelectAll={() => toggleSelectAll(setSelectedAll, keywords.map((k) => k.id))}
                onEdit={setEditingId}
                onCancelEdit={() => setEditingId(null)}
                onSaved={() => setEditingId(null)}
                historyId={historyId}
                onToggleHistory={(id) => setHistoryId(historyId === id ? null : id)}
                onDelete={(keyword) => startTransition(() => deleteKeywordAction(keyword.id, projectId))}
                onTogglePage={togglePage}
                onToggleTracked={(keyword) =>
                  startTransition(() => setKeywordTrackedAction(keyword.id, projectId, !keyword.isTracked))
                }
                onRankChange={(keyword, rank) => {
                  const formData = new FormData();
                  formData.set("id", keyword.id);
                  formData.set("projectId", projectId);
                  formData.set("keyword", keyword.keyword);
                  formData.set("targetPage", keyword.targetPage);
                  formData.set("searchVolume", keyword.searchVolume?.toString() ?? "");
                  formData.set("difficulty", keyword.difficulty?.toString() ?? "");
                  formData.set("currentRank", rank);
                  formData.set("targetRank", keyword.targetRank?.toString() ?? "");
                  formData.set("status", keyword.status);
                  formData.set("notes", keyword.notes);
                  startTransition(() => updateKeywordAction(formData));
                }}
                onStatusChange={(keyword, status) => {
                  const formData = new FormData();
                  formData.set("id", keyword.id);
                  formData.set("projectId", projectId);
                  formData.set("keyword", keyword.keyword);
                  formData.set("targetPage", keyword.targetPage);
                  formData.set("searchVolume", keyword.searchVolume?.toString() ?? "");
                  formData.set("difficulty", keyword.difficulty?.toString() ?? "");
                  formData.set("currentRank", keyword.currentRank?.toString() ?? "");
                  formData.set("targetRank", keyword.targetRank?.toString() ?? "");
                  formData.set("status", status);
                  formData.set("notes", keyword.notes);
                  startTransition(() => updateKeywordAction(formData));
                }}
              />
            </div>
          )}
        </div>
      </div>
    )}
    </div>
  );
}

function BulkActionsBar({
  selectedCount,
  groups,
  pagesByGroup,
  excludePageId,
  assignLabel,
  onAssign,
  onRemoveFromGroup,
  onExport,
  onDelete,
  onClear,
  isPending,
}: {
  selectedCount: number;
  groups: KeywordGroup[];
  pagesByGroup: Record<string, KeywordPage[]>;
  excludePageId?: string;
  assignLabel: string;
  onAssign: (pageId: string) => void;
  onRemoveFromGroup?: () => void;
  onExport?: () => void;
  onDelete: () => void;
  onClear: () => void;
  isPending: boolean;
}) {
  if (selectedCount === 0) return null;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-accent-500/30 bg-accent-500/5 px-3 py-2">
      <span className="text-xs font-medium text-accent-300">
        {selectedCount} keyword{selectedCount === 1 ? "" : "s"} selected
      </span>
      <BulkPagePicker groups={groups} pagesByGroup={pagesByGroup} excludePageId={excludePageId} label={assignLabel} onPick={onAssign} />
      {onRemoveFromGroup && (
        <button
          type="button"
          disabled={isPending}
          onClick={onRemoveFromGroup}
          className="flex items-center gap-1.5 rounded-md border border-base-600 px-2.5 py-1.5 text-xs text-neutral-300 hover:border-amber-500/50 hover:text-amber-300 disabled:opacity-50"
        >
          <FolderMinus size={13} />
          Remove from this group
        </button>
      )}
      {onExport && (
        <button
          type="button"
          onClick={onExport}
          className="flex items-center gap-1.5 rounded-md border border-base-600 px-2.5 py-1.5 text-xs text-neutral-300 hover:border-accent-500/50 hover:text-accent-300"
        >
          <Download size={13} />
          Export selected
        </button>
      )}
      <button
        type="button"
        disabled={isPending}
        onClick={onDelete}
        className="flex items-center gap-1.5 rounded-md border border-base-600 px-2.5 py-1.5 text-xs text-neutral-300 hover:border-rose-500/50 hover:text-rose-400 disabled:opacity-50"
      >
        <Trash2 size={13} />
        Delete selected
      </button>
      <button type="button" onClick={onClear} className="ml-auto text-xs text-neutral-500 hover:text-neutral-300">
        Clear selection
      </button>
    </div>
  );
}

function BulkPagePicker({
  groups,
  pagesByGroup,
  excludePageId,
  label,
  onPick,
}: {
  groups: KeywordGroup[];
  pagesByGroup: Record<string, KeywordPage[]>;
  excludePageId?: string;
  label: string;
  onPick: (pageId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const q = query.trim().toLowerCase();

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-md border border-base-600 px-2.5 py-1.5 text-xs text-neutral-300 hover:border-accent-500/50 hover:text-accent-300"
      >
        <FolderInput size={13} />
        {label}
        <ChevronDown size={11} className={cn("transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-[60] mt-1 w-64 overflow-hidden rounded-lg border border-base-600 bg-base-900 shadow-lg">
          <div className="border-b border-base-700 p-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search pages…"
              className="w-full rounded-md border border-base-600 bg-base-950 px-2 py-1 text-xs text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-1.5">
            {groups.length === 0 && <p className="px-2 py-1.5 text-[11px] text-neutral-600">No groups yet</p>}
            {groups.map((group) => {
              const pages = (pagesByGroup[group.id] ?? [])
                .filter((p) => p.id !== excludePageId)
                .filter((p) => !q || p.name.toLowerCase().includes(q));
              if (q && pages.length === 0) return null;
              return (
                <div key={group.id} className="mt-1.5 first:mt-0">
                  <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{group.name}</p>
                  {pages.length === 0 ? (
                    <p className="px-2 py-1 text-[11px] text-neutral-600">No pages</p>
                  ) : (
                    pages.map((page) => (
                      <button
                        key={page.id}
                        type="button"
                        onClick={() => {
                          onPick(page.id);
                          setOpen(false);
                          setQuery("");
                        }}
                        className="flex w-full items-center truncate rounded-md px-2 py-1.5 text-left text-xs text-neutral-300 hover:bg-base-800"
                      >
                        <span className="truncate">{page.name}</span>
                      </button>
                    ))
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const INTENT_LABEL: Record<SearchIntent, string> = {
  informational: "Informational",
  navigational: "Navigational",
  commercial: "Commercial",
  transactional: "Transactional",
  local: "Local",
};

const PRIORITY_STYLE: Record<Priority, string> = {
  low: "bg-base-700/60 text-neutral-400",
  medium: "bg-sky-500/15 text-sky-400",
  high: "bg-rose-500/15 text-rose-400",
};

function KeywordRow({
  keyword,
  history,
  groups,
  pagesByGroup,
  historyOpen,
  onToggleHistory,
  isPending,
  selected,
  onToggleSelect,
  onEdit,
  onDelete,
  onRankChange,
  onStatusChange,
  onToggleTracked,
  onTogglePage,
  taskCount = 0,
}: {
  keyword: Keyword;
  history: KeywordRankHistoryEntry[];
  groups: KeywordGroup[];
  pagesByGroup: Record<string, KeywordPage[]>;
  historyOpen: boolean;
  onToggleHistory: () => void;
  isPending: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRankChange: (rank: string) => void;
  onStatusChange: (status: KeywordStatus) => void;
  onToggleTracked: () => void;
  onTogglePage: (pageId: string, assign: boolean) => void;
  taskCount?: number;
}) {
  const assignedPages = keyword.pageIds
    .map((id) => Object.values(pagesByGroup).flat().find((p) => p.id === id))
    .filter((p): p is KeywordPage => Boolean(p));

  return (
    <div
      className={cn(
        "rounded-lg border p-4 shadow-md transition-colors",
        selected ? "border-accent-500/60 bg-accent-500/5" : "border-base-600 bg-base-800 hover:border-accent-500/50",
      )}
    >
      <div className="flex flex-col gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            className="mt-1.5 shrink-0 accent-accent-500"
            aria-label={`Select ${keyword.keyword}`}
          />
          <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="break-words text-base font-semibold text-neutral-100">{keyword.keyword}</p>
            {keyword.currentRank !== null && (
              <span className="rounded-full bg-base-950 px-2 py-0.5 text-xs font-medium text-neutral-300">
                #{keyword.currentRank}
              </span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-neutral-400">
            {assignedPages.map((page) => {
              const group = groups.find((g) => g.id === page.groupId);
              return (
                <span key={page.id} className="rounded-full bg-accent-500/10 px-2 py-0.5 text-accent-400">
                  {group ? `${group.name} / ` : ""}
                  {page.name}
                </span>
              );
            })}
            {assignedPages.length === 0 && keyword.targetPage && (
              <span className="rounded-full bg-base-800 px-2 py-0.5">{keyword.targetPage}</span>
            )}
            {keyword.searchVolume !== null && (
              <span className="rounded-full bg-base-800 px-2 py-0.5">Vol {keyword.searchVolume.toLocaleString()}</span>
            )}
            {keyword.difficulty !== null && <span className="rounded-full bg-base-800 px-2 py-0.5">KD {keyword.difficulty}</span>}
            {keyword.targetRank !== null && (
              <span className="rounded-full bg-base-800 px-2 py-0.5">Target #{keyword.targetRank}</span>
            )}
            <span className={cn("rounded-full px-2 py-0.5 font-medium", PRIORITY_STYLE[keyword.priority])}>
              {keyword.priority} priority
            </span>
            {keyword.searchIntent && (
              <span className="rounded-full bg-base-800 px-2 py-0.5">{INTENT_LABEL[keyword.searchIntent]}</span>
            )}
            {taskCount > 0 && (
              <span className="rounded-full bg-base-800 px-2 py-0.5">
                {taskCount} related task{taskCount === 1 ? "" : "s"}
              </span>
            )}
          </div>
          {keyword.notes && <p className="mt-1.5 break-words text-xs text-neutral-500">{keyword.notes}</p>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-base-700 pt-3">
          {groups.length > 0 && (
            <PageAssignMultiDropdown
              assignedPageIds={keyword.pageIds}
              groups={groups}
              pagesByGroup={pagesByGroup}
              onToggle={onTogglePage}
            />
          )}
          <label className="flex items-center gap-1.5 text-xs text-neutral-500">
            Rank
            <input
              type="number"
              min="0"
              defaultValue={keyword.currentRank ?? ""}
              onBlur={(e) => {
                if (e.target.value !== (keyword.currentRank?.toString() ?? "")) onRankChange(e.target.value);
              }}
              className="w-16 rounded-md border border-base-600 bg-base-950 px-2 py-1 text-xs text-neutral-100 focus:border-accent-500 focus:outline-none"
            />
          </label>
          <select
            value={keyword.status}
            onChange={(e) => onStatusChange(e.target.value as KeywordStatus)}
            className={cn("rounded-full border-0 px-2.5 py-1 text-[11px] font-medium focus:outline-none", STATUS_STYLE[keyword.status])}
          >
            {(Object.keys(STATUS_LABEL) as KeywordStatus[]).map((s) => (
              <option key={s} value={s} className="bg-base-900 text-neutral-100">
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onToggleHistory}
            disabled={history.length === 0}
            className="flex items-center gap-1 rounded-md p-1.5 text-neutral-400 hover:text-accent-300 disabled:opacity-30 disabled:hover:text-neutral-400"
            title="Rank history"
          >
            <History size={13} />
            <ChevronDown size={11} className={cn("transition-transform", historyOpen && "rotate-180")} />
          </button>
          <button
            type="button"
            onClick={onToggleTracked}
            className={cn(
              "flex items-center gap-1 rounded-md p-1.5 hover:text-accent-300",
              keyword.isTracked ? "text-accent-400" : "text-neutral-400",
            )}
            title={keyword.isTracked ? "Remove from monthly tracker" : "Add to monthly tracker"}
          >
            <LineChart size={13} />
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="rounded-md p-1.5 text-neutral-400 hover:text-accent-300"
            title="Edit keyword"
          >
            <Pencil size={13} />
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={onDelete}
            className="rounded-md p-1.5 text-neutral-400 hover:text-rose-400 disabled:opacity-50"
            title="Delete keyword"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {historyOpen && <RankHistoryList history={history} />}
    </div>
  );
}

function PageAssignMultiDropdown({
  assignedPageIds,
  groups,
  pagesByGroup,
  onToggle,
  compact = false,
}: {
  assignedPageIds: string[];
  groups: KeywordGroup[];
  pagesByGroup: Record<string, KeywordPage[]>;
  onToggle: (pageId: string, assign: boolean) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const q = query.trim().toLowerCase();
  const assignedSet = new Set(assignedPageIds);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-1 rounded-md border border-base-600 bg-base-950 px-2 py-1 text-[11px] text-neutral-300 hover:border-accent-500",
          compact ? "max-w-[7rem]" : "max-w-[12rem]",
        )}
        title="Assign to pages"
      >
        <span className="truncate">
          {assignedPageIds.length === 0 ? "Unassigned" : `${assignedPageIds.length} page${assignedPageIds.length === 1 ? "" : "s"}`}
        </span>
        <ChevronDown size={11} className={cn("shrink-0 text-neutral-500 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-[60] mt-1 w-64 overflow-hidden rounded-lg border border-base-600 bg-base-900 shadow-lg">
          <div className="border-b border-base-700 p-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search pages…"
              className="w-full rounded-md border border-base-600 bg-base-950 px-2 py-1 text-xs text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-1.5">
            {groups.length === 0 && <p className="px-2 py-1.5 text-[11px] text-neutral-600">No groups yet</p>}
            {groups.map((group) => {
              const pages = (pagesByGroup[group.id] ?? []).filter((p) => !q || p.name.toLowerCase().includes(q));
              if (q && pages.length === 0) return null;
              return (
                <div key={group.id} className="mt-1.5 first:mt-0">
                  <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{group.name}</p>
                  {pages.length === 0 ? (
                    <p className="px-2 py-1 text-[11px] text-neutral-600">No pages yet</p>
                  ) : (
                    pages.map((page) => {
                      const assigned = assignedSet.has(page.id);
                      return (
                        <button
                          key={page.id}
                          type="button"
                          onClick={() => onToggle(page.id, !assigned)}
                          className={cn(
                            "flex w-full items-center gap-2 truncate rounded-md px-2 py-1.5 text-left text-xs",
                            assigned ? "bg-accent-500/15 text-accent-300" : "text-neutral-300 hover:bg-base-800",
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border",
                              assigned ? "border-accent-400 bg-accent-500/20" : "border-base-600",
                            )}
                          >
                            {assigned && <Check size={10} />}
                          </span>
                          <span className="truncate">{page.name}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function PageKeywordsTable({
  keywords,
  rankHistory,
  groups,
  pagesByGroup,
  projectId,
  isPending,
  editingId,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onEdit,
  onCancelEdit,
  onSaved,
  historyId,
  onToggleHistory,
  onDelete,
  onTogglePage,
  onToggleTracked,
  onRankChange,
  onStatusChange,
}: {
  keywords: Keyword[];
  rankHistory: Record<string, KeywordRankHistoryEntry[]>;
  groups: KeywordGroup[];
  pagesByGroup: Record<string, KeywordPage[]>;
  projectId: string;
  isPending: boolean;
  editingId: string | null;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onEdit: (id: string) => void;
  onCancelEdit: () => void;
  onSaved: () => void;
  historyId: string | null;
  onToggleHistory: (id: string) => void;
  onDelete: (keyword: Keyword) => void;
  onTogglePage: (keyword: Keyword, pageId: string, assign: boolean) => void;
  onToggleTracked: (keyword: Keyword) => void;
  onRankChange: (keyword: Keyword, rank: string) => void;
  onStatusChange: (keyword: Keyword, status: KeywordStatus) => void;
}) {
  const allPages = useMemo(() => Object.values(pagesByGroup).flat(), [pagesByGroup]);
  const allSelected = keywords.length > 0 && keywords.every((k) => selectedIds.has(k.id));

  return (
    <div className="overflow-x-auto rounded-lg border border-base-600">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-base-600 bg-base-900 text-left text-[11px] uppercase tracking-wide text-neutral-500">
            <th className="w-8 px-3 py-2 font-medium">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleSelectAll}
                className="accent-accent-500"
                aria-label="Select all keywords"
              />
            </th>
            <th className="px-3 py-2 font-medium">Keyword</th>
            <th className="px-3 py-2 font-medium">Vol</th>
            <th className="px-3 py-2 font-medium">KD</th>
            <th className="px-3 py-2 font-medium">Rank</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {keywords.map((keyword) => {
            if (editingId === keyword.id) {
              return (
                <tr key={keyword.id} className="border-b border-base-700/60">
                  <td colSpan={7} className="bg-base-850 p-2">
                    <KeywordForm projectId={projectId} keyword={keyword} onCancel={onCancelEdit} onSaved={onSaved} />
                  </td>
                </tr>
              );
            }

            const history = rankHistory[keyword.id] ?? [];
            const assignedPages = keyword.pageIds
              .map((id) => allPages.find((p) => p.id === id))
              .filter((p): p is KeywordPage => Boolean(p));

            return (
              <Fragment key={keyword.id}>
                <tr
                  className={cn(
                    "border-b border-base-700/60 hover:bg-base-900",
                    selectedIds.has(keyword.id) ? "bg-accent-500/5" : "odd:bg-base-900/40",
                  )}
                >
                  <td className="px-3 py-2 align-top">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(keyword.id)}
                      onChange={() => onToggleSelect(keyword.id)}
                      className="accent-accent-500"
                      aria-label={`Select ${keyword.keyword}`}
                    />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <p className="font-medium text-neutral-100">{keyword.keyword}</p>
                    {assignedPages.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {assignedPages.map((page) => (
                          <span key={page.id} className="rounded-full bg-accent-500/10 px-1.5 py-0.5 text-[10px] text-accent-400">
                            {page.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top text-neutral-400">{keyword.searchVolume ?? "—"}</td>
                  <td className="px-3 py-2 align-top text-neutral-400">{keyword.difficulty ?? "—"}</td>
                  <td className="px-3 py-2 align-top">
                    <input
                      type="number"
                      min="0"
                      defaultValue={keyword.currentRank ?? ""}
                      onBlur={(e) => {
                        if (e.target.value !== (keyword.currentRank?.toString() ?? "")) onRankChange(keyword, e.target.value);
                      }}
                      className="w-14 rounded-md border border-base-600 bg-base-950 px-1.5 py-1 text-xs text-neutral-100 focus:border-accent-500 focus:outline-none"
                    />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <select
                      value={keyword.status}
                      onChange={(e) => onStatusChange(keyword, e.target.value as KeywordStatus)}
                      className={cn(
                        "rounded-full border-0 px-2 py-1 text-[10px] font-medium focus:outline-none",
                        STATUS_STYLE[keyword.status],
                      )}
                    >
                      {(Object.keys(STATUS_LABEL) as KeywordStatus[]).map((s) => (
                        <option key={s} value={s} className="bg-base-900 text-neutral-100">
                          {STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="flex items-center justify-end gap-1">
                      {groups.length > 0 && (
                        <PageAssignMultiDropdown
                          assignedPageIds={keyword.pageIds}
                          groups={groups}
                          pagesByGroup={pagesByGroup}
                          onToggle={(pageId, assign) => onTogglePage(keyword, pageId, assign)}
                          compact
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => onToggleHistory(keyword.id)}
                        disabled={history.length === 0}
                        className="rounded-md p-1.5 text-neutral-400 hover:text-accent-300 disabled:opacity-30 disabled:hover:text-neutral-400"
                        title="Rank history"
                      >
                        <History size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleTracked(keyword)}
                        className={cn(
                          "rounded-md p-1.5 hover:text-accent-300",
                          keyword.isTracked ? "text-accent-400" : "text-neutral-400",
                        )}
                        title={keyword.isTracked ? "Remove from monthly tracker" : "Add to monthly tracker"}
                      >
                        <LineChart size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onEdit(keyword.id)}
                        className="rounded-md p-1.5 text-neutral-400 hover:text-accent-300"
                        title="Edit keyword"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => onDelete(keyword)}
                        className="rounded-md p-1.5 text-neutral-400 hover:text-rose-400 disabled:opacity-50"
                        title="Delete keyword"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
                {historyId === keyword.id && history.length > 0 && (
                  <tr className="border-b border-base-700/60 bg-base-900/60">
                    <td colSpan={7} className="px-3 py-2">
                      <RankHistoryList history={history} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RankHistoryList({ history }: { history: KeywordRankHistoryEntry[] }) {
  return (
    <div className="mt-3 flex flex-col gap-1 border-t border-base-700/60 pt-2.5">
      {history.map((entry, i) => {
        const previous = history[i + 1];
        const delta = previous && entry.rank !== null && previous.rank !== null ? previous.rank - entry.rank : null;
        return (
          <div key={entry.id} className="flex items-center justify-between text-xs">
            <span className="text-neutral-500">{formatDateKey(entry.recordedOn)}</span>
            <div className="flex items-center gap-1.5">
              <span className="text-neutral-200">{entry.rank !== null ? `#${entry.rank}` : "Not ranking"}</span>
              {delta !== null && delta !== 0 && (
                <span className={cn("flex items-center gap-0.5", delta > 0 ? "text-accent-400" : "text-rose-400")}>
                  {delta > 0 ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
                  {Math.abs(delta)}
                </span>
              )}
              {delta === 0 && <Minus size={11} className="text-neutral-600" />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KeywordForm({
  projectId,
  keyword,
  defaultPageId,
  onSaved,
  onCancel,
}: {
  projectId: string;
  keyword: Keyword | null;
  defaultPageId?: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => {
        formData.set("projectId", projectId);
        if (keyword) formData.set("id", keyword.id);
        else if (defaultPageId) formData.set("pageId", defaultPageId);
        startTransition(async () => {
          await (keyword ? updateKeywordAction(formData) : createKeywordAction(formData));
          onSaved();
        });
      }}
      className="flex flex-col gap-2 rounded-lg border border-base-700/60 bg-base-900 p-3"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-400">{keyword ? "Edit keyword" : "New keyword"}</span>
        <button type="button" onClick={onCancel} className="text-neutral-500 hover:text-neutral-300">
          <X size={14} />
        </button>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          name="keyword"
          required
          placeholder="Keyword or phrase"
          defaultValue={keyword?.keyword ?? ""}
          className="w-full rounded-md border border-base-600 bg-base-950 px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
        />
        {/* targetPage is frozen (legacy free-text field) — shown read-only for
            older keywords that still have one, never collected for new ones.
            Use the Pages picker below (or the On-Page module) to set the
            real target page going forward. */}
        {keyword?.targetPage ? (
          <input
            disabled
            value={keyword.targetPage}
            title="Legacy target page — read-only. Use the page picker instead."
            className="w-full rounded-md border border-base-700/60 bg-base-900/60 px-2.5 py-1.5 text-sm text-neutral-500"
          />
        ) : (
          <div />
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <NumberField name="searchVolume" label="Volume" defaultValue={keyword?.searchVolume} />
        <NumberField name="difficulty" label="Difficulty" defaultValue={keyword?.difficulty} />
        <NumberField name="currentRank" label="Current rank" defaultValue={keyword?.currentRank} />
        <NumberField name="targetRank" label="Target rank" defaultValue={keyword?.targetRank} />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-[11px] text-neutral-500">Status</label>
          <select
            name="status"
            defaultValue={keyword?.status ?? "not_started"}
            className="w-full rounded-md border border-base-600 bg-base-950 px-2.5 py-1.5 text-sm text-neutral-100 focus:border-accent-500 focus:outline-none"
          >
            {(Object.keys(STATUS_LABEL) as KeywordStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-neutral-500">Priority</label>
          <select
            name="priority"
            defaultValue={keyword?.priority ?? "medium"}
            className="w-full rounded-md border border-base-600 bg-base-950 px-2.5 py-1.5 text-sm text-neutral-100 focus:border-accent-500 focus:outline-none"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-neutral-500">Search intent</label>
          <select
            name="searchIntent"
            defaultValue={keyword?.searchIntent ?? ""}
            className="w-full rounded-md border border-base-600 bg-base-950 px-2.5 py-1.5 text-sm text-neutral-100 focus:border-accent-500 focus:outline-none"
          >
            <option value="">Not set</option>
            <option value="local">Local</option>
            <option value="commercial">Commercial</option>
            <option value="transactional">Transactional</option>
            <option value="informational">Informational</option>
            <option value="navigational">Navigational</option>
          </select>
        </div>
      </div>
      <textarea
        name="notes"
        rows={2}
        placeholder="Notes (optional)"
        defaultValue={keyword?.notes ?? ""}
        className="w-full rounded-md border border-base-600 bg-base-950 px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="w-fit rounded-md bg-accent-500 px-3 py-1.5 text-xs font-medium text-base-950 hover:bg-accent-400 disabled:opacity-60"
        >
          {isPending ? "Saving…" : "Save keyword"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="w-fit rounded-md border border-base-600 px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-200"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function NumberField({ name, label, defaultValue }: { name: string; label: string; defaultValue?: number | null }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] text-neutral-500">{label}</label>
      <input
        name={name}
        type="number"
        min="0"
        defaultValue={defaultValue ?? ""}
        className="w-full rounded-md border border-base-600 bg-base-950 px-2.5 py-1.5 text-sm text-neutral-100 focus:border-accent-500 focus:outline-none"
      />
    </div>
  );
}
