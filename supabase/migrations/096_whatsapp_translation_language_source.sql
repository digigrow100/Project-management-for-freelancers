-- Track which latest inbound message established the active client language.
-- This prevents outbound/team messages from accidentally changing the target
-- language and lets the app re-detect only when a newer inbound message arrives.

alter table public.freelance_hq_whatsapp_translation_settings
  add column if not exists language_source_message_id uuid
  references public.freelance_hq_whatsapp_messages(id) on delete set null;
