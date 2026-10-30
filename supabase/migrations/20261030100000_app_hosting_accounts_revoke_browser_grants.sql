-- Applied to production right after 20261030090000 (read-back showed Supabase default privileges had granted the browser roles table access).
-- Row-level security already denied every row; this removes the grants as well, so the new tables are service_role only, as documented.
revoke all on public.freelance_hq_hosting_accounts, public.freelance_hq_hosting_account_sites from anon, authenticated, public;
grant select, insert, update on public.freelance_hq_hosting_accounts, public.freelance_hq_hosting_account_sites to service_role;
