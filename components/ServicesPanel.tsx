"use client";

import { useState, useTransition } from "react";
import { Package, Pencil, Plus, Trash2, X } from "lucide-react";
import type { BillingFrequency, Service } from "@/lib/types";
import { createServiceAction, deleteServiceAction, updateServiceAction } from "@/lib/actions";
import { cn, formatMoney } from "@/lib/utils";

const FREQUENCY_LABEL: Record<BillingFrequency, string> = {
  one_time: "One-time",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

export function ServicesPanel({ services }: { services: Service[] }) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-50">Services</h1>
          <p className="mt-1 text-sm text-neutral-500">Reusable, priced offerings clients can be subscribed to.</p>
        </div>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-2 rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-base-950 hover:bg-accent-400 shadow-glow"
          >
            <Plus size={16} />
            New service
          </button>
        )}
      </div>

      {adding && <ServiceForm onDone={() => setAdding(false)} />}

      {services.length === 0 && !adding ? (
        <div className="flex flex-col items-center gap-2 rounded-xl2 border border-dashed border-base-700/60 p-10 text-center">
          <Package size={22} className="text-neutral-500" />
          <p className="text-sm text-neutral-400">No services yet. Add your first one above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => (
            <ServiceCard key={service.id} service={service} />
          ))}
        </div>
      )}
    </div>
  );
}

function ServiceCard({ service }: { service: Service }) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (editing) {
    return <ServiceForm service={service} onDone={() => setEditing(false)} />;
  }

  return (
    <div
      className={cn(
        "rounded-xl2 border bg-base-850 p-4 shadow-card",
        service.isActive ? "border-base-700/60" : "border-base-700/40 opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-neutral-100">{service.name}</h3>
          <p className="text-xs text-neutral-500">
            {formatMoney(service.price, service.currency)} · {FREQUENCY_LABEL[service.billingFrequency]}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-md p-1.5 text-neutral-500 hover:text-accent-300"
          >
            <Pencil size={13} />
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              if (confirm(`Delete "${service.name}"? Existing client subscriptions and invoices keep their own data.`)) {
                startTransition(() => deleteServiceAction(service.id));
              }
            }}
            className="rounded-md p-1.5 text-neutral-500 hover:text-rose-400 disabled:opacity-50"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      {service.description && <p className="mt-2 text-xs text-neutral-400">{service.description}</p>}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(() => updateServiceAction(service.id, { isActive: !service.isActive }))}
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-medium disabled:opacity-50",
            service.isActive ? "bg-accent-500/15 text-accent-300" : "bg-base-700/60 text-neutral-400",
          )}
        >
          {service.isActive ? "Active" : "Inactive"}
        </button>
      </div>
    </div>
  );
}

function ServiceForm({ service, onDone }: { service?: Service; onDone: () => void }) {
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => {
        startTransition(async () => {
          if (service) {
            await updateServiceAction(service.id, {
              name: String(formData.get("name") ?? "").trim(),
              description: String(formData.get("description") ?? "").trim(),
              price: Number(formData.get("price")) || 0,
              currency: String(formData.get("currency") ?? "PKR"),
              billingFrequency: formData.get("billingFrequency") as BillingFrequency,
            });
          } else {
            await createServiceAction(formData);
          }
          onDone();
        });
      }}
      className="flex flex-col gap-3 rounded-xl2 border border-accent-500/30 bg-base-850 p-4"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-neutral-200">{service ? "Edit service" : "New service"}</p>
        <button type="button" onClick={onDone} className="text-neutral-500 hover:text-neutral-300">
          <X size={15} />
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          name="name"
          required
          autoFocus
          defaultValue={service?.name}
          placeholder="e.g. SEO Monthly Retainer"
          className="w-full rounded-md border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none sm:col-span-2"
        />
        <input
          name="price"
          type="number"
          step="0.01"
          min="0"
          defaultValue={service?.price}
          placeholder="Price"
          className="w-full rounded-md border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
        />
        <select
          name="currency"
          defaultValue={service?.currency ?? "PKR"}
          className="w-full rounded-md border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100 focus:border-accent-500 focus:outline-none"
        >
          {["PKR", "USD", "GBP"].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          name="billingFrequency"
          defaultValue={service?.billingFrequency ?? "monthly"}
          className="w-full rounded-md border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100 focus:border-accent-500 focus:outline-none sm:col-span-2"
        >
          {(Object.keys(FREQUENCY_LABEL) as BillingFrequency[]).map((f) => (
            <option key={f} value={f}>
              {FREQUENCY_LABEL[f]}
            </option>
          ))}
        </select>
      </div>
      <textarea
        name="description"
        rows={2}
        defaultValue={service?.description}
        placeholder="What's included (optional)"
        className="w-full rounded-md border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
      />
      <button
        type="submit"
        disabled={isPending}
        className="w-fit rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-base-950 hover:bg-accent-400 disabled:opacity-60"
      >
        {isPending ? "Saving…" : "Save service"}
      </button>
    </form>
  );
}
