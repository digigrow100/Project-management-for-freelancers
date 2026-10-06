-- Lightweight browser presence for team members.
create table if not exists public.freelance_hq_member_presence (
  user_id uuid primary key references public.freelance_hq_profiles(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.freelance_hq_member_presence enable row level security;

revoke all on table public.freelance_hq_member_presence from anon, authenticated;
grant select, insert, update, delete on table public.freelance_hq_member_presence to service_role;

create index if not exists freelance_hq_member_presence_last_seen_idx
  on public.freelance_hq_member_presence(last_seen_at desc);
