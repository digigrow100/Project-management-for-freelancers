// Presentation grouping only: preserve the existing database IDs, owners and task links.
export const TECHNICAL_PAGE_KEYS = [
  "page_link", "image_optimization", "internal_linking", "pagespeed_90",
  "canonical_url", "google_indexing", "schema_markup", "mobile_friendly", "technical_check",
] as const;

const SITE_KEYS = new Set([
  "breadcrumb_schema", "broken_links_404", "canonical_redirects", "core_web_vitals",
  "global_schema", "google_search_console", "https_security", "robots_txt", "xml_sitemap",
  "tool_404_redirects", "tool_generated_url_control", "tool_internal_linking",
  "tool_js_indexability", "tool_mobile_ux", "tool_performance", "tool_schema", "tool_sitemap_architecture",
]);
const RECURRING_KEYS = new Set([
  "broken_link_scan", "indexing_review", "pagespeed_cwv_review", "schema_validation",
  "sitemap_robots_review", "technical_seo_audit", "tool_indexation_review", "tool_internal_links_review",
]);
export function isTechnicalWorkflow(item: { module: string; itemKey: string }) {
  return item.module === "full_website" ? SITE_KEYS.has(item.itemKey)
    : item.module === "recurring" && RECURRING_KEYS.has(item.itemKey);
}
