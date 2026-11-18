import { addHostingDomain, assignHostingApp, configureHostingDns, controlHostingApp, deleteHostingEnv, removeHostingDomain, saveHostingEnv, saveHostingRedirect, setPrimaryDomain, verifyHostingDomain } from "@/lib/hosting/apps/actions";
import { cloudflareEnabled } from "@/lib/hosting/apps/cloudflare";
import { registrarOwns } from "@/lib/hosting/apps/registrarDns";
import type { HostingApp, HostingAppDomain, HostingEnvName } from "@/lib/hosting/apps/types";
import { AddDomainDialog } from "./controls";

export async function AppForms({
  base, app, tab, domains, envNames, clients = [], readOnly = false,
}: {
  base: string;
  app: HostingApp;
  tab: string;
  domains: HostingAppDomain[];
  envNames: HostingEnvName[];
  clients?: { id: string; name: string }[];
  readOnly?: boolean;
}) {
  if (readOnly) return <p className="hms-muted">Admin preview is read only.</p>;
  if (tab === "domains") {
    const admin = base.startsWith("/hosting/");
    const owned = admin ? await Promise.all(domains.map(async (domain) => ({ host: domain.hostname, apex: await registrarOwns(domain.hostname).catch(() => null) }))) : [];
    const cloudflare = admin && cloudflareEnabled();
    return <div className="hms-form-stack">
      <AddDomainDialog action={addHostingDomain} base={base} appId={app.id} />
      {domains.map((domain) => <div key={domain.id} className="hms-inline-forms">
        <form action={verifyHostingDomain}><input type="hidden" name="return_base" value={base} /><input type="hidden" name="app_id" value={app.id} /><input type="hidden" name="hostname" value={domain.hostname} /><button className="hms-dash-secondary" type="submit">Verify DNS</button></form>
        {owned.find((item) => item.host === domain.hostname)?.apex ? <form action={configureHostingDns}><input type="hidden" name="return_base" value={base} /><input type="hidden" name="app_id" value={app.id} /><input type="hidden" name="hostname" value={domain.hostname} /><input type="hidden" name="provider" value="dynadot" /><button className="hms-dash-secondary" type="submit">Configure DNS automatically</button></form> : null}
        {cloudflare ? <form action={configureHostingDns}><input type="hidden" name="return_base" value={base} /><input type="hidden" name="app_id" value={app.id} /><input type="hidden" name="hostname" value={domain.hostname} /><input type="hidden" name="provider" value="cloudflare" /><button className="hms-dash-secondary" type="submit">Configure Cloudflare DNS</button></form> : null}
        <form action={setPrimaryDomain}><input type="hidden" name="return_base" value={base} /><input type="hidden" name="app_id" value={app.id} /><input type="hidden" name="hostname" value={domain.hostname} /><button className="hms-dash-secondary" type="submit">Make primary</button></form>
        <form action={removeHostingDomain}><input type="hidden" name="return_base" value={base} /><input type="hidden" name="app_id" value={app.id} /><input type="hidden" name="hostname" value={domain.hostname} /><button className="hms-dash-secondary" type="submit">Remove</button></form>
      </div>)}
      <form action={saveHostingRedirect} className="hms-inline"><input type="hidden" name="return_base" value={base} /><input type="hidden" name="app_id" value={app.id} /><label>www and apex<select name="redirect" defaultValue={app.www_redirect}><option value="none">No redirect</option><option value="www_to_apex">www to apex</option><option value="apex_to_www">apex to www</option></select></label><button className="hms-dash-secondary" type="submit">Save redirect</button></form>
      {!cloudflare ? <p className="hms-muted">Cloudflare automation is off until CLOUDFLARE_API_TOKEN is set. Proxied records still verify with the TXT token.</p> : null}
    </div>;
  }
  if (tab === "env") return <div className="hms-form-stack"><form action={saveHostingEnv}><input type="hidden" name="return_base" value={base} /><input type="hidden" name="app_id" value={app.id} /><label>Add or replace variables<textarea name="env_text" rows={5} placeholder="API_URL=https://example.com" /></label><button className="hms-dash-primary" type="submit">Save variables</button></form>{envNames.map((item) => <form key={item.id} action={deleteHostingEnv}><input type="hidden" name="return_base" value={base} /><input type="hidden" name="app_id" value={app.id} /><input type="hidden" name="name" value={item.name} /><button className="hms-dash-secondary" type="submit">Remove {item.name}</button></form>)}</div>;
  if (tab === "settings") return <div className="hms-form-stack">
    {(["start", "stop", "restart", "redeploy"] as const).map((control) => <form key={control} action={controlHostingApp}><input type="hidden" name="return_base" value={base} /><input type="hidden" name="app_id" value={app.id} /><input type="hidden" name="control" value={control} /><button className="hms-dash-secondary" type="submit">{control}</button></form>)}
    {clients.length ? <form action={assignHostingApp} className="hms-inline"><input type="hidden" name="return_base" value={base} /><input type="hidden" name="app_id" value={app.id} /><label>Client<select name="client_id" defaultValue={app.client_id ?? ""}><option value="">Unassigned</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label><button className="hms-dash-secondary" type="submit">Assign</button></form> : null}
    <form action={controlHostingApp} className="hms-danger"><input type="hidden" name="return_base" value={base} /><input type="hidden" name="app_id" value={app.id} /><input type="hidden" name="control" value="delete" /><label>Type {app.name} to delete the container and this app<input name="confirm" /></label><button type="submit">Delete app</button></form>
  </div>;
  return null;
}
