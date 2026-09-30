-- Expand the monthly Website Pages SEO checklist with structured keyword/rank fields
-- and the full technical/content checklist requested for every SEO page.

alter table public.freelance_hq_page_check_templates
  add column if not exists input_type text not null default 'status';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'freelance_hq_page_check_templates_input_type_check'
  ) then
    alter table public.freelance_hq_page_check_templates
      add constraint freelance_hq_page_check_templates_input_type_check
      check (input_type in ('status','text'));
  end if;
end $$;

alter table public.freelance_hq_page_audit_checks
  add column if not exists value_text text not null default '';

-- Retire the old broad/duplicate checks. Historical audit rows remain stored,
-- but only active templates are displayed by the application.
update public.freelance_hq_page_check_templates
set is_active = false
where check_key in ('pagespeed','on_page','alt_text');

insert into public.freelance_hq_page_check_templates
  (check_key, label, order_index, is_active, input_type)
values
  ('page_link', 'Page Link verified', 10, true, 'status'),
  ('main_keyword', 'Main Keyword', 20, true, 'text'),
  ('pagespeed_90', 'PageSpeed 90+', 30, true, 'status'),
  ('meta_tags', 'Meta Tags optimized', 40, true, 'status'),
  ('canonical_url', 'Canonical URL correct', 50, true, 'status'),
  ('image_optimization', 'Image Optimization (WebP, compression, alt text, dimensions)', 60, true, 'status'),
  ('internal_linking', 'Internal Linking', 70, true, 'status'),
  ('heading_structure', 'H1, H2, H3 heading structure', 80, true, 'status'),
  ('google_indexing', 'Indexed in Google', 90, true, 'status'),
  ('main_keyword_rank', 'Rank for Main Keyword', 100, true, 'text'),
  ('unique_content', 'Unique Content', 110, true, 'status'),
  ('schema_markup', 'Schema Markup valid', 120, true, 'status'),
  ('mobile_friendly', 'Mobile Friendly', 130, true, 'status'),
  ('technical_check', 'Technical Check (200 status, indexable, robots allowed, no broken redirect)', 140, true, 'status')
on conflict (check_key) do update
set label = excluded.label,
    order_index = excluded.order_index,
    is_active = excluded.is_active,
    input_type = excluded.input_type;

-- Seed the new active checks for the current month. Existing rows are preserved.
insert into public.freelance_hq_page_audit_checks(page_id, period_month, check_key)
select
  pp.id,
  to_char(current_date, 'YYYY-MM'),
  t.check_key
from public.freelance_hq_project_pages pp
join public.freelance_hq_projects p on p.id = pp.project_id
cross join public.freelance_hq_page_check_templates t
where p.type = 'seo'
  and p.archived = false
  and pp.is_active = true
  and t.is_active = true
on conflict (page_id, period_month, check_key) do nothing;
