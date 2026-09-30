-- Keyword and ranking information now comes from the real mapped keyword records
-- shown directly in Website Pages, so these duplicate manual checklist fields are retired.
update public.freelance_hq_page_check_templates
set is_active = false
where check_key in ('main_keyword', 'main_keyword_rank');
