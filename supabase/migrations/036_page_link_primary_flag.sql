-- Incremental migration. Safe to run once in the SQL Editor.
--
-- Lets one of a page's linked keywords be marked its primary keyword; every
-- other linked keyword is automatically that page's secondary keywords —
-- no separate list to maintain. The partial unique index enforces at most
-- one primary keyword per page at the database level.

alter table freelance_hq_keyword_page_links
  add column if not exists is_primary boolean not null default false;

create unique index if not exists freelance_hq_keyword_page_links_primary_idx
  on freelance_hq_keyword_page_links (page_id)
  where is_primary;
