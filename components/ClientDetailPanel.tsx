"use client";

import { useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Building2 } from "lucide-react";
import type { Client, Project } from "@/lib/types";
import { updateClientAction } from "@/lib/actions";
import { ProjectCardClient } from "./ProjectCardClient";
import { cn } from "@/lib/utils";

export function ClientDetailPanel({
  client,
  projects,
  progress,
}: {
  client: Client;
  projects: Project[];
  progress: Record<string, { done: number; total: number; openCount: number }>;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/clients" className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-300">
          <ArrowLeft size={14} />
          All clients
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-500/15 text-accent-400">
            <Building2 size={19} />
          </span>
          <h1 className="text-2xl font-semibold text-neutral-50">{client.name || client.company}</h1>
        </div>
      </div>

      <form
        action={(formData) => {
          startTransition(async () => {
            await updateClientAction(formData);
          });
        }}
        className="flex flex-col gap-3 rounded-xl2 border border-base-700/60 bg-base-850 p-4"
      >
        <input type="hidden" name="id" value={client.id} />
        <input type="hidden" name="existingLogoUrl" value={client.logoUrl} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field name="name" label="Contact name" defaultValue={client.name} />
          <Field name="company" label="Company" defaultValue={client.company} />
          <Field name="email" label="Email" type="email" defaultValue={client.email} />
          <Field name="phone" label="Phone" defaultValue={client.phone} />
          <Field name="address" label="Address" defaultValue={client.address} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-400">Notes</label>
          <textarea
            name="notes"
            rows={2}
            defaultValue={client.notes}
            className="w-full rounded-md border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className={cn(
            "self-start rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-base-950 hover:bg-accent-400 shadow-glow",
            isPending && "opacity-60",
          )}
        >
          {isPending ? "Saving…" : "Save changes"}
        </button>
      </form>

      <div>
        <p className="mb-3 text-sm font-medium text-neutral-200">
          Projects <span className="text-neutral-500">({projects.length})</span>
        </p>
        {projects.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl2 border border-dashed border-base-700/60 p-10 text-center">
            <p className="text-sm text-neutral-400">No projects for this client yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCardClient
                key={project.id}
                project={project}
                progress={progress[project.id] ?? { done: 0, total: 0, openCount: 0 }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  name,
  label,
  placeholder,
  type = "text",
  defaultValue,
}: {
  name: string;
  label: string;
  placeholder?: string;
  type?: string;
  defaultValue?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-neutral-400">{label}</label>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="w-full rounded-md border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
      />
    </div>
  );
}
