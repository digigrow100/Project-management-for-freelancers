-- Retire any legacy entry issued during the release transition.
update freelance_hq_task_time_entries e set ended_at=now(),duration_seconds=greatest(0,floor(extract(epoch from now()-e.started_at)))::integer,stop_reason='admin_action' from freelance_hq_tasks t join freelance_hq_profiles u on u.id=t.assigned_to where e.task_id=t.id and e.ended_at is null and t.fallback_template_key like 'workflow:%' and t.fallback_template_key not like '%:tabplan-v2:%' and u.name in ('Maaz Ali','Junaid Mazhar');
update freelance_hq_tasks t set fallback_template_key='retired:'||fallback_template_key,assigned_to=case when status='done' then assigned_to else null end,updated_at=now() from freelance_hq_profiles u where u.id=t.assigned_to and u.name in ('Maaz Ali','Junaid Mazhar') and t.is_fallback and t.fallback_template_key like 'workflow:%' and t.fallback_template_key not like '%:tabplan-v2:%';
-- Carry the current fresh batch into today's issuance slot, without resetting
-- creation dates, completed work, checklists, source IDs, cadence or time history.
update freelance_hq_tasks t set fallback_template_key=regexp_replace(fallback_template_key,'[0-9]{4}-[0-9]{2}-[0-9]{2}$',to_char(now() at time zone 'Asia/Karachi','YYYY-MM-DD')) from freelance_hq_profiles u where u.id=t.assigned_to and u.name in ('Maaz Ali','Junaid Mazhar') and t.status<>'done' and t.fallback_template_key like 'workflow:%:tabplan-v2:%';
-- Match the categories assigned by the regular application task generator.
update freelance_hq_tasks set seo_module='on_page' where fallback_template_key like 'workflow:website_pages:%:tabplan-v2:%' and seo_module is null;
update freelance_hq_tasks set seo_module='content' where fallback_template_key like 'workflow:blog_onsite:%:tabplan-v2:%' and seo_module is null;
update freelance_hq_tasks set seo_module='technical' where (fallback_template_key like 'workflow:full_website:%:tabplan-v2:%' or fallback_template_key like 'workflow:recurring:%:tabplan-v2:%') and seo_module is null;
update freelance_hq_tasks set seo_module='off_page' where fallback_template_key like 'workflow:%:tabplan-v2:%' and seo_module is null;
update freelance_hq_tasks set seo_module='technical' where fallback_template_key like 'review:gsc:%' and seo_module is null;
update freelance_hq_tasks set seo_module='off_page' where fallback_template_key like 'review:gbp:%' and seo_module is null;
