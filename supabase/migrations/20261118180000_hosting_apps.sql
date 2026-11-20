-- Apps deployed by the Contabo hosting agent. Browser roles have no access.
-- The agent token itself is never stored here: only its SHA-256 hash.

create table public.freelance_hq_hosting_apps (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  display_name text not null,
  client_id uuid references public.freelance_hq_hosting_clients(id) on delete set null,
  framework text not null,
  source_kind text not null,
  source_url text not null,
  git_ref text,
  git_token_encrypted text,
  dockerfile_path text,
  port integer not null,
  cpu numeric not null,
  memory_mb integer not null,
  www_redirect text not null default 'none',
  status text not null default 'pending',
  last_error text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hosting_apps_name_check check (name ~ '^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$'),
  constraint hosting_apps_framework_check check (framework in ('nextjs','react','vue','nuxt','node','static','dockerfile','image')),
  constraint hosting_apps_source_check check (source_kind in ('git','image')),
  constraint hosting_apps_status_check check (status in ('pending','building','running','stopped','failed','deleting')),
  constraint hosting_apps_redirect_check check (www_redirect in ('none','www_to_apex','apex_to_www')),
  constraint hosting_apps_port_check check (port between 1 and 65535),
  constraint hosting_apps_cpu_check check (cpu >= 0.1 and cpu <= 4),
  constraint hosting_apps_memory_check check (memory_mb between 128 and 8192),
  constraint hosting_apps_display_check check (char_length(display_name) between 1 and 80)
);

create table public.freelance_hq_hosting_deployments (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.freelance_hq_hosting_apps(id) on delete cascade,
  status text not null,
  trigger text not null default 'manual',
  image_ref text,
  log_excerpt text,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint hosting_deployments_status_check check (status in ('queued','building','succeeded','failed'))
);

create table public.freelance_hq_hosting_app_domains (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.freelance_hq_hosting_apps(id) on delete cascade,
  hostname text not null unique,
  verification_token text not null,
  is_primary boolean not null default false,
  status text not null default 'pending_dns',
  detail text,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint hosting_app_domains_status_check check (status in ('pending_dns','verifying','issuing_ssl','active','error')),
  constraint hosting_app_domains_token_check check (verification_token ~ '^[a-f0-9]{32,64}$')
);

create table public.freelance_hq_hosting_app_env (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.freelance_hq_hosting_apps(id) on delete cascade,
  name text not null,
  value_encrypted text not null,
  updated_at timestamptz not null default now(),
  unique (app_id, name),
  constraint hosting_app_env_name_check check (name ~ '^[A-Z_][A-Z0-9_]{0,63}$')
);

create table public.freelance_hq_hosting_agent_config (
  id boolean primary key default true check (id),
  token_sha256 text,
  signing_public_key text,
  agent_host text,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  constraint hosting_agent_token_hash_check check (token_sha256 is null or token_sha256 ~ '^[a-f0-9]{64}$')
);

alter table public.freelance_hq_hosting_apps enable row level security;
alter table public.freelance_hq_hosting_deployments enable row level security;
alter table public.freelance_hq_hosting_app_domains enable row level security;
alter table public.freelance_hq_hosting_app_env enable row level security;
alter table public.freelance_hq_hosting_agent_config enable row level security;

revoke all on public.freelance_hq_hosting_apps, public.freelance_hq_hosting_deployments, public.freelance_hq_hosting_app_domains, public.freelance_hq_hosting_app_env, public.freelance_hq_hosting_agent_config from public, anon, authenticated;
grant select, insert, update, delete on public.freelance_hq_hosting_apps, public.freelance_hq_hosting_deployments, public.freelance_hq_hosting_app_domains, public.freelance_hq_hosting_app_env, public.freelance_hq_hosting_agent_config to service_role;

create index freelance_hq_hosting_apps_client_idx on public.freelance_hq_hosting_apps(client_id);
create index freelance_hq_hosting_deployments_app_idx on public.freelance_hq_hosting_deployments(app_id, created_at desc);
create index freelance_hq_hosting_app_domains_app_idx on public.freelance_hq_hosting_app_domains(app_id);
