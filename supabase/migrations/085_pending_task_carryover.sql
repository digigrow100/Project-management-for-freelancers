-- Pending/carryover state for paused member tasks.
alter table public.freelance_hq_task_focus
  add column if not exists available_on date,
  add column if not exists keep_pending boolean not null default false;

-- Existing paused tasks should not immediately bounce back into the same-day queue.
update public.freelance_hq_task_focus
set available_on = (paused_at at time zone 'Asia/Karachi')::date + 1
where state = 'paused'
  and available_on is null
  and keep_pending = false;
