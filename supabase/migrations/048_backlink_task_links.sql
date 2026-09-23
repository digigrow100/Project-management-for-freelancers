-- Incremental migration. Safe to run once in the SQL Editor.
--
-- Task <-> Off-Page asset linking, same pattern as the Phase 2 task links
-- (keyword_id/page_id/content_item_id): simple nullable columns, no join
-- tables. Lets "Create Yell listing" or "Follow up with guest post site"
-- tasks connect back to the asset/prospect they're for.

alter table freelance_hq_tasks
  add column if not exists backlink_entry_id uuid references freelance_hq_backlink_entries (id) on delete set null,
  add column if not exists outreach_prospect_id uuid references freelance_hq_outreach_prospects (id) on delete set null;

create index if not exists freelance_hq_tasks_backlink_entry_id_idx on freelance_hq_tasks (backlink_entry_id);
create index if not exists freelance_hq_tasks_outreach_prospect_id_idx on freelance_hq_tasks (outreach_prospect_id);
