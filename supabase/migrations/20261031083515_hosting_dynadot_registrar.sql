-- Registrar inventory is account-owned. It is not automatically assigned to hosting customers.
create table public.freelance_hq_hosting_registrar_connection (
 id boolean primary key default true check(id),
 version uuid not null default gen_random_uuid(),
 credentials_encrypted text not null,
 mode text not null check(mode in ('sandbox','production')),
 verified_at timestamptz not null,
 sync_at timestamptz,
 sync_run uuid,
 sync_next integer not null default 1,
 created_by uuid not null references auth.users(id)
);
create table public.freelance_hq_hosting_registrar_domains (
 connection_version uuid not null,
 name text not null,
 details jsonb not null check(jsonb_typeof(details)='object'),
 synced_at timestamptz not null default now(),
 sync_run uuid,
 primary key(connection_version,name)
);
create table public.freelance_hq_hosting_registrar_operations (
 id uuid primary key default gen_random_uuid(),
 actor_id uuid not null references auth.users(id),
 connection_version uuid not null,
 domain text not null,
 kind text not null check(kind in ('lock','renew_option','nameservers','dns_add','dns_remove','renew')),
 intent jsonb not null,
 before_state jsonb not null,
 quote jsonb,
 state text not null default 'prepared' check(state in ('prepared','executing','confirmed','uncertain','failed')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '5 minutes'
);
create index hosting_registrar_operations_active on public.freelance_hq_hosting_registrar_operations(state) where state in ('executing','uncertain');
create index hosting_registrar_operations_actor on public.freelance_hq_hosting_registrar_operations(actor_id,created_at desc);
create unique index hosting_registrar_one_executing on public.freelance_hq_hosting_registrar_operations((true)) where state in ('executing','uncertain');
alter table public.freelance_hq_hosting_registrar_connection enable row level security;
alter table public.freelance_hq_hosting_registrar_domains enable row level security;
alter table public.freelance_hq_hosting_registrar_operations enable row level security;
revoke all on public.freelance_hq_hosting_registrar_connection,public.freelance_hq_hosting_registrar_domains,public.freelance_hq_hosting_registrar_operations from public,anon,authenticated;
grant select,insert,update,delete on public.freelance_hq_hosting_registrar_connection,public.freelance_hq_hosting_registrar_domains,public.freelance_hq_hosting_registrar_operations to service_role;

create function public.freelance_hq_hosting_registrar_connect(p_actor uuid,p_credentials text,p_mode text) returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare v uuid:=gen_random_uuid();begin
 perform freelance_hq_hosting_assert_admin(p_actor);
 perform pg_advisory_xact_lock(88731031);
 if exists(select 1 from freelance_hq_hosting_registrar_operations where state in ('executing','uncertain'))then raise exception 'Registrar outcome needs reconciliation';end if;
 if p_credentials is null or length(p_credentials)<32 then raise exception 'Credentials required';end if;
 insert into freelance_hq_hosting_registrar_connection(id,version,credentials_encrypted,mode,verified_at,created_by)values(true,v,p_credentials,p_mode,now(),p_actor)
 on conflict(id)do update set version=v,credentials_encrypted=excluded.credentials_encrypted,mode=excluded.mode,verified_at=now(),sync_at=null,created_by=p_actor;
 insert into freelance_hq_hosting_audit_logs(actor_id,event,entity)values(p_actor,'registrar_connected','registrar');return v;
end $$;
create function public.freelance_hq_hosting_registrar_claim(p_actor uuid,p_id uuid) returns public.freelance_hq_hosting_registrar_operations language plpgsql security invoker set search_path=public,pg_temp as $$
declare op freelance_hq_hosting_registrar_operations; v uuid;begin
 perform freelance_hq_hosting_assert_admin(p_actor);
 perform pg_advisory_xact_lock(88731031);
 select version into strict v from freelance_hq_hosting_registrar_connection where id=true for update;
 select * into strict op from freelance_hq_hosting_registrar_operations where id=p_id and actor_id=p_actor for update;
 if op.state<>'prepared' or op.expires_at<now() or op.connection_version<>v then raise exception 'Registrar review expired or already submitted';end if;
 if exists(select 1 from freelance_hq_hosting_registrar_operations where state in ('executing','uncertain'))then raise exception 'Registrar outcome needs reconciliation';end if;
 update freelance_hq_hosting_registrar_operations set state='executing',updated_at=now()where id=p_id returning * into op;
 insert into freelance_hq_hosting_audit_logs(actor_id,event,entity,entity_id)values(p_actor,'registrar_'||op.kind||'_submitted','registrar',p_id);
 return op;
end $$;
revoke all on function public.freelance_hq_hosting_registrar_connect(uuid,text,text),public.freelance_hq_hosting_registrar_claim(uuid,uuid) from public,anon,authenticated;
grant execute on function public.freelance_hq_hosting_registrar_connect(uuid,text,text),public.freelance_hq_hosting_registrar_claim(uuid,uuid) to service_role;

create function public.freelance_hq_hosting_registrar_sync_start(p_actor uuid,p_version uuid) returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare r uuid:=gen_random_uuid();begin
 perform freelance_hq_hosting_assert_admin(p_actor);
 update freelance_hq_hosting_registrar_connection set sync_run=r,sync_next=1 where version=p_version;
 if not found then raise exception 'Connection changed';end if;return r;
end $$;
create function public.freelance_hq_hosting_registrar_sync_page(p_actor uuid,p_version uuid,p_run uuid,p_page integer,p_total integer,p_next boolean,p_domains jsonb) returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 perform freelance_hq_hosting_assert_admin(p_actor);
 perform 1 from freelance_hq_hosting_registrar_connection where version=p_version and sync_run=p_run and sync_next=p_page for update;
 if not found then raise exception 'Sync changed';end if;
 if jsonb_typeof(p_domains)<>'array' or jsonb_array_length(p_domains)>100 then raise exception 'Invalid page';end if;
 insert into freelance_hq_hosting_registrar_domains(connection_version,name,details,sync_run)
 select p_version,d->>'name',d,p_run from jsonb_array_elements(p_domains)d
 on conflict(connection_version,name)do update set details=excluded.details,sync_run=p_run,synced_at=now();
 if not p_next and (select count(*)from freelance_hq_hosting_registrar_domains where connection_version=p_version and sync_run=p_run)<>p_total then raise exception 'Domain list changed; restart sync';end if;
 update freelance_hq_hosting_registrar_connection set sync_next=case when p_next then p_page+1 else 0 end,sync_at=case when p_next then sync_at else now()end where version=p_version;
end $$;
create function public.freelance_hq_hosting_registrar_finish(p_actor uuid,p_id uuid,p_state text) returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare op freelance_hq_hosting_registrar_operations;begin
 perform freelance_hq_hosting_assert_admin(p_actor);
 if p_state not in ('confirmed','uncertain','failed')then raise exception 'Invalid state';end if;
 select * into strict op from freelance_hq_hosting_registrar_operations where id=p_id and actor_id=p_actor for update;
 if op.state not in ('executing','uncertain') or (op.state='uncertain'and p_state='failed')then raise exception 'Operation state changed';end if;
 update freelance_hq_hosting_registrar_operations set state=p_state,updated_at=now()where id=p_id;
 insert into freelance_hq_hosting_audit_logs(actor_id,event,entity,entity_id)values(p_actor,'registrar_'||op.kind||'_'||p_state,'registrar',p_id);
end $$;
revoke all on function public.freelance_hq_hosting_registrar_sync_start(uuid,uuid),public.freelance_hq_hosting_registrar_sync_page(uuid,uuid,uuid,integer,integer,boolean,jsonb),public.freelance_hq_hosting_registrar_finish(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.freelance_hq_hosting_registrar_sync_start(uuid,uuid),public.freelance_hq_hosting_registrar_sync_page(uuid,uuid,uuid,integer,integer,boolean,jsonb),public.freelance_hq_hosting_registrar_finish(uuid,uuid,text) to service_role;
