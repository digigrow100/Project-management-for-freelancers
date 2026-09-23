-- Incremental migration. Safe to run once in the SQL Editor.
--
-- Guest Post / Outreach CRM: a pipeline of prospects, most of whom never
-- get credentials (you're not logged into a site that hasn't accepted you
-- yet) — kept separate from freelance_hq_backlink_entries rather than
-- cramming contact/DR-DA/pricing/follow-up fields into the credential
-- vault table.

create type freelance_hq_outreach_status as enum
  ('prospect_found', 'contacted', 'follow_up_1', 'follow_up_2', 'accepted', 'article_sent', 'published', 'live');

create table if not exists freelance_hq_outreach_prospects (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references freelance_hq_projects (id) on delete cascade,
  website text not null,
  contact_person text not null default '',
  contact_email text not null default '',
  dr_da integer,
  price numeric,
  contact_date date,
  last_follow_up date,
  next_follow_up date,
  response text not null default '',
  status freelance_hq_outreach_status not null default 'prospect_found',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists freelance_hq_outreach_prospects_project_id_idx on freelance_hq_outreach_prospects (project_id);

alter table freelance_hq_outreach_prospects enable row level security;
