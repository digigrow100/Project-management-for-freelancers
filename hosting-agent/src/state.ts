import { mkdirSync, readFileSync, statfsSync, writeFileSync } from "node:fs";
import { cpus, freemem, totalmem } from "node:os";
import { join } from "node:path";
import { containedPath } from "./files.ts";
import { appNameOk } from "./validate.ts";

export type AppState = {
  name: string;
  status: "building" | "running" | "stopped" | "failed";
  image: string;
  framework: string;
  port: number;
  cpu: number;
  memoryMb: number;
  source: { kind: "git"; url: string; ref?: string } | { kind: "image"; image: string };
  domains: { host: string; token: string }[];
  redirect: "none" | "www_to_apex" | "apex_to_www";
  error: string | null;
  updatedAt: string;
};

export function stateFile(dataDir: string, name: string) {
  return join(containedPath(dataDir, name), "state.json");
}

export function readState(dataDir: string, name: string): AppState | null {
  if (!appNameOk(name)) return null;
  try { return JSON.parse(readFileSync(stateFile(dataDir, name), "utf8")) as AppState; } catch { return null; }
}

export function writeState(dataDir: string, state: AppState) {
  const directory = containedPath(dataDir, state.name);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  writeFileSync(stateFile(dataDir, state.name), JSON.stringify({ ...state, updatedAt: new Date().toISOString() }), { mode: 0o600 });
}

export function readBuildLog(dataDir: string, name: string) {
  if (!appNameOk(name)) return "";
  try { return readFileSync(join(containedPath(dataDir, name), "build.log"), "utf8").slice(-20_000); } catch { return ""; }
}

export function writeBuildLog(dataDir: string, name: string, text: string) {
  const directory = containedPath(dataDir, name);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  writeFileSync(join(directory, "build.log"), text.slice(-100_000), { mode: 0o600 });
}

function readCpuSample(path: string) {
  try {
    const line = readFileSync(path, "utf8").split("\n").find((entry) => entry.startsWith("cpu "));
    if (!line) return null;
    const parts = line.trim().split(/\s+/).slice(1).map(Number);
    const idle = parts[3] ?? 0;
    const total = parts.reduce((sum, value) => sum + value, 0);
    return { idle, total };
  } catch { return null; }
}

export async function hostReport(sitesDir: string) {
  const proc = process.env.HOST_PROC || "/host/proc";
  const first = readCpuSample(join(proc, "stat"));
  let cpuPercent: number | null = null;
  let source: "host" | "container" = first ? "host" : "container";
  if (first) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    const second = readCpuSample(join(proc, "stat"));
    if (second && second.total > first.total) cpuPercent = Math.max(0, Math.min(100, (1 - (second.idle - first.idle) / (second.total - first.total)) * 100));
  }
  let memoryTotal = totalmem();
  let memoryUsed = memoryTotal - freemem();
  try {
    const info = readFileSync(join(proc, "meminfo"), "utf8");
    const total = Number(/MemTotal:\s+(\d+)/.exec(info)?.[1] ?? 0) * 1024;
    const available = Number(/MemAvailable:\s+(\d+)/.exec(info)?.[1] ?? 0) * 1024;
    if (total > 0) { memoryTotal = total; memoryUsed = total - available; source = "host"; }
  } catch { /* container counters remain */ }
  let diskTotal = 0;
  let diskUsed = 0;
  try {
    const stats = statfsSync(sitesDir);
    diskTotal = stats.blocks * stats.bsize;
    diskUsed = (stats.blocks - stats.bavail) * stats.bsize;
  } catch { /* disk stays unknown */ }
  return {
    source,
    cpuPercent: cpuPercent === null ? null : Math.round(cpuPercent * 10) / 10,
    cpuCount: cpus().length,
    memory: { used: memoryUsed, total: memoryTotal },
    disk: { used: diskUsed, total: diskTotal },
  };
}
