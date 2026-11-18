"use client";

import { useEffect, useState } from "react";
import { ORIGIN_IPV4 } from "@/lib/hosting/apps/validate";

export function AddDomainDialog({ action, base, appId, open = false }: { action: (form: FormData) => void | Promise<void>; base: string; appId: string; open?: boolean }) {
  const [shown, setShown] = useState(open);
  return <>
    <button type="button" className="hms-dash-primary" onClick={() => setShown(true)}>Add domain</button>
    {shown ? <div className="hms-modal" role="dialog" aria-modal="true" aria-labelledby="add-domain-title"><form action={action} className="hms-modal-card"><h2 id="add-domain-title">Add domain</h2><p>After you save it, this page shows the DNS record to create. Verification moves from pending DNS to issuing the certificate.</p><input type="hidden" name="return_base" value={base} /><input type="hidden" name="app_id" value={appId} /><label>Hostname<input name="hostname" required placeholder="example.com" /></label><div className="hms-dns"><p><span>A</span><code>@</code><code>{ORIGIN_IPV4}</code><small>Use this when the name is the apex. For www, use a CNAME to the apex. Proxied Cloudflare is fine.</small></p></div><div className="hms-wizard-nav"><button type="button" className="hms-dash-secondary" onClick={() => setShown(false)}>Cancel</button><button className="hms-dash-primary" type="submit">Save domain</button></div></form></div> : null}
  </>;
}

export function ReloadWhileBuilding({ active }: { active: boolean }) {
  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => window.location.reload(), 8000);
    return () => window.clearTimeout(timer);
  }, [active]);
  return active ? <p className="hms-muted">This page refreshes while the build is running.</p> : null;
}
