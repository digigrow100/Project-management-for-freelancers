-- Member focus dashboard state.
-- Keeps execution state separate from the task's normal todo/in_progress/done lifecycle.
create table if not exists public.freelance_hq_task_focus (
  task_id uuid primary key references public.freelance_hq_tasks(id) on delete cascade,
  user_id uuid not null references public.freelance_hq_profiles(id) on delete cascade,
  state text not null check (state in ('active', 'paused')),
  started_at timestamptz,
  paused_at timestamptz,
  resume_after_completions integer not null default 0 check (resume_after_completions >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists freelance_hq_task_focus_user_idx
  on public.freelance_hq_task_focus(user_id, state, updated_at desc);

alter table public.freelance_hq_task_focus enable row level security;
