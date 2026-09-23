-- Incremental migration. Safe to run once in the SQL Editor.
--
-- Splits the SEO report's single `summary` blob into distinct editable
-- fields (summary / completed work / metrics / notes) and adds an approval
-- step ahead of attaching a report to an invoice: Generate -> Edit ->
-- Approve -> Attach. Every field stays editable after approval — `approved`
-- is a flag, not a lock; there is no read-only state for report content.

alter table freelance_hq_seo_reports
  add column if not exists completed_work text not null default '',
  add column if not exists metrics_notes text not null default '',
  add column if not exists notes text not null default '',
  add column if not exists approved boolean not null default false,
  add column if not exists approved_at timestamptz;
