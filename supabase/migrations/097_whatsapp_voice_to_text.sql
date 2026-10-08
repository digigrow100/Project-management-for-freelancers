-- Voice-note processing jobs for the WhatsApp bridge.
-- Audio is never exposed in the app UI: the job keeps the raw transcript for
-- audit/retry purposes while the normal WhatsApp message row stores only the
-- final meaningful Roman Urdu text.

create table if not exists public.freelance_hq_whatsapp_audio_jobs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.freelance_hq_clients(id) on delete cascade,
  bridge_id uuid references public.freelance_hq_whatsapp_bridge_devices(id) on delete set null,
  remote_message_key text not null,
  received_at timestamptz not null,
  mime_type text not null default '',
  byte_size integer not null default 0,
  status text not null default 'processing'
    check (status in ('processing','done','failed')),
  attempts integer not null default 1,
  raw_transcript text not null default '',
  detected_language text not null default '',
  final_text text not null default '',
  message_id uuid references public.freelance_hq_whatsapp_messages(id) on delete set null,
  error_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (client_id, remote_message_key)
);

create index if not exists fhq_wa_audio_jobs_status_idx
  on public.freelance_hq_whatsapp_audio_jobs(status, updated_at desc);

alter table public.freelance_hq_whatsapp_audio_jobs enable row level security;
revoke all on table public.freelance_hq_whatsapp_audio_jobs from anon, authenticated;
grant all on table public.freelance_hq_whatsapp_audio_jobs to service_role;
