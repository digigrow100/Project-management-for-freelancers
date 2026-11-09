import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { getSupabase } from "@/lib/supabaseClient";
import { rateLimit } from "@/lib/security/rateLimit";
import type { BotResult, Queue } from "./core";

export const botCookie = process.env.NODE_ENV === "production" ? "__Host-fhq-seo-bot" : "fhq-seo-bot";
export const botCookieOptions = {
  httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/", maxAge: 8 * 60 * 60,
};

export function newBotKey() {
  return "seo_" + randomBytes(32).toString("base64url");
}

export function botDigest(key: unknown) {
  return typeof key === "string" && /^seo_[A-Za-z0-9_-]{43}$/.test(key)
    ? createHash("sha256").update(key).digest("hex") : null;
}

export async function botRequestLimit(scope: string) {
  const ip = process.env.VERCEL === "1" ? (await headers()).get("x-vercel-forwarded-for")?.split(",")[0]?.trim() : null;
  await rateLimit(`seo-bot-${scope}`, ip || "unknown", 100, 60);
}

export async function botBrowserKey() {
  return (await cookies()).get(botCookie)?.value;
}

export async function botQueue(key: unknown): Promise<Queue | null> {
  const digest = botDigest(key);
  if (!digest) return null;
  const { data, error } = await getSupabase().rpc("freelance_hq_seo_bot_queue", { p_digest: digest });
  if (error) throw new Error("Could not load the SEO bot queue.");
  return data as Queue | null;
}

export async function recordBotResult(key: unknown, jobId: string, result: BotResult) {
  const digest = botDigest(key);
  if (!digest) return "unauthorized";
  const { data, error } = await getSupabase().rpc("freelance_hq_seo_bot_record", {
    p_digest: digest, p_job: jobId, p_work_date: result.work_date, p_status: result.status, p_summary: result.summary, p_evidence: result.evidence_url || null,
  });
  if (error) throw new Error("Could not save the SEO task result.");
  return data as "unauthorized" | "not_found" | "stale_date" | "blocked" | "completed";
}
