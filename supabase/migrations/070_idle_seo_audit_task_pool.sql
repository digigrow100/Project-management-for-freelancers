alter table public.freelance_hq_tasks
  add column if not exists is_fallback boolean not null default false,
  add column if not exists fallback_template_key text;

create index if not exists freelance_hq_tasks_fallback_idx
  on public.freelance_hq_tasks(assigned_to, is_fallback, status);

create table if not exists public.freelance_hq_idle_task_templates (
  template_key text primary key,
  title text not null,
  notes text not null default '',
  why text not null default '',
  expected_outcome text not null default '',
  priority text not null default 'medium' check (priority in ('low','medium','high')),
  seo_module text not null default 'technical' check (seo_module in ('on_page','technical','off_page','content','reporting')),
  order_index integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.freelance_hq_idle_task_claims (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.freelance_hq_projects(id) on delete cascade,
  assigned_to uuid not null references public.freelance_hq_profiles(id) on delete cascade,
  template_key text not null references public.freelance_hq_idle_task_templates(template_key) on delete cascade,
  period_month text not null check (period_month ~ '^[0-9]{4}-[0-9]{2}$'),
  task_id uuid references public.freelance_hq_tasks(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(project_id, template_key, period_month)
);

create index if not exists freelance_hq_idle_task_claims_member_idx
  on public.freelance_hq_idle_task_claims(assigned_to, period_month);

alter table public.freelance_hq_idle_task_templates enable row level security;
alter table public.freelance_hq_idle_task_claims enable row level security;

insert into public.freelance_hq_idle_task_templates
(template_key,title,notes,why,expected_outcome,priority,seo_module,order_index)
values
('technical_audit','Monthly Technical SEO Audit',
 'Run a practical technical SEO audit for this website. Check crawlability, indexability, HTTP status codes, redirect chains, canonical tags, robots.txt, XML sitemap, broken links, duplicate technical URLs, mobile usability, schema errors and major Core Web Vitals issues. Record each real issue you find and create/fix follow-up work where needed.',
 'This audit catches technical problems that can stop Google from crawling, indexing or properly understanding the website.',
 'Review the full website and leave a clear issue list. Confirm crawl/index controls, canonicals, sitemap and robots are correct, broken/redirect issues are identified, schema/mobile problems are noted, and any important problem has a clear next action.',
 'high','technical',10),
('on_page_audit','Monthly On-Page SEO Audit',
 'Review the important pages one by one. Check the target keyword and intent, SEO title, meta description, H1, heading order, content relevance, duplication, internal links, image alt text, canonical, schema and CTA clarity. Use the Pages tab checklist while reviewing pages and mark real problems as Needs Work.',
 'On-page checks keep every important page aligned with its target keyword and prevent weak, duplicated or poorly structured pages.',
 'Important pages have been reviewed, missing/duplicate metadata and headings are identified, content and internal links are checked, image alt text is reviewed, and page-level checklist statuses are updated.',
 'high','on_page',20),
('pagespeed_audit','Monthly PageSpeed & Core Web Vitals Audit',
 'Test the homepage and key service/location pages in PageSpeed Insights on mobile first, then desktop. Record LCP, INP and CLS where available. Check oversized images, render-blocking resources, unused JavaScript/CSS, caching, font loading and slow third-party scripts. Prioritize issues that affect real user experience.',
 'Speed and Core Web Vitals affect usability, conversions and can contribute to search performance.',
 'Key pages have current PageSpeed checks, major mobile/desktop performance bottlenecks are identified, Core Web Vitals are reviewed, and actionable fixes are recorded.',
 'medium','technical',30),
('indexing_audit','Monthly Indexing & Crawl Audit',
 'Review Google Search Console indexing/Pages reports and the XML sitemap. Check important URLs for Indexed / Not Indexed status, accidental noindex, robots blocks, canonical conflicts, soft 404s, redirect URLs in the sitemap and important orphan pages. Inspect representative problem URLs before creating fixes.',
 'A page cannot rank reliably if Google cannot discover, crawl or index the correct canonical URL.',
 'Important pages are confirmed indexable, sitemap/robots/canonical conflicts are identified, excluded URLs are reviewed, and genuine indexing problems have clear fixes or follow-up tasks.',
 'high','technical',40)
on conflict (template_key) do update
set title=excluded.title, notes=excluded.notes, why=excluded.why,
    expected_outcome=excluded.expected_outcome, priority=excluded.priority,
    seo_module=excluded.seo_module, order_index=excluded.order_index, is_active=true;