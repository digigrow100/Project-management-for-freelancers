-- Hosting security state is private; only the server service role can use these RPCs.
create table public.freelance_hq_hosting_rate_limits (
 bucket_key text primary key check (bucket_key ~ '^[a-f0-9]{64}$'),
 attempts integer not null check (attempts > 0),
 expires_at timestamptz not null
);
alter table public.freelance_hq_hosting_rate_limits enable row level security;
revoke all on public.freelance_hq_hosting_rate_limits from public, anon, authenticated;
grant all on public.freelance_hq_hosting_rate_limits to service_role;
create index freelance_hq_hosting_rate_limits_expiry on public.freelance_hq_hosting_rate_limits(expires_at);
create function public.freelance_hq_hosting_rate_limit(p_key text,p_limit integer,p_seconds integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare n integer;
begin
 if p_limit not between 1 and 1000 or p_seconds not between 1 and 86400 or p_key !~ '^[a-f0-9]{64}$' then
  raise exception 'Invalid rate limit parameters';
 end if;
 -- Opportunistic bounded cleanup avoids unlimited growth without an extra cron.
 delete from public.freelance_hq_hosting_rate_limits where bucket_key in
 (select bucket_key from public.freelance_hq_hosting_rate_limits where expires_at < now() limit 500);
 insert into public.freelance_hq_hosting_rate_limits as r(bucket_key,attempts,expires_at)
 values(p_key,1,now()+make_interval(secs=>p_seconds))
 on conflict(bucket_key) do update set
 attempts=case when r.expires_at <= now() then 1 else least(r.attempts+1,p_limit+1) end,
 expires_at=case when r.expires_at <= now() then now()+make_interval(secs=>p_seconds) else r.expires_at end
 returning attempts into n;
 return n<=p_limit;
end $$;
revoke all on function public.freelance_hq_hosting_rate_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.freelance_hq_hosting_rate_limit(text,integer,integer) to service_role;
create function public.freelance_hq_hosting_session_active(p_user uuid,p_session uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
 select exists(select 1 from auth.sessions s where s.id=p_session and s.user_id=p_user
 and (s.not_after is null or s.not_after>now()) and s.created_at>now()-interval '24 hours');
$$;
-- service_role does not need direct SELECT on auth.sessions; keep this narrowly scoped
-- SECURITY DEFINER boolean lookup, inaccessible to both browser roles.
alter function public.freelance_hq_hosting_session_active(uuid,uuid) security definer;
revoke all on function public.freelance_hq_hosting_session_active(uuid,uuid) from public,anon,authenticated;
grant execute on function public.freelance_hq_hosting_session_active(uuid,uuid) to service_role;
-- Trigger functions do not require RPC execute permission to run as triggers.
revoke execute on function public.handle_new_user() from public,anon,authenticated;
revoke execute on function public.seed_freelance_hq_seo_project_defaults() from public,anon,authenticated;
revoke execute on function public.seed_freelance_hq_seo_system_workflow_defaults() from public,anon,authenticated;
