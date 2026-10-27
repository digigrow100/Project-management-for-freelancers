-- Hosting management is additive. Existing team/agency records are unchanged.
-- All portal access uses verified server-side identities and scoped server queries.
-- Browser roles intentionally have NO access to hosting tables or RPCs.
create table public.freelance_hq_hosting_settings (
  id boolean primary key default true check(id),
  portal_name text not null default 'HouseMySite',
  business_name text not null default '',
  business_email text not null default '',
  business_address text not null default '',
  default_currency text not null default 'PKR' check(default_currency in ('PKR','GBP','USD')),
  invoice_prefix text not null default 'HMS' check(invoice_prefix ~ '^[A-Z0-9-]{1,12}$'),
  payment_instructions text not null default '',
  invoice_terms text not null default '',
  renewal_lead_days integer not null default 14 check(renewal_lead_days between 0 and 90),
  invoice_due_days integer not null default 7 check(invoice_due_days between 0 and 90),
  renewal_automation boolean not null default false,
  automation_actor uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.freelance_hq_hosting_settings enable row level security;
revoke all on public.freelance_hq_hosting_settings from public, anon, authenticated;
grant select, insert, update, delete on public.freelance_hq_hosting_settings to service_role;

create table public.freelance_hq_hosting_servers (
  id uuid primary key default gen_random_uuid(),
  name text not null check(length(name) between 1 and 120),
  hostname text not null,
  ipv4 text not null default '',
  ipv6 text not null default '',
  provider text not null default '',
  region text not null default '',
  status text not null default 'draft' check(status in ('draft','available','maintenance','disabled')),
  disk_mb bigint not null default 0 check(disk_mb>=0),
  memory_mb bigint not null default 0 check(memory_mb>=0),
  notes text not null default '',
  created_at timestamptz not null default now()
);
alter table public.freelance_hq_hosting_servers enable row level security;
revoke all on public.freelance_hq_hosting_servers from public, anon, authenticated;
grant select, insert, update, delete on public.freelance_hq_hosting_servers to service_role;

create table public.freelance_hq_hosting_packages (
  id uuid primary key default gen_random_uuid(),
  name text not null check(length(name) between 1 and 120),
  description text not null default '',
  price_minor bigint not null check(price_minor between 0 and 1000000000000),
  currency text not null check(currency in ('PKR','GBP','USD')),
  billing_cycle text not null check(billing_cycle in ('monthly','quarterly','yearly','one_time')),
  disk_mb bigint not null check(disk_mb>=0),
  inode_limit bigint check(inode_limit>0),
  memory_mb integer not null check(memory_mb>=0),
  cpu_percent integer not null check(cpu_percent between 0 and 10000),
  domain_limit integer not null default 1 check(domain_limit>=0),
  email_limit integer not null default 0 check(email_limit>=0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.freelance_hq_hosting_packages enable row level security;
revoke all on public.freelance_hq_hosting_packages from public, anon, authenticated;
grant select, insert, update, delete on public.freelance_hq_hosting_packages to service_role;

create table public.freelance_hq_hosting_package_servers (
  package_id uuid not null references public.freelance_hq_hosting_packages(id) on delete restrict,
  server_id uuid not null references public.freelance_hq_hosting_servers(id) on delete restrict,
  primary key(package_id,server_id)
);
alter table public.freelance_hq_hosting_package_servers enable row level security;
revoke all on public.freelance_hq_hosting_package_servers from public, anon, authenticated;
grant select, insert, update, delete on public.freelance_hq_hosting_package_servers to service_role;

create table public.freelance_hq_hosting_clients (
  id uuid primary key default gen_random_uuid(),
  agency_client_id uuid unique references public.freelance_hq_clients(id) on delete restrict,
  name text not null check(length(name) between 1 and 120),
  company text not null default '',
  email text not null check(email=lower(btrim(email))),
  phone text not null default '',
  address text not null default '',
  status text not null default 'active' check(status in ('active','suspended','closed')),
  notes text not null default '',
  created_at timestamptz not null default now()
);
alter table public.freelance_hq_hosting_clients enable row level security;
revoke all on public.freelance_hq_hosting_clients from public, anon, authenticated;
grant select, insert, update, delete on public.freelance_hq_hosting_clients to service_role;

create table public.freelance_hq_hosting_client_access (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.freelance_hq_hosting_clients(id) on delete restrict,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  email text unique not null check(email=lower(btrim(email))),
  enabled boolean not null default true,
  invited_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.freelance_hq_hosting_client_access enable row level security;
revoke all on public.freelance_hq_hosting_client_access from public, anon, authenticated;
grant select, insert, update, delete on public.freelance_hq_hosting_client_access to service_role;

create table public.freelance_hq_hosting_services (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.freelance_hq_hosting_clients(id) on delete restrict,
  package_id uuid not null references public.freelance_hq_hosting_packages(id) on delete restrict,
  server_id uuid references public.freelance_hq_hosting_servers(id) on delete restrict,
  name text not null check(length(name) between 1 and 120),
  primary_domain text not null default '',
  status text not null default 'pending' check(status in ('pending','active','suspended','cancelled')),
  price_minor bigint not null check(price_minor between 0 and 1000000000000),
  currency text not null check(currency in ('PKR','GBP','USD')),
  billing_cycle text not null check(billing_cycle in ('monthly','quarterly','yearly','one_time')),
  next_due_date date not null,
  auto_invoice boolean not null default true,
  notes text not null default '',
  created_at timestamptz not null default now(),
  unique(id,client_id),
  foreign key(package_id,server_id) references public.freelance_hq_hosting_package_servers(package_id,server_id) on delete restrict
);
alter table public.freelance_hq_hosting_services enable row level security;
revoke all on public.freelance_hq_hosting_services from public, anon, authenticated;
grant select, insert, update, delete on public.freelance_hq_hosting_services to service_role;

create table public.freelance_hq_hosting_domains (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.freelance_hq_hosting_clients(id) on delete restrict,
  service_id uuid,
  hostname text unique not null check(hostname=lower(btrim(hostname))),
  dns_status text not null default 'unchecked' check(dns_status in ('unchecked','matched','mismatch','error')),
  dns_checked_at timestamptz,
  ssl_status text not null default 'unchecked' check(ssl_status in ('unchecked','valid','error')),
  ssl_checked_at timestamptz,
  ssl_expires_at timestamptz,
  expires_on date,
  auto_renew boolean not null default false,
  notes text not null default '',
  created_at timestamptz not null default now(),
  foreign key(service_id,client_id) references public.freelance_hq_hosting_services(id,client_id) on delete restrict
);
alter table public.freelance_hq_hosting_domains enable row level security;
revoke all on public.freelance_hq_hosting_domains from public, anon, authenticated;
grant select, insert, update, delete on public.freelance_hq_hosting_domains to service_role;

create table public.freelance_hq_hosting_invoices (
  id uuid primary key default gen_random_uuid(),
  number text unique not null,
  client_id uuid not null references public.freelance_hq_hosting_clients(id) on delete restrict,
  service_id uuid,
  currency text not null check(currency in ('PKR','GBP','USD')),
  status text not null default 'issued' check(status in ('issued','cancelled')),
  subtotal_minor bigint not null check(subtotal_minor between 0 and 1000000000000),
  tax_minor bigint not null default 0 check(tax_minor between 0 and 1000000000000),
  total_minor bigint generated always as (subtotal_minor+tax_minor) stored,
  issued_on date not null,
  due_on date not null,
  period_start date,
  notes text not null default '',
  terms text not null default '',
  idempotency_key uuid unique not null,
  created_at timestamptz not null default now(),
  unique(id,client_id),
  unique(service_id,period_start),
  check(service_id is null or period_start is not null),
  foreign key(service_id,client_id) references public.freelance_hq_hosting_services(id,client_id) on delete restrict,
  request_digest text not null
);
alter table public.freelance_hq_hosting_invoices enable row level security;
revoke all on public.freelance_hq_hosting_invoices from public, anon, authenticated;
grant select, insert, update, delete on public.freelance_hq_hosting_invoices to service_role;

create table public.freelance_hq_hosting_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.freelance_hq_hosting_invoices(id) on delete restrict,
  description text not null check(length(description) between 1 and 1000),
  quantity integer not null check(quantity between 1 and 100000),
  unit_minor bigint not null check(unit_minor between 0 and 1000000000000),
  line_minor bigint generated always as (quantity::bigint*unit_minor) stored,
  position integer not null default 0
);
alter table public.freelance_hq_hosting_invoice_items enable row level security;
revoke all on public.freelance_hq_hosting_invoice_items from public, anon, authenticated;
grant select, insert, update, delete on public.freelance_hq_hosting_invoice_items to service_role;

create table public.freelance_hq_hosting_payments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.freelance_hq_hosting_clients(id) on delete restrict,
  invoice_id uuid not null,
  amount_minor bigint not null check(amount_minor between 1 and 1000000000000),
  currency text not null check(currency in ('PKR','GBP','USD')),
  direction text not null check(direction in ('incoming','refund')),
  refund_of uuid references public.freelance_hq_hosting_payments(id) on delete restrict,
  method text not null check(method in ('bank_transfer','cash','card','other')),
  reference text not null check(length(reference) between 1 and 120),
  paid_on date not null,
  idempotency_key uuid unique not null,
  created_at timestamptz not null default now(),
  check((direction='refund')=(refund_of is not null)),
  foreign key(invoice_id,client_id) references public.freelance_hq_hosting_invoices(id,client_id) on delete restrict,
  request_digest text not null
);
alter table public.freelance_hq_hosting_payments enable row level security;
revoke all on public.freelance_hq_hosting_payments from public, anon, authenticated;
grant select, insert, update, delete on public.freelance_hq_hosting_payments to service_role;

create table public.freelance_hq_hosting_expenses (
  id uuid primary key default gen_random_uuid(),
  server_id uuid references public.freelance_hq_hosting_servers(id) on delete restrict,
  vendor text not null,
  category text not null,
  amount_minor bigint not null check(amount_minor between 1 and 1000000000000),
  currency text not null check(currency in ('PKR','GBP','USD')),
  incurred_on date not null,
  notes text not null default '',
  idempotency_key uuid unique not null,
  created_at timestamptz not null default now()
);
alter table public.freelance_hq_hosting_expenses enable row level security;
revoke all on public.freelance_hq_hosting_expenses from public, anon, authenticated;
grant select, insert, update, delete on public.freelance_hq_hosting_expenses to service_role;

create table public.freelance_hq_hosting_payment_submissions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.freelance_hq_hosting_clients(id) on delete restrict,
  invoice_id uuid not null,
  amount_minor bigint not null check(amount_minor between 1 and 1000000000000),
  reference text not null check(length(reference) between 1 and 120),
  notes text not null default '',
  status text not null default 'pending' check(status in ('pending','approved','rejected')),
  payment_id uuid references public.freelance_hq_hosting_payments(id) on delete restrict,
  reviewed_by uuid references auth.users(id) on delete set null,
  idempotency_key uuid unique not null,
  created_at timestamptz not null default now(),
  foreign key(invoice_id,client_id) references public.freelance_hq_hosting_invoices(id,client_id) on delete restrict
);
alter table public.freelance_hq_hosting_payment_submissions enable row level security;
revoke all on public.freelance_hq_hosting_payment_submissions from public, anon, authenticated;
grant select, insert, update, delete on public.freelance_hq_hosting_payment_submissions to service_role;

create table public.freelance_hq_hosting_tickets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.freelance_hq_hosting_clients(id) on delete restrict,
  service_id uuid,
  subject text not null check(length(subject) between 1 and 200),
  priority text not null default 'normal' check(priority in ('low','normal','high')),
  status text not null default 'open' check(status in ('open','pending_customer','resolved','closed')),
  idempotency_key uuid unique not null,
  created_at timestamptz not null default now(),
  foreign key(service_id,client_id) references public.freelance_hq_hosting_services(id,client_id) on delete restrict
);
alter table public.freelance_hq_hosting_tickets enable row level security;
revoke all on public.freelance_hq_hosting_tickets from public, anon, authenticated;
grant select, insert, update, delete on public.freelance_hq_hosting_tickets to service_role;

create table public.freelance_hq_hosting_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.freelance_hq_hosting_tickets(id) on delete restrict,
  body text not null check(length(body) between 1 and 10000),
  is_internal boolean not null default false,
  author_role text not null check(author_role in ('admin','client')),
  author_id uuid not null references auth.users(id) on delete restrict,
  idempotency_key uuid unique not null,
  created_at timestamptz not null default now()
);
alter table public.freelance_hq_hosting_ticket_messages enable row level security;
revoke all on public.freelance_hq_hosting_ticket_messages from public, anon, authenticated;
grant select, insert, update, delete on public.freelance_hq_hosting_ticket_messages to service_role;

create table public.freelance_hq_hosting_jobs (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.freelance_hq_hosting_services(id) on delete restrict,
  kind text not null check(kind in ('provision','suspend','resume','cancel','deploy','rollback')),
  status text not null default 'awaiting_connection' check(status in ('awaiting_connection','cancelled')),
  note text not null default '',
  requested_by uuid not null references auth.users(id) on delete restrict,
  idempotency_key uuid unique not null,
  created_at timestamptz not null default now()
);
alter table public.freelance_hq_hosting_jobs enable row level security;
revoke all on public.freelance_hq_hosting_jobs from public, anon, authenticated;
grant select, insert, update, delete on public.freelance_hq_hosting_jobs to service_role;

create table public.freelance_hq_hosting_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  event text not null,
  entity text not null,
  entity_id uuid,
  created_at timestamptz not null default now()
);
alter table public.freelance_hq_hosting_audit_logs enable row level security;
revoke all on public.freelance_hq_hosting_audit_logs from public, anon, authenticated;
grant select, insert, update, delete on public.freelance_hq_hosting_audit_logs to service_role;

insert into public.freelance_hq_hosting_settings(id) values(true);
create sequence public.freelance_hq_hosting_invoice_seq;
revoke all on sequence public.freelance_hq_hosting_invoice_seq from public, anon, authenticated;
grant usage,select on sequence public.freelance_hq_hosting_invoice_seq to service_role;
create index on public.freelance_hq_hosting_client_access(client_id);
create index on public.freelance_hq_hosting_services(client_id);
create index on public.freelance_hq_hosting_services(package_id);
create index on public.freelance_hq_hosting_services(server_id);
create index on public.freelance_hq_hosting_domains(client_id);
create index on public.freelance_hq_hosting_domains(service_id);
create index on public.freelance_hq_hosting_invoices(client_id);
create index on public.freelance_hq_hosting_payments(invoice_id);
create index on public.freelance_hq_hosting_payments(refund_of);
create index on public.freelance_hq_hosting_expenses(server_id);
create index on public.freelance_hq_hosting_payment_submissions(invoice_id);
create index on public.freelance_hq_hosting_tickets(client_id);
create index on public.freelance_hq_hosting_tickets(service_id);
create index on public.freelance_hq_hosting_ticket_messages(ticket_id);
create index on public.freelance_hq_hosting_jobs(service_id);
create index on public.freelance_hq_hosting_services(next_due_date) where status='active' and auto_invoice;
create index on public.freelance_hq_hosting_package_servers(server_id);

create function public.freelance_hq_hosting_assert_admin(p_actor uuid)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if p_actor is null or not exists(select 1 from freelance_hq_profiles where id=p_actor and role='admin')
    or exists(select 1 from freelance_hq_hosting_client_access where auth_user_id=p_actor)
    then raise exception 'Hosting admin access required'; end if;
end $$;

create function public.freelance_hq_hosting_next_due(p_date date,p_cycle text)
returns date language sql immutable strict security invoker set search_path=public,pg_temp as $$
 select case p_cycle when 'monthly' then (p_date+interval '1 month')::date
 when 'quarterly' then (p_date+interval '3 months')::date
 when 'yearly' then (p_date+interval '1 year')::date else p_date end
$$;

create function public.freelance_hq_hosting_create_invoice(p_actor uuid,p_data jsonb,p_items jsonb)
returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_id uuid; v_service freelance_hq_hosting_services; v_settings freelance_hq_hosting_settings;
 v_client uuid; v_currency text; v_subtotal bigint; v_tax bigint; v_key uuid;
begin
 perform freelance_hq_hosting_assert_admin(p_actor);
 v_key:=(p_data->>'idempotency_key')::uuid;
 perform pg_advisory_xact_lock(hashtextextended(v_key::text,0));
 select id into v_id from freelance_hq_hosting_invoices where idempotency_key=v_key;
 if v_id is not null then
 if not exists(select 1 from freelance_hq_hosting_invoices where id=v_id and request_digest=md5(p_data::text||p_items::text)) then raise exception 'Idempotency key reused with different data'; end if;
 return v_id; end if;
 select * into strict v_settings from freelance_hq_hosting_settings where id;
 v_client:=(p_data->>'client_id')::uuid; v_currency:=p_data->>'currency';
 if not exists(select 1 from freelance_hq_hosting_clients where id=v_client and status='active') then raise exception 'Active hosting client required'; end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 50 then raise exception 'Invoice needs 1 to 50 items'; end if;
 if nullif(p_data->>'service_id','') is not null then
   select * into strict v_service from freelance_hq_hosting_services where id=(p_data->>'service_id')::uuid for update;
   if v_service.client_id<>v_client or v_service.currency<>v_currency or nullif(p_data->>'period_start','') is null then raise exception 'Service invoice ownership, currency or period mismatch'; end if;
   select id into v_id from freelance_hq_hosting_invoices where service_id=v_service.id and period_start=(p_data->>'period_start')::date;
   if v_id is not null then return v_id; end if;
 end if;
 if exists(select 1 from jsonb_array_elements(p_items) e where
   length(btrim(coalesce(e->>'description',''))) not between 1 and 1000
   or coalesce((e->>'quantity')::integer,0) not between 1 and 100000
   or coalesce((e->>'unit_minor')::bigint,-1) not between 0 and 1000000000000) then raise exception 'Invalid invoice line'; end if;
 select sum((e->>'quantity')::bigint*(e->>'unit_minor')::bigint) into v_subtotal from jsonb_array_elements(p_items) e;
 if v_subtotal not between 1 and 1000000000000 then raise exception 'Invoice total out of bounds'; end if;
 v_tax:=coalesce((p_data->>'tax_minor')::bigint,0);
 if v_tax not between 0 and 1000000000000 then raise exception 'Invalid tax'; end if;
 insert into freelance_hq_hosting_invoices(number,client_id,service_id,currency,subtotal_minor,tax_minor,issued_on,due_on,period_start,notes,terms,idempotency_key,request_digest)
 values(v_settings.invoice_prefix||'-'||lpad(nextval('freelance_hq_hosting_invoice_seq')::text,7,'0'),v_client,v_service.id,v_currency,v_subtotal,v_tax,
 (p_data->>'issued_on')::date,(p_data->>'due_on')::date,nullif(p_data->>'period_start','')::date,
 coalesce(p_data->>'notes',''),v_settings.invoice_terms,v_key,md5(p_data::text||p_items::text)) returning id into v_id;
 insert into freelance_hq_hosting_invoice_items(invoice_id,description,quantity,unit_minor,position)
 select v_id,btrim(e->>'description'),(e->>'quantity')::integer,(e->>'unit_minor')::bigint,ord::integer
 from jsonb_array_elements(p_items) with ordinality as a(e,ord);
 insert into freelance_hq_hosting_audit_logs(actor_id,event,entity,entity_id) values(p_actor,'invoice_created','invoices',v_id);
 return v_id;
end $$;

create function public.freelance_hq_hosting_record_payment(p_actor uuid,p_data jsonb)
returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_id uuid; v_invoice freelance_hq_hosting_invoices; v_original freelance_hq_hosting_payments;
 v_net bigint; v_amount bigint; v_refunded bigint; v_direction text; v_key uuid;
begin
 perform freelance_hq_hosting_assert_admin(p_actor);
 v_key:=(p_data->>'idempotency_key')::uuid;
 perform pg_advisory_xact_lock(hashtextextended(v_key::text,1));
 select id into v_id from freelance_hq_hosting_payments where idempotency_key=v_key;
 if v_id is not null then
 if not exists(select 1 from freelance_hq_hosting_payments where id=v_id and request_digest=md5(p_data::text)) then raise exception 'Idempotency key reused with different data'; end if;
 return v_id; end if;
 select * into strict v_invoice from freelance_hq_hosting_invoices where id=(p_data->>'invoice_id')::uuid for update;
 if v_invoice.status<>'issued' then raise exception 'Only issued invoices accept payments'; end if;
 v_amount:=(p_data->>'amount_minor')::bigint; v_direction:=p_data->>'direction';
 if v_invoice.currency<>p_data->>'currency' or v_amount not between 1 and 1000000000000 then raise exception 'Invalid currency or amount'; end if;
 select coalesce(sum(case direction when 'incoming' then amount_minor else -amount_minor end),0) into v_net from freelance_hq_hosting_payments where invoice_id=v_invoice.id;
 if v_direction='incoming' then
   if v_amount>v_invoice.total_minor-v_net then raise exception 'Payment exceeds outstanding balance'; end if;
 elsif v_direction='refund' then
   select * into strict v_original from freelance_hq_hosting_payments where id=(p_data->>'refund_of')::uuid;
   if v_original.invoice_id<>v_invoice.id or v_original.direction<>'incoming' then raise exception 'Invalid original payment'; end if;
   select coalesce(sum(amount_minor),0) into v_refunded from freelance_hq_hosting_payments where refund_of=v_original.id;
   if v_amount>v_original.amount_minor-v_refunded then raise exception 'Refund exceeds refundable amount'; end if;
 else raise exception 'Invalid payment direction'; end if;
 insert into freelance_hq_hosting_payments(client_id,invoice_id,amount_minor,currency,direction,refund_of,method,reference,paid_on,idempotency_key,request_digest)
 values(v_invoice.client_id,v_invoice.id,v_amount,v_invoice.currency,v_direction,nullif(p_data->>'refund_of','')::uuid,
 p_data->>'method',btrim(p_data->>'reference'),(p_data->>'paid_on')::date,v_key,md5(p_data::text)) returning id into v_id;
 if v_direction='incoming' and v_net+v_amount=v_invoice.total_minor and v_invoice.service_id is not null then
   update freelance_hq_hosting_services set next_due_date=freelance_hq_hosting_next_due(next_due_date,billing_cycle)
   where id=v_invoice.service_id and next_due_date=v_invoice.period_start and billing_cycle<>'one_time';
 end if;
 insert into freelance_hq_hosting_audit_logs(actor_id,event,entity,entity_id) values(p_actor,'payment_'||v_direction,'payments',v_id);
 return v_id;
end $$;

create function public.freelance_hq_hosting_review_submission(p_actor uuid,p_id uuid,p_approve boolean)
returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare s freelance_hq_hosting_payment_submissions; i freelance_hq_hosting_invoices; v_id uuid;
begin
 perform freelance_hq_hosting_assert_admin(p_actor);
 select * into strict s from freelance_hq_hosting_payment_submissions where id=p_id for update;
 if s.status='approved' then return s.payment_id; end if;
 if s.status<>'pending' then raise exception 'Submission already reviewed'; end if;
 if p_approve then
   select * into strict i from freelance_hq_hosting_invoices where id=s.invoice_id;
   v_id:=freelance_hq_hosting_record_payment(p_actor,jsonb_build_object('invoice_id',i.id,'amount_minor',s.amount_minor,'currency',i.currency,
   'direction','incoming','method','bank_transfer','reference',s.reference,'paid_on',(now() at time zone 'Asia/Karachi')::date,'idempotency_key',s.id));
 end if;
 update freelance_hq_hosting_payment_submissions set status=case when p_approve then 'approved' else 'rejected' end,reviewed_by=p_actor,payment_id=v_id where id=p_id;
 insert into freelance_hq_hosting_audit_logs(actor_id,event,entity,entity_id) values(p_actor,'payment_submission_reviewed','payment_submissions',p_id);
 return v_id;
end $$;

create function public.freelance_hq_hosting_cancel_invoice(p_actor uuid,p_id uuid)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_row freelance_hq_hosting_invoices;
begin
 perform freelance_hq_hosting_assert_admin(p_actor);
 select * into strict v_row from freelance_hq_hosting_invoices where id=p_id for update;
 if exists(select 1 from freelance_hq_hosting_payments where invoice_id=p_id) then raise exception 'An invoice with payment history cannot be cancelled'; end if;
 update freelance_hq_hosting_invoices set status='cancelled' where id=p_id;
 insert into freelance_hq_hosting_audit_logs(actor_id,event,entity,entity_id) values(p_actor,'invoice_cancelled','invoices',p_id);
end $$;

create function public.freelance_hq_hosting_run_renewals(p_actor uuid default null)
returns integer language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_actor uuid; v_settings freelance_hq_hosting_settings; s freelance_hq_hosting_services; n integer:=0; v_id uuid; v_date date;
begin
 select * into strict v_settings from freelance_hq_hosting_settings where id;
 if p_actor is null and not v_settings.renewal_automation then return 0; end if;
 v_actor:=coalesce(p_actor,v_settings.automation_actor);
 perform freelance_hq_hosting_assert_admin(v_actor);
 perform pg_advisory_xact_lock(hashtextextended('freelance_hq_hosting_renewals',0));
 v_date:=(now() at time zone 'Asia/Karachi')::date;
 for s in select services.* from freelance_hq_hosting_services services join freelance_hq_hosting_clients clients on clients.id=services.client_id
 where services.status='active' and clients.status='active' and services.auto_invoice and services.price_minor>0
 and services.billing_cycle<>'one_time' and services.next_due_date<=v_date+v_settings.renewal_lead_days
 and not exists(select 1 from freelance_hq_hosting_invoices i where i.service_id=services.id and i.period_start=services.next_due_date)
 order by services.id for update of services
 loop
   v_id:=freelance_hq_hosting_create_invoice(v_actor,jsonb_build_object('client_id',s.client_id,'service_id',s.id,'currency',s.currency,
   'issued_on',v_date,'due_on',s.next_due_date,'period_start',s.next_due_date,'idempotency_key',gen_random_uuid()),
   jsonb_build_array(jsonb_build_object('description',s.name||' — renewal '||s.next_due_date,'quantity',1,'unit_minor',s.price_minor)));
   n:=n+1;
 end loop;
 return n;
end $$;

create function public.freelance_hq_hosting_finance_summary(p_actor uuid,p_start date,p_end date)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 perform freelance_hq_hosting_assert_admin(p_actor);
 return jsonb_build_object(
 'cash',(select coalesce(jsonb_agg(x),'[]') from (select currency,
 coalesce(sum(amount_minor) filter(where direction='incoming'),0) incoming_minor,
 coalesce(sum(amount_minor) filter(where direction='refund'),0) refunds_minor
 from freelance_hq_hosting_payments where paid_on between p_start and p_end group by currency) x),
 'expenses',(select coalesce(jsonb_agg(x),'[]') from (select currency,sum(amount_minor) expense_minor from freelance_hq_hosting_expenses where incurred_on between p_start and p_end group by currency) x),
 'outstanding',(select coalesce(jsonb_agg(x),'[]') from (select i.currency,sum(i.total_minor-coalesce(p.net,0)) outstanding_minor from freelance_hq_hosting_invoices i
 left join (select invoice_id,sum(case direction when 'incoming' then amount_minor else -amount_minor end) net from freelance_hq_hosting_payments group by invoice_id) p on p.invoice_id=i.id
 where i.status='issued' group by i.currency) x));
end $$;

create function public.freelance_hq_hosting_protect_audit()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Hosting audit records are append-only'; end $$;
create trigger hosting_audit_immutable before update or delete on public.freelance_hq_hosting_audit_logs for each row execute function public.freelance_hq_hosting_protect_audit();

-- Deny all browser execution; only verified server actions use these RPCs.
revoke all on function public.freelance_hq_hosting_assert_admin(uuid) from public,anon,authenticated;
revoke all on function public.freelance_hq_hosting_next_due(date,text) from public,anon,authenticated;
revoke all on function public.freelance_hq_hosting_create_invoice(uuid,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.freelance_hq_hosting_record_payment(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.freelance_hq_hosting_review_submission(uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function public.freelance_hq_hosting_cancel_invoice(uuid,uuid) from public,anon,authenticated;
revoke all on function public.freelance_hq_hosting_run_renewals(uuid) from public,anon,authenticated;
revoke all on function public.freelance_hq_hosting_finance_summary(uuid,date,date) from public,anon,authenticated;
revoke all on function public.freelance_hq_hosting_protect_audit() from public,anon,authenticated;
grant execute on function public.freelance_hq_hosting_assert_admin(uuid),public.freelance_hq_hosting_next_due(date,text),public.freelance_hq_hosting_create_invoice(uuid,jsonb,jsonb),public.freelance_hq_hosting_record_payment(uuid,jsonb),public.freelance_hq_hosting_review_submission(uuid,uuid,boolean),public.freelance_hq_hosting_cancel_invoice(uuid,uuid),public.freelance_hq_hosting_run_renewals(uuid),public.freelance_hq_hosting_finance_summary(uuid,date,date) to service_role;

create function public.freelance_hq_hosting_save_package(p_actor uuid,p_id uuid,p_data jsonb,p_servers jsonb)
returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 perform freelance_hq_hosting_assert_admin(p_actor);
 if jsonb_typeof(p_servers)<>'array' or jsonb_array_length(p_servers)>100 then raise exception 'Invalid package servers'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,2));
 insert into freelance_hq_hosting_packages(id,name,description,price_minor,currency,billing_cycle,disk_mb,inode_limit,memory_mb,cpu_percent,domain_limit,email_limit,is_active)
 values(p_id,p_data->>'name',p_data->>'description',(p_data->>'price_minor')::bigint,p_data->>'currency',p_data->>'billing_cycle',(p_data->>'disk_mb')::bigint,
 (p_data->>'inode_limit')::bigint,(p_data->>'memory_mb')::integer,(p_data->>'cpu_percent')::integer,(p_data->>'domain_limit')::integer,(p_data->>'email_limit')::integer,(p_data->>'is_active')::boolean)
 on conflict(id) do update set name=excluded.name,description=excluded.description,price_minor=excluded.price_minor,currency=excluded.currency,billing_cycle=excluded.billing_cycle,
 disk_mb=excluded.disk_mb,inode_limit=excluded.inode_limit,memory_mb=excluded.memory_mb,cpu_percent=excluded.cpu_percent,domain_limit=excluded.domain_limit,email_limit=excluded.email_limit,is_active=excluded.is_active;
 delete from freelance_hq_hosting_package_servers where package_id=p_id and server_id not in(select value::uuid from jsonb_array_elements_text(p_servers));
 insert into freelance_hq_hosting_package_servers(package_id,server_id) select p_id,value::uuid from jsonb_array_elements_text(p_servers) on conflict do nothing;
 insert into freelance_hq_hosting_audit_logs(actor_id,event,entity,entity_id) values(p_actor,'package_saved','packages',p_id);
 return p_id;
end $$;

create function public.freelance_hq_hosting_client_ticket(p_user uuid,p_client uuid,p_service uuid,p_subject text,p_body text,p_priority text,p_key uuid)
returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_id uuid;
begin
 if not exists(select 1 from freelance_hq_hosting_client_access a join auth.users u on u.id=p_user
 join freelance_hq_hosting_clients c on c.id=a.client_id
 where a.client_id=p_client and a.enabled and c.status<>'closed' and u.email_confirmed_at is not null
 and a.email=lower(u.email) and (a.auth_user_id is null or a.auth_user_id=p_user)) then raise exception 'Client access denied'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_key::text,3));
 select id into v_id from freelance_hq_hosting_tickets where idempotency_key=p_key and client_id=p_client;
 if v_id is not null then return v_id; end if;
 insert into freelance_hq_hosting_tickets(client_id,service_id,subject,priority,idempotency_key) values(p_client,p_service,p_subject,p_priority,p_key) returning id into v_id;
 insert into freelance_hq_hosting_ticket_messages(ticket_id,body,author_role,author_id,idempotency_key) values(v_id,p_body,'client',p_user,p_key);
 insert into freelance_hq_hosting_audit_logs(actor_id,event,entity,entity_id) values(p_user,'ticket_opened','tickets',v_id);
 return v_id;
end $$;
revoke all on function public.freelance_hq_hosting_save_package(uuid,uuid,jsonb,jsonb),public.freelance_hq_hosting_client_ticket(uuid,uuid,uuid,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.freelance_hq_hosting_save_package(uuid,uuid,jsonb,jsonb),public.freelance_hq_hosting_client_ticket(uuid,uuid,uuid,text,text,text,uuid) to service_role;

-- Full client totals are calculated in Postgres, without REST row-limit truncation.
create function public.freelance_hq_hosting_client_summary(p_user uuid,p_client uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from freelance_hq_hosting_client_access a join auth.users u on u.id=p_user
 join freelance_hq_hosting_clients c on c.id=a.client_id
 where a.client_id=p_client and a.enabled and c.status<>'closed' and u.email_confirmed_at is not null
 and a.email=lower(u.email) and (a.auth_user_id is null or a.auth_user_id=p_user)) then raise exception 'Client access denied'; end if;
 return jsonb_build_object('services',(select count(*) from freelance_hq_hosting_services where client_id=p_client),
 'tickets',(select count(*) from freelance_hq_hosting_tickets where client_id=p_client and status in ('open','pending_customer')),
 'outstanding',(select coalesce(jsonb_agg(x),'[]') from (select i.currency,sum(i.total_minor-coalesce(p.net,0)) outstanding_minor
 from freelance_hq_hosting_invoices i left join (select invoice_id,sum(case direction when 'incoming' then amount_minor else -amount_minor end) net
 from freelance_hq_hosting_payments where client_id=p_client group by invoice_id) p on p.invoice_id=i.id
 where i.client_id=p_client and i.status='issued' group by i.currency having sum(i.total_minor-coalesce(p.net,0))>0) x));
end $$;
revoke all on function public.freelance_hq_hosting_client_summary(uuid,uuid) from public,anon,authenticated;
grant execute on function public.freelance_hq_hosting_client_summary(uuid,uuid) to service_role;

