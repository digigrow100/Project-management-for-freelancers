-- Incremental migration. Safe to run once in the SQL Editor (idempotent —
-- only touches rows where seo_module is still null).
--
-- Backfills freelance_hq_tasks.seo_module for existing SEO projects' tasks
-- from their current stage name, per the approved mapping:
--   On-Page SEO             -> on_page
--   Technical SEO            -> technical
--   Off-Page SEO              -> off_page
--   Social Media              -> off_page  (off-site trust signal, closest fit)
--   Google Business Profile   -> off_page  (off-site trust signal, closest fit)
-- Any other/renamed stage name is left null (unmapped) rather than guessed.
-- freelance_hq_stages rows themselves are untouched — SEO projects simply
-- stop reading/writing stage_id going forward.

update freelance_hq_tasks t
set seo_module = case s.name
  when 'On-Page SEO' then 'on_page'::freelance_hq_seo_module
  when 'Technical SEO' then 'technical'::freelance_hq_seo_module
  when 'Off-Page SEO' then 'off_page'::freelance_hq_seo_module
  when 'Social Media' then 'off_page'::freelance_hq_seo_module
  when 'Google Business Profile' then 'off_page'::freelance_hq_seo_module
  else null
end
from freelance_hq_stages s
join freelance_hq_projects p on p.id = s.project_id
where t.stage_id = s.id
  and p.type = 'seo'
  and t.seo_module is null;
