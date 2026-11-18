import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { appNameOk, domainOk, type Framework } from "./validate.ts";

export function containedPath(root: string, name: string) {
  if (!appNameOk(name)) throw new Error("invalid_name");
  const base = resolve(root);
  const target = resolve(base, name);
  if (target !== base && !target.startsWith(base + sep)) throw new Error("invalid_name");
  return target;
}

export type SiteSpec = {
  name: string;
  image: string;
  port: number;
  cpu: number;
  memoryMb: number;
  framework: Framework;
  domains: { host: string; token: string }[];
  redirect: "none" | "www_to_apex" | "apex_to_www";
  env: { name: string; value: string }[];
};

function rule(hosts: string[]) {
  return hosts.map((host) => "Host(`" + host + "`)").join(" || ");
}

export function traefikLabels(spec: SiteSpec) {
  const slug = spec.name;
  const labels: Record<string, string> = {
    "hms.managed": "true",
    "hms.app": spec.name,
    "traefik.enable": spec.domains.length ? "true" : "false",
    "traefik.docker.network": "proxy",
  };
  if (!spec.domains.length) return labels;
  const hosts = spec.domains.map((domain) => domain.host);
  labels[`traefik.http.routers.hms-${slug}.rule`] = rule(hosts);
  labels[`traefik.http.routers.hms-${slug}.entrypoints`] = "websecure";
  labels[`traefik.http.routers.hms-${slug}.tls.certresolver`] = "le";
  labels[`traefik.http.routers.hms-${slug}.service`] = `hms-${slug}`;
  labels[`traefik.http.services.hms-${slug}.loadbalancer.server.port`] = String(spec.port);
  spec.domains.forEach((domain, index) => {
    if (!domainOk(domain.host)) return;
    labels[`traefik.http.routers.hms-${slug}-verify-${index}.rule`] = `Host(\`${domain.host}\`) && PathPrefix(\`/.well-known/hms-verify\`)`;
    labels[`traefik.http.routers.hms-${slug}-verify-${index}.priority`] = "200";
    labels[`traefik.http.routers.hms-${slug}-verify-${index}.entrypoints`] = "websecure";
    labels[`traefik.http.routers.hms-${slug}-verify-${index}.tls.certresolver`] = "le";
    labels[`traefik.http.routers.hms-${slug}-verify-${index}.service`] = "hms-verify";
  });
  if (spec.redirect === "none") return labels;
  const fromWww = spec.redirect === "www_to_apex";
  const sources = hosts.filter((host) => host.startsWith("www.") === fromWww);
  if (!sources.length) return labels;
  labels[`traefik.http.middlewares.hms-${slug}-redir.redirectregex.regex`] = fromWww ? "^https://www\\\\.(.+)" : "^https://(?!www\\\\.)(.+)";
  labels[`traefik.http.middlewares.hms-${slug}-redir.redirectregex.replacement`] = fromWww ? "https://${1}" : "https://www.${1}";
  labels[`traefik.http.middlewares.hms-${slug}-redir.redirectregex.permanent`] = "true";
  labels[`traefik.http.routers.hms-${slug}-redir.rule`] = rule(sources);
  labels[`traefik.http.routers.hms-${slug}-redir.entrypoints`] = "websecure";
  labels[`traefik.http.routers.hms-${slug}-redir.tls.certresolver`] = "le";
  labels[`traefik.http.routers.hms-${slug}-redir.middlewares`] = `hms-${slug}-redir`;
  labels[`traefik.http.routers.hms-${slug}-redir.service`] = `hms-${slug}`;
  labels[`traefik.http.routers.hms-${slug}-redir.priority`] = "150";
  const remaining = hosts.filter((host) => !sources.includes(host));
  labels[`traefik.http.routers.hms-${slug}.rule`] = rule(remaining.length ? remaining : hosts);
  return labels;
}

function quote(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function writeSite(root: string, spec: SiteSpec) {
  const directory = containedPath(root, spec.name);
  mkdirSync(directory, { recursive: true, mode: 0o755 });
  const labels = traefikLabels(spec);
  const labelYaml = Object.entries(labels).map(([key, value]) => `      - ${JSON.stringify(key + "=" + value)}`).join("\n");
  const compose = `services:
  app:
    image: ${spec.image}
    container_name: hms-${spec.name}
    restart: unless-stopped
    env_file:
      - .env
    security_opt:
      - no-new-privileges:true
    mem_limit: ${spec.memoryMb}m
    cpus: "${spec.cpu}"
    networks:
      - proxy
    labels:
${labelYaml}
networks:
  proxy:
    external: true
`;
  writeFileSync(join(directory, "docker-compose.yml"), compose, { mode: 0o644 });
  const env = spec.env.map((item) => `${item.name}=${quote(item.value)}`).join("\n") + (spec.env.length ? "\n" : "");
  writeFileSync(join(directory, ".env"), env, { mode: 0o600 });
  return directory;
}

export function removeSite(root: string, name: string) {
  rmSync(containedPath(root, name), { recursive: true, force: true });
}
