-- App Hosting account identity: one assigned contract = one account that owns its website slots and shared budgets.
-- Additive. Nothing here provisions anything: a VPS receipt bound to the assignment UUID and the immutable limits digest is the only way to `enforced`,
-- and a service can become Active only after that. Usage is stored as REPORTED by the VPS (unknown stays unknown); no value is invented here.
create table public.freelance_hq_hosting_accounts(
 id uuid primary key default gen_random_uuid(),
 service_id uuid not null unique references public.freelance_hq_hosting_services(id),
 client_id uuid not null references public.freelance_hq_hosting_clients(id),
 server_id uuid not null references public.freelance_hq_hosting_servers(id),
 package_id uuid not null references public.freelance_hq_hosting_packages(id),
 package_version integer not null check(package_version>0),
 assignment_key uuid not null unique,
 limits_digest text not null check(limits_digest ~ '^[a-f0-9]{64}$'),
 status text not null default 'requested' check(status in ('requested','provisioning','uncertain','provider_confirmed','enforced','suspended')),
 receipt jsonb,
 receipt_digest text check(receipt_digest is null or receipt_digest ~ '^[a-f0-9]{64}$'),
 plan_digest text check(plan_digest is null or plan_digest ~ '^[a-f0-9]{64}$'),
 capabilities jsonb,
 blocked_features text[] not null default '{}',
 usage jsonb,
 usage_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check((status='enforced')=(receipt is not null and receipt_digest is not null))
);
create table public.freelance_hq_hosting_account_sites(
 id uuid primary key default gen_random_uuid(),
 account_id uuid not null references public.freelance_hq_hosting_accounts(id),
 client_id uuid not null references public.freelance_hq_hosting_clients(id),
 slot integer not null check(slot>0),
 hostname text not null unique check(length(hostname)<=253 and hostname ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' and hostname !~ '^[0-9.]+$'),
 is_primary boolean not null default false,
 status text not null default 'reserved' check(status in ('reserved','provider_confirmed','verified')),
 created_at timestamptz not null default now(),
 unique(account_id,slot)
);
create unique index freelance_hq_hosting_one_primary_site on public.freelance_hq_hosting_account_sites(account_id) where is_primary;
create index freelance_hq_hosting_account_sites_client on public.freelance_hq_hosting_account_sites(client_id);
alter table public.freelance_hq_hosting_accounts enable row level security;
alter table public.freelance_hq_hosting_account_sites enable row level security;
grant select, insert, update on public.freelance_hq_hosting_accounts to service_role;
grant select, insert, update on public.freelance_hq_hosting_account_sites to service_role;

-- Contract columns are immutable; the account row only moves through the receipt function.
create function public.freelance_hq_hosting_account_guard() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if tg_op='UPDATE' and (new.service_id is distinct from old.service_id or new.client_id is distinct from old.client_id or new.server_id is distinct from old.server_id
   or new.package_id is distinct from old.package_id or new.package_version is distinct from old.package_version or new.assignment_key is distinct from old.assignment_key
   or new.limits_digest is distinct from old.limits_digest) then raise exception 'Account contract is immutable'; end if;
 new.updated_at:=now();
 return new;
end $$;
create trigger app_account_guard before update on public.freelance_hq_hosting_accounts for each row execute function public.freelance_hq_hosting_account_guard();

-- Website slots draw on ONE allowance: the contract's website_limit. The account row is locked so concurrent requests cannot exceed it.
create function public.freelance_hq_hosting_site_slot() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare a freelance_hq_hosting_accounts; v_limit integer; v_used integer;
begin
 select * into strict a from freelance_hq_hosting_accounts where id=new.account_id for update;
 if new.client_id is distinct from a.client_id then raise exception 'Website belongs to another client'; end if;
 select (package_snapshot->'limits'->>'website_limit')::integer into strict v_limit from freelance_hq_hosting_services where id=a.service_id;
 select count(*) into v_used from freelance_hq_hosting_account_sites where account_id=a.id;
 if v_used>=v_limit then raise exception 'Website allowance of this account is used'; end if;
 if new.slot is distinct from v_used+1 then raise exception 'Website slot out of order'; end if;
 if new.is_primary is distinct from (v_used=0) then raise exception 'The first website of an account is its primary site'; end if;
 return new;
end $$;
create trigger app_site_slot before insert on public.freelance_hq_hosting_account_sites for each row execute function public.freelance_hq_hosting_site_slot();

create function public.freelance_hq_hosting_open_account(p_actor uuid,p_service uuid) returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare s freelance_hq_hosting_services; v_id uuid;
begin
 perform freelance_hq_hosting_assert_admin(p_actor);
 perform pg_advisory_xact_lock(hashtextextended(p_service::text,35));
 select * into s from freelance_hq_hosting_services where id=p_service for update;
 if not found or s.package_snapshot is null or s.assignment_key is null then raise exception 'Only an assigned App Hosting contract has an account'; end if;
 select id into v_id from freelance_hq_hosting_accounts where service_id=p_service;
 if found then return v_id; end if;
 if s.status<>'pending' or s.server_id is null then raise exception 'The contract must be pending and have a server'; end if;
 if freelance_hq_hosting_limits_digest(s.package_snapshot->'limits') is distinct from s.package_snapshot->>'limits_digest' then raise exception 'Contract limits do not match their digest'; end if;
 if not freelance_hq_hosting_valid_limits(s.package_snapshot->'limits') then raise exception 'Contract limits are invalid'; end if;
 insert into freelance_hq_hosting_accounts(service_id,client_id,server_id,package_id,package_version,assignment_key,limits_digest)
  values(s.id,s.client_id,s.server_id,s.package_id,(s.package_snapshot->>'version')::integer,s.assignment_key,s.package_snapshot->>'limits_digest') returning id into v_id;
 -- the primary website shares the contract's id, so every existing per-website screen and command works for it unchanged
 insert into freelance_hq_hosting_account_sites(id,account_id,client_id,slot,hostname,is_primary) values(s.id,v_id,s.client_id,1,lower(s.primary_domain),true);
 insert into freelance_hq_hosting_audit_logs(actor_id,event,entity,entity_id) values(p_actor,'app_account_opened','accounts',v_id);
 return v_id;
end $$;

create function public.freelance_hq_hosting_add_site(p_actor uuid,p_account uuid,p_hostname text) returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare a freelance_hq_hosting_accounts; v_id uuid; v_slot integer;
begin
 perform freelance_hq_hosting_assert_admin(p_actor);
 select * into a from freelance_hq_hosting_accounts where id=p_account for update;
 if not found then raise exception 'Unknown account'; end if;
 if a.status<>'enforced' then raise exception 'Additional websites need an enforced account'; end if;
 select count(*)+1 into v_slot from freelance_hq_hosting_account_sites where account_id=a.id;
 insert into freelance_hq_hosting_account_sites(account_id,client_id,slot,hostname,is_primary) values(a.id,a.client_id,v_slot,lower(p_hostname),false) returning id into v_id;
 insert into freelance_hq_hosting_audit_logs(actor_id,event,entity,entity_id) values(p_actor,'app_site_reserved','account_sites',v_id);
 return v_id;
end $$;

-- The only way an account becomes enforced: the VPS receipt must repeat every identity of the stored contract.
create function public.freelance_hq_hosting_record_app_status(p_actor uuid,p_account uuid,p_status jsonb) returns text language plpgsql security invoker set search_path=public,pg_temp as $$
declare a freelance_hq_hosting_accounts; v_state text; v_site jsonb;
begin
 perform freelance_hq_hosting_assert_admin(p_actor);
 select * into a from freelance_hq_hosting_accounts where id=p_account for update;
 if not found then raise exception 'Unknown account'; end if;
 if jsonb_typeof(p_status)<>'object' or p_status->>'account' is distinct from a.id::text or p_status->>'client' is distinct from a.client_id::text
   or p_status->>'assignment' is distinct from a.assignment_key::text or p_status->>'limits_digest' is distinct from a.limits_digest
   or p_status->>'package' is distinct from a.package_id::text or (p_status->>'package_version')::integer is distinct from a.package_version then raise exception 'Status does not match the contract'; end if;
 v_state:=p_status->>'state';
 if v_state not in ('requested','provisioning','uncertain','provider_confirmed','enforced','suspended') then raise exception 'Unknown account state'; end if;
 if a.status='enforced' and v_state not in ('enforced','suspended') then v_state:='enforced'; end if;   -- an added website never downgrades an enforced account
 if v_state='enforced' and a.status<>'enforced' then
  if (p_status->>'enforced')::boolean is not true or p_status->>'receipt_digest' !~ '^[a-f0-9]{64}$' or p_status->>'plan_digest' !~ '^[a-f0-9]{64}$' then raise exception 'A verified receipt is required'; end if;
  update freelance_hq_hosting_accounts set status='enforced',receipt=p_status,receipt_digest=p_status->>'receipt_digest',plan_digest=p_status->>'plan_digest',
   capabilities=p_status->'capabilities',blocked_features=coalesce((select array_agg(value) from jsonb_array_elements_text(p_status->'blocked_features')),'{}') where id=a.id;
 elsif v_state<>a.status and v_state<>'enforced' then
  update freelance_hq_hosting_accounts set status=v_state where id=a.id;
 end if;
 for v_site in select value from jsonb_array_elements(coalesce(p_status->'sites','[]'::jsonb)) loop
  update freelance_hq_hosting_account_sites set status=case when v_site->>'state'='verified' then 'verified' when v_site->>'state'='provider_confirmed' then 'provider_confirmed' else status end
   where id=(v_site->>'site')::uuid and account_id=a.id and hostname=v_site->>'domain';
 end loop;
 insert into freelance_hq_hosting_audit_logs(actor_id,event,entity,entity_id) values(p_actor,'app_account_status','accounts',a.id);
 return v_state;
end $$;

create function public.freelance_hq_hosting_record_app_usage(p_actor uuid,p_account uuid,p_usage jsonb) returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare k text; e jsonb;
begin
 perform freelance_hq_hosting_assert_admin(p_actor);
 if jsonb_typeof(p_usage)<>'object' then raise exception 'Invalid usage report'; end if;
 for k,e in select key,value from jsonb_each(p_usage) loop
  if k<>all(array['website_limit','disk_mb','traffic_mb','memory_mb','cpu_percent','inode_limit','database_limit','database_mb','database_connections','email_limit','mail_mb','mail_recipients_day','release_limit','backup_limit','upload_mb','extract_mb','build_seconds','build_memory_mb','process_limit','cron_limit','env_limit','env_value_bytes','log_mb']) then raise exception 'Unknown limit in usage report'; end if;
  if jsonb_typeof(e)<>'object' or e->>'level' is null or e->>'level' not in ('unknown','disabled','ok','warn80','warn90','exceeded') then raise exception 'Invalid usage entry'; end if;
  -- unknown stays unknown: a level other than unknown/disabled needs a measured number, and unknown can never carry one
  if e->>'level'='unknown' and coalesce(e->'used','null'::jsonb)<>'null'::jsonb then raise exception 'Unknown usage cannot carry a value'; end if;
  if e->>'level' in ('ok','warn80','warn90','exceeded') and coalesce(jsonb_typeof(e->'used'),'null')<>'number' then raise exception 'Measured usage required'; end if;
 end loop;
 update freelance_hq_hosting_accounts set usage=p_usage,usage_at=now() where id=p_account;
 if not found then raise exception 'Unknown account'; end if;
end $$;

-- Active is possible only for an enforced account whose stored digest still equals the frozen contract.
create or replace function public.freelance_hq_hosting_snapshot_plan() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare p freelance_hq_hosting_packages;
begin
 if tg_op='UPDATE' then
  if old.package_snapshot is not null and (new.package_id is distinct from old.package_id or new.client_id is distinct from old.client_id or new.package_snapshot is distinct from old.package_snapshot or new.assignment_key is distinct from old.assignment_key or new.assignment_digest is distinct from old.assignment_digest) then raise exception 'Assigned package contract is immutable'; end if;
  if new.package_snapshot is not null and new.status='active' and old.status is distinct from 'active' then
   if not exists(select 1 from freelance_hq_hosting_accounts a where a.service_id=new.id and a.status='enforced' and a.receipt_digest is not null and a.limits_digest=new.package_snapshot->>'limits_digest' and a.assignment_key=new.assignment_key) then
    raise exception 'App Hosting server enforcement is not verified'; end if;
  end if;
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

revoke all on function public.freelance_hq_hosting_account_guard(),public.freelance_hq_hosting_site_slot(),public.freelance_hq_hosting_open_account(uuid,uuid),public.freelance_hq_hosting_add_site(uuid,uuid,text),
 public.freelance_hq_hosting_record_app_status(uuid,uuid,jsonb),public.freelance_hq_hosting_record_app_usage(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.freelance_hq_hosting_open_account(uuid,uuid),public.freelance_hq_hosting_add_site(uuid,uuid,text),
 public.freelance_hq_hosting_record_app_status(uuid,uuid,jsonb),public.freelance_hq_hosting_record_app_usage(uuid,uuid,jsonb) to service_role;
