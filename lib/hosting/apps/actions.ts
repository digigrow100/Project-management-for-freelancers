"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { redirect, unstable_rethrow } from "next/navigation";
import { getSupabase } from "@/lib/supabaseClient";
import { requireHostingAdmin, requireHostingClient } from "@/lib/hosting/auth";
import { AgentError, agentConfigured, agentDeploy, agentDomains, agentLifecycle, agentRemove } from "@/lib/hosting/agent-client";
import { rateLimit, SecurityCheckUnavailable } from "@/lib/security/rateLimit";
import { cloudflareEnabled, configureCloudflare } from "./cloudflare";
import { assessDns, dnsPlan, domainStatusAfterProof } from "./dns";
import { certificateReady, httpTokenReady, lookupHostname } from "./lookup";
import { configureDynadot, registrarOwns } from "./registrarDns";
import { encryptAppSecret } from "./secrets";
import { getApp, listDomains, loadEnvValues, loadGitToken, storageCode } from "./store";
import type { HostingApp, HostingAppDomain } from "./types";
import { appNameOk, defaultPort, dockerfilePathOk, domainOk, frameworkOk, gitRefOk, gitUrlOk, imageRefOk, parseEnvText, portOk, redirectOk, resourcesOk, type RedirectMode } from "./validate";

function bail(path: string, code: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(code)}`);
}

async function open(base: string) {
  if (base === "/client/apps") {
    const session = await requireHostingClient();
    return { readOnly: session.adminView, clientId: session.clientId, actor: session.userId, admin: false, base: "/client/apps" as const };
  }
  if (base === "/hosting/apps") {
    const admin = await requireHostingAdmin();
    return { readOnly: false, clientId: null, actor: admin.id, admin: true, base: "/hosting/apps" as const };
  }
  redirect("/login");
}

async function limit(actor: string, path: string) {
  try { await rateLimit("hosting-app", actor, 20, 600); }
  catch (error) {
    unstable_rethrow(error);
    bail(path, error instanceof SecurityCheckUnavailable ? "storage_unavailable" : "too_many");
  }
}

async function owned(id: string, actor: Awaited<ReturnType<typeof open>>) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) bail(actor.base, "forbidden");
  let app: HostingApp | null;
  try { app = await getApp(id, actor.admin ? null : actor.clientId); }
  catch (error) { bail(actor.base, error instanceof Error ? error.message : "storage_unavailable"); }
  if (!app) bail(actor.base, "forbidden");
  return app;
}

async function audit(actor: string, event: string, id: string) {
  await getSupabase().from("freelance_hq_hosting_audit_logs").insert({ actor_id: actor, event, entity: "hosting_apps", entity_id: id }).then(() => undefined, () => undefined);
}

function codeOf(error: unknown) {
  if (error instanceof AgentError) return error.message;
  if (error instanceof Error && /^[a-z0-9_]{1,40}$/.test(error.message)) return error.message;
  return "storage_unavailable";
}

function displayName(value: string) {
  const clean = value.trim().replace(/\s+/g, " ");
  if (clean.length < 1 || clean.length > 80 || /[\u0000-\u001f]/.test(clean)) return null;
  return clean;
}

async function runtimeEnv(appId: string) {
  try { return await loadEnvValues(appId); } catch { return undefined; }
}

function sourceBody(app: HostingApp, token?: string) {
  if (app.source_kind === "image") return { kind: "image" as const, image: app.source_url };
  return { kind: "git" as const, url: app.source_url, ...(app.git_ref ? { ref: app.git_ref } : {}), ...(token ? { token } : {}) };
}

export async function createHostingApp(form: FormData) {
  const actor = await open(String(form.get("return_base") ?? ""));
  const back = `${actor.base}/new`;
  if (actor.readOnly) bail(back, "read_only");
  await limit(actor.actor, back);
  const name = String(form.get("name") ?? "").trim().toLowerCase();
  const label = displayName(String(form.get("display_name") ?? "")) ?? name;
  const sourceKind = String(form.get("source_kind") ?? "");
  const sourceUrl = String(form.get("source_url") ?? "").trim();
  const gitRef = String(form.get("git_ref") ?? "").trim();
  const gitToken = String(form.get("git_token") ?? "");
  const framework = String(form.get("framework") ?? "");
  const dockerfile = String(form.get("dockerfile") ?? "").trim();
  const domain = String(form.get("domain") ?? "").trim().toLowerCase();
  const redirectMode = String(form.get("redirect") ?? "none");
  const cpu = Number(form.get("cpu") ?? 1);
  const memory = Number(form.get("memory_mb") ?? 512);
  const requestedPort = form.get("port");
  if (!appNameOk(name) || !displayName(label) || !frameworkOk(framework) || !redirectOk(redirectMode)) bail(back, "invalid_name");
  if (sourceKind === "git") {
    if (!gitUrlOk(sourceUrl) || (gitRef && !gitRefOk(gitRef)) || framework === "image") bail(back, "invalid_source");
  } else if (sourceKind === "image") {
    if (!imageRefOk(sourceUrl) || framework !== "image") bail(back, "invalid_source");
  } else bail(back, "invalid_source");
  if (gitToken && (gitToken.length > 300 || /[\r\n\0]/.test(gitToken))) bail(back, "invalid_source");
  if (dockerfile && !dockerfilePathOk(dockerfile)) bail(back, "invalid_source");
  const port = requestedPort ? Number(requestedPort) : defaultPort(framework);
  if (!portOk(port) || !resourcesOk(cpu, memory)) bail(back, "invalid_limits");
  const env = parseEnvText(String(form.get("env_text") ?? ""));
  if (!env) bail(back, "invalid_env");
  if ((env.length || gitToken) && !process.env.HOSTING_APP_SECRETS_KEY) bail(back, "secrets_key_missing");
  if (domain && !domainOk(domain)) bail(back, "invalid_domain");
  let clientId = actor.clientId;
  if (actor.admin) {
    const requested = String(form.get("client_id") ?? "");
    if (requested) {
      if (!/^[0-9a-f-]{36}$/i.test(requested)) bail(back, "invalid_client");
      const client = await getSupabase().from("freelance_hq_hosting_clients").select("id").eq("id", requested).maybeSingle();
      if (client.error || !client.data) bail(back, "invalid_client");
      clientId = requested;
    }
  }
  const id = randomUUID();
  const inserted = await getSupabase().from("freelance_hq_hosting_apps").insert({
    id, name, display_name: label, client_id: clientId, framework, source_kind: sourceKind, source_url: sourceUrl,
    git_ref: gitRef || null, git_token_encrypted: gitToken ? encryptAppSecret(gitToken) : null, dockerfile_path: dockerfile || null,
    port, cpu, memory_mb: memory, www_redirect: redirectMode, status: "pending", created_by: actor.actor,
  }).select("id").single();
  if (inserted.error) bail(back, storageCode(inserted.error));
  if (env.length) {
    const saved = await getSupabase().from("freelance_hq_hosting_app_env").insert(env.map((item) => ({ app_id: id, name: item.name, value_encrypted: encryptAppSecret(item.value) })));
    if (saved.error) bail(`${actor.base}/${id}`, storageCode(saved.error));
  }
  const token = randomBytes(24).toString("hex");
  if (domain) {
    const saved = await getSupabase().from("freelance_hq_hosting_app_domains").insert({ app_id: id, hostname: domain, verification_token: token, is_primary: true, status: "pending_dns" });
    if (saved.error) bail(`${actor.base}/${id}`, storageCode(saved.error));
  }
  const deployment = randomUUID();
  await getSupabase().from("freelance_hq_hosting_deployments").insert({ id: deployment, app_id: id, status: "queued", image_ref: sourceKind === "image" ? sourceUrl : `hms/${name}:latest` });
  let status = "building";
  let errorCode: string | null = null;
  if (!agentConfigured()) errorCode = "agent_not_configured";
  else {
    try {
      await agentDeploy({
        name, framework, source: sourceBody({ source_kind: sourceKind, source_url: sourceUrl, git_ref: gitRef || null } as HostingApp, gitToken || undefined),
        dockerfile: dockerfile || undefined, port, cpu, memoryMb: memory, env, redirect: redirectMode,
        domains: domain ? [{ host: domain, token }] : [],
      });
    } catch (error) {
      unstable_rethrow(error);
      errorCode = codeOf(error);
      status = "failed";
    }
  }
  if (errorCode && status !== "failed") status = "pending";
  await getSupabase().from("freelance_hq_hosting_apps").update({ status, last_error: errorCode, updated_at: new Date().toISOString() }).eq("id", id);
  await getSupabase().from("freelance_hq_hosting_deployments").update({ status: status === "failed" ? "failed" : "building", error: errorCode, finished_at: status === "failed" ? new Date().toISOString() : null }).eq("id", deployment);
  await audit(actor.actor, "app_created", id);
  redirect(`${actor.base}/${id}?tab=deployments${errorCode ? `&error=${encodeURIComponent(errorCode)}` : ""}`);
}

async function syncDomains(app: HostingApp, domains: HostingAppDomain[]) {
  const env = await runtimeEnv(app.id);
  await agentDomains(app.name, {
    domains: domains.map((domain) => ({ host: domain.hostname, token: domain.verification_token })),
    redirect: app.www_redirect,
    ...(env ? { env } : {}),
  });
}

export async function verifyHostingDomain(form: FormData) {
  const actor = await open(String(form.get("return_base") ?? ""));
  const app = await owned(String(form.get("app_id") ?? ""), actor);
  const back = `${actor.base}/${app.id}?tab=domains`;
  if (actor.readOnly) bail(back, "read_only");
  await limit(actor.actor, back);
  const hostname = String(form.get("hostname") ?? "").toLowerCase();
  const domains = await listDomains(app.id);
  const domain = domains.find((item) => item.hostname === hostname);
  if (!domain) bail(back, "invalid_domain");
  const looked = await lookupHostname(hostname);
  const httpVerified = await httpTokenReady(hostname, domain.verification_token);
  const assessment = assessDns({ ...looked, token: domain.verification_token, httpVerified });
  let status: string = domainStatusAfterProof(assessment.proven, false, false);
  let detail = assessment.detail;
  if (assessment.proven && agentConfigured()) {
    try {
      await syncDomains(app, domains);
      const certificate = await certificateReady(hostname);
      status = domainStatusAfterProof(true, true, certificate.ok);
      if (certificate.ok && certificate.issuer) detail = `${assessment.detail} Certificate: ${certificate.issuer}.`;
    } catch (error) {
      unstable_rethrow(error);
      status = "error";
      detail = codeOf(error);
    }
  }
  await getSupabase().from("freelance_hq_hosting_app_domains").update({ status, detail, last_checked_at: new Date().toISOString() }).eq("id", domain.id);
  await audit(actor.actor, "domain_verified", app.id);
  redirect(back);
}

export async function addHostingDomain(form: FormData) {
  const actor = await open(String(form.get("return_base") ?? ""));
  const app = await owned(String(form.get("app_id") ?? ""), actor);
  const back = `${actor.base}/${app.id}?tab=domains`;
  if (actor.readOnly) bail(back, "read_only");
  await limit(actor.actor, back);
  const hostname = String(form.get("hostname") ?? "").trim().toLowerCase();
  if (!domainOk(hostname)) bail(back, "invalid_domain");
  const existing = await listDomains(app.id);
  const inserted = await getSupabase().from("freelance_hq_hosting_app_domains").insert({
    app_id: app.id, hostname, verification_token: randomBytes(24).toString("hex"), is_primary: existing.length === 0, status: "pending_dns",
  });
  if (inserted.error) bail(back, storageCode(inserted.error));
  await audit(actor.actor, "domain_added", app.id);
  redirect(back);
}

export async function configureHostingDns(form: FormData) {
  const actor = await open(String(form.get("return_base") ?? ""));
  const app = await owned(String(form.get("app_id") ?? ""), actor);
  const back = `${actor.base}/${app.id}?tab=domains`;
  if (actor.readOnly || !actor.admin) bail(back, "forbidden");
  await limit(actor.actor, back);
  const hostname = String(form.get("hostname") ?? "").toLowerCase();
  const provider = String(form.get("provider") ?? "");
  const domains = await listDomains(app.id);
  const domain = domains.find((item) => item.hostname === hostname);
  const plan = domain ? dnsPlan(hostname, domain.verification_token) : null;
  if (!domain || !plan) bail(back, "invalid_domain");
  try {
    if (provider === "cloudflare") {
      if (!cloudflareEnabled()) bail(back, "cloudflare_off");
      await configureCloudflare(hostname, plan.records);
    } else if (provider === "dynadot") {
      const apex = await registrarOwns(hostname);
      if (!apex) bail(back, "not_in_registrar");
      await configureDynadot(apex, plan.records);
    } else bail(back, "forbidden");
  } catch (error) {
    unstable_rethrow(error);
    bail(back, codeOf(error));
  }
  await audit(actor.actor, `dns_${provider}`, app.id);
  redirect(`${back}&saved=1`);
}

export async function setPrimaryDomain(form: FormData) {
  const actor = await open(String(form.get("return_base") ?? ""));
  const app = await owned(String(form.get("app_id") ?? ""), actor);
  const back = `${actor.base}/${app.id}?tab=domains`;
  if (actor.readOnly) bail(back, "read_only");
  const hostname = String(form.get("hostname") ?? "").toLowerCase();
  const domains = await listDomains(app.id);
  if (!domains.some((domain) => domain.hostname === hostname)) bail(back, "invalid_domain");
  await getSupabase().from("freelance_hq_hosting_app_domains").update({ is_primary: false }).eq("app_id", app.id);
  await getSupabase().from("freelance_hq_hosting_app_domains").update({ is_primary: true }).eq("app_id", app.id).eq("hostname", hostname);
  redirect(back);
}

export async function saveHostingEnv(form: FormData) {
  const actor = await open(String(form.get("return_base") ?? ""));
  const app = await owned(String(form.get("app_id") ?? ""), actor);
  const back = `${actor.base}/${app.id}?tab=env`;
  if (actor.readOnly) bail(back, "read_only");
  await limit(actor.actor, back);
  const rows = parseEnvText(String(form.get("env_text") ?? ""));
  if (!rows || !rows.length) bail(back, "invalid_env");
  if (!process.env.HOSTING_APP_SECRETS_KEY) bail(back, "secrets_key_missing");
  const saved = await getSupabase().from("freelance_hq_hosting_app_env").upsert(rows.map((row) => ({ app_id: app.id, name: row.name, value_encrypted: encryptAppSecret(row.value), updated_at: new Date().toISOString() })), { onConflict: "app_id,name" });
  if (saved.error) bail(back, storageCode(saved.error));
  await audit(actor.actor, "env_saved", app.id);
  redirect(`${back}&saved=1`);
}

export async function deleteHostingEnv(form: FormData) {
  const actor = await open(String(form.get("return_base") ?? ""));
  const app = await owned(String(form.get("app_id") ?? ""), actor);
  const back = `${actor.base}/${app.id}?tab=env`;
  if (actor.readOnly) bail(back, "read_only");
  const name = String(form.get("name") ?? "");
  await getSupabase().from("freelance_hq_hosting_app_env").delete().eq("app_id", app.id).eq("name", name);
  redirect(back);
}

export async function controlHostingApp(form: FormData) {
  const actor = await open(String(form.get("return_base") ?? ""));
  const app = await owned(String(form.get("app_id") ?? ""), actor);
  const action = String(form.get("control") ?? "");
  const back = `${actor.base}/${app.id}?tab=settings`;
  if (actor.readOnly) bail(back, "read_only");
  await limit(actor.actor, back);
  if (action === "delete") {
    if (String(form.get("confirm") ?? "") !== app.name) bail(back, "confirm_name");
    if (agentConfigured()) {
      try { await agentRemove(app.name); }
      catch (error) {
        unstable_rethrow(error);
        if (!(error instanceof AgentError) || error.code !== "not_found") bail(back, codeOf(error));
      }
    }
    await getSupabase().from("freelance_hq_hosting_apps").delete().eq("id", app.id);
    await audit(actor.actor, "app_deleted", app.id);
    redirect(actor.base);
  }
  if (action !== "start" && action !== "stop" && action !== "restart" && action !== "redeploy") bail(back, "forbidden");
  if (!agentConfigured()) bail(back, "agent_not_configured");
  try {
    if (action === "redeploy") {
      const token = app.source_kind === "git" ? await loadGitToken(app.id).catch(() => undefined) : undefined;
      const env = await runtimeEnv(app.id);
      await agentLifecycle(app.name, "redeploy", { ...(token ? { token } : {}), ...(env ? { env } : {}), ...(app.dockerfile_path ? { dockerfile: app.dockerfile_path } : {}) });
      await getSupabase().from("freelance_hq_hosting_deployments").insert({ app_id: app.id, status: "building", trigger: "redeploy", image_ref: app.source_kind === "image" ? app.source_url : `hms/${app.name}:latest` });
      await getSupabase().from("freelance_hq_hosting_apps").update({ status: "building", last_error: null, updated_at: new Date().toISOString() }).eq("id", app.id);
    } else {
      await agentLifecycle(app.name, action);
      await getSupabase().from("freelance_hq_hosting_apps").update({ status: action === "stop" ? "stopped" : "running", last_error: null, updated_at: new Date().toISOString() }).eq("id", app.id);
    }
  } catch (error) {
    unstable_rethrow(error);
    bail(back, codeOf(error));
  }
  await audit(actor.actor, `app_${action}`, app.id);
  redirect(action === "redeploy" ? `${actor.base}/${app.id}?tab=deployments` : back);
}

export async function assignHostingApp(form: FormData) {
  const actor = await open(String(form.get("return_base") ?? ""));
  const app = await owned(String(form.get("app_id") ?? ""), actor);
  const back = `${actor.base}/${app.id}?tab=settings`;
  if (!actor.admin) bail(back, "forbidden");
  const requested = String(form.get("client_id") ?? "");
  let clientId: string | null = null;
  if (requested) {
    if (!/^[0-9a-f-]{36}$/i.test(requested)) bail(back, "invalid_client");
    const client = await getSupabase().from("freelance_hq_hosting_clients").select("id").eq("id", requested).maybeSingle();
    if (client.error || !client.data) bail(back, "invalid_client");
    clientId = requested;
  }
  await getSupabase().from("freelance_hq_hosting_apps").update({ client_id: clientId, updated_at: new Date().toISOString() }).eq("id", app.id);
  await audit(actor.actor, "app_assigned", app.id);
  redirect(`${back}&saved=1`);
}

export async function saveHostingRedirect(form: FormData) {
  const actor = await open(String(form.get("return_base") ?? ""));
  const app = await owned(String(form.get("app_id") ?? ""), actor);
  const back = `${actor.base}/${app.id}?tab=domains`;
  if (actor.readOnly) bail(back, "read_only");
  const mode = String(form.get("redirect") ?? "");
  if (!redirectOk(mode)) bail(back, "invalid_domain");
  await getSupabase().from("freelance_hq_hosting_apps").update({ www_redirect: mode as RedirectMode, updated_at: new Date().toISOString() }).eq("id", app.id);
  redirect(back);
}

export async function removeHostingDomain(form: FormData) {
  const actor = await open(String(form.get("return_base") ?? ""));
  const app = await owned(String(form.get("app_id") ?? ""), actor);
  const back = `${actor.base}/${app.id}?tab=domains`;
  if (actor.readOnly) bail(back, "read_only");
  const hostname = String(form.get("hostname") ?? "").toLowerCase();
  await getSupabase().from("freelance_hq_hosting_app_domains").delete().eq("app_id", app.id).eq("hostname", hostname);
  const remaining = await listDomains(app.id);
  if (agentConfigured() && app.status !== "pending") {
    try { await syncDomains({ ...app }, remaining); } catch (error) { unstable_rethrow(error); bail(back, codeOf(error)); }
  }
  redirect(back);
}

export async function unbanHostingAddress(form: FormData) {
  const admin = await requireHostingAdmin();
  await limit(admin.id, "/hosting/security");
  const id = String(form.get("decision") ?? "");
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) bail("/hosting/security", "forbidden");
  try {
    const { agentUnban } = await import("@/lib/hosting/agent-client");
    await agentUnban(id);
  } catch (error) {
    unstable_rethrow(error);
    bail("/hosting/security", codeOf(error));
  }
  await audit(admin.id, "crowdsec_unban", admin.id);
  redirect("/hosting/security?saved=1");
}
