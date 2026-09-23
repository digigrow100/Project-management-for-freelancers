-- Incremental migration. Safe to run once in the SQL Editor.
--
-- Phase 4. A client's subscription to a catalog Service, optionally linked
-- to the Project it's delivered through (informational — a client can be
-- subscribed before any project exists). price/currency/billing_frequency
-- are copied from the service at subscribe-time so later catalog price
-- changes don't retroactively alter what an existing client is billed.
-- next_invoice_date drives on-demand recurring draft generation; null means
-- not scheduled for auto-drafting.

create table if not exists freelance_hq_client_services (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references freelance_hq_clients (id) on delete cascade,
  service_id uuid not null references freelance_hq_services (id) on delete restrict,
  project_id uuid references freelance_hq_projects (id) on delete set null,
  price_override numeric,
  currency text not null default 'PKR',
  billing_frequency text not null default 'monthly'
    check (billing_frequency in ('one_time', 'monthly', 'quarterly', 'yearly')),
  status text not null default 'active' check (status in ('active', 'paused', 'cancelled')),
  next_invoice_date date,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists freelance_hq_client_services_client_id_idx on freelance_hq_client_services (client_id);
create index if not exists freelance_hq_client_services_project_id_idx on freelance_hq_client_services (project_id);
create index if not exists freelance_hq_client_services_next_invoice_date_idx on freelance_hq_client_services (next_invoice_date);

alter table freelance_hq_client_services enable row level security;
