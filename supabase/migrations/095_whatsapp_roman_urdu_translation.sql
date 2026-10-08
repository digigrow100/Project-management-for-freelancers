-- Optional AI translation for WhatsApp client chats.
-- Translation is OFF by default. Once enabled for a client, cached Roman Urdu
-- versions are reused so polling does not repeatedly consume AI API resources.

create table if not exists public.freelance_hq_whatsapp_translation_settings (
  client_id uuid primary key references public.freelance_hq_clients(id) on delete cascade,
  enabled boolean not null default false,
  detected_language text not null default '',
  updated_by uuid references public.freelance_hq_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.freelance_hq_whatsapp_message_translations (
  message_id uuid primary key references public.freelance_hq_whatsapp_messages(id) on delete cascade,
  client_id uuid not null references public.freelance_hq_clients(id) on delete cascade,
  roman_urdu text not null default '',
  source_language text not null default '',
  explanation text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fhq_wa_message_translations_client_idx
  on public.freelance_hq_whatsapp_message_translations(client_id, updated_at desc);

alter table public.freelance_hq_whatsapp_translation_settings enable row level security;
alter table public.freelance_hq_whatsapp_message_translations enable row level security;

revoke all on table public.freelance_hq_whatsapp_translation_settings from anon, authenticated;
revoke all on table public.freelance_hq_whatsapp_message_translations from anon, authenticated;

grant all on table public.freelance_hq_whatsapp_translation_settings to service_role;
grant all on table public.freelance_hq_whatsapp_message_translations to service_role;
