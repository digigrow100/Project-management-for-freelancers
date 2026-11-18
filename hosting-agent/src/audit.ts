import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function writeAudit(file: string, entry: Record<string, string | number | boolean | null>) {
  try {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    appendFileSync(file, JSON.stringify({ ...entry, at: new Date().toISOString() }) + "\n", { mode: 0o600 });
  } catch {
    // A full disk must not turn into a second copy of the request.
  }
}
