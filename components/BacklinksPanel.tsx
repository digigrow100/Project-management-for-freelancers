"use client";

import { useState, useTransition } from "react";
import {
  Link2,
  Plus,
  Pencil,
  Trash2,
  X,
  Eye,
  EyeOff,
  Copy,
  KeyRound,
  ExternalLink,
  Check,
  Paperclip,
} from "lucide-react";
import type { BacklinkCategory, BacklinkCategoryType, BacklinkEntry, BacklinkLink, Keyword, Profile } from "@/lib/types";
import {
  createBacklinkCategoryAction,
  createBacklinkEntryAction,
  deleteBacklinkCategoryAction,
  deleteBacklinkEntryAction,
  revealBacklinkPasswordAction,
  updateBacklinkCategoryAction,
  updateBacklinkEntryAction,
} from "@/lib/actions";
import { cn } from "@/lib/utils";
import { DragScrollRow } from "@/components/DragScrollRow";
import { VaultPasswordModal } from "@/components/VaultPasswordModal";
import { NewTaskForm } from "@/components/NewTaskForm";

export const CATEGORY_TYPE_LABEL: Record<BacklinkCategoryType, string> = {
  local_citation: "Local Citation",
  web2: "Web 2.0",
  guest_post: "Guest Post",
  outreach: "Outreach",
  competitor: "Competitor",
  social: "Social",
  other: "Other",
};

const STATUS_LABEL = {
  not_started: "Not started",
  account_created: "Account created",
  submitted: "Submitted",
  verification_pending: "Verification pending",
  live: "Live",
  rejected: "Rejected",
} as const;

const STATUS_STYLE: Record<keyof typeof STATUS_LABEL, string> = {
  not_started: "bg-base-700/60 text-neutral-400",
  account_created: "bg-sky-500/15 text-sky-400",
  submitted: "bg-amber-500/15 text-amber-400",
  verification_pending: "bg-amber-500/15 text-amber-400",
  live: "bg-accent-500/15 text-accent-400",
  rejected: "bg-rose-500/15 text-rose-400",
};

export function BacklinksPanel({
  projectId,
  categories,
  entriesByCategory,
  hasVaultPassword,
  keywords = [],
  assignableMembers = [],
}: {
  projectId: string;
  categories: BacklinkCategory[];
  entriesByCategory: Record<string, BacklinkEntry[]>;
  hasVaultPassword: boolean;
  keywords?: Keyword[];
  assignableMembers?: Profile[];
}) {
  const [isPending, startTransition] = useTransition();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(categories[0]?.id ?? null);
  const [addingCategory, setAddingCategory] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [addingEntry, setAddingEntry] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [vaultModalOpen, setVaultModalOpen] = useState(false);
  const [vaultPasswordSet, setVaultPasswordSet] = useState(hasVaultPassword);

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId) ?? categories[0] ?? null;
  const entries = selectedCategory ? entriesByCategory[selectedCategory.id] ?? [] : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl2 border border-base-700/60 bg-base-850 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Link2 size={16} className="text-accent-400" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Backlinks</h2>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setVaultModalOpen(true)}
              className="flex items-center gap-1 text-xs text-neutral-400 hover:text-accent-300"
            >
              <KeyRound size={13} />
              {vaultPasswordSet ? "Change security password" : "Set security password"}
            </button>
            {!addingCategory && (
              <button
                type="button"
                onClick={() => setAddingCategory(true)}
                className="flex items-center gap-1 text-xs text-accent-400 hover:text-accent-300"
              >
                <Plus size={13} />
                New category
              </button>
            )}
          </div>
        </div>

        {addingCategory && (
          <CategoryForm
            projectId={projectId}
            category={null}
            onCancel={() => setAddingCategory(false)}
            onSaved={(id) => {
              setAddingCategory(false);
              setSelectedCategoryId(id);
            }}
          />
        )}

        {categories.length === 0 && !addingCategory && (
          <p className="rounded-lg border border-dashed border-base-700 p-6 text-center text-sm text-neutral-500">
            No categories yet. Create one to start tracking backlinks.
          </p>
        )}

        {categories.length > 0 && (
          <DragScrollRow className="-mx-1 px-1 pb-1">
            {categories.map((category) =>
              editingCategoryId === category.id ? (
                <div key={category.id} className="w-56 shrink-0">
                  <CategoryForm
                    projectId={projectId}
                    category={category}
                    onCancel={() => setEditingCategoryId(null)}
                    onSaved={() => setEditingCategoryId(null)}
                  />
                </div>
              ) : (
                <div
                  key={category.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedCategoryId(category.id)}
                  className={cn(
                    "group flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                    selectedCategory?.id === category.id
                      ? "bg-accent-500/15 text-accent-300"
                      : "bg-base-900 text-neutral-400 hover:text-neutral-200",
                  )}
                >
                  <span>{category.name}</span>
                  <span className="rounded-full bg-base-800 px-1.5 text-[10px] text-neutral-500">
                    {CATEGORY_TYPE_LABEL[category.categoryType]}
                  </span>
                  <span className="rounded-full bg-base-800 px-1.5 text-[10px] text-neutral-400">
                    {(entriesByCategory[category.id] ?? []).length}
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingCategoryId(category.id);
                    }}
                    className="rounded p-0.5 opacity-0 hover:text-accent-300 group-hover:opacity-100"
                  >
                    <Pencil size={10} />
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isPending) {
                        startTransition(() => deleteBacklinkCategoryAction(category.id, projectId));
                        if (selectedCategoryId === category.id) setSelectedCategoryId(null);
                      }
                    }}
                    className="rounded p-0.5 opacity-0 hover:text-rose-400 group-hover:opacity-100"
                  >
                    <Trash2 size={10} />
                  </span>
                </div>
              ),
            )}
          </DragScrollRow>
        )}
      </div>

      {selectedCategory && (
        <div className="rounded-xl2 border border-base-700/60 bg-base-850 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">{selectedCategory.name}</p>
            {!addingEntry && (
              <button
                type="button"
                onClick={() => setAddingEntry(true)}
                className="flex items-center gap-1 text-xs text-accent-400 hover:text-accent-300"
              >
                <Plus size={13} />
                Add entry
              </button>
            )}
          </div>

          {addingEntry && (
            <div className="mb-3">
              <EntryForm
                projectId={projectId}
                categoryId={selectedCategory.id}
                entry={null}
                keywords={keywords}
                onCancel={() => setAddingEntry(false)}
                onSaved={() => setAddingEntry(false)}
              />
            </div>
          )}

          {entries.length === 0 && !addingEntry && (
            <p className="rounded-lg border border-dashed border-base-700 p-6 text-center text-sm text-neutral-500">
              No entries in this category yet.
            </p>
          )}

          <div className="flex flex-col gap-2">
            {entries.map((entry) =>
              editingEntryId === entry.id ? (
                <EntryForm
                  key={entry.id}
                  projectId={projectId}
                  categoryId={selectedCategory.id}
                  entry={entry}
                  keywords={keywords}
                  onCancel={() => setEditingEntryId(null)}
                  onSaved={() => setEditingEntryId(null)}
                />
              ) : (
                <EntryCard
                  key={entry.id}
                  entry={entry}
                  projectId={projectId}
                  vaultPasswordSet={vaultPasswordSet}
                  keywords={keywords}
                  assignableMembers={assignableMembers}
                  onRequestVaultSetup={() => setVaultModalOpen(true)}
                  onEdit={() => setEditingEntryId(entry.id)}
                  onDelete={() => startTransition(() => deleteBacklinkEntryAction(entry.id, projectId))}
                  isPending={isPending}
                />
              ),
            )}
          </div>
        </div>
      )}

      {vaultModalOpen && (
        <VaultPasswordModal
          hasPassword={vaultPasswordSet}
          onClose={() => setVaultModalOpen(false)}
          onSuccess={() => {
            setVaultPasswordSet(true);
            setVaultModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

function CategoryForm({
  projectId,
  category,
  onCancel,
  onSaved,
}: {
  projectId: string;
  category: BacklinkCategory | null;
  onCancel: () => void;
  onSaved: (id: string) => void;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => {
        const name = String(formData.get("name") ?? "").trim();
        const categoryType = String(formData.get("categoryType") ?? "other") as BacklinkCategoryType;
        if (!name) return;
        startTransition(async () => {
          if (category) {
            await updateBacklinkCategoryAction(category.id, projectId, { name, categoryType });
            onSaved(category.id);
          } else {
            const id = await createBacklinkCategoryAction(projectId, name, categoryType);
            onSaved(id ?? "");
          }
        });
      }}
      className="mb-3 flex items-center gap-2 rounded-lg border border-base-700/60 bg-base-900 p-2.5"
    >
      <input
        name="name"
        required
        autoFocus
        placeholder="Category name"
        defaultValue={category?.name ?? ""}
        className="w-full rounded-md border border-base-600 bg-base-950 px-2.5 py-1.5 text-xs text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
      />
      <select
        name="categoryType"
        defaultValue={category?.categoryType ?? "other"}
        className="w-fit shrink-0 rounded-md border border-base-600 bg-base-950 px-2 py-1.5 text-xs text-neutral-100 focus:border-accent-500 focus:outline-none"
      >
        {(Object.keys(CATEGORY_TYPE_LABEL) as BacklinkCategoryType[]).map((t) => (
          <option key={t} value={t}>
            {CATEGORY_TYPE_LABEL[t]}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={isPending}
        className="w-fit shrink-0 rounded-md bg-accent-500 px-2.5 py-1.5 text-xs font-medium text-base-950 hover:bg-accent-400 disabled:opacity-60"
      >
        {isPending ? "Saving…" : "Save"}
      </button>
      <button type="button" onClick={onCancel} className="shrink-0 text-neutral-500 hover:text-neutral-300">
        <X size={16} />
      </button>
    </form>
  );
}

function EntryCard({
  entry,
  projectId,
  vaultPasswordSet,
  keywords,
  assignableMembers,
  onRequestVaultSetup,
  onEdit,
  onDelete,
  isPending,
}: {
  entry: BacklinkEntry;
  projectId: string;
  vaultPasswordSet: boolean;
  keywords: Keyword[];
  assignableMembers: Profile[];
  onRequestVaultSetup: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isPending: boolean;
}) {
  const [revealing, setRevealing] = useState(false);
  const [revealPending, startRevealTransition] = useTransition();
  const [vaultInput, setVaultInput] = useState("");
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);
  const [revealError, setRevealError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
  const linkedKeyword = entry.keywordId ? keywords.find((k) => k.id === entry.keywordId) : null;

  function submitReveal() {
    setRevealError(null);
    startRevealTransition(async () => {
      const result = await revealBacklinkPasswordAction(entry.id, projectId, vaultInput);
      if (result.ok) {
        setRevealedPassword(result.password);
        setRevealing(false);
        setVaultInput("");
        return;
      }
      if (result.reason === "wrong_password") setRevealError("Incorrect security password.");
      else if (result.reason === "no_password_set") setRevealError("No password saved for this entry.");
      else if (result.reason === "no_vault_password") onRequestVaultSetup();
      else if (result.reason === "no_permission")
        setRevealError("You don't have permission to reveal backlink credentials. Ask an admin to grant access.");
      else setRevealError("Something went wrong. Please try again.");
    });
  }

  return (
    <div className="rounded-lg border border-base-700/60 bg-base-900 p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="break-words text-sm font-semibold text-neutral-100">{entry.name}</p>
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", STATUS_STYLE[entry.status])}>
              {STATUS_LABEL[entry.status]}
            </span>
          </div>
          {entry.url && (
            <a
              href={entry.url}
              target="_blank"
              rel="noreferrer"
              className="mt-0.5 flex items-center gap-1 truncate text-xs text-accent-400 hover:text-accent-300"
            >
              <ExternalLink size={11} />
              {entry.url}
            </a>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setCreatingTask((v) => !v)}
            className="rounded-md p-1.5 text-neutral-400 hover:text-accent-300"
            title="Create task"
          >
            <Plus size={13} />
          </button>
          <button type="button" onClick={onEdit} className="rounded-md p-1.5 text-neutral-400 hover:text-accent-300" title="Edit">
            <Pencil size={13} />
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={onDelete}
            className="rounded-md p-1.5 text-neutral-400 hover:text-rose-400 disabled:opacity-50"
            title="Delete"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-neutral-400">
        {entry.username && <span className="rounded-full bg-base-800 px-2 py-0.5">User: {entry.username}</span>}
        {entry.email && <span className="rounded-full bg-base-800 px-2 py-0.5">{entry.email}</span>}
        {entry.postsPerMonth !== null && (
          <span className="rounded-full bg-base-800 px-2 py-0.5">{entry.postsPerMonth} posts/mo</span>
        )}
        {linkedKeyword && (
          <span className="rounded-full bg-accent-500/10 px-2 py-0.5 text-accent-400">
            {linkedKeyword.keyword} #{linkedKeyword.currentRank ?? "—"}
          </span>
        )}
        {entry.indexed !== null && (
          <span className="rounded-full bg-base-800 px-2 py-0.5">{entry.indexed ? "Indexed" : "Not indexed"}</span>
        )}
        {entry.listedOn && <span className="rounded-full bg-base-800 px-2 py-0.5">Listed {entry.listedOn}</span>}
      </div>

      {creatingTask && (
        <div className="mt-2.5">
          <NewTaskForm
            projectId={projectId}
            stageId={null}
            assignableMembers={assignableMembers}
            seoModule="off_page"
            backlinkEntryId={entry.id}
          />
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {!entry.hasPassword && <span className="text-xs text-neutral-600">No password saved</span>}

        {entry.hasPassword && revealedPassword === null && !revealing && (
          <button
            type="button"
            onClick={() => (vaultPasswordSet ? setRevealing(true) : onRequestVaultSetup())}
            className="flex items-center gap-1.5 rounded-md border border-base-600 bg-base-950 px-2.5 py-1 text-xs text-neutral-300 hover:border-accent-500 hover:text-accent-300"
          >
            <Eye size={12} />
            •••••••• Reveal
          </button>
        )}

        {entry.hasPassword && revealing && (
          <div className="flex flex-wrap items-center gap-1.5">
            <input
              type="password"
              autoFocus
              placeholder="Security password"
              value={vaultInput}
              onChange={(e) => setVaultInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitReveal();
              }}
              className="w-40 rounded-md border border-base-600 bg-base-950 px-2 py-1 text-xs text-neutral-100 focus:border-accent-500 focus:outline-none"
            />
            <button
              type="button"
              disabled={revealPending || !vaultInput}
              onClick={submitReveal}
              className="rounded-md bg-accent-500 px-2.5 py-1 text-xs font-medium text-base-950 hover:bg-accent-400 disabled:opacity-60"
            >
              {revealPending ? "Checking…" : "Unlock"}
            </button>
            <button
              type="button"
              onClick={() => {
                setRevealing(false);
                setVaultInput("");
                setRevealError(null);
              }}
              className="text-neutral-500 hover:text-neutral-300"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {revealedPassword !== null && (
          <div className="flex flex-wrap items-center gap-1.5">
            <code className="rounded-md border border-accent-500/30 bg-accent-500/10 px-2.5 py-1 text-xs text-accent-300">
              {revealedPassword}
            </code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(revealedPassword);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="rounded-md p-1.5 text-neutral-400 hover:text-accent-300"
              title="Copy"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
            <button
              type="button"
              onClick={() => setRevealedPassword(null)}
              className="rounded-md p-1.5 text-neutral-400 hover:text-neutral-200"
              title="Hide"
            >
              <EyeOff size={13} />
            </button>
          </div>
        )}
      </div>

      {revealError && <p className="mt-1.5 text-xs text-rose-400">{revealError}</p>}

      {entry.links.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {entry.links.map((link, i) => (
            <a
              key={i}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 rounded-full bg-base-800 px-2 py-0.5 text-[11px] text-neutral-300 hover:text-accent-300"
            >
              <ExternalLink size={10} />
              {link.label || link.url}
            </a>
          ))}
        </div>
      )}

      {entry.files.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {entry.files.map((file, i) => (
            <a
              key={i}
              href={file.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 rounded-full bg-base-800 px-2 py-0.5 text-[11px] text-neutral-300 hover:text-accent-300"
            >
              <Paperclip size={10} />
              {file.name}
            </a>
          ))}
        </div>
      )}

      {entry.notes && <p className="mt-2 break-words text-xs text-neutral-500">{entry.notes}</p>}
    </div>
  );
}

function EntryForm({
  projectId,
  categoryId,
  entry,
  keywords,
  onCancel,
  onSaved,
}: {
  projectId: string;
  categoryId: string;
  entry: BacklinkEntry | null;
  keywords: Keyword[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [links, setLinks] = useState<BacklinkLink[]>(entry?.links ?? []);
  const [clearPassword, setClearPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateLink(index: number, patch: Partial<BacklinkLink>) {
    setLinks((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }
  function removeLink(index: number) {
    setLinks((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <form
      action={(formData) => {
        formData.set("projectId", projectId);
        formData.set("categoryId", categoryId);
        formData.set("links", JSON.stringify(links.filter((l) => l.url.trim())));
        if (entry) {
          formData.set("id", entry.id);
          formData.set("clearPassword", clearPassword ? "true" : "false");
        }
        setError(null);
        startTransition(async () => {
          const result = await (entry ? updateBacklinkEntryAction(formData) : createBacklinkEntryAction(formData));
          if (result.ok) onSaved();
          else setError(result.error);
        });
      }}
      className="flex flex-col gap-2.5 rounded-lg border border-base-700/60 bg-base-900 p-3.5"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-400">{entry ? "Edit entry" : "New entry"}</span>
        <button type="button" onClick={onCancel} className="text-neutral-500 hover:text-neutral-300">
          <X size={14} />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          name="name"
          required
          placeholder="Platform / site name (e.g. Facebook)"
          defaultValue={entry?.name ?? ""}
          className="w-full rounded-md border border-base-600 bg-base-950 px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
        />
        <input
          name="url"
          placeholder="Profile / site URL"
          defaultValue={entry?.url ?? ""}
          className="w-full rounded-md border border-base-600 bg-base-950 px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          name="username"
          placeholder="Username"
          defaultValue={entry?.username ?? ""}
          className="w-full rounded-md border border-base-600 bg-base-950 px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
        />
        <input
          name="email"
          type="email"
          placeholder="Email"
          defaultValue={entry?.email ?? ""}
          className="w-full rounded-md border border-base-600 bg-base-950 px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <input
            name="password"
            type="password"
            placeholder={entry?.hasPassword ? "New password (leave blank to keep current)" : "Password"}
            disabled={clearPassword}
            className="w-full rounded-md border border-base-600 bg-base-950 px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none disabled:opacity-50"
          />
          {entry?.hasPassword && (
            <label className="mt-1 flex items-center gap-1.5 text-[11px] text-neutral-500">
              <input
                type="checkbox"
                checked={clearPassword}
                onChange={(e) => setClearPassword(e.target.checked)}
                className="accent-accent-500"
              />
              Remove saved password
            </label>
          )}
        </div>
        <input
          name="postsPerMonth"
          type="number"
          min="0"
          placeholder="Posts per month"
          defaultValue={entry?.postsPerMonth ?? ""}
          className="w-full rounded-md border border-base-600 bg-base-950 px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-[11px] text-neutral-500">Login method</label>
          <select
            name="loginMethod"
            defaultValue={entry?.loginMethod ?? "email"}
            className="w-full rounded-md border border-base-600 bg-base-950 px-2.5 py-1.5 text-sm text-neutral-100 focus:border-accent-500 focus:outline-none"
          >
            <option value="email">Email</option>
            <option value="google">Google Login</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-neutral-500">Status</label>
          <select
            name="status"
            defaultValue={entry?.status ?? "not_started"}
            className="w-full rounded-md border border-base-600 bg-base-950 px-2.5 py-1.5 text-sm text-neutral-100 focus:border-accent-500 focus:outline-none"
          >
            {(Object.keys(STATUS_LABEL) as (keyof typeof STATUS_LABEL)[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-neutral-500">Listed on</label>
          <input
            name="listedOn"
            type="date"
            defaultValue={entry?.listedOn ?? ""}
            className="w-full rounded-md border border-base-600 bg-base-950 px-2.5 py-1.5 text-sm text-neutral-100 focus:border-accent-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[11px] text-neutral-500">Linked keyword (ranking tracking)</label>
          <select
            name="keywordId"
            defaultValue={entry?.keywordId ?? ""}
            className="w-full rounded-md border border-base-600 bg-base-950 px-2.5 py-1.5 text-sm text-neutral-100 focus:border-accent-500 focus:outline-none"
          >
            <option value="">None</option>
            {keywords.map((k) => (
              <option key={k.id} value={k.id}>
                {k.keyword}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-neutral-500">Indexed</label>
          <select
            name="indexed"
            defaultValue={entry?.indexed === null || entry?.indexed === undefined ? "" : String(entry.indexed)}
            className="w-full rounded-md border border-base-600 bg-base-950 px-2.5 py-1.5 text-sm text-neutral-100 focus:border-accent-500 focus:outline-none"
          >
            <option value="">Not set</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </div>
      </div>

      <label className="flex w-fit cursor-pointer items-center gap-1.5 text-xs text-neutral-400 hover:text-accent-300">
        <Paperclip size={13} />
        Attach screenshot / file
        <input type="file" name="attachmentFile" multiple className="hidden" />
      </label>
      {entry && entry.files.length > 0 && (
        <p className="text-[11px] text-neutral-600">
          {entry.files.length} file{entry.files.length === 1 ? "" : "s"} already attached — new uploads are added, not replaced.
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[11px] text-neutral-500">Article / backlink links</label>
          <button
            type="button"
            onClick={() => setLinks((prev) => [...prev, { url: "", label: "" }])}
            className="flex items-center gap-1 text-[11px] text-accent-400 hover:text-accent-300"
          >
            <Plus size={11} />
            Add link
          </button>
        </div>
        {links.map((link, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input
              placeholder="URL"
              value={link.url}
              onChange={(e) => updateLink(i, { url: e.target.value })}
              className="w-1/2 rounded-md border border-base-600 bg-base-950 px-2 py-1 text-xs text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
            />
            <input
              placeholder="Label (optional)"
              value={link.label}
              onChange={(e) => updateLink(i, { label: e.target.value })}
              className="w-1/2 rounded-md border border-base-600 bg-base-950 px-2 py-1 text-xs text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
            />
            <button type="button" onClick={() => removeLink(i)} className="shrink-0 text-neutral-500 hover:text-rose-400">
              <X size={13} />
            </button>
          </div>
        ))}
      </div>

      <textarea
        name="notes"
        rows={2}
        placeholder="Notes (optional)"
        defaultValue={entry?.notes ?? ""}
        className="w-full rounded-md border border-base-600 bg-base-950 px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
      />

      {error && <p className="text-xs text-rose-400">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="w-fit rounded-md bg-accent-500 px-3 py-1.5 text-xs font-medium text-base-950 hover:bg-accent-400 disabled:opacity-60"
        >
          {isPending ? "Saving…" : "Save entry"}
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
