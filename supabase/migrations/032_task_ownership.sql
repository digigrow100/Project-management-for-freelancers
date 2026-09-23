-- Incremental migration. Safe to run once in the SQL Editor.
--
-- Phase 1 of the task-management redesign: gives every task a single
-- accountable owner, plus two short context fields (why it matters, what
-- "done" looks like) so a task reads as self-explanatory without opening
-- notes. Purely additive — no existing column, table, or status changes.

alter table freelance_hq_tasks
  add column if not exists assigned_to uuid references freelance_hq_profiles (id) on delete set null,
  add column if not exists why text not null default '',
  add column if not exists expected_outcome text not null default '';

create index if not exists freelance_hq_tasks_assigned_to_idx on freelance_hq_tasks (assigned_to);
