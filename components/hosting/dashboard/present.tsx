import Link from "next/link";
import { gbLabel } from "@/lib/hosting/websites/types";
import type { ReactNode } from "react";
import { dnsPlan } from "@/lib/hosting/apps/dns";
import { hostingMessage } from "@/lib/hosting/apps/messages";
import type { HostingApp, HostingAppDomain, HostingDeployment, HostingEnvName } from "@/lib/hosting/apps/types";
export function message(code?: string) {
    return code ? hostingMessage(code) : "";
}
export function Pill({ value }: {
    value: string;
}) {
    const tone = ["running", "active", "succeeded"].includes(value) ? "ok" : ["failed", "error", "stopped"].includes(value) ? "bad" : ["building", "pending", "pending_dns", "verifying", "issuing_ssl", "queued"].includes(value) ? "wait" : "idle";
    return <span className={`hms-pill hms-pill-${tone}`}>{value.replaceAll("_", " ")}</span>;
}
export function EmptyState({ title, body, href, action }: {
    title: string;
    body: string;
    href?: string;
    action?: string;
}) {
    return <div className="hms-empty-card"><div className="hms-empty-mark" aria-hidden="true">+</div><h2>{title}</h2><p>{body}</p>{href && action ? <Link className="hms-dash-primary" href={href}>{action}</Link> : null}</div>;
}
function bytes(value: number) {
    if (!value)
        return "—";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let size = value;
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) {
        size /= 1024;
        unit += 1;
    }
    return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}
export function Stat({ label, value, hint }: {
    label: string;
    value: string;
    hint?: string;
}) {
    return <div className="hms-dash-stat"><span>{label}</span><strong>{value}</strong>{hint ? <small>{hint}</small> : null}</div>;
}
export function Overview({ base, apps, deployments, host, attacks, agentNote, legacy, }: {
    base: string;
    apps: HostingApp[];
    deployments: HostingDeployment[];
    host?: {
        cpuPercent: number | null;
        memory: {
            used: number;
            total: number;
        };
        disk: {
            used: number;
            total: number;
        };
        source: string;
    } | null;
    attacks?: {
        id: string;
        value: string;
        scenario: string;
        duration: string;
    }[];
    agentNote?: string;
    legacy?: {
        services: number;
        tickets: number;
    };
}) {
    const activeDomains = apps.filter((app) => app.status === "running").length;
    return <div className="hms-dash">
    <header className="hms-dash-head"><div><p className="hms-kicker">Hosting</p><h1>Apps & websites</h1><p>Deploy a site, point a domain at the server, and watch the certificate issue.</p></div><Link className="hms-dash-primary" href={`${base}/new`}>Add New Website</Link></header>
    {agentNote ? <p className="hms-banner" role="status">{agentNote}</p> : null}
    <section className="hms-stat-grid">
      {host !== undefined ? <><Stat label="CPU" value={host?.cpuPercent === null || host?.cpuPercent === undefined ? "—" : `${host.cpuPercent}%`} hint={host ? host.source === "host" ? "This VPS" : "Agent container" : "Agent not connected"}/><Stat label="Memory" value={host ? bytes(host.memory.used) : "—"} hint={host ? `of ${bytes(host.memory.total)}` : "Waiting for the agent"}/><Stat label="Disk" value={host ? bytes(host.disk.used) : "—"} hint={host?.disk.total ? `of ${bytes(host.disk.total)}` : "Sites volume"}/></> : null}
      <Stat label="Apps" value={String(apps.length)} hint={`${activeDomains} running`}/>
    </section>
    <section className="hms-card-grid">{apps.length ? apps.slice(0, 6).map((app) => <AppCard key={app.id} base={base} app={app}/>) : <EmptyState title="No apps yet" body="Start with an approved website credit, then upload files or connect GitHub. The wizard picks the build and gives you the DNS record." href={`${base}/new`} action="Create your first app"/>}</section>
    <div className="hms-split">
      <section className="hms-panel"><h2>Recent deployments</h2>{deployments.length ? <ul className="hms-feed">{deployments.map((item) => <li key={item.id}><Pill value={item.status}/><span>{item.image_ref ?? "Build"}</span><time>{new Date(item.created_at).toLocaleString()}</time></li>)}</ul> : <p className="hms-muted">Deployments will show up here after the first build.</p>}</section>
      <section className="hms-panel"><h2>Blocked addresses</h2>{attacks && attacks.length ? <ul className="hms-feed">{attacks.slice(0, 5).map((item) => <li key={item.id}><Pill value="blocked"/><span>{item.value}</span><small>{item.scenario}</small></li>)}</ul> : <p className="hms-muted">{attacks ? "CrowdSec has no active decisions." : "Security data appears when the agent can read CrowdSec."}</p>}{base.startsWith("/hosting") ? <Link href="/hosting/security">Open security</Link> : null}</section>
    </div>
    {legacy ? <section className="hms-panel hms-secondary"><h2>Records</h2><p><Link href="/hosting/services">{legacy.services} plan assignments</Link> · <Link href="/hosting/tickets">{legacy.tickets} open tickets</Link> · <Link href="/hosting/billing">Billing</Link></p></section> : null}
  </div>;
}
export function AppCard({ base, app, domain }: {
    base: string;
    app: HostingApp;
    domain?: string;
}) {
    return <Link className="hms-app-card" href={`${base}/${app.id}`}><span className="hms-app-mark" aria-hidden="true">{app.display_name.slice(0, 1).toUpperCase()}</span><span><strong>{app.display_name}</strong><small>{domain || app.name} · {app.framework}</small></span><Pill value={app.status}/></Link>;
}
export function AppsList({ base, apps, domains, action }: {
    base: string;
    apps: HostingApp[];
    domains: Record<string, string>;
    action?: ReactNode;
}) {
    return <div className="hms-dash"><header className="hms-dash-head"><div><p className="hms-kicker">Apps</p><h1>Your websites</h1></div>{action ?? <Link className="hms-dash-primary" href={`${base}/new`}>Add New Website</Link>}</header>{apps.length ? <section className="hms-card-grid">{apps.map((app) => <AppCard key={app.id} base={base} app={app} domain={domains[app.id]}/>)}</section> : <EmptyState title="Nothing deployed" body="Each app is one container on the VPS, with its own domain and environment." href={`${base}/new`} action="Add New Website"/>}</div>;
}
const TABS = ["overview", "deployments", "logs", "domains", "env", "settings"] as const;
export function AppDetail({ base, app, tab, domains, deployments, envNames, logs, notice, children, }: {
    base: string;
    app: HostingApp;
    tab: string;
    domains: HostingAppDomain[];
    deployments: HostingDeployment[];
    envNames: HostingEnvName[];
    logs?: {
        build?: string;
        runtime?: string;
    };
    notice?: string;
    children: ReactNode;
}) {
    const primary = domains.find((domain) => domain.is_primary) ?? domains[0];
    const current = TABS.includes(tab as typeof TABS[number]) ? tab : "overview";
    return <div className="hms-dash">
    <header className="hms-dash-head"><div><p className="hms-kicker">{app.framework}</p><h1>{app.display_name}</h1><p>{primary?.hostname ?? "No domain yet"} · {app.name}</p></div><Pill value={app.status}/></header>
    {notice ? <p className="hms-banner" role="alert">{notice}</p> : null}
    {app.last_error ? <p className="hms-banner" role="status">{hostingMessage(app.last_error)}</p> : null}
    <nav className="hms-tabs" aria-label="App sections">{TABS.map((item) => <Link key={item} href={`${base}/${app.id}?tab=${item}`} aria-current={item === current ? "page" : undefined}>{item}</Link>)}</nav>
    {current === "overview" ? <section className="hms-panel"><div className="hms-kv"><span>Status</span><Pill value={app.status}/></div><div className="hms-kv"><span>Deployment source</span><code>{app.source_url}</code></div><div className="hms-kv"><span>Content storage</span><span>{gbLabel(app.storage_used_bytes)} / {gbLabel(Number(app.storage_limit_bytes))}</span></div><p className="website-note">1 GB included. Extra storage is charged only for actual content size and time, up to the cap you selected.</p></section> : null}
    {current === "deployments" ? <section className="hms-panel">{deployments.length ? deployments.map((item) => <article key={item.id} className="hms-deploy"><div><Pill value={item.status}/><time>{new Date(item.created_at).toLocaleString()}</time></div>{item.error ? <p>{hostingMessage(item.error)}</p> : null}{item.log_excerpt ? <pre>{item.log_excerpt}</pre> : null}</article>) : <p className="hms-muted">No builds yet.</p>}{logs?.build ? <pre>{logs.build}</pre> : null}</section> : null}
    {current === "logs" ? <section className="hms-panel"><h2>Build</h2><pre>{logs?.build || "No build log yet."}</pre><h2>Runtime</h2><pre>{logs?.runtime || "No runtime log yet."}</pre></section> : null}
    {current === "domains" ? <DomainList domains={domains}/> : null}
    {current === "env" ? <section className="hms-panel"><p className="hms-muted">Values are encrypted and are not shown again.</p>{envNames.length ? <ul className="hms-feed">{envNames.map((item) => <li key={item.id}><code>{item.name}</code></li>)}</ul> : <p className="hms-muted">No variables yet.</p>}</section> : null}
    {children}
  </div>;
}
export function DomainList({ domains }: {
    domains: HostingAppDomain[];
}) {
    if (!domains.length)
        return <section className="hms-panel"><h2>Domains</h2><p className="hms-muted">Add a domain to get the exact DNS record and start the certificate.</p></section>;
    return <section className="hms-panel"><h2>Domains</h2><ul className="hms-domain-list">{domains.map((domain) => {
            const plan = dnsPlan(domain.hostname, domain.verification_token);
            return <li key={domain.id}><div><strong>{domain.hostname}</strong>{domain.is_primary ? <em>Primary</em> : null}<Pill value={domain.status}/></div>{domain.detail ? <p>{domain.detail}</p> : null}{plan ? <div className="hms-dns">{plan.records.map((record) => <p key={record.type + record.name}><span>{record.type}</span><code>{record.name}</code><code>{record.value}</code><small>{record.note}</small></p>)}</div> : null}</li>;
        })}</ul></section>;
}
export function ComingSoon({ title, body, alternate }: {
    title: string;
    body: string;
    alternate?: {
        href: string;
        label: string;
    };
}) {
    return <div className="hms-dash"><section className="hms-soon"><p className="hms-kicker">Coming soon</p><h1>{title}</h1><p>{body}</p>{alternate ? <Link className="hms-dash-primary" href={alternate.href}>{alternate.label}</Link> : null}<ul><li>No records are created from this page.</li><li>No sample mailboxes, databases or sites are shown.</li></ul></section></div>;
}
export function SecurityView({ decisions, alerts, note }: {
    decisions: {
        id: string;
        value: string;
        type: string;
        scenario: string;
        duration: string;
    }[];
    alerts: {
        id: string;
        scenario: string;
        message: string;
    }[];
    note?: string;
}) {
    return <div className="hms-dash"><header className="hms-dash-head"><div><p className="hms-kicker">CrowdSec</p><h1>Security</h1><p>Decisions and alerts reported by the agent. Unban removes one decision.</p></div></header>{note ? <p className="hms-banner">{note}</p> : null}<section className="hms-panel"><h2>Decisions</h2>{decisions.length ? <ul className="hms-feed">{decisions.map((item) => <li key={item.id}><Pill value={item.type || "ban"}/><span>{item.value}</span><small>{item.scenario} · {item.duration}</small></li>)}</ul> : <p className="hms-muted">No decisions.</p>}</section><section className="hms-panel"><h2>Alerts</h2>{alerts.length ? <ul className="hms-feed">{alerts.map((item) => <li key={item.id}><span>{item.scenario || "Alert"}</span><small>{item.message}</small></li>)}</ul> : <p className="hms-muted">No recent alerts.</p>}</section></div>;
}
export function ServerView({ host, note }: {
    host: {
        cpuPercent: number | null;
        cpuCount?: number;
        memory: {
            used: number;
            total: number;
        };
        disk: {
            used: number;
            total: number;
        };
        source: string;
    } | null;
    note?: string;
}) {
    return <div className="hms-dash"><header className="hms-dash-head"><div><p className="hms-kicker">VPS</p><h1>Server</h1><p>62.171.130.156 · Ubuntu · Docker · Traefik</p></div></header>{note ? <p className="hms-banner">{note}</p> : null}<section className="hms-stat-grid"><Stat label="CPU" value={host?.cpuPercent === null || host?.cpuPercent === undefined ? "—" : `${host.cpuPercent}%`} hint={host?.source === "host" ? "Host counters" : "Not the host"}/><Stat label="Memory used" value={host ? bytes(host.memory.used) : "—"} hint={host ? bytes(host.memory.total) : ""}/><Stat label="Disk used" value={host ? bytes(host.disk.used) : "—"} hint={host?.disk.total ? bytes(host.disk.total) : ""}/></section></div>;
}
