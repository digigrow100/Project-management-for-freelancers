alter table public.freelance_hq_invoices
  add column if not exists quotation_text text not null default '',
  add column if not exists terms_and_conditions text not null default '';
