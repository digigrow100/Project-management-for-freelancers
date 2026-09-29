-- Separate website-page inventory + monthly reusable page audit checklist system.

create table if not exists public.freelance_hq_project_pages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.freelance_hq_projects(id) on delete cascade,
  name text not null,
  url text not null default '',
  page_type text not null default 'other'
    check (page_type in ('home','service','location','blog','landing','legal','contact','other')),
  is_active boolean not null default true,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, name)
);

create index if not exists freelance_hq_project_pages_project_idx
  on public.freelance_hq_project_pages(project_id, is_active);

create table if not exists public.freelance_hq_page_check_templates (
  check_key text primary key,
  label text not null,
  order_index integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.freelance_hq_page_audit_checks (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.freelance_hq_project_pages(id) on delete cascade,
  period_month text not null check (period_month ~ '^[0-9]{4}-[0-9]{2}$'),
  check_key text not null references public.freelance_hq_page_check_templates(check_key) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','done','needs_work','not_applicable')),
  notes text not null default '',
  checked_at timestamptz,
  checked_by uuid references public.freelance_hq_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(page_id, period_month, check_key)
);

create index if not exists freelance_hq_page_audit_checks_page_month_idx
  on public.freelance_hq_page_audit_checks(page_id, period_month);

alter table public.freelance_hq_project_pages enable row level security;
alter table public.freelance_hq_page_check_templates enable row level security;
alter table public.freelance_hq_page_audit_checks enable row level security;

insert into public.freelance_hq_page_check_templates(check_key, label, order_index)
values
  ('pagespeed', 'PageSpeed Insights checked', 10),
  ('on_page', 'On-Page SEO checked', 20),
  ('alt_text', 'Alt text checked', 30),
  ('unique_content', 'Unique content checked', 40)
on conflict (check_key) do update
set label = excluded.label,
    order_index = excluded.order_index,
    is_active = true;

insert into public.freelance_hq_project_pages(project_id, name, url, page_type, source)
select distinct
  p.id,
  kp.name,
  case when lower(kp.name)='home' and coalesce(nullif(trim(kp.url),''),'')='' then p.website_url else coalesce(kp.url,'') end,
  case when lower(kp.name)='home' then 'home'
       when kp.page_type in ('service','location','blog','landing') then kp.page_type::text
       else 'other' end,
  'keyword_inventory'
from public.freelance_hq_projects p
join public.freelance_hq_keyword_groups kg on kg.project_id=p.id
join public.freelance_hq_keyword_pages kp on kp.group_id=kg.id
where p.type='seo' and p.archived=false and kp.name is not null and trim(kp.name)<>''
on conflict (project_id,name) do nothing;

insert into public.freelance_hq_project_pages(project_id,name,url,page_type,source)
select p.id,'Home',p.website_url,'home','project_website'
from public.freelance_hq_projects p
where p.type='seo' and p.archived=false
and not exists (
  select 1 from public.freelance_hq_project_pages pp
  where pp.project_id=p.id and lower(pp.name)='home'
)
on conflict (project_id,name) do nothing;

insert into public.freelance_hq_page_audit_checks(page_id,period_month,check_key)
select pp.id,to_char(current_date,'YYYY-MM'),t.check_key
from public.freelance_hq_project_pages pp
join public.freelance_hq_projects p on p.id=pp.project_id
cross join public.freelance_hq_page_check_templates t
where p.type='seo' and p.archived=false and pp.is_active=true and t.is_active=true
on conflict (page_id,period_month,check_key) do nothing;
