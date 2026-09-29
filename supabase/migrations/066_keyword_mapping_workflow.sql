-- Extends the SEO keyword system into a page-mapping workflow.
-- Keeps the existing groups/pages/link tables and adds explicit targeting metadata.

alter table public.freelance_hq_keywords
  add column if not exists keyword_role text not null default 'secondary'
    check (keyword_role in ('primary','secondary','supporting','long_tail')),
  add column if not exists target_mode text not null default 'existing_page'
    check (target_mode in ('existing_page','new_page_required')),
  add column if not exists suggested_page_name text not null default '',
  add column if not exists cluster_id uuid references public.freelance_hq_keyword_groups(id) on delete set null,
  add column if not exists primary_page_id uuid references public.freelance_hq_keyword_pages(id) on delete set null;

create index if not exists freelance_hq_keywords_cluster_id_idx
  on public.freelance_hq_keywords(cluster_id);

create index if not exists freelance_hq_keywords_primary_page_id_idx
  on public.freelance_hq_keywords(primary_page_id);

-- Backfill the new fields from the existing page-link system.
update public.freelance_hq_keywords k
set primary_page_id = l.page_id,
    keyword_role = 'primary',
    cluster_id = p.group_id
from public.freelance_hq_keyword_page_links l
join public.freelance_hq_keyword_pages p on p.id = l.page_id
where l.keyword_id = k.id
  and l.is_primary = true
  and k.primary_page_id is null;

update public.freelance_hq_keywords k
set cluster_id = p.group_id
from public.freelance_hq_keyword_page_links l
join public.freelance_hq_keyword_pages p on p.id = l.page_id
where l.keyword_id = k.id
  and k.cluster_id is null;
