"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Client, ProjectType } from "@/lib/types";
import { PROJECT_COLORS, PROJECT_TEMPLATES, PROJECT_TYPE_OPTIONS } from "@/lib/templates";
import { createProjectAction } from "@/lib/actions";
import { cn } from "@/lib/utils";

export function NewProjectForm({ clients }: { clients: Client[] }) {
  const router = useRouter();
  const [type, setType] = useState<ProjectType>("seo");
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => {
        startTransition(async () => {
          const id = await createProjectAction(formData);
          if (id) router.push(`/projects/${id}`);
        });
      }}
      className="mt-6 flex flex-col gap-4"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-400">Project name</label>
          <input
            name="name"
            required
            placeholder="e.g. One Stop Tyres"
            className="w-full rounded-lg border border-base-600 bg-base-850 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-400">Client name</label>
          {clients.length > 0 ? (
            <select
              name="clientId"
              required
              defaultValue=""
              className="w-full rounded-lg border border-base-600 bg-base-850 px-3 py-2 text-sm text-neutral-100 focus:border-accent-500 focus:outline-none"
            >
              <option value="" disabled>
                Select a client…
              </option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name || client.company}
                </option>
              ))}
            </select>
          ) : (
            <p className="rounded-lg border border-base-600 bg-base-850 px-3 py-2 text-xs text-neutral-500">
              No clients yet —{" "}
              <Link href="/clients" className="text-accent-400 hover:underline">
                add one first
              </Link>
              .
            </p>
          )}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-400">Project type</label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {PROJECT_TYPE_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className="flex cursor-pointer flex-col gap-1 rounded-lg border border-base-600 bg-base-850 p-3 text-sm has-[:checked]:border-accent-500 has-[:checked]:bg-accent-500/10"
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="type"
                  value={opt.value}
                  checked={type === opt.value}
                  onChange={() => setType(opt.value)}
                  className="accent-accent-500"
                />
                <span className="font-medium text-neutral-100">{opt.label}</span>
              </span>
              <span className="text-xs text-neutral-500">
                {PROJECT_TEMPLATES[opt.value].stages.length} {opt.value === "seo" ? "modules" : "stages"}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-400">Description</label>
        <textarea
          name="description"
          rows={2}
          placeholder="What are you delivering for this client?"
          className="w-full rounded-lg border border-base-600 bg-base-850 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-400">Start date</label>
          <input
            type="date"
            name="startDate"
            className="w-full rounded-lg border border-base-600 bg-base-850 px-3 py-2 text-sm text-neutral-100 focus:border-accent-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-400">Due date</label>
          <input
            type="date"
            name="endDate"
            className="w-full rounded-lg border border-base-600 bg-base-850 px-3 py-2 text-sm text-neutral-100 focus:border-accent-500 focus:outline-none"
          />
        </div>
      </div>

      {type === "seo" && (
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-400">Website URL (the site you&apos;re optimizing)</label>
          <input
            name="websiteUrl"
            placeholder="https://example.com"
            className="w-full rounded-lg border border-base-600 bg-base-850 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
          />
        </div>
      )}

      {(type === "web_dev" || type === "web_app") && (
        <fieldset className="rounded-lg border border-sky-700/40 p-3">
          <legend className="px-1 text-xs font-medium text-neutral-400">Website details</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field name="websiteUrl" label="Website URL" placeholder="https://example.com" />
            <Field name="logoUrl" label="Logo URL" placeholder="https://.../logo.svg" />
            <Field name="siteIconUrl" label="Site icon / favicon URL" placeholder="https://.../favicon.ico" />
            <Field name="openGraphImageUrl" label="Open Graph image URL" placeholder="https://.../og-cover.png" />
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-400">Domain status</label>
              <select
                name="domainStatus"
                defaultValue="pending"
                className="w-full rounded-md border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100 focus:border-sky-400 focus:outline-none"
              >
                <option value="purchased">Purchased</option>
                <option value="pending">Pending purchase</option>
                <option value="not_required">Not required</option>
              </select>
            </div>
          </div>
          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-neutral-400">Services details</label>
            <textarea
              name="servicesDetails"
              rows={2}
              placeholder="e.g. Marketing site + booking flow + payments"
              className="w-full rounded-md border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-sky-400 focus:outline-none"
            />
          </div>
        </fieldset>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-400">Color</label>
        <div className="flex gap-2">
          {PROJECT_COLORS.map((color, i) => (
            <label key={color} className="cursor-pointer">
              <input type="radio" name="color" value={color} defaultChecked={i === 0} className="peer sr-only" />
              <span
                className="block h-7 w-7 rounded-full ring-offset-2 ring-offset-base-950 peer-checked:ring-2"
                style={{ backgroundColor: color, ["--tw-ring-color" as string]: color }}
              />
            </label>
          ))}
        </div>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className={cn(
          "mt-2 rounded-lg bg-accent-500 py-2.5 text-sm font-semibold text-base-950 hover:bg-accent-400 shadow-glow",
          isPending && "opacity-60",
        )}
      >
        {isPending ? "Creating…" : "Create Project"}
      </button>
    </form>
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
