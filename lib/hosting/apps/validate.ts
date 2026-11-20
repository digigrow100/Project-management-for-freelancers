export const ORIGIN_IPV4 = "62.171.130.156";
const APP_NAME = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const RESERVED = new Set(["traefik", "proxy", "socket-proxy", "agent", "portainer", "crowdsec", "_template", "_verify", "www", "mail", "localhost", "docker", "root"]);
const DOMAIN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const ENV_NAME = /^[A-Z_][A-Z0-9_]{0,63}$/;
const BLOCKED_ENV = /^(PATH|HOME|HOSTNAME|NODE_[A-Z_]*|LD_PRELOAD|LD_LIBRARY_PATH|DOCKER_HOST|HOSTING_AGENT_|HMS_|GIT_|NPM_|npm_|SSL_CERT_)/;
export const FRAMEWORKS = ["nextjs", "react", "vue", "nuxt", "node", "static"] as const;
export type Framework = (typeof FRAMEWORKS)[number];
export type RedirectMode = "none" | "www_to_apex" | "apex_to_www";
export function appNameOk(name: string) {
    return APP_NAME.test(name) && !RESERVED.has(name);
}
export function previewHost(name: string) {
    if (!/^w-[a-f0-9]{32}$/.test(name)) throw Error('invalid_website');
    return `${name}.deploy.housemysite.com`;
}
export function isPreviewHost(host: string) { return /^w-[a-f0-9]{32}\.deploy\.housemysite\.com$/.test(host); }
export function domainOk(host: string) {
    if (!DOMAIN.test(host))
        return false;
    return isPreviewHost(host) || host !== "housemysite.com" && !host.endsWith(".housemysite.com") && !host.endsWith(".local") && !host.endsWith(".localhost") && !host.endsWith(".internal") && !host.endsWith(".invalid");
}
export function envNameOk(name: string) {
    return ENV_NAME.test(name) && !BLOCKED_ENV.test(name);
}
export function envValueOk(value: string) {
    return value.length <= 4096 && !/[\r\n\0]/.test(value);
}
function ipv4Parts(host: string) {
    const parts = host.split(".");
    if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part)))
        return null;
    const numbers = parts.map((part) => Number(part));
    if (numbers.some((part) => part > 255))
        return null;
    return numbers;
}
export function blockedAddress(host: string) {
    const parts = ipv4Parts(host);
    if (!parts)
        return host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost");
    const a = parts[0] ?? 0;
    const b = parts[1] ?? 0;
    if (a === 0 || a === 10 || a === 127)
        return true;
    if (a === 169 && b === 254)
        return true;
    if (a === 172 && b >= 16 && b <= 31)
        return true;
    if (a === 192 && b === 168)
        return true;
    if (a === 100 && b >= 64 && b <= 127)
        return true;
    return false;
}
export function gitUrlOk(value: string) {
    return /^https:\/\/github\.com\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(value)
        && value.length <= 200 && !value.includes("..") && !value.endsWith("/");
}
export function gitRefOk(value: string) {
    return /^[A-Za-z0-9._/-]{1,128}$/.test(value) && !value.includes("..") && !value.startsWith("-") && !value.startsWith("/") && !value.endsWith("/");
}
export function imageRefOk(value: string) {
    if (value.length < 1 || value.length > 200)
        return false;
    if (value.includes("..") || /[\s@\\]/.test(value))
        return false;
    return /^[a-z0-9][a-z0-9._/-]*(?::[A-Za-z0-9._-]{1,128})?$/.test(value);
}
export function dockerfilePathOk(value: string) {
    return /^[A-Za-z0-9._/-]{1,120}$/.test(value) && !value.includes("..") && !value.startsWith("/") && !value.startsWith("-");
}
export function frameworkOk(value: string): value is Framework {
    return (FRAMEWORKS as readonly string[]).includes(value);
}
export function portOk(port: number) {
    return Number.isInteger(port) && port >= 1 && port <= 65535;
}
export function resourcesOk(cpu: number, memoryMb: number) {
    return Number.isFinite(cpu) && cpu >= 0.1 && cpu <= 4 && Number.isInteger(memoryMb) && memoryMb >= 128 && memoryMb <= 8192;
}
export function redirectOk(value: string): value is RedirectMode {
    return value === "none" || value === "www_to_apex" || value === "apex_to_www";
}
export function defaultPort(framework: Framework) {
    return framework === "react" || framework === "vue" || framework === "static" ? 8080 : 3000;
}
export function parseEnvText(text: string) {
    const rows: {
        name: string;
        value: string;
    }[] = [];
    for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#"))
            continue;
        const index = trimmed.indexOf("=");
        if (index < 1)
            return null;
        const name = trimmed.slice(0, index).trim();
        const value = trimmed.slice(index + 1);
        if (!envNameOk(name) || !envValueOk(value))
            return null;
        rows.push({ name, value });
    }
    return rows.length > 64 ? null : rows;
}
