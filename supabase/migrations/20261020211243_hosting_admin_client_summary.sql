-- Read-only, client-scoped totals for verified administrator inspection.
create function public.freelance_hq_hosting_admin_client_summary(p_actor uuid,p_client uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 perform freelance_hq_hosting_assert_admin(p_actor);
 if not exists(select 1 from freelance_hq_hosting_clients where id=p_client and status<>'closed') then raise exception 'Client access denied'; end if;
 return jsonb_build_object('services',(select count(*) from freelance_hq_hosting_services where client_id=p_client),
 'tickets',(select count(*) from freelance_hq_hosting_tickets where client_id=p_client and status in ('open','pending_customer')),
 'outstanding',(select coalesce(jsonb_agg(x),'[]') from (select i.currency,sum(i.total_minor-coalesce(p.net,0)) outstanding_minor
 from freelance_hq_hosting_invoices i left join (select invoice_id,sum(case direction when 'incoming' then amount_minor else -amount_minor end) net
 from freelance_hq_hosting_payments where client_id=p_client group by invoice_id) p on p.invoice_id=i.id
 where i.client_id=p_client and i.status='issued' group by i.currency having sum(i.total_minor-coalesce(p.net,0))>0) x));
end $$;
revoke all on function public.freelance_hq_hosting_admin_client_summary(uuid,uuid) from public,anon,authenticated;
grant execute on function public.freelance_hq_hosting_admin_client_summary(uuid,uuid) to service_role;
