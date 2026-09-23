-- Incremental migration. Safe to run once in the SQL Editor.
--
-- Reporting module: one persisted record per client per month. Its content
-- (keyword movement, completed tasks, backlinks created) is computed at
-- generate-time from existing tables, not stored here — `summary` is the
-- one thing a human writes.

create table if not exists freelance_hq_seo_reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references freelance_hq_projects (id) on delete cascade,
  period text not null, -- 'YYYY-MM'
  summary text not null default '',
  generated_by uuid references freelance_hq_profiles (id) on delete set null,
  sent_to_client boolean not null default false,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (project_id, period)
);

create index if not exists freelance_hq_seo_reports_project_id_idx on freelance_hq_seo_reports (project_id, period desc);

alter table freelance_hq_seo_reports enable row level security;
