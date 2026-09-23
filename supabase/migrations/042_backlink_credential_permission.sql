-- Incremental migration. Safe to run once in the SQL Editor.
--
-- Phase 3 of the SEO workflow redesign (Off-Page CRM). Backlink credential
-- reveal is currently gated only by a member's own vault password once
-- they're on the project — this adds a real permission an admin must grant,
-- same pattern as 027_member_renewals_access.sql. Admins always have
-- access; members default to false.

alter table freelance_hq_profiles
  add column if not exists can_access_backlink_credentials boolean not null default false;
