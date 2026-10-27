-- Dormant transport: enrollment and polling are OFF until separately approved.
create table public.freelance_hq_hosting_operators (
 server_id uuid primary key references public.freelance_hq_hosting_servers(id),
 token_sha256 text not null check(token_sha256 ~ '^[a-f0-9]{64}$'),
 enabled boolean not null default false
);
create table public.freelance_hq_hosting_operator_mappings (
 service_id uuid primary key references public.freelance_hq_hosting_services(id),
 server_id uuid not null references public.freelance_hq_hosting_operators(server_id),
 client_id uuid not null references public.freelance_hq_hosting_clients(id),
 tenant text not null check(tenant ~ '^[a-z][a-z0-9-]{0,47}$'),
 subject text not null check(subject ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$'),
 actor_id uuid not null references auth.users(id),
 project text check(project ~ '^c[a-f0-9]{8}$'),
 unique(server_id,project)
);
create table public.freelance_hq_hosting_operator_deliveries (
 id uuid primary key default gen_random_uuid(),
 job_id uuid unique not null references public.freelance_hq_hosting_jobs(id),
 server_id uuid not null references public.freelance_hq_hosting_operators(server_id),
 body text not null check(octet_length(body)<=8192),
 body_sha256 text not null check(body_sha256 ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz not null,
 state text not null default 'pending' check(state in ('pending','claimed','queued','applied','rejected','recovery_required')),
 claim_id uuid, receipt jsonb, updated_at timestamptz not null default now(),
 unique(server_id,claim_id)
);
-- No browser access. Private per-server credentials never grant Data API access.
do $$ declare n text; begin
 foreach n in array array['operators','operator_mappings','operator_deliveries'] loop
 execute format('alter table public.%I enable row level security','freelance_hq_hosting_'||n);
 execute format('revoke all on public.%I from public,anon,authenticated','freelance_hq_hosting_'||n);
 execute format('grant select,insert,update on public.%I to service_role','freelance_hq_hosting_'||n);
 end loop;
end $$;
create function public.freelance_hq_hosting_operator_claim(p_server uuid,p_token text,p_claim uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.freelance_hq_hosting_operator_deliveries;
begin
 perform 1 from public.freelance_hq_hosting_operators where server_id=p_server and token_sha256=p_token and enabled for share;
 if not found then raise exception 'denied'; end if;
 select * into d from public.freelance_hq_hosting_operator_deliveries where server_id=p_server and claim_id=p_claim;
 if found then return to_jsonb(d); end if;
 select x.* into d from public.freelance_hq_hosting_operator_deliveries x
 join public.freelance_hq_hosting_jobs j on j.id=x.job_id
 join public.freelance_hq_hosting_operator_mappings m on m.service_id=j.service_id
 join public.freelance_hq_hosting_services s on s.id=m.service_id
 where x.server_id=p_server and x.state='pending' and x.expires_at>now() and j.status='awaiting_connection'
 and m.server_id=p_server and s.server_id=p_server and s.client_id=m.client_id
 order by x.updated_at for update of x skip locked limit 1;
 if not found then return null; end if;
 update public.freelance_hq_hosting_operator_deliveries set state='claimed',claim_id=p_claim,updated_at=now() where id=d.id returning * into d;
 return to_jsonb(d);
end $$;
create function public.freelance_hq_hosting_operator_receipt(p_server uuid,p_token text,p_receipt jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare d public.freelance_hq_hosting_operator_deliveries; st text := p_receipt->>'state'; b jsonb;
begin
 perform 1 from public.freelance_hq_hosting_operators where server_id=p_server and token_sha256=p_token and enabled for share;
 if not found then raise exception 'denied'; end if;
 select * into d from public.freelance_hq_hosting_operator_deliveries where id=(p_receipt->>'delivery_id')::uuid and server_id=p_server for update;
 if not found or d.claim_id is distinct from (p_receipt->>'claim_id')::uuid or d.body_sha256 is distinct from p_receipt->>'body_sha256' then raise exception 'denied'; end if;
 if d.receipt=p_receipt then return true; end if;
 if not (d.state='claimed' and st in ('queued','rejected','recovery_required') or d.state='queued' and st in ('applied','rejected','recovery_required')) then raise exception 'invalid transition'; end if;
 if d.receipt is not null and d.receipt->'local_id' is distinct from p_receipt->'local_id' then raise exception 'receipt mismatch'; end if;
 b := d.body::jsonb;
 if st='applied' and b->'request'->>'operation'='project.create' then
   if p_receipt->>'project' is null or p_receipt->>'project' !~ '^c[a-f0-9]{8}$' then raise exception 'missing project'; end if;
   update public.freelance_hq_hosting_operator_mappings set project=p_receipt->>'project'
   where service_id=(b->>'service_id')::uuid and server_id=p_server and tenant=b->>'tenant'
   and client_id=(b->>'client_id')::uuid and subject=b->>'subject' and (project is null or project=p_receipt->>'project');
   if not found then raise exception 'mapping conflict'; end if;
 end if;
 update public.freelance_hq_hosting_operator_deliveries set state=st,receipt=p_receipt,updated_at=now() where id=d.id;
 return true;
end $$;
revoke all on function public.freelance_hq_hosting_operator_claim(uuid,text,uuid),public.freelance_hq_hosting_operator_receipt(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.freelance_hq_hosting_operator_claim(uuid,text,uuid),public.freelance_hq_hosting_operator_receipt(uuid,text,jsonb) to service_role;
-- Serialize cancellation against claim; never describe a claimed operation as cancelled.
create function public.freelance_hq_hosting_operator_cancel_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
declare d public.freelance_hq_hosting_operator_deliveries;
begin
 if new.status='cancelled' and old.status is distinct from new.status then
  select * into d from public.freelance_hq_hosting_operator_deliveries where job_id=old.id for update;
  if found then
   if d.state<>'pending' then raise exception 'Claimed delivery requires operator reconciliation'; end if;
   update public.freelance_hq_hosting_operator_deliveries set state='rejected',updated_at=now() where id=d.id;
  end if;
 end if;
 return new;
end $$;
revoke all on function public.freelance_hq_hosting_operator_cancel_guard() from public,anon,authenticated;
create trigger hosting_operator_cancel_guard before update of status on public.freelance_hq_hosting_jobs
for each row execute function public.freelance_hq_hosting_operator_cancel_guard();

