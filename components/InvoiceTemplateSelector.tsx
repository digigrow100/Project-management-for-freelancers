"use client";

import type { InvoiceTemplateKey } from "@/lib/types";
import { cn } from "@/lib/utils";

export const INVOICE_TEMPLATES: Array<{
  key: InvoiceTemplateKey;
  label: string;
  description: string;
}> = [
  { key: "modern_blue", label: "Modern Blue", description: "Clean light layout with blue accents" },
  { key: "corporate_navy", label: "Corporate Navy", description: "Structured dark-navy business layout" },
  { key: "minimal_clean", label: "Minimal Clean", description: "Simple monochrome premium layout" },
  { key: "premium_teal", label: "Premium Teal", description: "Premium teal design with amount-due card" },
];

export function InvoiceTemplateSelector({
  value,
  onChange,
  name = "templateKey",
}: {
  value: InvoiceTemplateKey;
  onChange: (value: InvoiceTemplateKey) => void;
  name?: string;
}) {
  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={value} />
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {INVOICE_TEMPLATES.map((template) => (
          <button
            key={template.key}
            type="button"
            onClick={() => onChange(template.key)}
            className={cn(
              "overflow-hidden rounded-xl border p-2 text-left transition",
              value === template.key
                ? "border-accent-400 bg-accent-500/8 ring-1 ring-accent-400/30"
                : "border-base-700 bg-base-900 hover:border-base-600",
            )}
          >
            <InvoiceTemplateMiniature template={template.key} />
            <div className="mt-2">
              <p className="text-xs font-semibold text-neutral-100">{template.label}</p>
              <p className="mt-0.5 text-[10px] leading-4 text-neutral-500">{template.description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function InvoiceTemplateMiniature({ template }: { template: InvoiceTemplateKey }) {
  if (template === "modern_blue") {
    return (
      <div className="aspect-[0.72] rounded-md bg-white p-2 shadow-inner">
        <div className="flex items-center justify-between">
          <div className="h-2 w-12 rounded bg-sky-500" />
          <div className="text-[7px] font-bold text-slate-900">INVOICE</div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-1">
          <div className="h-8 rounded bg-sky-50" />
          <div className="h-8 rounded bg-sky-50" />
        </div>
        <div className="mt-2 h-3 rounded bg-sky-100" />
        <div className="mt-1 h-5 border-b border-slate-200" />
        <div className="mt-1 h-5 border-b border-slate-200" />
        <div className="mt-3 ml-auto h-7 w-20 rounded bg-sky-50" />
      </div>
    );
  }

  if (template === "corporate_navy") {
    return (
      <div className="aspect-[0.72] rounded-md bg-white shadow-inner">
        <div className="flex h-10 items-center justify-between rounded-t-md bg-slate-900 px-2">
          <div className="h-2 w-11 rounded bg-sky-400" />
          <div className="text-[7px] font-bold text-white">INVOICE</div>
        </div>
        <div className="p-2">
          <div className="grid grid-cols-3 gap-1">
            <div className="h-8 rounded bg-slate-100" />
            <div className="h-8 rounded bg-slate-100" />
            <div className="h-8 rounded bg-slate-100" />
          </div>
          <div className="mt-2 h-3 rounded bg-slate-900" />
          <div className="mt-1 h-5 border-b border-slate-200" />
          <div className="mt-1 h-5 border-b border-slate-200" />
          <div className="mt-2 ml-auto h-7 w-20 rounded bg-slate-900" />
        </div>
      </div>
    );
  }

  if (template === "minimal_clean") {
    return (
      <div className="aspect-[0.72] rounded-md bg-white p-2 shadow-inner">
        <div className="h-2 w-16 rounded bg-slate-300" />
        <div className="mt-4 text-[10px] font-bold text-black">Invoice</div>
        <div className="mt-3 h-px bg-slate-300" />
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="h-8" />
          <div className="h-8" />
          <div className="h-8 border-l border-slate-200" />
        </div>
        <div className="mt-3 h-3 bg-slate-100" />
        <div className="mt-1 h-5 border-b border-slate-200" />
        <div className="mt-1 h-5 border-b border-slate-200" />
        <div className="mt-3 ml-auto h-7 w-20 bg-slate-100" />
      </div>
    );
  }

  return (
    <div className="aspect-[0.72] overflow-hidden rounded-md bg-white shadow-inner">
      <div className="relative p-2">
        <div className="absolute right-0 top-0 h-8 w-20 rounded-bl-[999px] bg-teal-800" />
        <div className="h-2 w-16 rounded bg-teal-900" />
        <div className="mt-4 text-[10px] font-serif font-bold text-teal-950">INVOICE</div>
        <div className="mt-3 grid grid-cols-3 gap-1">
          <div className="h-8 rounded bg-slate-50" />
          <div className="h-8 rounded bg-slate-50" />
          <div className="h-8 rounded bg-slate-50" />
        </div>
        <div className="mt-2 h-3 rounded bg-teal-900" />
        <div className="mt-1 h-5 border-b border-slate-200" />
        <div className="mt-1 h-5 border-b border-slate-200" />
        <div className="mt-2 ml-auto h-8 w-20 rounded bg-teal-800" />
      </div>
    </div>
  );
}
