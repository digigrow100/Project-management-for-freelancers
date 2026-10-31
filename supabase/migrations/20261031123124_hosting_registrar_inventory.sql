-- Read-only owner inventory: global counts and grouping before pagination.
create function public.freelance_hq_hosting_registrar_inventory(p_actor uuid,p_search text default '',p_filter text default 'all',p_page integer default 1)
returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare v uuid; m text; synced timestamptz; t numeric:=floor(extract(epoch from now())*1000); answer jsonb;
begin
 perform freelance_hq_hosting_assert_admin(p_actor);
 if p_search is null or length(p_search)>253 or p_search !~ '^[a-z0-9.*-]*$' or p_filter is null or p_filter not in ('all','expiring','expired','locked','auto_renew') or p_page is null or p_page<1 or p_page>100000 then raise exception 'Invalid inventory request';end if;
 select version,mode,sync_at into strict v,m,synced from freelance_hq_hosting_registrar_connection where id=true;
 with base as materialized (
  select name,details,synced_at,
   case when jsonb_typeof(details->'expires')='number' then case when (details->>'expires')::numeric>0 then (details->>'expires')::numeric end end expiry,
   coalesce(details->>'renewOption','')='auto' automatic,
   coalesce(details->>'locked','')='true' locked
  from freelance_hq_hosting_registrar_domains where connection_version=v
 ), grouped as materialized (
  select *,case when expiry between t and t+2592000000 then 'expiring' when expiry<t then 'expired' when expiry is null then 'unknown' else 'other' end category from base
 ), filtered as materialized (
  select * from grouped where position(replace(p_search,'*','') in name)>0 and
   (p_filter='all' or (p_filter='expiring' and category='expiring') or (p_filter='expired' and category='expired') or (p_filter='locked' and locked) or (p_filter='auto_renew' and automatic))
 ), page as (
  select name,details,synced_at,category,
   row_number() over(order by case category when 'expiring' then 0 when 'expired' then 1 when 'other' then 2 else 3 end,expiry nulls last,name) ordinal
  from filtered order by case category when 'expiring' then 0 when 'expired' then 1 when 'other' then 2 else 3 end,expiry nulls last,name limit 25 offset (p_page-1)*25
 )
 select jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('name',name,'details',details,'synced_at',synced_at,'category',category) order by ordinal) from page),'[]'::jsonb),
  'total',(select count(*) from filtered),'pageSize',25,'mode',m,'asOf',t,'syncAt',synced,'needsReconcile',exists(select 1 from freelance_hq_hosting_registrar_operations where connection_version=v and state in ('executing','uncertain')),
  'summary',jsonb_build_object('total',(select count(*) from grouped),'expiring',(select count(*) from grouped where category='expiring'),
   'expired',(select count(*) from grouped where category='expired'),'autoRenew',(select count(*) from grouped where automatic),'locked',(select count(*) from grouped where locked))) into answer;
 return answer;
end $$;
revoke all on function public.freelance_hq_hosting_registrar_inventory(uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.freelance_hq_hosting_registrar_inventory(uuid,text,text,integer) to service_role;
