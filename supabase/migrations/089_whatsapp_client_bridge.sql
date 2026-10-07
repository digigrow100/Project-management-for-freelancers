-- WhatsApp Web bridge for controlled client/team messaging.
-- Server-only architecture: all tables use RLS with anon/authenticated access revoked.

create table if not exists public.freelance_hq_whatsapp_bridge_pairing_tokens (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.freelance_hq_profiles(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists fhq_wa_bridge_pairing_created_by_idx
  on public.freelance_hq_whatsapp_bridge_pairing_tokens(created_by, created_at desc);

create table if not exists public.freelance_hq_whatsapp_bridge_devices (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.freelance_hq_profiles(id) on delete cascade,
  device_id text not null,
  extension_install_id text not null unique,
  token_hash text not null unique,
  device_label text not null default '',
  user_agent text not null default '',
  paired_at timestamptz not null default now(),
  token_expires_at timestamptz not null,
  token_rotated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_health_at timestamptz,
  whatsapp_ready boolean not null default false,
  current_state text not null default 'offline'
    check (current_state in ('online','offline','auth_required','error')),
  last_error text not null default '',
  revoked_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists fhq_wa_bridge_devices_owner_idx
  on public.freelance_hq_whatsapp_bridge_devices(owner_user_id, last_seen_at desc);

create table if not exists public.freelance_hq_whatsapp_client_links (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references public.freelance_hq_clients(id) on delete cascade,
  chat_key text not null default '',
  chat_label text not null default '',
  phone text not null default '',
  is_enabled boolean not null default true,
  created_by uuid references public.freelance_hq_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fhq_wa_client_links_enabled_idx
  on public.freelance_hq_whatsapp_client_links(is_enabled, updated_at desc);

create table if not exists public.freelance_hq_whatsapp_chat_access (
  client_id uuid not null references public.freelance_hq_clients(id) on delete cascade,
  user_id uuid not null references public.freelance_hq_profiles(id) on delete cascade,
  can_send boolean not null default true,
  granted_by uuid references public.freelance_hq_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (client_id, user_id)
);

create index if not exists fhq_wa_chat_access_user_idx
  on public.freelance_hq_whatsapp_chat_access(user_id, client_id);

create table if not exists public.freelance_hq_whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.freelance_hq_clients(id) on delete cascade,
  direction text not null check (direction in ('inbound','outbound')),
  body text not null,
  status text not null default 'queued'
    check (status in ('queued','sending','sent','failed','received')),
  sender_user_id uuid references public.freelance_hq_profiles(id) on delete set null,
  bridge_id uuid references public.freelance_hq_whatsapp_bridge_devices(id) on delete set null,
  remote_message_key text,
  remote_timestamp timestamptz,
  error_text text not null default '',
  claimed_at timestamptz,
  sent_at timestamptz,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fhq_wa_messages_client_created_idx
  on public.freelance_hq_whatsapp_messages(client_id, created_at desc);
create index if not exists fhq_wa_messages_outbox_idx
  on public.freelance_hq_whatsapp_messages(status, created_at)
  where direction='outbound';

create unique index if not exists fhq_wa_messages_remote_unique
  on public.freelance_hq_whatsapp_messages(client_id, remote_message_key)
  where remote_message_key is not null and remote_message_key <> '';

alter table public.freelance_hq_whatsapp_bridge_pairing_tokens enable row level security;
alter table public.freelance_hq_whatsapp_bridge_devices enable row level security;
alter table public.freelance_hq_whatsapp_client_links enable row level security;
alter table public.freelance_hq_whatsapp_chat_access enable row level security;
alter table public.freelance_hq_whatsapp_messages enable row level security;

revoke all on table public.freelance_hq_whatsapp_bridge_pairing_tokens from anon, authenticated;
revoke all on table public.freelance_hq_whatsapp_bridge_devices from anon, authenticated;
revoke all on table public.freelance_hq_whatsapp_client_links from anon, authenticated;
revoke all on table public.freelance_hq_whatsapp_chat_access from anon, authenticated;
revoke all on table public.freelance_hq_whatsapp_messages from anon, authenticated;

grant all on table public.freelance_hq_whatsapp_bridge_pairing_tokens to service_role;
grant all on table public.freelance_hq_whatsapp_bridge_devices to service_role;
grant all on table public.freelance_hq_whatsapp_client_links to service_role;
grant all on table public.freelance_hq_whatsapp_chat_access to service_role;
grant all on table public.freelance_hq_whatsapp_messages to service_role;
