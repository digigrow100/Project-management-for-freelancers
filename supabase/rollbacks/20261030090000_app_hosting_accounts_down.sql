-- ROLLBACK for 20261030090000_app_hosting_accounts.sql. NOT in supabase/migrations: it is never applied automatically.
-- Run it only after the portal code that reads the account tables is no longer deployed (unset HOSTING_APP_ACCOUNTS_ENABLED / promote the previous Vercel deployment first).
-- It refuses to run while any account exists: accounts are history (receipts, audit trail) and are never dropped by a rollback; export them first if they must go.
do $$
begin
 if exists(select 1 from public.freelance_hq_hosting_accounts) then
  raise exception 'Accounts exist: not rolling back (they carry receipts and history)';
 end if;
end $$;

drop trigger if exists app_site_slot on public.freelance_hq_hosting_account_sites;
drop trigger if exists app_account_guard on public.freelance_hq_hosting_accounts;
drop function if exists public.freelance_hq_hosting_open_account(uuid,uuid);
drop function if exists public.freelance_hq_hosting_add_site(uuid,uuid,text);
drop function if exists public.freelance_hq_hosting_record_app_status(uuid,uuid,jsonb);
drop function if exists public.freelance_hq_hosting_record_app_usage(uuid,uuid,jsonb);
drop function if exists public.freelance_hq_hosting_site_slot();
drop function if exists public.freelance_hq_hosting_account_guard();
drop table if exists public.freelance_hq_hosting_account_sites;
drop table if exists public.freelance_hq_hosting_accounts;

-- Previous behaviour of the contract trigger (exactly the text that was live before this migration): an App Hosting contract can never be set Active.
create or replace function public.freelance_hq_hosting_snapshot_plan() returns trigger language plpgsql set search_path=public,pg_temp as $$
declare p freelance_hq_hosting_packages;
begin
 if tg_op='UPDATE' then
  if old.package_snapshot is not null and (new.package_id is distinct from old.package_id or new.client_id is distinct from old.client_id or new.package_snapshot is distinct from old.package_snapshot or new.assignment_key is distinct from old.assignment_key or new.assignment_digest is distinct from old.assignment_digest) then raise exception 'Assigned package contract is immutable'; end if;
  if new.package_snapshot is not null and new.status='active' and old.status is distinct from 'active' then raise exception 'App Hosting server enforcement is not enrolled'; end if;
  if new.package_snapshot is not null and (new.package_snapshot->>'pricing_ready')::boolean=false then new.auto_invoice:=false;new.price_minor:=0; end if;
  return new;
 end if;
 select * into strict p from freelance_hq_hosting_packages where id=new.package_id for share;
 if p.product_kind='app_hosting' then
  if new.status<>'pending' then raise exception 'App Hosting must start pending server enrollment';end if;
  new.package_snapshot:=jsonb_build_object('schema',1,'package_id',p.id,'name',p.name,'version',p.limits_version,'limits',p.resource_limits,'limits_digest',freelance_hq_hosting_limits_digest(p.resource_limits),'pricing_ready',p.pricing_ready);
  new.price_minor:=case when p.pricing_ready then p.price_minor else 0 end;new.currency:=p.currency;new.billing_cycle:=p.billing_cycle;
  if not p.pricing_ready then new.auto_invoice:=false;end if;
 elsif new.package_snapshot is not null then raise exception 'Unexpected package snapshot';end if;
 return new;
end $$;
