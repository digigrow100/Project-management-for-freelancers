-- Incremental migration. Safe to run once in the SQL Editor.
--
-- Adds a business address to clients, so backlink template import can
-- auto-fill the full set of business details (name, phone, email, website,
-- address) into a new asset's notes. The project-level client_details
-- snapshot is jsonb already, so it accepts the new key with no column
-- change there.

alter table freelance_hq_clients add column if not exists address text not null default '';
