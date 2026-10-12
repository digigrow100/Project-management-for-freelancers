create function public.freelance_hq_review_task_category_default() returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if NEW.seo_module is null then
    if NEW.fallback_template_key like 'review:gsc:%' then NEW.seo_module := 'technical';
    elsif NEW.fallback_template_key like 'review:gbp:%' then NEW.seo_module := 'off_page'; end if;
  end if;
  return NEW;
end $$;
revoke all on function public.freelance_hq_review_task_category_default() from public,anon,authenticated;
create trigger freelance_hq_review_task_category_before_insert before insert on public.freelance_hq_tasks for each row execute function public.freelance_hq_review_task_category_default();
