-- Incremental migration. Safe to run once in the SQL Editor.
--
-- Phase 4. Invoices, billed against a client (never orphaned — restrict
-- delete rather than cascade, so removing a client with billing history
-- fails loudly instead of silently losing invoices). project_id and
-- client_service_id are informational/nullable: an invoice can exist without
-- either (a one-off, ad-hoc invoice), or be traced back to the project and
-- recurring subscription it was generated from.

create table if not exists freelance_hq_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  client_id uuid not null references freelance_hq_clients (id) on delete restrict,
  project_id uuid references freelance_hq_projects (id) on delete set null,
  client_service_id uuid references freelance_hq_client_services (id) on delete set null,
  currency text not null default 'PKR',
  issue_date date not null default current_date,
  due_date date not null default current_date,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'paid', 'partially_paid', 'overdue', 'cancelled')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists freelance_hq_invoices_client_id_idx on freelance_hq_invoices (client_id);
create index if not exists freelance_hq_invoices_project_id_idx on freelance_hq_invoices (project_id);
create index if not exists freelance_hq_invoices_status_idx on freelance_hq_invoices (status);
create index if not exists freelance_hq_invoices_due_date_idx on freelance_hq_invoices (due_date);

alter table freelance_hq_invoices enable row level security;
