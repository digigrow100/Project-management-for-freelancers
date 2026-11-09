"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { assignBotJob, issueBotKey } from "@/lib/seoBots/adminActions";
import { categories, taskTemplates } from "@/lib/seoBots/core";

const input = "mt-1 block w-full rounded-md border border-base-600 bg-base-950 p-2 text-sm";
const button = "rounded-md border border-base-600 px-3 py-2 text-sm font-semibold disabled:opacity-50";

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return <button className={button} disabled={pending}>{pending ? "Saving…" : children}</button>;
}

export function SeoBotKeyForm({ id }: { id?: string }) {
  const [state, action] = useFormState(issueBotKey, {});
  return <form action={action} className="space-y-2">
    {id ? <input type="hidden" name="id" value={id} /> :
      <label className="block text-sm">Bot name<input name="name" className={input} required maxLength={80} /></label>}
    <Submit>{id ? "Rotate access key" : "Create bot account"}</Submit>
    {state.error && <p role="alert" className="text-sm text-amber-300">{state.error}</p>}
    {state.key && <div role="status" className="rounded-md border border-accent-700 p-3 text-sm">
      <p>Copy this access key to the bot’s private configuration. It is shown once.</p>
      <code className="mt-2 block select-all break-all">{state.key}</code>
    </div>}
  </form>;
}

export function SeoBotJobForm({ bots, projects, today }: {
  bots: { id: string; name: string }[]; projects: { id: string; name: string }[]; today: string;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<keyof typeof categories>("on_page");
  const [instructions, setInstructions] = useState("");
  if (!bots.length) return <p className="text-sm text-neutral-400">Create or enable a bot before assigning a task.</p>;
  return <form action={assignBotJob} className="space-y-3">
    <label className="block text-sm">Start from a template
      <select className={input} defaultValue="" onChange={event => {
        const template = taskTemplates.find(item => item.name === event.target.value);
        if (template) { setTitle(template.name); setCategory(template.category); setInstructions(template.instructions); }
      }}>
        <option value="">Custom task</option>
        {taskTemplates.map(template => <option key={template.name}>{template.name}</option>)}
      </select>
    </label>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">Bot<select name="bot_id" required className={input}>{bots.map(bot => <option key={bot.id} value={bot.id}>{bot.name}</option>)}</select></label>
      <label className="text-sm">SEO project (optional)<select name="project_id" className={input}><option value="">No project link</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
      <label className="text-sm">Task title<input name="title" value={title} onChange={event => setTitle(event.target.value)} required maxLength={160} className={input} /></label>
      <label className="text-sm">SEO category<select name="category" value={category} onChange={event => setCategory(event.target.value as keyof typeof categories)} className={input}>{Object.entries(categories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label className="text-sm">Website or page URL<input name="target_url" type="url" required maxLength={2048} className={input} /></label>
      <label className="text-sm">First work date<input name="starts_on" type="date" required defaultValue={today} className={input} /></label>
      <label className="text-sm">Repeat<select name="cadence" className={input}><option value="once">Once</option><option value="daily">Daily</option></select></label>
      <label className="text-sm">Priority<select name="priority" className={input}><option value="normal">Normal</option><option value="high">High</option><option value="low">Low</option></select></label>
    </div>
    <label className="block text-sm">Instructions<textarea name="instructions" value={instructions} onChange={event => setInstructions(event.target.value)} required maxLength={4000} rows={4} className={input} /></label>
    <Submit>Assign SEO task</Submit>
  </form>;
}
