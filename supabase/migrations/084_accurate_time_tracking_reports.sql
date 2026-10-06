-- Add explicit stop reasons to focused work sessions.
-- This makes daily/weekly/monthly reports auditable and prevents silent timer closures.

alter table public.freelance_hq_task_time_entries
  add column if not exists stop_reason text,
  add column if not exists stop_detail text;

alter table public.freelance_hq_task_time_entries
  drop constraint if exists freelance_hq_task_time_entries_stop_reason_check;

alter table public.freelance_hq_task_time_entries
  add constraint freelance_hq_task_time_entries_stop_reason_check
  check (
    stop_reason is null or stop_reason in (
      'paused',
      'skipped',
      'completed',
      'task_switched',
      'admin_action',
      'admin_completed',
      'auto_reconciled'
    )
  );
