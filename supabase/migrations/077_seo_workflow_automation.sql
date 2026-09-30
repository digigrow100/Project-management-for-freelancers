-- Project-level SEO workflow modules and default work items.
create table if not exists public.freelance_hq_seo_workflow_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.freelance_hq_projects(id) on delete cascade,
  module text not null check (module in ('social_media','local_listing','blog_onsite','web_2_0','guest_blogging')),
  item_key text not null,
  title text not null,
  url text not null default '',
  status text not null default 'pending' check (status in ('pending','done')),
  sort_order integer not null default 0,
  details jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, module, item_key)
);

create index if not exists freelance_hq_seo_workflow_items_project_module_idx
  on public.freelance_hq_seo_workflow_items(project_id, module, sort_order);

alter table public.freelance_hq_seo_workflow_items enable row level security;

-- The previous generic monthly audit pool is superseded by the project workflow rotation.
update public.freelance_hq_idle_task_templates set is_active = false where is_active = true;

-- Every SEO project must have at least a Home page. Existing populated projects are left untouched.
insert into public.freelance_hq_project_pages (project_id, name, url, page_type, source)
select p.id, 'Home', coalesce(p.website_url, ''), 'home', 'workflow_default'
from public.freelance_hq_projects p
where p.type = 'seo'
  and not exists (
    select 1 from public.freelance_hq_project_pages pp
    where pp.project_id = p.id and pp.is_active = true
  );

-- Default workflow items for all existing SEO projects.
with defaults(module, item_key, title, url, sort_order, details) as (
  values
    ('social_media','facebook','Facebook','https://www.facebook.com/',10,'{}'::jsonb),
    ('social_media','instagram','Instagram','https://www.instagram.com/',20,'{}'::jsonb),
    ('social_media','linkedin','LinkedIn','https://www.linkedin.com/',30,'{}'::jsonb),
    ('social_media','pinterest','Pinterest','https://www.pinterest.com/',40,'{}'::jsonb),
    ('social_media','quora','Quora','https://www.quora.com/',50,'{}'::jsonb),

    ('local_listing','yell','Yell','https://www.yell.com/',10,'{}'::jsonb),
    ('local_listing','yelp','Yelp','https://www.yelp.com/',20,'{}'::jsonb),
    ('local_listing','google_business_profile','Google Business Profile','https://www.google.com/business/',30,'{}'::jsonb),
    ('local_listing','bing_places','Bing Places','https://www.bingplaces.com/',40,'{}'::jsonb),
    ('local_listing','apple_business_connect','Apple Business Connect','https://businessconnect.apple.com/',50,'{}'::jsonb),
    ('local_listing','freeindex','FreeIndex','https://www.freeindex.co.uk/',60,'{}'::jsonb),
    ('local_listing','hotfrog','Hotfrog','https://www.hotfrog.co.uk/',70,'{}'::jsonb),
    ('local_listing','cylex','Cylex','https://www.cylex-uk.co.uk/',80,'{}'::jsonb),
    ('local_listing','scoot','Scoot','https://www.scoot.co.uk/',90,'{}'::jsonb),

    ('blog_onsite','next_blog','Next Onsite Blog','',10,
      '{"steps":["Choose topic and primary keyword","Write title and outline","Write SEO draft","Add internal links","Publish or send for approval"]}'::jsonb),

    ('web_2_0','wordpress_com','WordPress.com','https://wordpress.com/',10,'{}'::jsonb),
    ('web_2_0','blogger','Blogger','https://www.blogger.com/',20,'{}'::jsonb),
    ('web_2_0','medium','Medium','https://medium.com/',30,'{}'::jsonb),
    ('web_2_0','tumblr','Tumblr','https://www.tumblr.com/',40,'{}'::jsonb),
    ('web_2_0','wix','Wix','https://www.wix.com/',50,'{}'::jsonb),
    ('web_2_0','weebly','Weebly','https://www.weebly.com/',60,'{}'::jsonb),

    ('guest_blogging','demo_guest_site','Demo Guest Blogging Prospect','https://example.com/',10,
      '{"steps":["Find 5 relevant guest blogging sites","Analyse traffic, relevance and quality","Contact site owners by email","Confirm article approval and backlink price","Add approved and payment-confirmed sites to the list","Contact the client and quote the final backlink price"]}'::jsonb)
)
insert into public.freelance_hq_seo_workflow_items (project_id,module,item_key,title,url,sort_order,details)
select p.id, d.module, d.item_key, d.title, d.url, d.sort_order, d.details
from public.freelance_hq_projects p
cross join defaults d
where p.type='seo'
on conflict (project_id,module,item_key) do nothing;

-- Seed defaults automatically for every future SEO project.
create or replace function public.seed_freelance_hq_seo_project_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.type <> 'seo' then
    return new;
  end if;

  insert into public.freelance_hq_project_pages (project_id,name,url,page_type,source)
  values (new.id,'Home',coalesce(new.website_url,''),'home','workflow_default')
  on conflict do nothing;

  insert into public.freelance_hq_seo_workflow_items (project_id,module,item_key,title,url,sort_order,details)
  values
    (new.id,'social_media','facebook','Facebook','https://www.facebook.com/',10,'{}'),
    (new.id,'social_media','instagram','Instagram','https://www.instagram.com/',20,'{}'),
    (new.id,'social_media','linkedin','LinkedIn','https://www.linkedin.com/',30,'{}'),
    (new.id,'social_media','pinterest','Pinterest','https://www.pinterest.com/',40,'{}'),
    (new.id,'social_media','quora','Quora','https://www.quora.com/',50,'{}'),
    (new.id,'local_listing','yell','Yell','https://www.yell.com/',10,'{}'),
    (new.id,'local_listing','yelp','Yelp','https://www.yelp.com/',20,'{}'),
    (new.id,'local_listing','google_business_profile','Google Business Profile','https://www.google.com/business/',30,'{}'),
    (new.id,'local_listing','bing_places','Bing Places','https://www.bingplaces.com/',40,'{}'),
    (new.id,'local_listing','apple_business_connect','Apple Business Connect','https://businessconnect.apple.com/',50,'{}'),
    (new.id,'local_listing','freeindex','FreeIndex','https://www.freeindex.co.uk/',60,'{}'),
    (new.id,'local_listing','hotfrog','Hotfrog','https://www.hotfrog.co.uk/',70,'{}'),
    (new.id,'local_listing','cylex','Cylex','https://www.cylex-uk.co.uk/',80,'{}'),
    (new.id,'local_listing','scoot','Scoot','https://www.scoot.co.uk/',90,'{}'),
    (new.id,'blog_onsite','next_blog','Next Onsite Blog','',10,'{"steps":["Choose topic and primary keyword","Write title and outline","Write SEO draft","Add internal links","Publish or send for approval"]}'),
    (new.id,'web_2_0','wordpress_com','WordPress.com','https://wordpress.com/',10,'{}'),
    (new.id,'web_2_0','blogger','Blogger','https://www.blogger.com/',20,'{}'),
    (new.id,'web_2_0','medium','Medium','https://medium.com/',30,'{}'),
    (new.id,'web_2_0','tumblr','Tumblr','https://www.tumblr.com/',40,'{}'),
    (new.id,'web_2_0','wix','Wix','https://www.wix.com/',50,'{}'),
    (new.id,'web_2_0','weebly','Weebly','https://www.weebly.com/',60,'{}'),
    (new.id,'guest_blogging','demo_guest_site','Demo Guest Blogging Prospect','https://example.com/',10,'{"steps":["Find 5 relevant guest blogging sites","Analyse traffic, relevance and quality","Contact site owners by email","Confirm article approval and backlink price","Add approved and payment-confirmed sites to the list","Contact the client and quote the final backlink price"]}')
  on conflict (project_id,module,item_key) do nothing;

  return new;
end
$$;

drop trigger if exists freelance_hq_seed_seo_project_defaults on public.freelance_hq_projects;
create trigger freelance_hq_seed_seo_project_defaults
after insert on public.freelance_hq_projects
for each row execute function public.seed_freelance_hq_seo_project_defaults();
