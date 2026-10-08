create table if not exists public.freelance_hq_seo_module_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.freelance_hq_projects(id) on delete cascade,
  module text not null check (module in (
    'website_pages',
    'full_website',
    'social_media',
    'local_listing',
    'blog_onsite',
    'web_2_0',
    'guest_blogging',
    'recurring',
    'reporting'
  )),
  assigned_to uuid not null references public.freelance_hq_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, module)
);

create index if not exists freelance_hq_seo_module_assignments_member_idx
  on public.freelance_hq_seo_module_assignments(assigned_to, project_id);

alter table public.freelance_hq_seo_module_assignments enable row level security;
