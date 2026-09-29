create unique index if not exists freelance_hq_tasks_one_open_fallback_per_member_idx
on public.freelance_hq_tasks(assigned_to)
where is_fallback = true and status <> 'done' and assigned_to is not null;
