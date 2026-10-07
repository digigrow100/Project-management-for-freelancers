drop index if exists public.fhq_wa_messages_remote_unique;

alter table public.freelance_hq_whatsapp_messages
  drop constraint if exists freelance_hq_whatsapp_messages_client_remote_key_unique;

alter table public.freelance_hq_whatsapp_messages
  add constraint freelance_hq_whatsapp_messages_client_remote_key_unique
  unique (client_id, remote_message_key);
