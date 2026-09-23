"use client";

import { useState, useTransition } from "react";
import { Package, Plus, Trash2, X, Zap } from "lucide-react";
import type { BillingFrequency, ClientService, ClientServiceStatus, Project, Service } from "@/lib/types";
import {
  createClientServiceAction,
  deleteClientServiceAction,
  generateDueInvoiceDraftsAction,
  updateClientServiceAction,
} from "@/lib/actions";
import { cn, formatMoney } from "@/lib/utils";

const FREQUENCY_LABEL: Record<BillingFrequency, string> = {
  one_time: "One-time",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

const STATUS_LABEL: Record<ClientServiceStatus, string> = {
  active: "Active",
  paused: "Paused",
  cancelled: "Cancelled",
};

export function ClientServicesPanel({
  clientId,
  clientServices,
  services,
  projects,
}: {
  clientId: string;
  clientServices: ClientService[];
  services: Service[];
  projects: Project[];
}) {
  const [adding, setAdding] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [generatedMsg, setGeneratedMsg] = useState<string | null>(null);

  return (
    <div className="rounded-xl2 border border-base-700/60 bg-base-850 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Package size={16} className="text-accent-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Services</h2>
        </div>
        <div className="flex items-center gap-2">
          {clientServices.some((cs) => cs.status === "active" && cs.nextInvoiceDate) && (
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  const count = await generateDueInvoiceDraftsAction();
                  setGeneratedMsg(count > 0 ? `Generated ${count} draft invoice${count === 1 ? "" : "s"}.` : "Nothing due yet.");
                })
              }
              className="flex items-center gap-1 text-xs text-accent-400 hover:text-accent-300 disabled:opacity-50"
              title="Generate draft invoices for every due recurring service"
            >
              <Zap size={13} />
              Generate due drafts
            </button>
          )}
          {!adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex items-center gap-1 text-xs text-accent-400 hover:text-accent-300"
            >
              <Plus size={13} />
              Add service
            </button>
          )}
        </div>
      </div>

      {generatedMsg && <p className="mb-3 text-xs text-neutral-500">{generatedMsg}</p>}

      {adding && (
        <NewClientServiceForm clientId={clientId} services={services} projects={projects} onDone={() => setAdding(false)} />
      )}

      {clientServices.length === 0 && !adding ? (
        <p className="rounded-lg border border-dashed border-base-700 p-4 text-center text-xs text-neutral-500">
          Not subscribed to any services yet.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {clientServices.map((cs) => (
            <ClientServiceRow key={cs.id} clientId={clientId} clientService={cs} projects={projects} />
          ))}
        </div>
      )}
    </div>
  );
}

function NewClientServiceForm({
  clientId,
  services,
  projects,
  onDone,
}: {
  clientId: string;
  services: Service[];
  projects: Project[];
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const selectedService = services.find((s) => s.id === serviceId);

  return (
    <form
      action={(formData) => {
        formData.set("clientId", clientId);
        startTransition(async () => {
          await createClientServiceAction(formData);
          onDone();
        });
      }}
      className="mb-3 flex flex-col gap-2 rounded-lg border border-base-700/60 bg-base-900 p-3"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-400">Subscribe to a service</span>
        <button type="button" onClick={onDone} className="text-neutral-500 hover:text-neutral-300">
          <X size={14} />
        </button>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <select
          name="serviceId"
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
          required
          className="w-full rounded-md border border-base-600 bg-base-950 px-2.5 py-1.5 text-sm text-neutral-100 focus:border-accent-500 focus:outline-none"
        >
          {services.length === 0 && <option value="">No services in catalog yet</option>}
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} — {formatMoney(s.price, s.currency)}
            </option>
          ))}
        </select>
        <select
          name="projectId"
          defaultValue=""
          className="w-full rounded-md border border-base-600 bg-base-950 px-2.5 py-1.5 text-sm text-neutral-300 focus:border-accent-500 focus:outline-none"
        >
          <option value="">No linked project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          name="priceOverride"
          type="number"
          step="0.01"
          min="0"
          placeholder={selectedService ? `Price (default ${selectedService.price})` : "Price override"}
          className="w-full rounded-md border border-base-600 bg-base-950 px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
        />
        <select
          name="currency"
          defaultValue={selectedService?.currency ?? "PKR"}
          className="w-full rounded-md border border-base-600 bg-base-950 px-2.5 py-1.5 text-sm text-neutral-100 focus:border-accent-500 focus:outline-none"
        >
          {["PKR", "USD", "GBP"].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          name="billingFrequency"
          defaultValue={selectedService?.billingFrequency ?? "monthly"}
          className="w-full rounded-md border border-base-600 bg-base-950 px-2.5 py-1.5 text-sm text-neutral-100 focus:border-accent-500 focus:outline-none"
        >
          {(Object.keys(FREQUENCY_LABEL) as BillingFrequency[]).map((f) => (
            <option key={f} value={f}>
              {FREQUENCY_LABEL[f]}
            </option>
          ))}
        </select>
        <div>
          <label className="mb-1 block text-[11px] text-neutral-500">Next invoice date (for auto-drafting)</label>
          <input
            name="nextInvoiceDate"
            type="date"
            className="w-full rounded-md border border-base-600 bg-base-950 px-2.5 py-1.5 text-sm text-neutral-300 focus:border-accent-500 focus:outline-none"
          />
        </div>
      </div>
      <textarea
        name="notes"
        rows={2}
        placeholder="Notes (optional)"
        className="w-full rounded-md border border-base-600 bg-base-950 px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
      />
      <button
        type="submit"
        disabled={isPending || services.length === 0}
        className="w-fit rounded-md bg-accent-500 px-3 py-1.5 text-xs font-medium text-base-950 hover:bg-accent-400 disabled:opacity-60"
      >
        {isPending ? "Saving…" : "Subscribe"}
      </button>
    </form>
  );
}

function ClientServiceRow({
  clientId,
  clientService,
  projects,
}: {
  clientId: string;
  clientService: ClientService;
  projects: Project[];
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-base-700/60 bg-base-900 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-neutral-100">{clientService.serviceName}</p>
        <p className="text-xs text-neutral-500">
          {formatMoney(clientService.priceOverride ?? 0, clientService.currency)} ·{" "}
          {FREQUENCY_LABEL[clientService.billingFrequency]}
          {clientService.projectName && ` · ${clientService.projectName}`}
          {clientService.nextInvoiceDate && ` · Next: ${clientService.nextInvoiceDate}`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <select
          value={clientService.status}
          disabled={isPending}
          onChange={(e) =>
            startTransition(() =>
              updateClientServiceAction(clientService.id, clientId, { status: e.target.value as ClientServiceStatus }),
            )
          }
          className={cn(
            "rounded-md border px-2 py-1 text-[11px] focus:outline-none",
            clientService.status === "active"
              ? "border-accent-500/40 bg-accent-500/10 text-accent-300"
              : "border-base-600 bg-base-950 text-neutral-400",
          )}
        >
          {(Object.keys(STATUS_LABEL) as ClientServiceStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <select
          value={clientService.projectId ?? ""}
          disabled={isPending}
          onChange={(e) =>
            startTransition(() =>
              updateClientServiceAction(clientService.id, clientId, { projectId: e.target.value || null }),
            )
          }
          className="rounded-md border border-base-600 bg-base-950 px-2 py-1 text-[11px] text-neutral-300 focus:outline-none"
        >
          <option value="">No project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(() => deleteClientServiceAction(clientService.id, clientId))}
          className="rounded-md p-1 text-neutral-500 hover:text-rose-400 disabled:opacity-50"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}
