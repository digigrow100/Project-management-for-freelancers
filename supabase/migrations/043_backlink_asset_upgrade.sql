-- Incremental migration. Safe to run once in the SQL Editor.
--
-- Upgrades the existing backlink category/entry system into managed SEO
-- assets: a category type (for local citations / web 2.0 / guest posts /
-- outreach / competitor / social / other), a status pipeline, login method,
-- an optional link to an existing keyword (so Web 2.0 "ranking tracking"
-- reuses the Keywords module's rank history instead of duplicating it),
-- an indexed flag, an editable listed-on date, and file attachments
-- (screenshots etc., same jsonb TaskFile[] shape already used on tasks).
--
-- Every new column has a default that preserves existing rows' current
-- behavior exactly — no existing entry's name/url/username/email/
-- password_encrypted/links/notes is touched.

create type freelance_hq_backlink_category_type as enum
  ('local_citation', 'web2', 'guest_post', 'outreach', 'competitor', 'social', 'other');

alter table freelance_hq_backlink_categories
  add column if not exists category_type freelance_hq_backlink_category_type not null default 'other';

-- Backfill: map the 4 default seed category names (see DEFAULT_BACKLINK_CATEGORIES
-- in lib/store.ts) to their real type. Anything custom-named is left as 'other'
-- rather than guessed.
update freelance_hq_backlink_categories set category_type = 'social' where name = 'Social Media Profiles' and category_type = 'other';
update freelance_hq_backlink_categories set category_type = 'local_citation' where name = 'Local Listing Backlinks' and category_type = 'other';
update freelance_hq_backlink_categories set category_type = 'web2' where name = 'Web 2.0 Backlinks' and category_type = 'other';
update freelance_hq_backlink_categories set category_type = 'guest_post' where name = 'Guest Posting' and category_type = 'other';

create type freelance_hq_backlink_status as enum
  ('not_started', 'account_created', 'submitted', 'verification_pending', 'live', 'rejected');
create type freelance_hq_login_method as enum ('email', 'google', 'other');

alter table freelance_hq_backlink_entries
  add column if not exists status freelance_hq_backlink_status not null default 'not_started',
  add column if not exists login_method freelance_hq_login_method not null default 'email',
  add column if not exists keyword_id uuid references freelance_hq_keywords (id) on delete set null,
  add column if not exists indexed boolean,
  add column if not exists listed_on date,
  add column if not exists files jsonb not null default '[]'::jsonb;

create index if not exists freelance_hq_backlink_entries_keyword_id_idx on freelance_hq_backlink_entries (keyword_id);

insert into storage.buckets (id, name, public)
values ('backlink-files', 'backlink-files', true)
on conflict (id) do nothing;
