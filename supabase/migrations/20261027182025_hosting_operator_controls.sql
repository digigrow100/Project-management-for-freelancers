-- Prepared locally only. Do not apply to production without owner approval.
begin;
alter table public.freelance_hq_hosting_jobs drop constraint freelance_hq_hosting_jobs_kind_check;
alter table public.freelance_hq_hosting_jobs add constraint freelance_hq_hosting_jobs_kind_check
 check (kind in ('provision','suspend','resume','cancel','deploy','rollback','configure'));
alter table public.freelance_hq_hosting_operator_deliveries drop constraint freelance_hq_hosting_operator_deliveries_body_check;
alter table public.freelance_hq_hosting_operator_deliveries add constraint freelance_hq_hosting_operator_deliveries_body_check
 check(octet_length(body)<=131072);
commit;
