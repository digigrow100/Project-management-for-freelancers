create table if not exists public.freelance_hq_whatsapp_admin_chats (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.freelance_hq_profiles(id) on delete cascade,
  chat_key text not null,
  chat_label text not null default '',
  phone text not null default '',
  secondary text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, chat_key)
);

create index if not exists fhq_wa_admin_chats_owner_idx
  on public.freelance_hq_whatsapp_admin_chats(owner_user_id, updated_at desc);

alter table public.freelance_hq_whatsapp_admin_chats enable row level security;
revoke all on table public.freelance_hq_whatsapp_admin_chats from anon, authenticated;
grant all on table public.freelance_hq_whatsapp_admin_chats to service_role;
