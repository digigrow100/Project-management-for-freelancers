-- Incremental migration. Safe to run once in the SQL Editor.
--
-- Phase 4. Reusable service/package catalog (e.g. "SEO Monthly Retainer",
-- "Website Development"). Not client- or project-specific — clients
-- subscribe to a service via freelance_hq_client_services (next migration).

create table if not exists freelance_hq_services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  price numeric not null default 0,
  currency text not null default 'PKR',
  billing_frequency text not null default 'monthly'
    check (billing_frequency in ('one_time', 'monthly', 'quarterly', 'yearly')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table freelance_hq_services enable row level security;
