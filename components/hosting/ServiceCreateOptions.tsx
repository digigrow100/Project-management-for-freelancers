"use client";

import { useState } from "react";

type PackageOption = { id: string; name: string; currency: string; product_kind?: string };
const inputClass = "w-full rounded-lg border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100";

export function ServiceCreateOptions({ packages, selectedPackage = "" }: { packages: PackageOption[]; selectedPackage?: string }) {
  const [packageId, setPackageId] = useState(selectedPackage);
  const [status, setStatus] = useState("active");
  const appHosting = packages.find(p => p.id === packageId)?.product_kind === "app_hosting";
  return <>
    <label className="flex flex-col gap-1 text-xs text-neutral-400">Package
      <select name="package_id" className={inputClass} required value={packageId} onChange={e => setPackageId(e.target.value)}>
        <option value="">Choose…</option>
        {packages.map(p => <option key={p.id} value={p.id}>{p.name} ({p.currency})</option>)}
      </select>
    </label>
    <label className="flex flex-col gap-1 text-xs text-neutral-400">Initial recorded status
      <select name="status" className={inputClass} value={appHosting ? "pending" : status} onChange={e => setStatus(e.target.value)} aria-describedby="service-create-status-help">
        <option value="active" disabled={appHosting}>Active</option>
        <option value="pending">Pending</option>
      </select>
      <span id="service-create-status-help">{appHosting ? "App Hosting starts Pending. Complete its server setup and check status before selecting Active." : "Active records an existing service. Pending keeps it awaiting setup."}</span>
    </label>
  </>;
}
