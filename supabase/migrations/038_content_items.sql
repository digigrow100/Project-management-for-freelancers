-- Incremental migration. Safe to run once in the SQL Editor.
--
-- Content module: Idea -> Brief -> Writing -> Review -> Published. A
-- content item optionally targets a keyword. Also adds
-- freelance_hq_tasks.content_item_id here (rather than in 033) since it
-- depends on this table existing.

create type freelance_hq_content_status as enum ('idea', 'brief', 'writing', 'review', 'published');

create table if not exists freelance_hq_content_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references freelance_hq_projects (id) on delete cascade,
  topic text not null,
  target_keyword_id uuid references freelance_hq_keywords (id) on delete set null,
  assigned_to uuid references freelance_hq_profiles (id) on delete set null,
  status freelance_hq_content_status not null default 'idea',
  url text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists freelance_hq_content_items_project_id_idx on freelance_hq_content_items (project_id);

alter table freelance_hq_content_items enable row level security;

alter table freelance_hq_tasks
  add column if not exists content_item_id uuid references freelance_hq_content_items (id) on delete set null;

create index if not exists freelance_hq_tasks_content_item_id_idx on freelance_hq_tasks (content_item_id);
