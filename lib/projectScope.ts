import "server-only";
import { getSupabase } from "./supabaseClient";

const parentTables = {
  keyword_pages: "freelance_hq_keyword_groups",
  web_app_subfeatures: "freelance_hq_web_app_features",
} as const;

type Resource = keyof typeof parentTables | "tasks" | "stages" | "project_attachments"
  | "backlink_categories" | "backlink_entries" | "keywords" | "keyword_groups"
  | "project_pages" | "technical_issues" | "content_items" | "seo_reports"
  | "outreach_prospects" | "competitor_backlinks" | "web_app_features";

const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

/** Bind every supplied resource to the already authorized project before using service-role access. */
export async function requireProjectResources(projectId: string, resource: Resource, ...ids: (string | null | undefined)[]) {
  const requested = [...new Set(ids.filter((id): id is string => id != null && id !== ""))];
  if (!requested.length) return;
  if (requested.some((id) => typeof id !== "string" || !UUID.test(id))) {
    throw new Error("Invalid project resource.");
  }

  const parent = resource === "keyword_pages" || resource === "web_app_subfeatures"
    ? parentTables[resource]
    : null;
  const table = getSupabase().from(`freelance_hq_${resource}`);
  for (let offset = 0; offset < requested.length; offset += 100) {
    const batch = requested.slice(offset, offset + 100);
    const query = parent
      ? table.select(`id,${parent}!inner(project_id)`).eq(`${parent}.project_id`, projectId)
      : table.select("id").eq("project_id", projectId);
    const { data, error } = await query.in("id", batch);
    if (error || data?.length !== batch.length) throw new Error("Project resource not found.");
  }
}
