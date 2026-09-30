-- Retire any still-open legacy generic fallback audits so the new workflow queue can start immediately.
with legacy as (
  select id
  from public.freelance_hq_tasks
  where is_fallback = true
    and status <> 'done'
    and coalesce(fallback_template_key, '') not like 'workflow:%'
)
update public.freelance_hq_task_time_entries e
set ended_at = now(),
    duration_seconds = greatest(0, floor(extract(epoch from (now() - e.started_at)))::int)
where e.ended_at is null
  and e.task_id in (select id from legacy);

delete from public.freelance_hq_task_focus
where task_id in (
  select id from public.freelance_hq_tasks
  where is_fallback = true
    and status <> 'done'
    and coalesce(fallback_template_key, '') not like 'workflow:%'
);

update public.freelance_hq_tasks
set status = 'done',
    completed_at = now(),
    scheduled_for = null,
    updated_at = now()
where is_fallback = true
  and status <> 'done'
  and coalesce(fallback_template_key, '') not like 'workflow:%';
