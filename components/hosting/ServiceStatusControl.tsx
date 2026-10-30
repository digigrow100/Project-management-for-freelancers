"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { changeHostingServiceStatus } from "@/lib/hosting/actions";

export function ServiceStatusControl({ id, name, status }: { id: string; name: string; status: string }) {
  const router = useRouter();
  const [saved, setSaved] = useState(status);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);
  useEffect(() => { setSaved(status); }, [status]);
  async function change(next: string) {
    if (inFlight.current || next === saved) return;
    inFlight.current = true; setBusy(true); setMessage(""); setFailed(false);
    try {
      const result = await changeHostingServiceStatus(id, next, saved);
      if (!result.ok) { setFailed(true); setMessage(result.error); }
      else { setSaved(result.status); setMessage("Saved"); }
      router.refresh();
    } catch {
      setFailed(true); setMessage("Could not confirm the change. Refresh the page to check the saved status.");
    } finally { inFlight.current = false; setBusy(false); }
  }
  return <div className="min-w-[10rem] max-w-xs">
    <select aria-label={`Recorded status for ${name}`} aria-describedby={`service-status-${id}`} disabled={busy} value={saved} onChange={e => void change(e.target.value)} className="w-full rounded-lg border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100 disabled:opacity-60">
      <option value="active">Active</option><option value="pending">Pending</option><option value="suspended">Suspended</option><option value="cancelled">Cancelled</option>
    </select>
    <p id={`service-status-${id}`} role={failed ? "alert" : "status"} className={`mt-1 whitespace-normal text-xs ${failed ? "text-red-700" : "text-neutral-500"}`}>{busy ? "Saving…" : message}</p>
  </div>;
}
