import { z } from "zod";

export const categories = {
  on_page: "On-page SEO",
  technical: "Technical SEO",
  local_seo: "Local SEO",
  content: "Content SEO",
  reporting: "Reporting",
} as const;

export const taskTemplates = [
  { name: "Title and meta description", category: "on_page", instructions: "Compare the live title and meta description with the page intent. Record the current text, proposed text, and desktop/mobile preview width. Report whether the change was applied or needs approval." },
  { name: "Indexability and canonical", category: "technical", instructions: "Check HTTP status, robots directives, canonical URL and sitemap membership. Record evidence and any fix or blocker." },
  { name: "Local page and contact details", category: "local_seo", instructions: "Check the service area, business contact details and relevant internal links. Record mismatches and any fix or blocker." },
  { name: "Content and internal links", category: "content", instructions: "Check headings, search intent and internal links. List the pages or sections changed and how you verified them." },
  { name: "SEO results report", category: "reporting", instructions: "Record the date range, source, key changes and any items needing admin review. Include an evidence link when available." },
] as const;

export function workDate() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts();
  const byType = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

const webUrl = z.string().trim().max(2048).refine(value => {
  try {
    const url = new URL(value);
    return /^https?:\/\//i.test(value) && ["https:", "http:"].includes(url.protocol) && !url.username && !url.password
      && !Array.from(url.searchParams.keys()).some(key => /^(?:access_token|refresh_token|api[-_]?key|token|password|secret)$/i.test(key));
  } catch { return false; }
}, "Enter an HTTP or HTTPS URL without credentials.");

export const jobInput = z.object({
  bot_id: z.uuid(),
  project_id: z.union([z.literal(""), z.uuid()]),
  title: z.string().trim().min(1).max(160),
  category: z.enum(["on_page", "technical", "local_seo", "content", "reporting"]),
  target_url: webUrl,
  instructions: z.string().trim().min(1).max(4000),
  priority: z.enum(["high", "normal", "low"]),
  cadence: z.enum(["once", "daily"]),
  starts_on: z.iso.date(),
});

export const resultInput = z.object({
  work_date: z.iso.date(),
  status: z.enum(["completed", "blocked"]),
  summary: z.string().trim().min(1).max(4000),
  evidence_url: z.union([webUrl, z.literal(""), z.null()]).optional(),
}).strict();

export type BotResult = z.infer<typeof resultInput>;
export type Queue = { bot: string; date: string; tasks: {
  id: string; title: string; category: keyof typeof categories; target_url: string; instructions: string;
  priority: string; cadence: string; work_date: string; status: "todo" | "blocked" | "completed";
  summary: string | null; evidence_url: string | null;
}[] };
