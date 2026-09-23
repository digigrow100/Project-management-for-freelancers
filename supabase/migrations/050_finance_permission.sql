-- Incremental migration. Safe to run once in the SQL Editor.
--
-- Phase 4. Finance access permission, same pattern as
-- 027_member_renewals_access.sql and 042_backlink_credential_permission.sql.
-- Admins always have access; members default to false.

alter table freelance_hq_profiles
  add column if not exists can_access_finance boolean not null default false;
