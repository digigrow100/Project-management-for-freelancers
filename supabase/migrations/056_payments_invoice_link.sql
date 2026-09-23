-- Incremental migration. Safe to run once in the SQL Editor.
--
-- Phase 4. Lets a payment be recorded against a specific invoice instead of
-- only a project. Nullable and additive — every existing payment keeps
-- invoice_id = null and project_id unchanged; the project-level
-- PaymentsCard flow (Phase 1) is completely unaffected.

alter table freelance_hq_payments
  add column if not exists invoice_id uuid references freelance_hq_invoices (id) on delete set null;

create index if not exists freelance_hq_payments_invoice_id_idx on freelance_hq_payments (invoice_id);
