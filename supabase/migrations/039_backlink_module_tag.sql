-- Incremental migration. Safe to run once in the SQL Editor.
--
-- Off-Page SEO module, structure only (Phase 3 builds the real CRM on top
-- of this): tags backlink categories so they can be shown under the
-- project's Off-Page tab. freelance_hq_backlink_categories/_entries
-- themselves are otherwise untouched.

alter table freelance_hq_backlink_categories
  add column if not exists seo_module freelance_hq_seo_module not null default 'off_page';
