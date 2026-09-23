-- Incremental migration. Safe to run once in the SQL Editor.
--
-- Phase 5. Storage-only report preferences per SEO project (daily/weekly/
-- monthly auto-report toggles). No scheduling, email, or AI automation
-- reads this yet — that's Phase 6. Kept as its own table since this is
-- genuinely new state, not derivable from any existing row.

create table if not exists freelance_hq_report_preferences (
  project_id uuid primary key references freelance_hq_projects (id) on delete cascade,
  daily_enabled boolean not null default false,
  weekly_enabled boolean not null default false,
  monthly_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table freelance_hq_report_preferences enable row level security;
