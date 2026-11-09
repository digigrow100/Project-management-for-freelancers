create table public.freelance_hq_seo_bots (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(name) between 1 and 80),
  credential_digest text not null unique check (credential_digest ~ '^[a-f0-9]{64}$'),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.freelance_hq_seo_bot_jobs (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null references public.freelance_hq_seo_bots(id) on delete restrict,
  project_id uuid references public.freelance_hq_projects(id) on delete set null,
  title text not null check (length(title) between 1 and 160),
  category text not null check (category in ('on_page','technical','local_seo','content','reporting')),
  target_url text not null check (length(target_url) <= 2048 and target_url ~* '^https?://'),
  instructions text not null check (length(instructions) between 1 and 4000),
  priority text not null check (priority in ('high','normal','low')),
  cadence text not null check (cadence in ('once','daily')),
  starts_on date not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index freelance_hq_seo_bot_jobs_lookup on public.freelance_hq_seo_bot_jobs(bot_id, starts_on) where active;

create table public.freelance_hq_seo_bot_results (
  job_id uuid not null references public.freelance_hq_seo_bot_jobs(id) on delete restrict,
  work_date date not null,
  status text not null check (status in ('completed','blocked')),
  summary text not null check (length(summary) between 1 and 4000),
  evidence_url text check (length(evidence_url) <= 2048 and evidence_url ~* '^https?://'),
  recorded_at timestamptz not null default now(),
  primary key (job_id, work_date)
);

alter table public.freelance_hq_seo_bots enable row level security;
alter table public.freelance_hq_seo_bot_jobs enable row level security;
alter table public.freelance_hq_seo_bot_results enable row level security;
revoke all on public.freelance_hq_seo_bots, public.freelance_hq_seo_bot_jobs, public.freelance_hq_seo_bot_results from public, anon, authenticated;
grant select, insert, update on public.freelance_hq_seo_bots, public.freelance_hq_seo_bot_jobs, public.freelance_hq_seo_bot_results to service_role;

create function public.freelance_hq_seo_bot_queue(p_digest text)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('bot', bot.name, 'date', clock.today, 'tasks', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', job.id, 'title', job.title, 'category', job.category, 'target_url', job.target_url,
      'instructions', job.instructions, 'priority', job.priority, 'cadence', job.cadence,
      'work_date', coalesce(result.work_date, case when job.cadence = 'once' then job.starts_on else clock.today end),
      'status', coalesce(result.status, 'todo'), 'summary', result.summary, 'evidence_url', result.evidence_url
    ) order by case job.priority when 'high' then 0 when 'normal' then 1 else 2 end, job.starts_on, job.id)
    from public.freelance_hq_seo_bot_jobs job
    left join public.freelance_hq_seo_bot_results result on result.job_id = job.id
      and result.work_date = case when job.cadence = 'once' then job.starts_on else clock.today end
    where job.bot_id = bot.id and job.active and job.starts_on <= clock.today
      and (job.cadence = 'daily' or result.status is distinct from 'completed'
           or (result.recorded_at at time zone 'Asia/Karachi')::date = clock.today)
  ), '[]'::jsonb))
  from public.freelance_hq_seo_bots bot
  cross join (select (now() at time zone 'Asia/Karachi')::date as today) clock
  where bot.credential_digest = p_digest and bot.enabled;
$$;

create function public.freelance_hq_seo_bot_record(p_digest text, p_job uuid, p_work_date date, p_status text, p_summary text, p_evidence text)
returns text language plpgsql set search_path = '' as $$
declare
  actor uuid;
  task_date date;
  today date := (now() at time zone 'Asia/Karachi')::date;
  final_status text;
begin
  select id into actor from public.freelance_hq_seo_bots
    where credential_digest = p_digest and enabled for share;
  if not found then return 'unauthorized'; end if;

  select case when cadence = 'once' then starts_on else today end into task_date
    from public.freelance_hq_seo_bot_jobs where id = p_job and bot_id = actor and active and starts_on <= today for share;
  if not found then return 'not_found'; end if;
  if task_date is distinct from p_work_date then return 'stale_date'; end if;

  insert into public.freelance_hq_seo_bot_results as r (job_id, work_date, status, summary, evidence_url)
  values (p_job, task_date, p_status, p_summary, p_evidence)
  on conflict (job_id, work_date) do update
    set status = excluded.status, summary = excluded.summary, evidence_url = excluded.evidence_url, recorded_at = now()
    where r.status = 'blocked' and excluded.status = 'completed';

  select status into final_status from public.freelance_hq_seo_bot_results where job_id = p_job and work_date = task_date;
  return final_status;
end;
$$;

revoke all on function public.freelance_hq_seo_bot_queue(text), public.freelance_hq_seo_bot_record(text,uuid,date,text,text,text) from public, anon, authenticated;
grant execute on function public.freelance_hq_seo_bot_queue(text), public.freelance_hq_seo_bot_record(text,uuid,date,text,text,text) to service_role;
