-- Incremental migration. Safe to run once in the SQL Editor.
--
-- Phase 4. Backs sequential, future-friendly invoice numbering
-- (INV-YYYY-001). Kept as its own counter table rather than a hardcoded
-- format string in application code, so the numbering scheme (padding,
-- prefix, per-year reset) can change later without touching historical
-- invoice_number values already stored on freelance_hq_invoices.

create table if not exists freelance_hq_invoice_counters (
  year integer primary key,
  last_number integer not null default 0
);
