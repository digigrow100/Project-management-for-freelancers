-- Incremental migration. Safe to run once in the SQL Editor.
--
-- Phase 5 (SEO Reporting & Activity Dashboard). Lets a report be daily or
-- weekly in addition to the existing monthly cadence. `period` keeps its
-- existing meaning per type: 'YYYY-MM-DD' for daily, 'YYYY-Www' (ISO week)
-- for weekly, 'YYYY-MM' for monthly (unchanged). Every existing row is a
-- monthly report, so the default preserves them exactly as they were.

alter table freelance_hq_seo_reports
  add column if not exists period_type text not null default 'monthly'
    check (period_type in ('daily', 'weekly', 'monthly'));
