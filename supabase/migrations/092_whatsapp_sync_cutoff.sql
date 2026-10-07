-- Prevent newly mapped chats from backfilling old WhatsApp messages during background sync.
-- Older history is imported only when the admin explicitly requests a date/day.

alter table public.freelance_hq_whatsapp_client_links
  add column if not exists sync_from timestamptz not null default now();
