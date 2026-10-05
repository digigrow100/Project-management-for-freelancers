-- Secure server-only admin/invoice tables exposed through public schema.
-- App data access uses the server-side service_role client; anon is auth-only.

alter table public.freelance_hq_invoice_counters enable row level security;
alter table public.freelance_hq_admin_work_items enable row level security;
alter table public.freelance_hq_admin_workflow_settings enable row level security;

revoke all on table public.freelance_hq_invoice_counters from anon, authenticated;
revoke all on table public.freelance_hq_admin_work_items from anon, authenticated;
revoke all on table public.freelance_hq_admin_workflow_settings from anon, authenticated;

grant select, insert, update, delete, references, trigger, truncate
  on table public.freelance_hq_invoice_counters,
           public.freelance_hq_admin_work_items,
           public.freelance_hq_admin_workflow_settings
  to service_role;
