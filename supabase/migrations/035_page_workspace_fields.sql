-- Incremental migration. Safe to run once in the SQL Editor.
--
-- Elevates freelance_hq_keyword_pages from a bare {name, url} label a
-- keyword can attach to, into a real on-page SEO workspace: meta/H1 fields,
-- per-area status tracking, and a per-page checklist (same ChecklistItem[]
-- jsonb shape already used on tasks). The existing Group -> Page hierarchy
-- and keyword links are untouched.

create type freelance_hq_page_type as enum ('service', 'location', 'blog', 'landing', 'other');
create type freelance_hq_onpage_status as enum ('not_started', 'in_progress', 'done');

alter table freelance_hq_keyword_pages
  add column if not exists page_type freelance_hq_page_type not null default 'other',
  add column if not exists meta_title text not null default '',
  add column if not exists meta_description text not null default '',
  add column if not exists h1 text not null default '',
  add column if not exists content_status freelance_hq_onpage_status not null default 'not_started',
  add column if not exists internal_linking_status freelance_hq_onpage_status not null default 'not_started',
  add column if not exists image_seo_status freelance_hq_onpage_status not null default 'not_started',
  add column if not exists schema_status freelance_hq_onpage_status not null default 'not_started',
  add column if not exists checklist jsonb not null default '[]'::jsonb;
