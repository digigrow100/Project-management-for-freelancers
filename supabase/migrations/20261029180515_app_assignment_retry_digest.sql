create or replace function public.freelance_hq_hosting_assign_service(p_actor uuid,p_key uuid,p_data jsonb) returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare p freelance_hq_hosting_packages; previous freelance_hq_hosting_services; v_id uuid; v_client uuid:=(p_data->>'client_id')::uuid; v_server uuid:=(p_data->>'server_id')::uuid; v_digest text:=encode(sha256(convert_to((p_data-'price_minor'-'currency'-'billing_cycle')::text,'UTF8')),'hex');
begin
 perform freelance_hq_hosting_assert_admin(p_actor);
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
 values(v_client,p.id,v_server,p_data->>'name',coalesce(p_data->>'primary_domain',''),'pending',p.price_minor,p.currency,p.billing_cycle,(p_data->>'next_due_date')::date,coalesce((p_data->>'auto_invoice')::boolean,false),coalesce(p_data->>'notes',''),p_key,v_digest) returning id into v_id;
 insert into freelance_hq_hosting_audit_logs(actor_id,event,entity,entity_id)values(p_actor,'package_assigned','services',v_id);
 return v_id;
end $$;
