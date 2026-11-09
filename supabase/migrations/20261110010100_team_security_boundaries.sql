-- HQ accesses these RLS-protected tables only from the server.
do $$
declare
  target record;
begin
  for target in
    select tablename from pg_catalog.pg_tables
    where schemaname = 'public' and starts_with(tablename, 'freelance_hq_')
  loop
    execute format('revoke all privileges on table public.%I from public, anon, authenticated', target.tablename);
  end loop;
end
$$;

-- Re-pairing can rotate a device token but cannot claim a different owner's installation.
create function public.freelance_hq_protect_device_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(old) -> TG_ARGV[0]) is distinct from (to_jsonb(new) -> TG_ARGV[0]) then
    raise exception 'Device belongs to another account' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.freelance_hq_protect_device_owner() from public, anon, authenticated;

create trigger protect_employee_device_owner
before update of employee_id on public.freelance_hq_employee_devices
for each row execute function public.freelance_hq_protect_device_owner('employee_id');

create trigger protect_whatsapp_device_owner
before update of owner_user_id on public.freelance_hq_whatsapp_bridge_devices
for each row execute function public.freelance_hq_protect_device_owner('owner_user_id');
