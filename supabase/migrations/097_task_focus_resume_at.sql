-- Apply before releasing the matching app changes. Preserve all existing focus history.
alter table public.freelance_hq_task_focus add column if not exists resume_at timestamptz;
