-- Project URLs can be stored separately from project metadata.
-- Supports one primary URL plus optional additional URLs per project.
create table if not exists public.freelance_hq_project_urls (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.freelance_hq_projects(id) on delete cascade,
  url text not null,
  label text not null default 'Primary',
  is_primary boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, url)
);

create index if not exists freelance_hq_project_urls_project_idx
  on public.freelance_hq_project_urls(project_id);

create unique index if not exists freelance_hq_project_urls_one_primary_idx
  on public.freelance_hq_project_urls(project_id)
  where is_primary = true;

alter table public.freelance_hq_project_urls enable row level security;
