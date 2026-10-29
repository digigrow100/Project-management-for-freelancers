-- Additive plan contracts. No worker enrollment or hosting activation.
create function public.freelance_hq_hosting_valid_limits(v jsonb) returns boolean language plpgsql immutable set search_path=pg_catalog,public as $$
declare item jsonb; k text; maximum bigint;
begin
 if v is null then return true; end if;
 if jsonb_typeof(v)<>'object' or v->'schema' is distinct from '1'::jsonb then return false; end if;
 if (select count(*) from jsonb_object_keys(v))<>24 then return false; end if;
 for item in select value from jsonb_array_elements('[ ["website_limit",100],["disk_mb",1048576],["traffic_mb",10485760],["memory_mb",65536],["cpu_percent",400],["inode_limit",10000000],["database_limit",100],["database_mb",1048576],["database_connections",1000],["email_limit",1000],["mail_mb",1048576],["mail_recipients_day",10000],["release_limit",100],["backup_limit",100],["upload_mb",1024],["extract_mb",10240],["build_seconds",3600],["build_memory_mb",4096],["process_limit",512],["cron_limit",50],["env_limit",200],["env_value_bytes",16384],["log_mb",1024]]'::jsonb) loop
  k:=item->>0; maximum:=(item->>1)::bigint;
  if not(v?k) or jsonb_typeof(v->k)<>'number' or v->>k !~ '^[0-9]+$' or length(v->>k)>10 or (v->>k)::bigint>maximum then return false; end if;
 end loop;
 foreach k in array array['website_limit','disk_mb','memory_mb','cpu_percent','inode_limit','release_limit','upload_mb','extract_mb','build_seconds','build_memory_mb','process_limit','env_value_bytes'] loop
  if (v->>k)::bigint<1 then return false; end if;
 end loop;
 if (v->>'backup_limit')::integer<3 or (v->>'extract_mb')::integer<(v->>'upload_mb')::integer then return false; end if;
 if (v->>'database_limit')::integer>0 and ((v->>'database_mb')::integer=0 or (v->>'database_connections')::integer=0) then return false; end if;
 if (v->>'email_limit')::integer>0 and ((v->>'mail_mb')::integer=0 or (v->>'mail_recipients_day')::integer=0) then return false; end if;
 return true;
exception when others then return false;
end $$;
create function public.freelance_hq_hosting_limits_digest(v jsonb) returns text language sql immutable strict set search_path=pg_catalog,public as $$
 select encode(sha256(convert_to('{'||string_agg(to_jsonb(key)::text||':'||value::text,',' order by key collate "C")||'}','UTF8')),'hex') from jsonb_each(v)
$$;
alter table public.freelance_hq_hosting_packages
 add column product_kind text not null default 'standard' check(product_kind in ('standard','app_hosting')),
 add column catalog_key text unique,
 add column resource_limits jsonb,
 add column pricing_ready boolean not null default true,
 add column limits_version integer not null default 1 check(limits_version>0),
 add constraint app_package_limits check (case when product_kind='app_hosting' then
 resource_limits is not null and freelance_hq_hosting_valid_limits(resource_limits)
 and disk_mb=(resource_limits->>'disk_mb')::bigint and memory_mb=(resource_limits->>'memory_mb')::integer
 and cpu_percent=(resource_limits->>'cpu_percent')::integer and inode_limit=(resource_limits->>'inode_limit')::bigint
 and domain_limit=(resource_limits->>'website_limit')::integer and email_limit=(resource_limits->>'email_limit')::integer
 else resource_limits is null end);
alter table public.freelance_hq_hosting_services add column package_snapshot jsonb,add column assignment_key uuid unique,add column assignment_digest text;
create function public.freelance_hq_hosting_snapshot_plan() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
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
create trigger app_plan_snapshot before insert or update on public.freelance_hq_hosting_services for each row execute function public.freelance_hq_hosting_snapshot_plan();
create or replace function public.freelance_hq_hosting_save_package(p_actor uuid,p_id uuid,p_data jsonb,p_servers jsonb)
returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare prior freelance_hq_hosting_packages;
begin
 perform freelance_hq_hosting_assert_admin(p_actor);
 if jsonb_typeof(p_servers)<>'array' or jsonb_array_length(p_servers)>100 then raise exception 'Invalid package servers';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,2));
 select * into prior from freelance_hq_hosting_packages where id=p_id for update;
 if prior.product_kind='app_hosting' and coalesce(p_data->>'product_kind','standard')<>'app_hosting' then raise exception 'App package kind cannot be removed';end if;
 insert into freelance_hq_hosting_packages(id,name,description,price_minor,currency,billing_cycle,disk_mb,inode_limit,memory_mb,cpu_percent,domain_limit,email_limit,is_active,product_kind,resource_limits,pricing_ready)
 values(p_id,p_data->>'name',p_data->>'description',(p_data->>'price_minor')::bigint,p_data->>'currency',p_data->>'billing_cycle',(p_data->>'disk_mb')::bigint,(p_data->>'inode_limit')::bigint,(p_data->>'memory_mb')::integer,(p_data->>'cpu_percent')::integer,(p_data->>'domain_limit')::integer,(p_data->>'email_limit')::integer,(p_data->>'is_active')::boolean,coalesce(p_data->>'product_kind','standard'),p_data->'resource_limits',coalesce((p_data->>'pricing_ready')::boolean,true))
 on conflict(id) do update set name=excluded.name,description=excluded.description,price_minor=excluded.price_minor,currency=excluded.currency,billing_cycle=excluded.billing_cycle,disk_mb=excluded.disk_mb,inode_limit=excluded.inode_limit,memory_mb=excluded.memory_mb,cpu_percent=excluded.cpu_percent,domain_limit=excluded.domain_limit,email_limit=excluded.email_limit,is_active=excluded.is_active,product_kind=excluded.product_kind,resource_limits=excluded.resource_limits,pricing_ready=excluded.pricing_ready,limits_version=freelance_hq_hosting_packages.limits_version+case when freelance_hq_hosting_packages.resource_limits is distinct from excluded.resource_limits then 1 else 0 end;
 delete from freelance_hq_hosting_package_servers where package_id=p_id and server_id not in(select value::uuid from jsonb_array_elements_text(p_servers));
 insert into freelance_hq_hosting_package_servers(package_id,server_id) select p_id,value::uuid from jsonb_array_elements_text(p_servers) on conflict do nothing;
 insert into freelance_hq_hosting_audit_logs(actor_id,event,entity,entity_id)values(p_actor,'package_saved','packages',p_id);
 return p_id;
end $$;
create function public.freelance_hq_hosting_assign_service(p_actor uuid,p_key uuid,p_data jsonb) returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare p freelance_hq_hosting_packages; previous freelance_hq_hosting_services; v_id uuid; v_client uuid:=(p_data->>'client_id')::uuid; v_server uuid:=(p_data->>'server_id')::uuid; v_digest text:=encode(sha256(convert_to(p_data::text,'UTF8')),'hex');
begin
 perform freelance_hq_hosting_assert_admin(p_actor);
 if p_key is null then raise exception 'Assignment key required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_key::text,34));
 select * into previous from freelance_hq_hosting_services where assignment_key=p_key;
 if found then if previous.assignment_digest<>v_digest then raise exception 'Idempotency key reused with different data';end if;return previous.id;end if;
 select * into strict p from freelance_hq_hosting_packages where id=(p_data->>'package_id')::uuid for share;
 if not p.is_active then raise exception 'Choose an active package';end if;
 perform 1 from freelance_hq_hosting_clients where id=v_client and status='active' for share;if not found then raise exception 'Client must be active';end if;
 if v_server is not null then
  perform 1 from freelance_hq_hosting_servers where id=v_server and status='available' for share;if not found then raise exception 'Server is not available';end if;
  perform 1 from freelance_hq_hosting_package_servers where package_id=p.id and server_id=v_server for share;if not found then raise exception 'Server is not allowed by package';end if;
 end if;
 insert into freelance_hq_hosting_services(client_id,package_id,server_id,name,primary_domain,status,price_minor,currency,billing_cycle,next_due_date,auto_invoice,notes,assignment_key,assignment_digest)
 values(v_client,p.id,v_server,p_data->>'name',coalesce(p_data->>'primary_domain',''),'pending',p.price_minor,p.currency,p.billing_cycle,(p_data->>'next_due_date')::date,coalesce((p_data->>'auto_invoice')::boolean,false),coalesce(p_data->>'notes',''),p_key,v_digest) returning id into v_id;
 insert into freelance_hq_hosting_audit_logs(actor_id,event,entity,entity_id)values(p_actor,'package_assigned','services',v_id);
 return v_id;
end $$;
create function public.freelance_hq_hosting_app_invoice_guard() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if exists(select 1 from freelance_hq_hosting_services where id=new.service_id and package_snapshot is not null and ((package_snapshot->>'pricing_ready')::boolean=false or status<>'active')) then raise exception 'App Hosting is not ready for billing';end if;return new;
end $$;
create trigger app_invoice_guard before insert or update on public.freelance_hq_hosting_invoices for each row execute function public.freelance_hq_hosting_app_invoice_guard();
revoke all on function public.freelance_hq_hosting_valid_limits(jsonb),public.freelance_hq_hosting_limits_digest(jsonb),public.freelance_hq_hosting_snapshot_plan(),public.freelance_hq_hosting_assign_service(uuid,uuid,jsonb),public.freelance_hq_hosting_app_invoice_guard() from public,anon,authenticated;
grant execute on function public.freelance_hq_hosting_valid_limits(jsonb),public.freelance_hq_hosting_limits_digest(jsonb),public.freelance_hq_hosting_snapshot_plan(),public.freelance_hq_hosting_assign_service(uuid,uuid,jsonb),public.freelance_hq_hosting_app_invoice_guard() to service_role;

insert into public.freelance_hq_hosting_packages(name,description,catalog_key,price_minor,currency,billing_cycle,disk_mb,inode_limit,memory_mb,cpu_percent,domain_limit,email_limit,is_active,product_kind,resource_limits,pricing_ready) values ('App Starter','House My Site App Hosting. Account totals. Server setup pending.','app-starter-v1',0,'PKR','monthly',2048,100000,512,50,1,2,true,'app_hosting','{"schema":1,"website_limit":1,"disk_mb":2048,"traffic_mb":20480,"memory_mb":512,"cpu_percent":50,"inode_limit":100000,"database_limit":1,"database_mb":250,"database_connections":5,"email_limit":2,"mail_mb":1024,"mail_recipients_day":100,"release_limit":3,"backup_limit":3,"upload_mb":50,"extract_mb":1024,"build_seconds":600,"build_memory_mb":1536,"process_limit":64,"cron_limit":2,"env_limit":30,"env_value_bytes":8192,"log_mb":50}'::jsonb,false) on conflict(catalog_key) do nothing;
insert into public.freelance_hq_hosting_packages(name,description,catalog_key,price_minor,currency,billing_cycle,disk_mb,inode_limit,memory_mb,cpu_percent,domain_limit,email_limit,is_active,product_kind,resource_limits,pricing_ready) values ('App Business','House My Site App Hosting. Account totals. Server setup pending.','app-business-v1',0,'PKR','monthly',5120,250000,1024,100,3,5,true,'app_hosting','{"schema":1,"website_limit":3,"disk_mb":5120,"traffic_mb":51200,"memory_mb":1024,"cpu_percent":100,"inode_limit":250000,"database_limit":3,"database_mb":1024,"database_connections":10,"email_limit":5,"mail_mb":2048,"mail_recipients_day":250,"release_limit":5,"backup_limit":3,"upload_mb":100,"extract_mb":2048,"build_seconds":900,"build_memory_mb":2048,"process_limit":128,"cron_limit":5,"env_limit":60,"env_value_bytes":8192,"log_mb":100}'::jsonb,false) on conflict(catalog_key) do nothing;
insert into public.freelance_hq_hosting_packages(name,description,catalog_key,price_minor,currency,billing_cycle,disk_mb,inode_limit,memory_mb,cpu_percent,domain_limit,email_limit,is_active,product_kind,resource_limits,pricing_ready) values ('App Pro','House My Site App Hosting. Account totals. Server setup pending.','app-pro-v1',0,'PKR','monthly',10240,500000,2048,200,5,10,true,'app_hosting','{"schema":1,"website_limit":5,"disk_mb":10240,"traffic_mb":102400,"memory_mb":2048,"cpu_percent":200,"inode_limit":500000,"database_limit":5,"database_mb":2048,"database_connections":20,"email_limit":10,"mail_mb":5120,"mail_recipients_day":500,"release_limit":10,"backup_limit":3,"upload_mb":100,"extract_mb":4096,"build_seconds":1200,"build_memory_mb":3072,"process_limit":192,"cron_limit":10,"env_limit":100,"env_value_bytes":8192,"log_mb":200}'::jsonb,false) on conflict(catalog_key) do nothing;
insert into public.freelance_hq_hosting_package_servers(package_id,server_id) select p.id,s.id from public.freelance_hq_hosting_packages p cross join public.freelance_hq_hosting_servers s where p.catalog_key in ('app-starter-v1','app-business-v1','app-pro-v1') and s.hostname='server1.housemysite.com' and s.ipv4='62.171.130.156' on conflict do nothing;
