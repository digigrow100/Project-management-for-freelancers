import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { KeyObject } from "node:crypto";
import { authorize, NonceStore } from "./auth.ts";
import { writeAudit } from "./audit.ts";
import { deleteDecision, readAlerts, readDecisions } from "./crowdsec.ts";
import { DOCKERIGNORE, generatedDockerfile } from "./dockerfiles.ts";
import { DockerClient } from "./docker.ts";
import { removeSite, traefikLabels, writeSite, type SiteSpec } from "./files.ts";
import { cloneRepo } from "./git.ts";
import { enqueue } from "./jobs.ts";
import { RateLimiter } from "./rateLimit.ts";
import { hostReport, readBuildLog, readState, writeBuildLog, writeState, type AppState } from "./state.ts";
import { appNameOk, decisionIdOk, defaultPort, domainOk, dockerfilePathOk, envNameOk, envValueOk, frameworkOk, gitRefOk, gitUrlOk, imageRefOk, portOk, resourcesOk, type Framework } from "./validate.ts";

export type AgentDeps = {
  token: string;
  publicKey: KeyObject;
  sitesDir: string;
  dataDir: string;
  auditFile: string;
  now?: () => number;
  inline?: boolean;
  docker?: Pick<DockerClient, "build" | "pull" | "run" | "action" | "logs" | "listManaged" | "remove" | "removeImage">;
  nonces?: NonceStore;
  limiter?: RateLimiter;
};

type EnvPair = { name: string; value: string };
type DomainPair = { host: string; token: string };

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 262_144) { const error = new Error("too_large"); throw error; }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function objectBody(body: Buffer) {
  if (!body.length) return {} as Record<string, unknown>;
  const parsed = JSON.parse(body.toString("utf8")) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid_json");
  return parsed as Record<string, unknown>;
}

function envList(value: unknown): EnvPair[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 64) throw new Error("invalid_env");
  return value.map((item) => {
    const row = item as Record<string, unknown>;
    if (!envNameOk(String(row.name ?? "")) || !envValueOk(String(row.value ?? ""))) throw new Error("invalid_env");
    return { name: String(row.name), value: String(row.value) };
  });
}

function domainList(value: unknown): DomainPair[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 20) throw new Error("invalid_domain");
  const domains = value.map((item) => {
    const row = item as Record<string, unknown>;
    const host = String(row.host ?? "").toLowerCase();
    const token = String(row.token ?? "");
    if (!domainOk(host) || !/^[a-f0-9]{32,64}$/.test(token)) throw new Error("invalid_domain");
    return { host, token };
  });
  if (new Set(domains.map((domain) => domain.host)).size !== domains.length) throw new Error("invalid_domain");
  return domains;
}

function redirectMode(value: unknown) {
  const mode = value === undefined ? "none" : String(value);
  if (mode !== "none" && mode !== "www_to_apex" && mode !== "apex_to_www") throw new Error("invalid_redirect");
  return mode;
}

function containerName(name: string) {
  return `hms-${name}`;
}

function verifyToken(host: string, dataDir: string) {
  try {
    const names = readdirSync(dataDir);
    for (const name of names) {
      const state = readState(dataDir, name);
      const match = state?.domains.find((domain) => domain.host === host);
      if (match) return match.token;
    }
  } catch { /* no saved apps yet */ }
  return "";
}

export function createAgentServer(deps: AgentDeps) {
  const nonces = deps.nonces ?? new NonceStore();
  const limiter = deps.limiter ?? new RateLimiter();
  const docker = deps.docker ?? new DockerClient();
  const now = deps.now ?? Date.now;

  async function apply(state: AppState, env: EnvPair[]) {
    const spec: SiteSpec = { name: state.name, image: state.image, port: state.port, cpu: state.cpu, memoryMb: state.memoryMb, framework: state.framework as Framework, domains: state.domains, redirect: state.redirect, env };
    writeSite(deps.sitesDir, spec);
    const labels = traefikLabels(spec);
    await docker.run({
      name: containerName(state.name),
      image: state.image,
      env: env.map((item) => `${item.name}=${item.value}`),
      port: state.port,
      cpu: state.cpu,
      memoryMb: state.memoryMb,
      labels,
    });
  }

  async function buildApp(state: AppState, env: EnvPair[], token?: string, dockerfile?: string) {
    writeState(deps.dataDir, { ...state, status: "building", error: null });
    const log: string[] = [];
    const note = (line: string) => { log.push(line); writeBuildLog(deps.dataDir, state.name, log.join("\n")); };
    try {
      if (state.source.kind === "image") {
        note(`Pulling ${state.source.image}`);
        await docker.pull(state.source.image);
      } else {
        const destination = join(deps.dataDir, state.name, "src");
        note(`Cloning ${state.source.url}`);
        await cloneRepo(state.source.url, destination, state.source.ref, token);
        const file = state.framework === "dockerfile" ? (dockerfile || "Dockerfile") : "Dockerfile.hms";
        if (state.framework !== "dockerfile") {
          writeFileSync(join(destination, "Dockerfile.hms"), generatedDockerfile(state.framework as Framework));
          writeFileSync(join(destination, ".dockerignore"), DOCKERIGNORE);
        }
        note(`Building ${state.image}`);
        await docker.build(destination, state.image, file);
      }
      note("Starting container");
      await apply(state, env);
      writeState(deps.dataDir, { ...state, status: "running", error: null });
      note("Running");
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 300) : "failed";
      note(message);
      writeState(deps.dataDir, { ...state, status: "failed", error: message });
      throw error;
    }
  }

  return createServer((req, res) => {
    void handleRequest(req, res).catch(() => {
      if (!res.headersSent) send(res, 400, { error: "bad_request" });
    });
  });

  async function handleRequest(req: IncomingMessage, res: ServerResponse) {
    const method = req.method ?? "GET";
    const path = req.url ?? "/";
    const remote = req.socket.remoteAddress ?? "unknown";
    const started = now();
    if (!limiter.allow(remote, 120, 60_000, started)) { send(res, 429, { error: "rate_limited" }); return; }
    if (method === "GET" && path.startsWith("/.well-known/hms-verify/")) {
      const host = String(req.headers.host ?? "").split(":")[0]?.toLowerCase() ?? "";
      const token = path.split("?")[0]?.split("/").pop() ?? "";
      if (!/^[a-f0-9]{32,64}$/.test(token)) { send(res, 404, { error: "not_found" }); return; }
      const expected = verifyToken(host, deps.dataDir);
      if (!expected || expected !== token) { send(res, 404, { error: "not_found" }); return; }
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
      res.end(expected);
      return;
    }
    if (method === "GET" && path === "/health") { send(res, 200, { ok: true }); return; }
    let body = Buffer.alloc(0);
    try { body = await readBody(req); }
    catch { send(res, 413, { error: "too_large" }); return; }
    const decision = authorize({ headers: req.headers, method, path, body, token: deps.token, publicKey: deps.publicKey, now: started, nonces });
    if (!decision.ok) {
      writeAudit(deps.auditFile, { method, path: path.split("?")[0] ?? path, ok: false, code: decision.code, ip: remote });
      send(res, decision.status, { error: decision.code });
      return;
    }
    try {
      const route = path.split("?")[0] ?? path;
      const mutatingDeploy = method === "POST" && (route === "/v1/apps" || route.endsWith("/redeploy"));
      if (mutatingDeploy && !limiter.allow("deploy", 6, 60_000, started)) { send(res, 429, { error: "rate_limited" }); return; }
      const result = await routeRequest({ method, route, body, deps, docker, buildApp, apply });
      writeAudit(deps.auditFile, { method, path: route, ok: true, ip: remote });
      send(res, result.status, result.body);
    } catch (error) {
      const code = error instanceof Error && error.message.startsWith("invalid") ? error.message : error instanceof SyntaxError ? "invalid_json" : "failed";
      const status = code === "not_found" ? 404 : code.startsWith("invalid") || code === "invalid_json" ? 400 : code === "busy" ? 429 : 500;
      writeAudit(deps.auditFile, { method, path: path.split("?")[0] ?? path, ok: false, code, ip: remote });
      send(res, status, { error: code === "failed" ? "failed" : code });
    }
  }
}

async function routeRequest(input: {
  method: string;
  route: string;
  body: Buffer;
  deps: AgentDeps;
  docker: Pick<DockerClient, "build" | "pull" | "run" | "action" | "logs" | "listManaged" | "remove" | "removeImage">;
  buildApp: (state: AppState, env: EnvPair[], token?: string, dockerfile?: string) => Promise<void>;
  apply: (state: AppState, env: EnvPair[]) => Promise<void>;
}): Promise<{ status: number; body: unknown }> {
  const { method, route, deps, docker } = input;
  if (method === "GET" && route === "/v1/host") {
    const apps = docker.listManaged();
    const report = await hostReport(deps.sitesDir);
    return { status: 200, body: { ...report, apps: await apps } };
  }
  if (method === "GET" && route === "/v1/security/decisions") return { status: 200, body: await readDecisions() };
  if (method === "GET" && route === "/v1/security/alerts") return { status: 200, body: await readAlerts() };
  const unban = /^\/v1\/security\/decisions\/([A-Za-z0-9_-]{1,80})$/.exec(route);
  if (method === "DELETE" && unban) {
    const id = unban[1] ?? "";
    if (!decisionIdOk(id)) throw new Error("invalid_decision");
    await deleteDecision(id);
    return { status: 200, body: { deleted: id } };
  }
  if (method === "GET" && route === "/v1/apps") {
    let names: string[] = [];
    try { names = readdirSyncSafe(deps.dataDir); } catch { names = []; }
    return { status: 200, body: { apps: names.map((name) => readState(deps.dataDir, name)).filter(Boolean) } };
  }
  if (method === "POST" && route === "/v1/apps") {
    const payload = objectBody(input.body);
    const name = String(payload.name ?? "");
    const framework = String(payload.framework ?? "");
    if (!appNameOk(name) || !frameworkOk(framework)) throw new Error("invalid_name");
    const source = payload.source as Record<string, unknown> | undefined;
    if (!source) throw new Error("invalid_source");
    const kind = String(source.kind ?? "");
    let recorded: AppState["source"];
    let token: string | undefined;
    if (kind === "git") {
      const url = String(source.url ?? "");
      const ref = source.ref === undefined ? undefined : String(source.ref);
      if (!gitUrlOk(url) || (ref && !gitRefOk(ref))) throw new Error("invalid_source");
      if (framework === "image") throw new Error("invalid_source");
      recorded = { kind: "git", url, ...(ref ? { ref } : {}) };
      token = source.token === undefined ? undefined : String(source.token);
    } else if (kind === "image") {
      const image = String(source.image ?? "");
      if (!imageRefOk(image) || framework !== "image") throw new Error("invalid_source");
      recorded = { kind: "image", image };
    } else throw new Error("invalid_source");
    const port = payload.port === undefined ? defaultPort(framework) : Number(payload.port);
    const cpu = payload.cpu === undefined ? 1 : Number(payload.cpu);
    const memoryMb = payload.memoryMb === undefined ? 512 : Number(payload.memoryMb);
    if (!portOk(port) || !resourcesOk(cpu, memoryMb)) throw new Error("invalid_limits");
    const dockerfile = payload.dockerfile === undefined ? undefined : String(payload.dockerfile);
    if (dockerfile && !dockerfilePathOk(dockerfile)) throw new Error("invalid_dockerfile");
    const env = envList(payload.env);
    const domains = domainList(payload.domains);
    const state: AppState = {
      name, status: "building", image: kind === "image" && recorded.kind === "image" ? recorded.image : `hms/${name}:latest`,
      framework, port, cpu, memoryMb, source: recorded, domains, redirect: redirectMode(payload.redirect), error: null, updatedAt: new Date().toISOString(),
    };
    const job = () => input.buildApp(state, env, token, dockerfile);
    if (deps.inline) await job();
    else enqueue(() => job().catch(() => undefined));
    return { status: 202, body: { accepted: true, name, status: deps.inline ? readState(deps.dataDir, name)?.status ?? "building" : "building" } };
  }
  const appRoute = /^\/v1\/apps\/([a-z0-9-]+)(?:\/(start|stop|restart|redeploy|logs|domains))?$/.exec(route);
  if (!appRoute) throw new Error("not_found");
  const name = appRoute[1] ?? "";
  const action = appRoute[2];
  if (!appNameOk(name)) throw new Error("invalid_name");
  const state = readState(deps.dataDir, name);
  if (!state && action !== undefined) throw new Error("not_found");
  if (method === "GET" && !action) {
    if (!state) throw new Error("not_found");
    return { status: 200, body: state };
  }
  if (method === "GET" && action === "logs") {
    const runtime = state ? await docker.logs(containerName(name)).catch(() => "") : "";
    return { status: 200, body: { build: readBuildLog(deps.dataDir, name), runtime } };
  }
  if (method === "DELETE" && !action) {
    await docker.remove(containerName(name));
    await docker.removeImage(state?.image ?? `hms/${name}:latest`);
    removeSite(deps.sitesDir, name);
    rmSync(join(deps.dataDir, name), { recursive: true, force: true });
    return { status: 200, body: { deleted: name } };
  }
  if (!state) throw new Error("not_found");
  if (method === "POST" && (action === "start" || action === "stop" || action === "restart")) {
    await docker.action(containerName(name), action);
    writeState(deps.dataDir, { ...state, status: action === "stop" ? "stopped" : "running", error: null });
    return { status: 200, body: { name, status: action === "stop" ? "stopped" : "running" } };
  }
  if (method === "POST" && action === "redeploy") {
    const payload = objectBody(input.body);
    const token = payload.token === undefined ? undefined : String(payload.token);
    const env = payload.env === undefined ? readEnvFile(deps.sitesDir, name) : envList(payload.env);
    const job = () => input.buildApp(state, env, token, payload.dockerfile === undefined ? undefined : String(payload.dockerfile));
    if (deps.inline) await job();
    else enqueue(() => job().catch(() => undefined));
    return { status: 202, body: { accepted: true, name, status: "building" } };
  }
  if (method === "POST" && action === "domains") {
    const payload = objectBody(input.body);
    const domains = domainList(payload.domains);
    const next = { ...state, domains, redirect: redirectMode(payload.redirect) };
    const env = payload.env === undefined ? readEnvFile(deps.sitesDir, name) : envList(payload.env);
    await input.apply(next, env);
    writeState(deps.dataDir, { ...next, status: "running", error: null });
    return { status: 200, body: { name, domains: domains.map((domain) => domain.host) } };
  }
  throw new Error("not_found");
}

function readdirSyncSafe(directory: string) {
  return readdirSync(directory).filter((name) => appNameOk(name));
}

function readEnvFile(root: string, name: string): EnvPair[] {
  try {
    const text = readFileSync(join(root, name, ".env"), "utf8");
    return text.split("\n").filter(Boolean).map((line) => {
      const index = line.indexOf("=");
      const key = line.slice(0, index);
      const raw = line.slice(index + 1);
      const value = raw.startsWith("\"") ? raw.slice(1, -1).replace(/\\"/g, "\"").replace(/\\\\/g, "\\") : raw;
      return { name: key, value };
    }).filter((item) => envNameOk(item.name));
  } catch { return []; }
}
