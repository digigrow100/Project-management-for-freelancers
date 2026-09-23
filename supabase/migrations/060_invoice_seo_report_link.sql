-- Incremental migration. Safe to run once in the SQL Editor.
--
-- Optional link from an invoice to the SEO report it was sent alongside.
-- Nullable and additive — an invoice can exist without a report, and every
-- existing invoice row keeps seo_report_id = null.

alter table freelance_hq_invoices
  add column if not exists seo_report_id uuid references freelance_hq_seo_reports (id) on delete set null;

create index if not exists freelance_hq_invoices_seo_report_id_idx on freelance_hq_invoices (seo_report_id);
