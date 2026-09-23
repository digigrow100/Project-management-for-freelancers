-- Incremental migration. Safe to run once in the SQL Editor.
--
-- Competitor backlink intel: not your asset (no login concept at all),
-- so it's not part of the credential vault table. Optionally links to an
-- existing On-Page page as the intended target — reuses freelance_hq_keyword_pages
-- rather than introducing a second "target page" concept.

create table if not exists freelance_hq_competitor_backlinks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references freelance_hq_projects (id) on delete cascade,
  competitor_url text not null,
  source_backlink_url text not null default '',
  opportunity_notes text not null default '',
  target_page_id uuid references freelance_hq_keyword_pages (id) on delete set null,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists freelance_hq_competitor_backlinks_project_id_idx on freelance_hq_competitor_backlinks (project_id);

alter table freelance_hq_competitor_backlinks enable row level security;
