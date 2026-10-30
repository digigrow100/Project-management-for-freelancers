-- Explicit new-form statuses; omitted status preserves old clients and retry digests.
create or replace function public.freelance_hq_hosting_assign_service(p_actor uuid,p_key uuid,p_data jsonb) returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare p freelance_hq_hosting_packages; previous freelance_hq_hosting_services; v_id uuid; v_status text:=coalesce(p_data->>'status','pending'); v_client uuid:=(p_data->>'client_id')::uuid; v_server uuid:=(p_data->>'server_id')::uuid; v_digest text:=encode(sha256(convert_to((p_data-'price_minor'-'currency'-'billing_cycle')::text,'UTF8')),'hex');
begin
 perform freelance_hq_hosting_assert_admin(p_actor);
 if v_status not in ('active','pending') then raise exception 'Invalid initial service status';end if;
 if p_key is null then raise exception 'Assignment key required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_key::text,34));
 select * into previous from freelance_hq_hosting_services where assignment_key=p_key;
 if found then if previous.assignment_digest<>v_digest then raise exception 'Idempotency key reused with different data';end if;return previous.id;end if;
 select * into strict p from freelance_hq_hosting_packages where id=(p_data->>'package_id')::uuid for share;
 if not p.is_active then raise exception 'Choose an active package';end if;
 perform 1 from freelance_hq_hosting_clients where id=v_client and status='active' for share;if not found then raise exception 'Client must be active';end if;
 if v_server is not null then
  perform 1 from freelance_hq_hosting_servers where id=v_server and status='available' for share;if not found then raise exception 'Server is not available';end if;
  perform 1 from freelance_hq_hosting_package_servers where package_id=p.id and server_id=v_server for share;if not found then raise exception 'Server is not allowed by package';end if;
 end if;
 insert into freelance_hq_hosting_services(client_id,package_id,server_id,name,primary_domain,status,price_minor,currency,billing_cycle,next_due_date,auto_invoice,notes,assignment_key,assignment_digest)
 values(v_client,p.id,v_server,p_data->>'name',coalesce(p_data->>'primary_domain',''),v_status,p.price_minor,p.currency,p.billing_cycle,(p_data->>'next_due_date')::date,coalesce((p_data->>'auto_invoice')::boolean,false),coalesce(p_data->>'notes',''),p_key,v_digest) returning id into v_id;
 insert into freelance_hq_hosting_audit_logs(actor_id,event,entity,entity_id)values(p_actor,'package_assigned','services',v_id);
 return v_id;
end $$;

-- Status-only changes must not overwrite billing dates, notes or contract fields.
create or replace function public.freelance_hq_hosting_set_service_status(
 p_actor uuid,p_service uuid,p_status text,p_expected_status text
) returns text language plpgsql security invoker set search_path=public,pg_temp as $$
declare previous_status text;
begin
 perform freelance_hq_hosting_assert_admin(p_actor);
 if p_status is null or p_status not in ('active','pending','suspended','cancelled') then
  raise exception 'Invalid service status';
 end if;
 select status into previous_status from freelance_hq_hosting_services where id=p_service for update;
 if not found then raise exception 'Unknown hosting service';end if;
 if previous_status=p_status then return previous_status;end if;
 if previous_status is distinct from p_expected_status then raise exception 'Service status changed since this page loaded';end if;
 -- Existing App Hosting snapshot/receipt trigger remains authoritative.
 update freelance_hq_hosting_services set status=p_status where id=p_service;
 insert into freelance_hq_hosting_audit_logs(actor_id,event,entity,entity_id)
 values(p_actor,'service_status_'||previous_status||'_to_'||p_status,'services',p_service);
 return p_status;
end $$;
revoke all on function public.freelance_hq_hosting_assign_service(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.freelance_hq_hosting_assign_service(uuid,uuid,jsonb) to service_role;
revoke all on function public.freelance_hq_hosting_set_service_status(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.freelance_hq_hosting_set_service_status(uuid,uuid,text,text) to service_role;
