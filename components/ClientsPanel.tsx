"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Building2, Plus } from "lucide-react";
import type { Client } from "@/lib/types";
import { createClientAction } from "@/lib/actions";
import { cn } from "@/lib/utils";

export function ClientsPanel({ clients }: { clients: Client[] }) {
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="flex flex-col gap-6">
      <form
        ref={formRef}
        action={(formData) => {
          startTransition(async () => {
            await createClientAction(formData);
            formRef.current?.reset();
          });
        }}
        className="flex flex-col gap-3 rounded-xl2 border border-base-700/60 bg-base-850 p-4"
      >
        <p className="text-sm font-medium text-neutral-200">Add a client</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field name="name" label="Contact name" placeholder="e.g. James Carter" />
          <Field name="company" label="Company" placeholder="e.g. One Stop Tyres Ltd" />
          <Field name="email" label="Email" type="email" placeholder="client@example.com" />
          <Field name="phone" label="Phone" placeholder="+1 555 000 0000" />
          <Field name="address" label="Address" placeholder="Business address" />
          <Field name="website" label="Website" placeholder="https://example.com" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-400">Notes</label>
          <textarea
            name="notes"
            rows={2}
            placeholder="Anything worth remembering about this client"
            className="w-full rounded-md border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className={cn(
            "flex items-center justify-center gap-2 rounded-lg bg-accent-500 py-2.5 text-sm font-semibold text-base-950 hover:bg-accent-400 shadow-glow",
            isPending && "opacity-60",
          )}
        >
          <Plus size={16} />
          {isPending ? "Adding…" : "Add Client"}
        </button>
      </form>

      {clients.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl2 border border-dashed border-base-700/60 p-10 text-center">
          <Building2 size={22} className="text-neutral-500" />
          <p className="text-sm text-neutral-400">No clients yet. Add your first one above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((client) => (
            <Link
              key={client.id}
              href={`/clients/${client.id}`}
              className="block rounded-xl2 border border-base-700/60 bg-base-850 p-4 shadow-card transition-colors hover:border-accent-500/60"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-500/15 text-accent-400">
                  <Building2 size={17} />
                </span>
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-neutral-100">
                    {client.name || client.company}
                  </h3>
                  {client.name && client.company && (
                    <p className="truncate text-xs text-neutral-500">{client.company}</p>
                  )}
                </div>
              </div>
              {(client.email || client.phone) && (
                <div className="mt-3 flex flex-col gap-0.5 text-xs text-neutral-500">
                  {client.email && <p className="truncate">{client.email}</p>}
                  {client.phone && <p className="truncate">{client.phone}</p>}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({
  name,
  label,
  placeholder,
  type = "text",
}: {
  name: string;
  label: string;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-neutral-400">{label}</label>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        className="w-full rounded-md border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
      />
    </div>
  );
}
