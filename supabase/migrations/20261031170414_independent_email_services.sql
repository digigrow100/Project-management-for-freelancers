-- Email is a product in its own right. No hosting package or website is required.
create table public.freelance_hq_email_services (
 id uuid primary key default gen_random_uuid(), hostname text not null unique,
 runtime_client uuid not null unique default gen_random_uuid(),
 client_id uuid references public.freelance_hq_hosting_clients(id),
 version integer not null default 1 check(version>0),
 mailboxes integer not null check(mailboxes between 1 and 1000),
 mailbox_mb integer not null check(mailbox_mb between 1 and 102400),
 total_mb integer not null check(total_mb between 1 and 1048576),
 price_minor bigint check(price_minor between 0 and 100000000000),
 currency text not null check(currency in ('USD','GBP','PKR')),
 cycle text not null check(cycle in ('monthly','yearly')),
 discount_percent integer not null default 0 check(discount_percent between 0 and 100),
 due_on date,grace_days integer not null default 7 check(grace_days between 0 and 90),
 snapshot jsonb, observed_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(hostname=lower(hostname) and length(hostname)<=253 and hostname ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$'),
 check(mailboxes::bigint*mailbox_mb<=total_mb),
 check(snapshot is null or jsonb_typeof(snapshot)='object')
);
create index email_services_client on public.freelance_hq_email_services(client_id);
create table public.freelance_hq_email_mailbox_profiles (
 service_id uuid not null references public.freelance_hq_email_services(id),
 resource text not null check(resource ~ '^[a-f0-9]{32}$'),
 client_id uuid references public.freelance_hq_hosting_clients(id),
 inherit_client boolean not null default true,
 price_minor bigint check(price_minor between 0 and 100000000000),
 version integer not null default 1 check(version>0),
 primary key(service_id,resource),check(not inherit_client or client_id is null)
);
create index email_profiles_client on public.freelance_hq_email_mailbox_profiles(client_id);
create table public.freelance_hq_email_billing (
 id uuid primary key default gen_random_uuid(),invoice_id uuid unique references public.freelance_hq_hosting_invoices(id),service_id uuid not null references public.freelance_hq_email_services(id),
 period_start date not null,period_end date not null,client_id uuid not null references public.freelance_hq_hosting_clients(id),
 amount_minor bigint not null check(amount_minor between 0 and 100000000000),currency text not null check(currency in ('USD','GBP','PKR')),
 due_on date not null,paid_on date,reference text not null default '' check(length(reference)<=200),
 created_at timestamptz not null default now(),unique(service_id,client_id,period_start),check(period_end>period_start)
);
create index email_billing_client on public.freelance_hq_email_billing(client_id,created_at desc);
alter table public.freelance_hq_email_services enable row level security;
alter table public.freelance_hq_email_mailbox_profiles enable row level security;
alter table public.freelance_hq_email_billing enable row level security;
revoke all on public.freelance_hq_email_services,public.freelance_hq_email_mailbox_profiles,public.freelance_hq_email_billing from public,anon,authenticated;
grant select,insert,update on public.freelance_hq_email_services,public.freelance_hq_email_mailbox_profiles,public.freelance_hq_email_billing to service_role;

create function public.freelance_hq_email_service_save(p_actor uuid,p_id uuid,p_expected integer,p_value jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare r freelance_hq_email_services;c uuid;begin
 perform freelance_hq_hosting_assert_admin(p_actor);
 if jsonb_typeof(p_value)<>'object' or (p_value-'hostname'-'client_id'-'mailboxes'-'mailbox_mb'-'total_mb'-'price_minor'-'currency'-'cycle'-'discount_percent'-'due_on'-'grace_days')<>'{}'::jsonb then raise exception 'Invalid email service';end if;
 c:=nullif(p_value->>'client_id','')::uuid;
 if c is not null and not exists(select 1 from freelance_hq_hosting_clients where id=c and status='active')then raise exception 'Active client required';end if;
 if p_id is null then
  if p_expected<>0 then raise exception 'Version conflict';end if;
  insert into freelance_hq_email_services(hostname,client_id,mailboxes,mailbox_mb,total_mb,price_minor,currency,cycle,discount_percent,due_on,grace_days)
  values(p_value->>'hostname',c,(p_value->>'mailboxes')::integer,(p_value->>'mailbox_mb')::integer,(p_value->>'total_mb')::integer,(p_value->>'price_minor')::bigint,p_value->>'currency',p_value->>'cycle',coalesce((p_value->>'discount_percent')::integer,0),nullif(p_value->>'due_on','')::date,coalesce((p_value->>'grace_days')::integer,7))returning * into r;
 else
  select * into strict r from freelance_hq_email_services where id=p_id for update;
  if r.version<>p_expected then raise exception 'Version conflict';end if;
  if p_value->>'hostname'<>r.hostname then raise exception 'Domain cannot be renamed';end if;
  if exists(select 1 from jsonb_array_elements(coalesce(r.snapshot->'jobs','[]'::jsonb))j where j->>'state' in ('queued','applying','uncertain'))then raise exception 'Resolve pending requests before editing';end if;
  update freelance_hq_email_services set client_id=c,mailboxes=(p_value->>'mailboxes')::integer,mailbox_mb=(p_value->>'mailbox_mb')::integer,total_mb=(p_value->>'total_mb')::integer,price_minor=(p_value->>'price_minor')::bigint,currency=p_value->>'currency',cycle=p_value->>'cycle',discount_percent=(p_value->>'discount_percent')::integer,due_on=nullif(p_value->>'due_on','')::date,grace_days=(p_value->>'grace_days')::integer,version=version+1,updated_at=now()where id=p_id returning * into r;
 end if;
 insert into freelance_hq_hosting_audit_logs(actor_id,event,entity,entity_id)values(p_actor,'email_service_saved','email_services',r.id);
 return to_jsonb(r);
end $$;
create function public.freelance_hq_email_observe(p_actor uuid,p_id uuid,p_expected integer,p_snapshot jsonb) returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 perform freelance_hq_hosting_assert_admin(p_actor);
 if jsonb_typeof(p_snapshot)<>'object' or pg_column_size(p_snapshot)>524288 or p_snapshot->>'service'<>p_id::text then raise exception 'Invalid mail observation';end if;
 update freelance_hq_email_services set snapshot=p_snapshot,observed_at=now()where id=p_id and version=p_expected and hostname=p_snapshot->>'domain';
 if not found then raise exception 'Email service changed';end if;
end $$;
create function public.freelance_hq_email_profile(p_actor uuid,p_service uuid,p_resource text,p_expected integer,p_client uuid,p_inherit boolean,p_price bigint) returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare s freelance_hq_email_services;begin
 perform freelance_hq_hosting_assert_admin(p_actor);
 select * into strict s from freelance_hq_email_services where id=p_service for update;
 if s.observed_at is null or s.observed_at<now()-interval '5 minutes' or not exists(select 1 from jsonb_array_elements(s.snapshot->'mailboxes')m where m->>'id'=p_resource)then raise exception 'Refresh mailbox inventory';end if;
 if p_client is not null and not exists(select 1 from freelance_hq_hosting_clients where id=p_client and status='active')then raise exception 'Active client required';end if;
 if p_expected=0 then
 insert into freelance_hq_email_mailbox_profiles(service_id,resource,client_id,inherit_client,price_minor)values(p_service,p_resource,p_client,p_inherit,p_price);
 else
 update freelance_hq_email_mailbox_profiles set client_id=p_client,inherit_client=p_inherit,price_minor=p_price,version=version+1 where service_id=p_service and resource=p_resource and version=p_expected;
 if not found then raise exception 'Version conflict';end if;
 end if;
 insert into freelance_hq_hosting_audit_logs(actor_id,event,entity,entity_id)values(p_actor,'email_mailbox_assigned','email_services',p_service);
end $$;
create function public.freelance_hq_email_bill(p_actor uuid,p_service uuid,p_expected integer,p_period date,p_client uuid default null) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare s freelance_hq_email_services;r freelance_hq_email_billing;ending date;customer uuid;charge bigint;begin
 perform freelance_hq_hosting_assert_admin(p_actor);
 select * into strict s from freelance_hq_email_services where id=p_service for update;
 customer:=coalesce(p_client,s.client_id);
 if s.version<>p_expected or customer is null or s.due_on is null or p_period is null or not exists(select 1 from freelance_hq_hosting_clients where id=customer and status='active')then raise exception 'Client, price and due date required';end if;
 charge:=case when customer=s.client_id then s.price_minor else 0 end;
 select coalesce(charge,0)+coalesce(sum(p.price_minor),0) into charge from freelance_hq_email_mailbox_profiles p where p.service_id=s.id and case when p.inherit_client then s.client_id else p.client_id end=customer and exists(select 1 from jsonb_array_elements(coalesce(s.snapshot->'mailboxes','[]'::jsonb))m where m->>'id'=p.resource);
 if s.price_minor is null and not exists(select 1 from freelance_hq_email_mailbox_profiles p where p.service_id=s.id and p.price_minor is not null and case when p.inherit_client then s.client_id else p.client_id end=customer)then raise exception 'Set a price first';end if;
 if customer is distinct from s.client_id and not exists(select 1 from freelance_hq_email_mailbox_profiles p where p.service_id=s.id and not p.inherit_client and p.client_id=customer)then raise exception 'Client is not assigned to this service';end if;
 ending:=(p_period+case when s.cycle='monthly' then interval '1 month' else interval '1 year' end)::date;
 if exists(select 1 from freelance_hq_email_billing where service_id=s.id and client_id=customer and period_start<>p_period and period_start<ending and period_end>p_period)then raise exception 'Overlapping billing period';end if;
 insert into freelance_hq_email_billing(service_id,period_start,period_end,client_id,amount_minor,currency,due_on)
 values(s.id,p_period,ending,customer,round(charge::numeric*(100-s.discount_percent)/100),s.currency,s.due_on)
 on conflict(service_id,client_id,period_start)do nothing returning * into r;
 if r.id is null then select * into strict r from freelance_hq_email_billing where service_id=s.id and client_id=customer and period_start=p_period;
 else
  if r.amount_minor>0 then
   update freelance_hq_email_billing set invoice_id=freelance_hq_hosting_create_invoice(p_actor,jsonb_build_object('client_id',customer,'service_id',null,'currency',r.currency,'issued_on',current_date,'due_on',r.due_on,'period_start',r.period_start,'idempotency_key',r.id,'notes','Professional email: '||s.hostname),jsonb_build_array(jsonb_build_object('description','Professional email: '||s.hostname||' ('||r.period_start||' to '||r.period_end||')','quantity',1,'unit_minor',r.amount_minor)))where id=r.id returning * into r;
  else update freelance_hq_email_billing set paid_on=current_date where id=r.id returning * into r;end if;
  insert into freelance_hq_hosting_audit_logs(actor_id,event,entity,entity_id)values(p_actor,'email_bill_created','email_billing',r.id);end if;
 return to_jsonb(r);
end $$;
create function public.freelance_hq_email_payment(p_actor uuid,p_bill uuid,p_reference text,p_key uuid) returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare b freelance_hq_email_billing;i freelance_hq_hosting_invoices;net bigint;begin
 perform freelance_hq_hosting_assert_admin(p_actor);
 if p_reference is null or length(btrim(p_reference))not between 1 and 120 or p_key is null then raise exception 'Invalid payment reference';end if;
 select * into strict b from freelance_hq_email_billing where id=p_bill;
 -- Match canonical payment locking order: invoice, then linked email bill.
 if b.invoice_id is not null then
  select * into strict i from freelance_hq_hosting_invoices where id=b.invoice_id for update;
 end if;
 select * into strict b from freelance_hq_email_billing where id=p_bill for update;
 if b.invoice_id is not null then
  if i.client_id<>b.client_id or i.currency<>b.currency or i.status<>'issued' then raise exception 'Invoice changed';end if;
  select coalesce(sum(case direction when 'incoming' then amount_minor else -amount_minor end),0)into net from freelance_hq_hosting_payments where invoice_id=i.id;
  if net<i.total_minor then perform freelance_hq_hosting_record_payment(p_actor,jsonb_build_object('invoice_id',i.id,'currency',i.currency,'amount_minor',i.total_minor-net,'direction','incoming','refund_of',null,'method','other','reference',p_reference,'paid_on',current_date,'idempotency_key',p_key));end if;
 end if;
 update freelance_hq_email_billing set paid_on=coalesce(paid_on,current_date),reference=case when paid_on is null then p_reference else reference end where id=p_bill;
 insert into freelance_hq_hosting_audit_logs(actor_id,event,entity,entity_id)values(p_actor,'email_payment_checked','email_billing',p_bill);
end $$;

revoke all on function public.freelance_hq_email_service_save(uuid,uuid,integer,jsonb),public.freelance_hq_email_observe(uuid,uuid,integer,jsonb),public.freelance_hq_email_profile(uuid,uuid,text,integer,uuid,boolean,bigint),public.freelance_hq_email_bill(uuid,uuid,integer,date,uuid),public.freelance_hq_email_payment(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.freelance_hq_email_service_save(uuid,uuid,integer,jsonb),public.freelance_hq_email_observe(uuid,uuid,integer,jsonb),public.freelance_hq_email_profile(uuid,uuid,text,integer,uuid,boolean,bigint),public.freelance_hq_email_bill(uuid,uuid,integer,date,uuid),public.freelance_hq_email_payment(uuid,uuid,text,uuid) to service_role;

-- Resolve mailbox visibility in SQL. A truncated profile query must never turn
-- an explicitly reassigned mailbox back into inherited client access.
create function public.freelance_hq_email_client_inventory(p_actor uuid,p_client uuid) returns jsonb language plpgsql security invoker stable set search_path=public,pg_temp as $$
declare result jsonb;begin
 if not exists(select 1 from freelance_hq_hosting_client_access a join freelance_hq_hosting_clients c on c.id=a.client_id where a.auth_user_id=p_actor and a.client_id=p_client and a.enabled and c.status='active') and not exists(select 1 from freelance_hq_profiles where id=p_actor and role='admin')then raise exception 'Client access required';end if;
 select jsonb_build_object('services',coalesce(jsonb_agg(jsonb_build_object('id',s.id,'domain',s.hostname,'webmail_url',coalesce(s.snapshot->>'webmail_url',''),'observed_at',s.observed_at,'mailboxes',coalesce((select jsonb_agg(jsonb_build_object('address',m->>'address','quota_mb',m->'quota_mb','used_bytes',m->'used_bytes','sending',m->'sending','receiving',m->'receiving','login',m->'login')) from jsonb_array_elements(coalesce(s.snapshot->'mailboxes','[]'::jsonb))m left join freelance_hq_email_mailbox_profiles p on p.service_id=s.id and p.resource=m->>'id' where case when p.resource is not null and not p.inherit_client then p.client_id else s.client_id end=p_client),'[]'::jsonb))order by s.hostname),'[]'::jsonb),
 'bills',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'invoice_id',b.invoice_id,'service_id',b.service_id,'period_start',b.period_start,'period_end',b.period_end,'amount_minor',b.amount_minor,'currency',b.currency,'due_on',b.due_on,'paid_on',b.paid_on) order by b.created_at desc) from (select * from freelance_hq_email_billing where client_id=p_client order by created_at desc limit 100)b),'[]'::jsonb))into result
 from freelance_hq_email_services s where s.client_id=p_client or exists(select 1 from freelance_hq_email_mailbox_profiles p where p.service_id=s.id and not p.inherit_client and p.client_id=p_client);
 return result;
end $$;
revoke all on function public.freelance_hq_email_client_inventory(uuid,uuid) from public,anon,authenticated;
grant execute on function public.freelance_hq_email_client_inventory(uuid,uuid) to service_role;

-- Canonical invoice/payment changes remain the source of truth, including
-- payments recorded outside the Email page and subsequent refunds.
create function public.freelance_hq_email_sync_payment() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare target uuid;net bigint;latest date;begin
 for target in select distinct value from unnest(case when TG_OP='INSERT' then array[NEW.invoice_id] when TG_OP='DELETE' then array[OLD.invoice_id] else array[NEW.invoice_id,OLD.invoice_id]end)value loop
  perform 1 from freelance_hq_hosting_invoices where id=target for update;
  select coalesce(sum(case direction when 'incoming' then amount_minor else -amount_minor end),0),max(paid_on)filter(where direction='incoming')into net,latest from freelance_hq_hosting_payments where invoice_id=target;
  update freelance_hq_email_billing set paid_on=case when net>=amount_minor then latest else null end where invoice_id=target;
 end loop;
 return null;
end $$;
create trigger email_payment_sync after insert or update or delete on public.freelance_hq_hosting_payments for each row execute function public.freelance_hq_email_sync_payment();
revoke all on function public.freelance_hq_email_sync_payment() from public,anon,authenticated;
grant execute on function public.freelance_hq_email_sync_payment() to service_role;
