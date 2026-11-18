export const ORIGIN_IPV4 = "62.171.130.156";

const APP_NAME = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const RESERVED = new Set([
  "traefik", "proxy", "socket-proxy", "agent", "portainer", "crowdsec",
  "_template", "_verify", "www", "mail", "localhost", "docker", "root",
]);
const DOMAIN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const ENV_NAME = /^[A-Z_][A-Z0-9_]{0,63}$/;
const BLOCKED_ENV = /^(PATH|HOME|HOSTNAME|NODE_OPTIONS|NODE_PATH|LD_PRELOAD|LD_LIBRARY_PATH|DOCKER_HOST|HOSTING_AGENT_|HMS_AGENT|GIT_ASKPASS|HMS_GIT_)/;
export const FRAMEWORKS = ["nextjs", "react", "vue", "nuxt", "node", "static", "dockerfile", "image"] as const;
export type Framework = (typeof FRAMEWORKS)[number];

export function appNameOk(name: string) {
  return APP_NAME.test(name) && !RESERVED.has(name);
}

export function domainOk(host: string) {
  if (!DOMAIN.test(host)) return false;
  return !host.endsWith(".local") && !host.endsWith(".localhost") && !host.endsWith(".internal") && !host.endsWith(".invalid");
}

export function envNameOk(name: string) {
  return ENV_NAME.test(name) && !BLOCKED_ENV.test(name);
}

export function envValueOk(value: string) {
  return typeof value === "string" && value.length <= 4096 && !/[\r\n\0]/.test(value);
}

function ipv4Parts(host: string) {
  const parts = host.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return null;
  const numbers = parts.map((part) => Number(part));
  if (numbers.some((part) => part > 255)) return null;
  return numbers;
}

export function blockedAddress(host: string) {
  const parts = ipv4Parts(host);
  if (!parts) return host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost");
  const [a, b] = parts;
  if (a === undefined || b === undefined) return true;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

export function gitUrlOk(value: string) {
  if (value.length > 500) return false;
  let url: URL;
  try { url = new URL(value); } catch { return false; }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) return false;
  const host = url.hostname.toLowerCase();
  if (blockedAddress(host)) return false;
  if (!url.pathname || url.pathname === "/" || url.pathname.includes("..")) return false;
  return true;
}

export function gitRefOk(value: string) {
  return /^[A-Za-z0-9._/-]{1,128}$/.test(value) && !value.includes("..") && !value.startsWith("-") && !value.startsWith("/") && !value.endsWith("/");
}

export function imageRefOk(value: string) {
  if (value.length < 1 || value.length > 200) return false;
  if (value.includes("..") || /[\s@\\]/.test(value)) return false;
  return /^[a-z0-9][a-z0-9._/-]*(?::[A-Za-z0-9._-]{1,128})?$/.test(value);
}

export function dockerfilePathOk(value: string) {
  return /^[A-Za-z0-9._/-]{1,120}$/.test(value) && !value.includes("..") && !value.startsWith("/") && !value.startsWith("-");
}

export function frameworkOk(value: string): value is Framework {
  return (FRAMEWORKS as readonly string[]).includes(value);
}

export function decisionIdOk(value: string) {
  return /^[A-Za-z0-9_-]{1,80}$/.test(value);
}

export function portOk(port: number) {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

export function resourcesOk(cpu: number, memoryMb: number) {
  return Number.isFinite(cpu) && cpu >= 0.1 && cpu <= 4 && Number.isInteger(memoryMb) && memoryMb >= 128 && memoryMb <= 8192;
}

export function defaultPort(framework: Framework) {
  return framework === "react" || framework === "vue" || framework === "static" ? 80 : 3000;
}
