-- Incremental migration. Safe to run once in the SQL Editor.
--
-- Phase 4 (Client Management + Finance + Invoices). Adds a website field to
-- clients, matching the address field added in 044.

alter table freelance_hq_clients add column if not exists website text not null default '';
