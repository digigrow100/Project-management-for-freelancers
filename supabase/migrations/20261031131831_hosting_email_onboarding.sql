-- Email domain onboarding only. This does not enroll a provider or enable sending.
create table public.freelance_hq_hosting_email_settings (
 id boolean primary key default true check(id),
 settings jsonb not null default '{"mx_host":"","imap_host":"","smtp_host":"","webmail_url":"","host_fingerprint":""}'::jsonb,
 updated_at timestamptz not null default now()
);
create table public.freelance_hq_hosting_email_domains (
 id uuid primary key default gen_random_uuid(),
 hostname text not null unique check(length(hostname)<=253 and hostname=lower(hostname) and hostname ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$'),
 service_id uuid references public.freelance_hq_hosting_services(id) on delete set null,
 source text not null check(source in ('hosted','external')),
 verification_token text not null check(verification_token ~ '^[a-f0-9]{64}$'),
 verified_at timestamptz,
 dns_checked_at timestamptz,
 dns_check jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index hosting_email_domains_service on public.freelance_hq_hosting_email_domains(service_id);
alter table public.freelance_hq_hosting_email_domains enable row level security;
alter table public.freelance_hq_hosting_email_settings enable row level security;
revoke all on public.freelance_hq_hosting_email_domains,public.freelance_hq_hosting_email_settings from public,anon,authenticated;
grant select,insert,update,delete on public.freelance_hq_hosting_email_domains,public.freelance_hq_hosting_email_settings to service_role;
insert into public.freelance_hq_hosting_email_settings(id) values(true);

create function public.freelance_hq_hosting_email_workspace(p_actor uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare result jsonb;
begin
 perform freelance_hq_hosting_assert_admin(p_actor);
 select jsonb_build_object('domains',coalesce((select jsonb_agg(to_jsonb(d) order by d.hostname) from freelance_hq_hosting_email_domains d),'[]'::jsonb),
 'hosted',coalesce((select jsonb_agg(jsonb_build_object('hostname',s.primary_domain,'service_id',s.id,'name',s.name,'verified',coalesce(a.status='enforced' and a.receipt_digest is not null,false),'mailboxes',coalesce(a.capabilities->>'mailboxes'='true',false),'sending',coalesce(a.capabilities->>'mail_send'='true',false)) order by s.primary_domain)
 from freelance_hq_hosting_services s join freelance_hq_hosting_clients c on c.id=s.client_id and c.status='active'
 left join freelance_hq_hosting_accounts a on a.service_id=s.id
 where s.status in ('active','pending') and s.primary_domain is not null and s.primary_domain<>''),'[]'::jsonb),
 'settings',(select settings from freelance_hq_hosting_email_settings where id)) into result;
 return result;
end $$;

create function public.freelance_hq_hosting_email_domain_add(p_actor uuid,p_hostname text,p_token text) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare row freelance_hq_hosting_email_domains; sid uuid; trusted boolean:=false;
begin
 perform freelance_hq_hosting_assert_admin(p_actor);
 if p_hostname is null or p_token is null or length(p_hostname)>253 or p_hostname<>lower(p_hostname) or p_token !~ '^[a-f0-9]{64}$' or p_hostname !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$' then raise exception 'Invalid email domain'; end if;
 select s.id,coalesce(a.status='enforced' and a.receipt_digest is not null,false) into sid,trusted
 from freelance_hq_hosting_services s join freelance_hq_hosting_clients c on c.id=s.client_id and c.status='active'
 left join freelance_hq_hosting_accounts a on a.service_id=s.id
 where s.status in ('active','pending') and s.primary_domain=p_hostname order by (a.status='enforced') desc nulls last,s.id limit 1;
 insert into freelance_hq_hosting_email_domains(hostname,service_id,source,verification_token,verified_at)
 values(p_hostname,sid,case when sid is null then 'external' else 'hosted' end,p_token,null)
 on conflict(hostname) do nothing returning * into row;
 if row.id is null then select * into strict row from freelance_hq_hosting_email_domains where hostname=p_hostname;
 else insert into freelance_hq_hosting_audit_logs(actor_id,event,entity,entity_id) values(p_actor,'email_domain_added','email_domains',row.id);end if;
 return to_jsonb(row);
end $$;

create function public.freelance_hq_hosting_email_domain_check(p_actor uuid,p_domain uuid,p_token text,p_check jsonb,p_mx_host text) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
declare row freelance_hq_hosting_email_domains;
begin
 perform freelance_hq_hosting_assert_admin(p_actor);
 select * into strict row from freelance_hq_hosting_email_domains where id=p_domain for update;
 if row.verification_token<>p_token or p_check is null or jsonb_typeof(p_check)<>'object' or (select count(*) from jsonb_object_keys(p_check))<>4
 or not(p_check ?& array['ownership','mx','spf','dmarc'])
 or p_check->>'ownership' not in ('matched','missing','unavailable') or p_check->>'mx' not in ('matched','missing','different','unavailable','not_configured')
 or p_check->>'spf' not in ('present','missing','multiple','unavailable') or p_check->>'dmarc' not in ('present','missing','unavailable')
 or exists(select 1 from jsonb_each(p_check) e where jsonb_typeof(e.value)<>'string') then raise exception 'Invalid email observation';end if;
 -- Settings may change while the DNS query is in flight. Never save a green result for an old target.
 if p_mx_host is distinct from (select settings->>'mx_host' from freelance_hq_hosting_email_settings where id) then raise exception 'Email settings changed';end if;
 update freelance_hq_hosting_email_domains set verified_at=case when p_check->>'ownership'='matched' then now() when p_check->>'ownership'='missing' then null else verified_at end,
 dns_check=p_check||jsonb_build_object('mx_host',p_mx_host),dns_checked_at=now() where id=p_domain;
 insert into freelance_hq_hosting_audit_logs(actor_id,event,entity,entity_id) values(p_actor,'email_dns_checked','email_domains',p_domain);
end $$;

create function public.freelance_hq_hosting_email_settings_save(p_actor uuid,p_settings jsonb) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
declare host text;
begin
 perform freelance_hq_hosting_assert_admin(p_actor);
 if p_settings is null or jsonb_typeof(p_settings)<>'object' or (select count(*) from jsonb_object_keys(p_settings))<>5 or not(p_settings ?& array['mx_host','imap_host','smtp_host','webmail_url','host_fingerprint'])
 or exists(select 1 from jsonb_each(p_settings) e where jsonb_typeof(e.value)<>'string') then raise exception 'Invalid email settings';end if;
 foreach host in array array[p_settings->>'mx_host',p_settings->>'imap_host',p_settings->>'smtp_host'] loop
 if host<>'' and (length(host)>253 or host !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$') then raise exception 'Invalid mail hostname';end if;
 end loop;
 if length(p_settings->>'webmail_url')>500 or (p_settings->>'webmail_url'<>'' and p_settings->>'webmail_url' !~ '^https://[a-z0-9.-]+(:443)?(/[^?#@[:space:]]*)?$') or (p_settings->>'host_fingerprint'<>'' and p_settings->>'host_fingerprint' !~ '^[a-f0-9]{64}$') then raise exception 'Invalid mail connection';end if;
 update freelance_hq_hosting_email_settings set settings=p_settings,updated_at=now() where id;
 -- Retain observations with their original target for audit; UI requires it to equal the current setting.
 insert into freelance_hq_hosting_audit_logs(actor_id,event,entity) values(p_actor,'email_settings_saved','email_settings');
end $$;
revoke all on function public.freelance_hq_hosting_email_workspace(uuid),public.freelance_hq_hosting_email_domain_add(uuid,text,text),public.freelance_hq_hosting_email_domain_check(uuid,uuid,text,jsonb,text),public.freelance_hq_hosting_email_settings_save(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.freelance_hq_hosting_email_workspace(uuid),public.freelance_hq_hosting_email_domain_add(uuid,text,text),public.freelance_hq_hosting_email_domain_check(uuid,uuid,text,jsonb,text),public.freelance_hq_hosting_email_settings_save(uuid,jsonb) to service_role;
