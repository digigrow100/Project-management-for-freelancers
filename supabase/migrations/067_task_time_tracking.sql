-- Tracks focused work sessions per member/task/project.
-- One user can only have one open timer at a time.

create table if not exists public.freelance_hq_task_time_entries (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.freelance_hq_tasks(id) on delete cascade,
  project_id uuid not null references public.freelance_hq_projects(id) on delete cascade,
  user_id uuid not null references public.freelance_hq_profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  created_at timestamptz not null default now()
);

create index if not exists freelance_hq_task_time_entries_task_idx
  on public.freelance_hq_task_time_entries(task_id, started_at desc);

create index if not exists freelance_hq_task_time_entries_project_idx
  on public.freelance_hq_task_time_entries(project_id, started_at desc);

create index if not exists freelance_hq_task_time_entries_user_idx
  on public.freelance_hq_task_time_entries(user_id, started_at desc);

create unique index if not exists freelance_hq_task_time_entries_one_open_per_user_idx
  on public.freelance_hq_task_time_entries(user_id)
  where ended_at is null;

alter table public.freelance_hq_task_time_entries enable row level security;
