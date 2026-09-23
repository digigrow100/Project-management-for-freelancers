-- Incremental migration. Safe to run once in the SQL Editor.
--
-- Backlink templates: a reusable, named set of platforms (e.g. "Local
-- citation pack") that can be imported into any project. Templates NEVER
-- store credentials — only platform_name/category_type/default_url —
-- imported entries always need fresh, client-specific login details.

create table if not exists freelance_hq_backlink_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references freelance_hq_profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table freelance_hq_backlink_templates enable row level security;

create table if not exists freelance_hq_backlink_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references freelance_hq_backlink_templates (id) on delete cascade,
  category_type freelance_hq_backlink_category_type not null default 'other',
  platform_name text not null,
  default_url text not null default '',
  "order" integer not null default 0
);

create index if not exists freelance_hq_backlink_template_items_template_id_idx
  on freelance_hq_backlink_template_items (template_id, "order");

alter table freelance_hq_backlink_template_items enable row level security;
