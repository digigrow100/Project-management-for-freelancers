import { redirect } from "next/navigation";
import { botBrowserKey, botQueue } from "@/lib/seoBots/server";
import { saveBotResult, signOutBot } from "@/lib/seoBots/botActions";
import { categories } from "@/lib/seoBots/core";

export const dynamic = "force-dynamic";

export default async function SeoBotDailyWork({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const key = await botBrowserKey();
  if (!key) redirect("/seo-bots/login");
  const queue = await botQueue(key);
  if (!queue) redirect("/seo-bots/login?error=invalid");
  const { error, saved } = await searchParams;
  return <main className="mx-auto max-w-3xl space-y-5 px-5 py-8">
    <header className="flex items-start justify-between gap-4">
      <div><p className="text-sm text-accent-400">{queue.bot}</p><h1 className="text-3xl font-semibold">Today’s SEO tasks</h1><p className="mt-1 text-sm text-neutral-400">{queue.date} · Pakistan time · {queue.tasks.filter(task => task.status === "completed").length}/{queue.tasks.length} complete</p></div>
      <form action={signOutBot}><button className="rounded-md border border-base-600 px-3 py-2 text-sm">Sign out</button></form>
    </header>
    {error && <p role="alert" className="text-amber-300">{error === "invalid" ? "Enter a result summary and a valid evidence URL if provided." : error === "stale" ? "The work day changed. Review the current task before submitting again." : error === "missing" ? "This task is no longer available." : "Could not save the result. Try again."}</p>}
    {saved && <p role="status" className="text-accent-400">{saved === "completed" ? "Task marked complete." : "Blocker saved."}</p>}
    {!queue.tasks.length && <p className="rounded-xl border border-base-700 p-5 text-neutral-400">No tasks assigned for today.</p>}
    {queue.tasks.map(task => <article key={task.id} className="space-y-3 rounded-xl border border-base-700 bg-base-850 p-5">
      <p className="text-xs text-neutral-400">{categories[task.category]} · {task.priority} priority · {task.status === "todo" ? "To do" : task.status}{task.work_date < queue.date && task.status !== "completed" ? " · Overdue" : ""}</p>
      <h2 className="text-xl font-semibold">{task.title}</h2>
      <a href={task.target_url} target="_blank" rel="noreferrer" className="block break-all text-sm text-accent-400 underline">{task.target_url}</a>
      <p className="whitespace-pre-wrap text-sm text-neutral-300">{task.instructions}</p>
      {task.summary && <p className="whitespace-pre-wrap rounded-md bg-base-900 p-3 text-sm">{task.summary}</p>}
      {task.evidence_url && <a href={task.evidence_url} target="_blank" rel="noreferrer" className="text-sm text-accent-400 underline">View evidence</a>}
      {task.status !== "completed" && <form action={saveBotResult} className="space-y-3 border-t border-base-700 pt-3">
        <input type="hidden" name="job" value={task.id} />
        <input type="hidden" name="work_date" value={task.work_date} />
        <label className="block text-sm">Result or blocker<textarea name="summary" required maxLength={4000} rows={3} className="mt-1 block w-full rounded-md border border-base-600 bg-base-950 p-2" /></label>
        <label className="block text-sm">Evidence URL (optional)<input name="evidence_url" type="url" maxLength={2048} className="mt-1 block w-full rounded-md border border-base-600 bg-base-950 p-2" /></label>
        <div className="flex flex-wrap gap-2">
          <button name="status" value="completed" className="rounded-md bg-accent-500 px-3 py-2 text-sm font-semibold text-base-950">Mark complete</button>
          {task.status !== "blocked" && <button name="status" value="blocked" className="rounded-md border border-base-600 px-3 py-2 text-sm">Report blocker</button>}
        </div>
      </form>}
    </article>)}
  </main>;
}
