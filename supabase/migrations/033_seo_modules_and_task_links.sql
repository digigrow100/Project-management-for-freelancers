-- Incremental migration. Safe to run once in the SQL Editor.
--
-- Phase 2 of the SEO workflow redesign. Replaces freeform per-project SEO
-- stages with a fixed module taxonomy (Keywords is handled separately, not
-- a task bucket), and lets a task optionally link to the keyword/page it
-- serves. Purely additive — `stage_id` stays on the table, untouched, and
-- keeps working exactly as before for non-SEO project types.

create type freelance_hq_seo_module as enum
  ('on_page', 'technical', 'off_page', 'content', 'reporting');

alter table freelance_hq_tasks
  add column if not exists seo_module freelance_hq_seo_module,
  add column if not exists keyword_id uuid references freelance_hq_keywords (id) on delete set null,
  add column if not exists page_id uuid references freelance_hq_keyword_pages (id) on delete set null;

create index if not exists freelance_hq_tasks_seo_module_idx on freelance_hq_tasks (project_id, seo_module);
create index if not exists freelance_hq_tasks_keyword_id_idx on freelance_hq_tasks (keyword_id);
create index if not exists freelance_hq_tasks_page_id_idx on freelance_hq_tasks (page_id);
