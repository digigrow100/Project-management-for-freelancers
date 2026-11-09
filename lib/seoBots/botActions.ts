"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { resultInput } from "./core";
import { botBrowserKey, botCookie, botCookieOptions, botDigest, botQueue, botRequestLimit, recordBotResult } from "./server";

export async function signInBot(form: FormData) {
  const key = String(form.get("key") ?? "").trim();
  let valid = false;
  if (botDigest(key)) {
    try {
      await botRequestLimit("login");
      valid = !!await botQueue(key);
    } catch {
      redirect("/seo-bots/login?error=unavailable");
    }
  }
  if (!valid) redirect("/seo-bots/login?error=invalid");
  (await cookies()).set(botCookie, key, botCookieOptions);
  redirect("/seo-bots");
}

export async function signOutBot() {
  (await cookies()).set(botCookie, "", { ...botCookieOptions, maxAge: 0 });
  redirect("/seo-bots/login");
}

export async function saveBotResult(form: FormData) {
  const job = z.uuid().safeParse(form.get("job"));
  const result = resultInput.safeParse({
    work_date: form.get("work_date"), status: form.get("status"), summary: form.get("summary"), evidence_url: form.get("evidence_url"),
  });
  if (!job.success || !result.success) redirect("/seo-bots?error=invalid");
  let state;
  try {
    await botRequestLimit("result");
    state = await recordBotResult(await botBrowserKey(), job.data, result.data);
  } catch {
    redirect("/seo-bots?error=unavailable");
  }
  if (state === "unauthorized") redirect("/seo-bots/login?error=invalid");
  if (state === "stale_date") redirect("/seo-bots?error=stale");
  if (state === "not_found") redirect("/seo-bots?error=missing");
  revalidatePath("/seo-bots");
  redirect(`/seo-bots?saved=${state}`);
}
