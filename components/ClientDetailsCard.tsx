"use client";

import { useRef, useState } from "react";
import { Mail, Phone, Building2, Pencil, X, User, MapPin } from "lucide-react";
import type { ClientDetails } from "@/lib/types";
import { updateClientDetailsAction } from "@/lib/actions";

export function ClientDetailsCard({ projectId, client }: { projectId: string; client: ClientDetails }) {
  const [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const hasAnyDetails = client.name || client.company || client.email || client.phone;

  if (!editing) {
    return (
      <div className="rounded-xl2 border border-base-700/60 bg-base-850 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Client Details</h2>
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-neutral-400 hover:bg-base-700/60 hover:text-accent-300"
          >
            <Pencil size={12} />
            Edit
          </button>
        </div>

        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-base-600 bg-base-900">
            {client.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={client.logoUrl} alt={client.company || "Client logo"} className="h-full w-full object-contain" />
            ) : (
              <Building2 size={18} className="text-neutral-600" />
            )}
          </div>
          <p className="text-sm text-neutral-300">
            {client.logoUrl ? "Logo on file" : "No logo uploaded — reports will show the client name instead"}
          </p>
        </div>

        {hasAnyDetails ? (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <Field icon={User} label="Contact" value={client.name} />
            <Field icon={Building2} label="Company" value={client.company} />
            <Field icon={Mail} label="Email" value={client.email} href={client.email ? `mailto:${client.email}` : undefined} />
            <Field icon={Phone} label="Phone" value={client.phone} href={client.phone ? `tel:${client.phone}` : undefined} />
            <Field icon={MapPin} label="Address" value={client.address} />
          </div>
        ) : (
          <p className="text-sm text-neutral-500">No client details yet. Click edit to add them.</p>
        )}

        {client.notes && (
          <p className="mt-3 rounded-lg bg-base-900/60 p-2.5 text-xs text-neutral-400">{client.notes}</p>
        )}
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await updateClientDetailsAction(formData);
        setEditing(false);
        setPreview(null);
      }}
      className="flex flex-col gap-3 rounded-xl2 border border-accent-500/30 bg-base-850 p-4"
    >
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="existingLogoUrl" value={client.logoUrl} />
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Client Details</h2>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setPreview(null);
          }}
          className="text-neutral-500 hover:text-neutral-300"
        >
          <X size={15} />
        </button>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-400">Client logo</label>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-base-600 bg-base-900">
            {preview || client.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview ?? client.logoUrl} alt="Logo preview" className="h-full w-full object-contain" />
            ) : (
              <Building2 size={18} className="text-neutral-600" />
            )}
          </div>
          <input
            type="file"
            name="logoFile"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              setPreview(file ? URL.createObjectURL(file) : null);
            }}
            className="flex-1 text-sm text-neutral-400 file:mr-3 file:rounded-md file:border-0 file:bg-base-700 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-neutral-200 hover:file:bg-base-600"
          />
        </div>
        <p className="mt-1 text-xs text-neutral-500">
          Without a logo, reports will show the client&apos;s name instead.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <LabeledInput name="clientName" label="Contact name" defaultValue={client.name} />
        <LabeledInput name="clientCompany" label="Company" defaultValue={client.company} />
        <LabeledInput name="clientEmail" label="Email" type="email" defaultValue={client.email} />
        <LabeledInput name="clientPhone" label="Phone" defaultValue={client.phone} />
        <LabeledInput name="clientAddress" label="Address" defaultValue={client.address} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-400">Notes</label>
        <textarea
          name="clientNotes"
          defaultValue={client.notes}
          rows={2}
          className="w-full rounded-md border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100 focus:border-accent-500 focus:outline-none"
        />
      </div>

      <button type="submit" className="mt-1 rounded-md bg-accent-500 py-2 text-sm font-medium text-base-950 hover:bg-accent-400">
        Save client details
      </button>
    </form>
  );
}

function Field({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: typeof User;
  label: string;
  value: string;
  href?: string;
}) {
  if (!value) return null;
  const content = (
    <span className="block truncate text-sm text-neutral-200">{value}</span>
  );
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg bg-base-900/50 px-2.5 py-2">
      <Icon size={14} className="shrink-0 text-neutral-500" />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</p>
        {href ? (
          <a href={href} className="block truncate text-sm text-accent-300 hover:underline">
            {value}
          </a>
        ) : (
          content
        )}
      </div>
    </div>
  );
}

function LabeledInput({
  name,
  label,
  defaultValue,
  type = "text",
}: {
  name: string;
  label: string;
  defaultValue: string;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-neutral-400">{label}</label>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        className="w-full rounded-md border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100 focus:border-accent-500 focus:outline-none"
      />
    </div>
  );
}
