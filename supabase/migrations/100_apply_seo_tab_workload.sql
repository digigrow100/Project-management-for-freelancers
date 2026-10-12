do $$ begin if (select count(*) from public.freelance_hq_profiles where name='Maaz Ali' and role='member' and job_role='seo_expert')<>1 or (select count(*) from public.freelance_hq_profiles where name='Junaid Mazhar' and role='member' and job_role='seo_expert')<>1 then raise exception 'SEO members must resolve uniquely'; end if; end $$;
-- Approved tab ownership and persistent review tasks. Preserve completed work and active sessions.
create or replace function public.freelance_hq_sync_review_task(p_project uuid,p_kind text)
returns void language plpgsql security invoker set search_path=public as $$
declare owner_id uuid; cycle_no integer; review_data jsonb; sections jsonb; task_checks jsonb; task_key text; task_id uuid;
begin
 if p_kind not in ('gsc','gbp') then return; end if;
 select a.assigned_to into owner_id from freelance_hq_seo_module_assignments a join freelance_hq_projects p on p.id=a.project_id where a.project_id=p_project and a.module=p_kind and not p.archived;
 if owner_id is null then return; end if;
 select cycle,data into cycle_no,review_data from freelance_hq_seo_review_cycles where project_id=p_project and kind=p_kind;
 cycle_no:=coalesce(cycle_no,1); review_data:=coalesce(review_data,'{"checks":{},"rows":{},"notes":{}}');
 sections:=case when p_kind='gsc' then '[{"key":"keywords","title":"Page keywords and positions"},{"key":"sitemap","title":"XML sitemap and new pages"},{"key":"indexing","title":"Unindexed pages and indexing follow-up"},{"key":"backlinks","title":"Suspicious backlink review"},{"key":"clusters","title":"Keyword clusters and content updates"},{"key":"comparison","title":"Previous-period comparison"},{"key":"ctr","title":"High impressions, low CTR"},{"key":"cannibalization","title":"Query cannibalization — priority"},{"key":"health","title":"Core Web Vitals and HTTPS"},{"key":"security","title":"Manual actions and security issues"}]'::jsonb else '[{"key":"access","title":"Ownership, verification and access"},{"key":"categories","title":"Business categories"},{"key":"details","title":"Consistent business details"},{"key":"services","title":"Services and description"},{"key":"landing","title":"Landing page and UTM tracking"},{"key":"photos","title":"Original logo, cover and work photos"},{"key":"reviews","title":"Reply to each new review"},{"key":"posts","title":"Publish posts and original photos"},{"key":"performance","title":"Weekly calls and directions"},{"key":"rankings","title":"Area and keyword rankings"},{"key":"competitors","title":"Local competitor comparison"}]'::jsonb end;
 select jsonb_agg(jsonb_build_object('id','review:'||p_kind||':'||(s->>'key'),'text',s->>'title','done',coalesce((review_data->'checks'->>(s->>'key'))::boolean,false)) order by n) into task_checks from jsonb_array_elements(sections) with ordinality as x(s,n);
 task_key:='review:'||p_kind||':'||cycle_no; task_id:=md5(p_project::text||':'||task_key)::uuid;
 update freelance_hq_task_time_entries e set ended_at=now(),duration_seconds=greatest(0,floor(extract(epoch from now()-e.started_at)))::integer,stop_reason='completed' from freelance_hq_tasks t where e.task_id=t.id and e.ended_at is null and t.project_id=p_project and t.fallback_template_key like 'review:'||p_kind||':%' and split_part(t.fallback_template_key,':',3)::integer<cycle_no;
 update freelance_hq_tasks set status='done',completed_at=coalesce(completed_at,now()),updated_at=now(),checklist=(select jsonb_agg(jsonb_set(c,'{done}','true')) from jsonb_array_elements(checklist)c) where project_id=p_project and fallback_template_key like 'review:'||p_kind||':%' and split_part(fallback_template_key,':',3)::integer<cycle_no and status<>'done';
 delete from freelance_hq_task_focus f using freelance_hq_tasks t where f.task_id=t.id and t.project_id=p_project and t.fallback_template_key like 'review:'||p_kind||':%' and t.status='done';
 insert into freelance_hq_tasks(id,project_id,title,notes,status,priority,assigned_to,checklist,is_fallback,fallback_template_key,why,expected_outcome)
 values(task_id,p_project,(case p_kind when 'gsc' then 'Google Search Console' else 'Google Business Profile' end)||' — Review cycle '||cycle_no,'Open the matching project tab. Save findings and check each section there. Saving the complete cycle closes this task and creates the next cycle.','todo','medium',owner_id,task_checks,false,task_key,'Assigned by SEO tab owner.','Verified findings saved in the review tab.')
 on conflict(id) do update set assigned_to=excluded.assigned_to,checklist=excluded.checklist,updated_at=now();
end $$;
revoke all on function public.freelance_hq_sync_review_task(uuid,text) from public,anon,authenticated;
grant execute on function public.freelance_hq_sync_review_task(uuid,text) to service_role;
create or replace function public.freelance_hq_review_task_trigger() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if TG_TABLE_NAME='freelance_hq_seo_review_cycles' then perform freelance_hq_sync_review_task(NEW.project_id,NEW.kind);
 else perform freelance_hq_sync_review_task(NEW.project_id,NEW.module); end if;
 return NEW;
end $$;
revoke all on function public.freelance_hq_review_task_trigger() from public,anon,authenticated;
create trigger freelance_hq_review_tasks_after_save after insert or update on freelance_hq_seo_review_cycles for each row execute function freelance_hq_review_task_trigger();
create trigger freelance_hq_review_tasks_after_assignment after insert or update on freelance_hq_seo_module_assignments for each row execute function freelance_hq_review_task_trigger();

-- Scope to the eight existing team SEO projects; AI Ranko and Make Invo stay unassigned.
insert into freelance_hq_seo_module_assignments(project_id,module,assigned_to)
select distinct p.id,v.module,u.id from freelance_hq_projects p join freelance_hq_seo_module_assignments existing on existing.project_id=p.id cross join (values
('website_pages','Maaz Ali'),('technical_seo','Maaz Ali'),('blog_onsite','Maaz Ali'),('gsc','Maaz Ali'),
('full_website','Junaid Mazhar'),('social_media','Junaid Mazhar'),('local_listing','Junaid Mazhar'),('web_2_0','Junaid Mazhar'),('guest_blogging','Junaid Mazhar'),('gbp','Junaid Mazhar'),('recurring_general','Junaid Mazhar'))v(module,owner) join freelance_hq_profiles u on u.name=v.owner and u.role='member' and u.job_role='seo_expert'
where p.type='seo' and not p.archived and existing.module='gsc'
on conflict(project_id,module) do update set assigned_to=excluded.assigned_to,updated_at=now();
insert into freelance_hq_project_assignments(project_id,user_id) select distinct project_id,assigned_to from freelance_hq_seo_module_assignments on conflict(project_id,user_id) do nothing;
with classified as (
 select t.id,case when split_part(t.fallback_template_key,':',2)='website_pages' then 'website_pages'
 when i.module='local_listing' and i.item_key='google_business_profile' then 'gbp'
 when i.module='recurring' and i.item_key in ('gsc_performance_review','indexing_review','ranking_review','pagespeed_cwv_review','schema_validation','sitemap_robots_review','technical_seo_audit','tool_indexation_review') then 'gsc'
 when i.module in ('full_website','recurring') and i.item_key in ('page_link','image_optimization','internal_linking','pagespeed_90','canonical_url','google_indexing','schema_markup','mobile_friendly','technical_check','breadcrumb_schema','broken_links_404','canonical_redirects','core_web_vitals','global_schema','google_search_console','https_security','robots_txt','xml_sitemap','tool_404_redirects','tool_generated_url_control','tool_internal_linking','tool_js_indexability','tool_mobile_ux','tool_performance','tool_schema','tool_sitemap_architecture','broken_link_scan','indexing_review','pagespeed_cwv_review','schema_validation','sitemap_robots_review','technical_seo_audit','tool_indexation_review','tool_internal_links_review') then 'technical_seo'
 when i.module='recurring' then 'recurring_general' else i.module end as owner_group,t.project_id
 from freelance_hq_tasks t left join freelance_hq_seo_workflow_items i on i.id::text=split_part(t.fallback_template_key,':',3) and i.project_id=t.project_id
 where t.status<>'done' and t.fallback_template_key like 'workflow:%'
 and not exists(select 1 from freelance_hq_task_focus f where f.task_id=t.id and f.state='active')
 and not exists(select 1 from freelance_hq_task_time_entries e where e.task_id=t.id and e.ended_at is null)
)
update freelance_hq_tasks t set assigned_to=a.assigned_to,updated_at=now() from classified c join freelance_hq_seo_module_assignments a on a.project_id=c.project_id and a.module=c.owner_group where t.id=c.id and t.assigned_to is distinct from a.assigned_to;

-- Move only current paused controls; historical sessions remain untouched.
update freelance_hq_task_focus f set user_id=t.assigned_to,updated_at=now() from freelance_hq_tasks t
where f.task_id=t.id and t.status<>'done' and t.fallback_template_key like 'workflow:%' and f.state='paused' and f.user_id<>t.assigned_to
and not exists(select 1 from freelance_hq_task_time_entries e where e.task_id=t.id and e.ended_at is null);
