import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getSupabase } from "@/lib/supabaseClient";
import { archiveBotJob, toggleBot } from "@/lib/seoBots/adminActions";
import { workDate } from "@/lib/seoBots/core";
import { SeoBotJobForm, SeoBotKeyForm } from "@/components/SeoBotAdminForms";

export const dynamic = "force-dynamic";
const panel = "space-y-4 rounded-xl border border-base-700 bg-base-850 p-5";
const button = "rounded-md border border-base-600 px-3 py-2 text-sm";

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ error?: string; assigned?: string }> }) {
  await requireAdmin();
  const { error, assigned } = await searchParams;
  const db = getSupabase();
  const [bots, jobs, reports, projects] = await Promise.all([
    db.from("freelance_hq_seo_bots").select("id,name,enabled").order("name"),
    db.from("freelance_hq_seo_bot_jobs").select("id,bot_id,title,cadence,starts_on").eq("active", true).order("created_at", { ascending: false }).limit(100),
    db.from("freelance_hq_seo_bot_results").select("job_id,work_date,status,summary,evidence_url,freelance_hq_seo_bot_jobs(title,bot_id)").order("recorded_at", { ascending: false }).limit(60),
    db.from("freelance_hq_projects").select("id,name").eq("type", "seo").eq("archived", false).order("name"),
  ]);
  if (bots.error || jobs.error || reports.error || projects.error) {
    return <p role="alert" className="text-amber-300">The SEO bot workspace is unavailable. Try again shortly.</p>;
  }
  const nameByBot = new Map(bots.data.map(bot => [bot.id, bot.name]));
  return <div className="space-y-6">
    <header><h1 className="text-2xl font-semibold text-neutral-100">SEO Bots</h1><p className="mt-1 text-sm text-neutral-400">Manage bot accounts, assign daily SEO work, and review results.</p>
      <Link href="/seo-bots/login" className="mt-2 inline-block text-sm text-accent-400 underline">Open bot sign-in</Link>
    </header>
    {error && <p role="alert" className="text-amber-300">{error === "invalid" ? "Check the task fields, date and URL." : "The change could not be saved. Check that the selected bot and project are active."}</p>}
    {assigned && <p role="status" className="text-accent-400">SEO task assigned.</p>}
    <section className={panel}><h2 className="font-semibold">Bot accounts</h2><SeoBotKeyForm />
      <ul className="space-y-3">{bots.data.map(bot => <li key={bot.id} className="space-y-2 border-t border-base-700 pt-3">
        <p className="text-sm"><strong>{bot.name}</strong> · {bot.enabled ? "Enabled" : "Disabled"}</p>
        <div className="flex flex-wrap items-start gap-2">
          <SeoBotKeyForm id={bot.id} />
          <form action={toggleBot}><input type="hidden" name="id" value={bot.id} /><input type="hidden" name="enabled" value={String(!bot.enabled)} /><button className={button}>{bot.enabled ? "Disable bot" : "Enable bot"}</button></form>
        </div>
      </li>)}</ul>
    </section>
    <section className={panel}><h2 className="font-semibold">Assign SEO work</h2><SeoBotJobForm bots={bots.data.filter(bot => bot.enabled)} projects={projects.data} today={workDate()} /></section>
    <section className={panel}><h2 className="font-semibold">Active assignments</h2>
      {!jobs.data.length && <p className="text-sm text-neutral-400">No active assignments.</p>}
      <ul className="space-y-3">{jobs.data.map(job => <li key={job.id} className="flex items-start justify-between gap-3 border-t border-base-700 pt-3">
        <div><p className="text-sm font-semibold">{job.title}</p><p className="text-xs text-neutral-400">{nameByBot.get(job.bot_id)} · {job.cadence} · {job.starts_on}</p></div>
        <form action={archiveBotJob}><input type="hidden" name="id" value={job.id} /><button className={button}>Archive</button></form>
      </li>)}</ul>
    </section>
    <section className={panel}><h2 className="font-semibold">Recent results</h2>
      {!reports.data.length && <p className="text-sm text-neutral-400">No results yet.</p>}
      <ul className="space-y-3">{reports.data.map(report => {
        const job = report.freelance_hq_seo_bot_jobs as unknown as { title: string; bot_id: string } | null;
        return <li key={`${report.job_id}-${report.work_date}`} className="border-t border-base-700 pt-3 text-sm">
          <p className="font-semibold">{job?.title ?? "SEO task"} · {report.status}</p>
          <p className="text-xs text-neutral-400">{report.work_date} · {job ? nameByBot.get(job.bot_id) : ""}</p>
          <p className="mt-1 whitespace-pre-wrap break-words">{report.summary}</p>
          {report.evidence_url && <a href={report.evidence_url} target="_blank" rel="noreferrer" className="text-accent-400 underline">View evidence</a>}
        </li>;
      })}</ul>
    </section>
  </div>;
}
