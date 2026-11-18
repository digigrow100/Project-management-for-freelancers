import "server-only";
import { gitUrlOk } from "./validate";
import { frameworkFromManifest, } from "./detect";
import type { Framework } from "./validate";

export async function detectGitFramework(url: string, token?: string): Promise<Framework | null> {
  if (!gitUrlOk(url)) return null;
  const parsed = new URL(url);
  if (parsed.hostname !== "github.com") return null;
  const parts = parsed.pathname.replace(/\.git$/, "").split("/").filter(Boolean);
  const owner = parts[0];
  const repo = parts[1];
  if (!owner || !repo || parts.length > 2) return null;
  const headers: Record<string, string> = { accept: "application/vnd.github+json", "user-agent": "housemysite-hosting" };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/`, { headers, redirect: "error", signal: AbortSignal.timeout(8000) });
  if (!response.ok) return null;
  const listing = await response.json() as { name?: string; type?: string }[];
  if (!Array.isArray(listing)) return null;
  const files = listing.filter((item) => item.type === "file" && item.name).map((item) => item.name ?? "");
  let manifest: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } | null = null;
  if (files.includes("package.json")) {
    const file = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/package.json`, { headers, redirect: "error", signal: AbortSignal.timeout(8000) });
    if (file.ok) {
      const payload = await file.json() as { content?: string; encoding?: string };
      if (payload.encoding === "base64" && payload.content && payload.content.length < 200_000) {
        try { manifest = JSON.parse(Buffer.from(payload.content, "base64").toString("utf8")); } catch { manifest = null; }
      }
    }
  }
  return frameworkFromManifest(files, manifest);
}
