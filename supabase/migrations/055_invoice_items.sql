-- Incremental migration. Safe to run once in the SQL Editor.
--
-- Phase 4. Invoice line items (e.g. "SEO Monthly Package", qty 1, £500).
-- Cascades with the invoice since an item is meaningless without it.

create table if not exists freelance_hq_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references freelance_hq_invoices (id) on delete cascade,
  description text not null default '',
  quantity numeric not null default 1,
  unit_price numeric not null default 0,
  "order" integer not null default 0
);

create index if not exists freelance_hq_invoice_items_invoice_id_idx on freelance_hq_invoice_items (invoice_id, "order");

alter table freelance_hq_invoice_items enable row level security;
