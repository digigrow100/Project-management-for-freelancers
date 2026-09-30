alter table public.freelance_hq_seo_workflow_items
  add column if not exists login_method text not null default '',
  add column if not exists login_email text not null default '',
  add column if not exists username text not null default '',
  add column if not exists password_encrypted text,
  add column if not exists profile_url text not null default '',
  add column if not exists notes text not null default '',
  add column if not exists verification_status text not null default '',
  add column if not exists contact_name text not null default '',
  add column if not exists contact_email text not null default '',
  add column if not exists outreach_status text not null default '',
  add column if not exists price numeric,
  add column if not exists currency text not null default 'GBP',
  add column if not exists payment_status text not null default '',
  add column if not exists approval_status text not null default '';

alter table public.freelance_hq_seo_workflow_items
  drop constraint if exists freelance_hq_seo_workflow_items_login_method_check;
alter table public.freelance_hq_seo_workflow_items
  add constraint freelance_hq_seo_workflow_items_login_method_check
  check (login_method in ('','email_password','google','facebook','apple','other'));

alter table public.freelance_hq_seo_workflow_items
  drop constraint if exists freelance_hq_seo_workflow_items_verification_status_check;
alter table public.freelance_hq_seo_workflow_items
  add constraint freelance_hq_seo_workflow_items_verification_status_check
  check (verification_status in ('','not_started','pending','verified','rejected'));

alter table public.freelance_hq_seo_workflow_items
  drop constraint if exists freelance_hq_seo_workflow_items_outreach_status_check;
alter table public.freelance_hq_seo_workflow_items
  add constraint freelance_hq_seo_workflow_items_outreach_status_check
  check (outreach_status in ('','not_contacted','contacted','replied','negotiating','approved','rejected'));

alter table public.freelance_hq_seo_workflow_items
  drop constraint if exists freelance_hq_seo_workflow_items_payment_status_check;
alter table public.freelance_hq_seo_workflow_items
  add constraint freelance_hq_seo_workflow_items_payment_status_check
  check (payment_status in ('','not_required','pending','confirmed','paid'));

alter table public.freelance_hq_seo_workflow_items
  drop constraint if exists freelance_hq_seo_workflow_items_approval_status_check;
alter table public.freelance_hq_seo_workflow_items
  add constraint freelance_hq_seo_workflow_items_approval_status_check
  check (approval_status in ('','pending','approved','rejected'));
