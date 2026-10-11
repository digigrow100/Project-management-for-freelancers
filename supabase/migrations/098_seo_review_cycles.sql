create table public.freelance_hq_seo_review_cycles (
  project_id uuid not null references public.freelance_hq_projects(id) on delete cascade,
  kind text not null check(kind in ('gsc','gbp')),
  cycle integer not null default 1,
  revision integer not null default 0,
  data jsonb not null default '{"checks":{},"rows":{},"notes":{}}',
  updated_by uuid references public.freelance_hq_profiles(id),
  updated_at timestamptz not null default now(),
  primary key(project_id,kind)
);
create table public.freelance_hq_seo_review_history (
  project_id uuid not null references public.freelance_hq_projects(id) on delete cascade,
  kind text not null,
  cycle integer not null,
  data jsonb not null,
  completed_by uuid references public.freelance_hq_profiles(id),
  completed_at timestamptz not null default now(),
  primary key(project_id,kind,cycle)
);
alter table public.freelance_hq_seo_review_cycles enable row level security;
alter table public.freelance_hq_seo_review_history enable row level security;
-- Server action checks project access; serialize writes and reject stale edits.
create function public.freelance_hq_save_seo_review(p_project uuid,p_kind text,p_revision integer,p_data jsonb,p_actor uuid,p_complete boolean)
returns void language plpgsql security invoker set search_path=public as $$
declare current_row public.freelance_hq_seo_review_cycles;
begin
  insert into public.freelance_hq_seo_review_cycles(project_id,kind) values(p_project,p_kind) on conflict do nothing;
  select * into current_row from public.freelance_hq_seo_review_cycles where project_id=p_project and kind=p_kind for update;
  if current_row.revision <> p_revision then raise exception 'This review changed. Reload before saving.'; end if;
  if p_complete then
    insert into public.freelance_hq_seo_review_history(project_id,kind,cycle,data,completed_by)
    values(p_project,p_kind,current_row.cycle,p_data,p_actor);
  end if;
  update public.freelance_hq_seo_review_cycles set
    data=case when p_complete then jsonb_set(p_data,'{checks}','{}') else p_data end,
    cycle=cycle+case when p_complete then 1 else 0 end,
    revision=revision+1,updated_by=p_actor,updated_at=now()
  where project_id=p_project and kind=p_kind;
end $$;
revoke all on function public.freelance_hq_save_seo_review(uuid,text,integer,jsonb,uuid,boolean) from public,anon,authenticated;
grant execute on function public.freelance_hq_save_seo_review(uuid,text,integer,jsonb,uuid,boolean) to service_role;
