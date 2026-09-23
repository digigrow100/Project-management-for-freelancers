"use client";

import { useState, useTransition } from "react";
import { ClipboardList, Download, Plus, Trash2, X } from "lucide-react";
import type { BacklinkTemplate, BacklinkTemplateItem } from "@/lib/types";
import {
  deleteBacklinkTemplateAction,
  importBacklinkTemplateItemsAction,
  saveBacklinksAsTemplateAction,
} from "@/lib/actions";
import { CATEGORY_TYPE_LABEL } from "@/components/BacklinksPanel";

export function BacklinkTemplatesPanel({
  projectId,
  templates,
  templateItemsByTemplate,
  isAdmin,
}: {
  projectId: string;
  templates: BacklinkTemplate[];
  templateItemsByTemplate: Record<string, BacklinkTemplateItem[]>;
  isAdmin: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [openTemplateId, setOpenTemplateId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList size={16} className="text-accent-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Backlink Templates</h2>
        </div>
        {!saving && (
          <button
            type="button"
            onClick={() => setSaving(true)}
            className="flex items-center gap-1 text-xs text-accent-400 hover:text-accent-300"
          >
            <Plus size={13} />
            Save this project&apos;s assets as template
          </button>
        )}
      </div>

      <p className="text-xs text-neutral-500">
        Templates only store platform name, category type and default URL — never usernames, emails, passwords or
        credentials. Importing a template creates fresh entries that still require client-specific credentials.
      </p>

      {saving && <SaveTemplateForm projectId={projectId} onDone={() => setSaving(false)} />}

      {templates.length === 0 && !saving ? (
        <div className="flex flex-col items-center gap-2 rounded-xl2 border border-dashed border-base-700/60 p-8 text-center">
          <p className="text-sm text-neutral-400">No backlink templates yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {templates.map((template) => (
            <TemplateRow
              key={template.id}
              projectId={projectId}
              template={template}
              items={templateItemsByTemplate[template.id] ?? []}
              isAdmin={isAdmin}
              open={openTemplateId === template.id}
              onToggle={() => setOpenTemplateId(openTemplateId === template.id ? null : template.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SaveTemplateForm({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const [name, setName] = useState("");
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-base-700/60 bg-base-850 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-400">Save as template</span>
        <button type="button" onClick={onDone} className="text-neutral-500 hover:text-neutral-300">
          <X size={14} />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          placeholder="Template name"
          className="flex-1 rounded-md border border-base-600 bg-base-900 px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
        />
        <button
          type="button"
          disabled={isPending || !name.trim()}
          onClick={() =>
            startTransition(async () => {
              await saveBacklinksAsTemplateAction(projectId, name.trim());
              setName("");
              onDone();
            })
          }
          className="shrink-0 rounded-md bg-accent-500 px-3 py-1.5 text-xs font-medium text-base-950 hover:bg-accent-400 disabled:opacity-60"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

function TemplateRow({
  projectId,
  template,
  items,
  isAdmin,
  open,
  onToggle,
}: {
  projectId: string;
  template: BacklinkTemplate;
  items: BacklinkTemplateItem[];
  isAdmin: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [importedCount, setImportedCount] = useState<number | null>(null);

  const toggleItem = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="rounded-lg border border-base-600 bg-base-800 p-3">
      <div className="flex items-center justify-between">
        <button type="button" onClick={onToggle} className="flex-1 text-left">
          <p className="text-sm font-medium text-neutral-100">{template.name}</p>
          <p className="mt-0.5 text-[11px] text-neutral-500">
            {items.length} platform{items.length === 1 ? "" : "s"}
            {template.createdByName ? ` · by ${template.createdByName}` : ""}
          </p>
        </button>
        {isAdmin && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => startTransition(() => deleteBacklinkTemplateAction(template.id))}
            className="rounded-md p-1 text-neutral-500 hover:text-rose-400 disabled:opacity-50"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3 flex flex-col gap-2 border-t border-base-700/60 pt-3">
          {items.map((item) => (
            <label
              key={item.id}
              className="flex items-center gap-2 rounded-md bg-base-900/60 px-2.5 py-1.5 text-xs text-neutral-300"
            >
              <input
                type="checkbox"
                checked={selected.has(item.id)}
                onChange={() => toggleItem(item.id)}
                className="accent-accent-500"
              />
              <span className="flex-1">{item.platformName}</span>
              <span className="text-[10px] uppercase tracking-wide text-neutral-500">
                {CATEGORY_TYPE_LABEL[item.categoryType]}
              </span>
            </label>
          ))}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              disabled={isPending || selected.size === 0}
              onClick={() =>
                startTransition(async () => {
                  const count = await importBacklinkTemplateItemsAction(projectId, Array.from(selected));
                  setImportedCount(count);
                  setSelected(new Set());
                })
              }
              className="flex items-center gap-1 rounded-md bg-accent-500 px-3 py-1.5 text-xs font-medium text-base-950 hover:bg-accent-400 disabled:opacity-60"
            >
              <Download size={12} />
              {isPending ? "Importing…" : `Import selected (${selected.size})`}
            </button>
            {importedCount !== null && (
              <span className="text-[11px] text-neutral-500">
                Imported {importedCount} entr{importedCount === 1 ? "y" : "ies"} — add credentials on each.
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
