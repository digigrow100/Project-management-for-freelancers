-- Controlled WhatsApp history sharing and extension request queue.
-- Team members see no old history by default. Admin explicitly shares selected
-- messages/days/ranges, while new conversation activity is visible from grant time.

alter table public.freelance_hq_whatsapp_chat_access
  add column if not exists live_from timestamptz not null default now();

create table if not exists public.freelance_hq_whatsapp_message_shares (
  message_id uuid not null references public.freelance_hq_whatsapp_messages(id) on delete cascade,
  client_id uuid not null references public.freelance_hq_clients(id) on delete cascade,
  user_id uuid not null references public.freelance_hq_profiles(id) on delete cascade,
  shared_by uuid references public.freelance_hq_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index if not exists fhq_wa_message_shares_user_client_idx
  on public.freelance_hq_whatsapp_message_shares(user_id, client_id, created_at desc);

create table if not exists public.freelance_hq_whatsapp_bridge_requests (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.freelance_hq_profiles(id) on delete cascade,
  request_type text not null
    check (request_type in ('scan','list_chats','history','direct_send')),
  query text not null default '',
  chat_key text not null default '',
  chat_label text not null default '',
  phone text not null default '',
  client_id uuid references public.freelance_hq_clients(id) on delete set null,
  date_from timestamptz,
  date_to timestamptz,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued'
    check (status in ('queued','processing','done','failed')),
  result jsonb,
  error_text text not null default '',
  claimed_by uuid references public.freelance_hq_whatsapp_bridge_devices(id) on delete set null,
  claimed_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fhq_wa_bridge_requests_queue_idx
  on public.freelance_hq_whatsapp_bridge_requests(status, created_at)
  where status in ('queued','processing');

alter table public.freelance_hq_whatsapp_message_shares enable row level security;
alter table public.freelance_hq_whatsapp_bridge_requests enable row level security;

revoke all on table public.freelance_hq_whatsapp_message_shares from anon, authenticated;
revoke all on table public.freelance_hq_whatsapp_bridge_requests from anon, authenticated;

grant all on table public.freelance_hq_whatsapp_message_shares to service_role;
grant all on table public.freelance_hq_whatsapp_bridge_requests to service_role;
