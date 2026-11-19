-- Shared database: auth.users is Supabase-owned. Do not rewrite Auth users,
-- credentials, sessions, HQ profiles, customer records, or financial data.
-- These legacy public tables are not the Freelance HQ authorization source.
set lock_timeout = '5s';
set statement_timeout = '30s';

create schema if not exists freelance_hq_security;
revoke all on schema freelance_hq_security from public, anon, authenticated;
grant usage on schema freelance_hq_security to authenticated, service_role;

-- A narrow, current-user-only predicate avoids a recursive RLS self-query.
-- The private schema is not a Data API schema. No caller-supplied user ID.
create or replace function freelance_hq_security.legacy_user_is_admin()
returns boolean
language plpgsql stable security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or to_regclass('public.users') is null then
    return false;
  end if;
  return exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'ADMIN'
  );
end;
$function$;
alter function freelance_hq_security.legacy_user_is_admin() owner to postgres;
revoke all on function freelance_hq_security.legacy_user_is_admin() from public, anon, authenticated;
grant execute on function freelance_hq_security.legacy_user_is_admin() to authenticated, service_role;

-- RLS protects rows, not individual fields. Check sensitive fields before writes.
-- A definer trigger can read the canonical Auth email and BASIC plan without
-- exposing either table to the browser. The original request role stays in GUC
-- "role" even though this trigger executes as its owner.
create or replace function freelance_hq_security.guard_legacy_user_fields()
returns trigger
language plpgsql security definer
set search_path = ''
as $function$
declare
  basic_plan uuid;
  canonical_email text;
begin
  if current_setting('role', true) in ('anon', 'authenticated') then
    if tg_op = 'UPDATE' then
      if new.id is distinct from old.id or new.created_at is distinct from old.created_at then
        raise exception 'User identity fields are managed by the server.' using errcode = '42501';
      end if;
      if not freelance_hq_security.legacy_user_is_admin() and (
        new.role is distinct from old.role or new.plan_id is distinct from old.plan_id
        or new.email is distinct from old.email
      ) then
        raise exception 'User role, plan and login email are managed by the server.' using errcode = '42501';
      end if;
    elsif tg_op = 'INSERT' and not freelance_hq_security.legacy_user_is_admin() then
      select p.id into basic_plan from public.plans p where p.code = 'BASIC' limit 1;
      select u.email into canonical_email from auth.users u where u.id = auth.uid();
      if new.id is distinct from auth.uid() or new.role is distinct from 'USER'
        or (new.plan_id is not null and new.plan_id is distinct from basic_plan)
        or lower(new.email) is distinct from lower(canonical_email)
      then
        raise exception 'New user identity and access must match the server defaults.' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end;
$function$;
alter function freelance_hq_security.guard_legacy_user_fields() owner to postgres;
revoke all on function freelance_hq_security.guard_legacy_user_fields() from public, anon, authenticated;

do $migration$
begin
  -- The companion app's tables do not exist on every standalone HQ install.
  if to_regclass('public.users') is not null then
    alter table public.users enable row level security;
    drop policy if exists users_admin_all on public.users;
    drop policy if exists users_insert_own on public.users;
    drop policy if exists users_select_own on public.users;
    drop policy if exists users_update_own on public.users;

    create policy users_admin_all on public.users for all to authenticated
      using ((select freelance_hq_security.legacy_user_is_admin()))
      with check ((select freelance_hq_security.legacy_user_is_admin()));
    create policy users_insert_own on public.users for insert to authenticated
      with check ((select auth.uid()) = id);
    create policy users_select_own on public.users for select to authenticated
      using ((select auth.uid()) = id);
    create policy users_update_own on public.users for update to authenticated
      using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

    drop trigger if exists guard_legacy_user_fields on public.users;
    create trigger guard_legacy_user_fields before insert or update on public.users
      for each row execute function freelance_hq_security.guard_legacy_user_fields();
    revoke all privileges on public.users from public, anon;
    grant select, insert, update, delete on public.users to authenticated, service_role;
  end if;

  if to_regclass('public.usage_logs') is not null then
    -- Usage/quota counters must be written by trusted backend code. Never expose
    -- NULL-owner guest/IP records or let a browser reset authoritative counters.
    alter table public.usage_logs enable row level security;
    drop policy if exists usage_logs_insert_all on public.usage_logs;
    drop policy if exists usage_logs_select_own on public.usage_logs;
    drop policy if exists usage_logs_update_own on public.usage_logs;
    create policy usage_logs_select_own on public.usage_logs for select to authenticated
      using ((select auth.uid()) = user_id);
    revoke all privileges on public.usage_logs from public, anon, authenticated;
    grant select on public.usage_logs to authenticated;
    grant select, insert, update, delete on public.usage_logs to service_role;
  end if;
end;
$migration$;

reset lock_timeout;
reset statement_timeout;
