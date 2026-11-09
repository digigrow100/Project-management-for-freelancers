"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getSupabase } from "@/lib/supabaseClient";
import { botDigest, newBotKey } from "./server";
import { jobInput } from "./core";

export type KeyState = { key?: string; error?: string };

export async function issueBotKey(_previous: KeyState, form: FormData): Promise<KeyState> {
  await requireAdmin();
  const id = String(form.get("id") ?? "");
  const name = z.string().trim().min(1).max(80).safeParse(form.get("name"));
  if (id ? !z.uuid().safeParse(id).success : !name.success) return { error: "Enter a valid bot name or select a bot." };
  const key = newBotKey();
  const credential_digest = botDigest(key);
  const bots = getSupabase().from("freelance_hq_seo_bots");
  const { data, error } = id
    ? await bots.update({ credential_digest }).eq("id", id).select("id").maybeSingle()
    : await bots.insert({ name: name.data, credential_digest }).select("id").single();
  if (error || !data) return { error: "Could not issue the key. Check for a duplicate bot name." };
  revalidatePath("/team");
  return { key };
}

export async function toggleBot(form: FormData) {
  await requireAdmin();
  const id = z.uuid().parse(form.get("id"));
  const enabled = z.enum(["true", "false"]).parse(form.get("enabled")) === "true";
  const { error } = await getSupabase().from("freelance_hq_seo_bots").update({ enabled }).eq("id", id);
  if (error) redirect("/team?error=bot");
  revalidatePath("/team");
}

export async function assignBotJob(form: FormData) {
  await requireAdmin();
  const fields = Object.fromEntries(Object.keys(jobInput.shape).map(name => [name, form.get(name)]));
  const input = jobInput.safeParse(fields);
  if (!input.success) redirect("/team?error=invalid");
  const db = getSupabase();
  const { data: bot, error: botError } = await db.from("freelance_hq_seo_bots").select("id")
    .eq("id", input.data.bot_id).eq("enabled", true).maybeSingle();
  if (botError || !bot) redirect("/team?error=bot");
  if (input.data.project_id) {
    const { data, error } = await db.from("freelance_hq_projects").select("id").eq("id", input.data.project_id)
      .eq("type", "seo").eq("archived", false).maybeSingle();
    if (error || !data) redirect("/team?error=project");
  }
  const { error } = await db.from("freelance_hq_seo_bot_jobs")
    .insert({ ...input.data, project_id: input.data.project_id || null });
  if (error) redirect("/team?error=job");
  revalidatePath("/team");
  redirect("/team?assigned=1");
}

export async function archiveBotJob(form: FormData) {
  await requireAdmin();
  const id = z.uuid().parse(form.get("id"));
  const { error } = await getSupabase().from("freelance_hq_seo_bot_jobs").update({ active: false }).eq("id", id);
  if (error) redirect("/team?error=job");
  revalidatePath("/team");
}
