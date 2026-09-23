-- Incremental migration. Safe to run once in the SQL Editor.
--
-- Technical SEO module: a simple issue tracker. An issue optionally links
-- to the task doing the fix (freelance_hq_tasks.fix task), kept separate
-- from the task's own status so "this issue is fixed" and "this task is
-- done" can be tracked independently if the fix spans multiple tasks.

create type freelance_hq_technical_status as enum ('open', 'in_progress', 'fixed');

create table if not exists freelance_hq_technical_issues (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references freelance_hq_projects (id) on delete cascade,
  title text not null,
  description text not null default '',
  url_affected text not null default '',
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  assigned_to uuid references freelance_hq_profiles (id) on delete set null,
  status freelance_hq_technical_status not null default 'open',
  fix_task_id uuid references freelance_hq_tasks (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists freelance_hq_technical_issues_project_id_idx on freelance_hq_technical_issues (project_id);

alter table freelance_hq_technical_issues enable row level security;
