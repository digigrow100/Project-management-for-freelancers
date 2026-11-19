-- Additive website checkout. Existing hosting contracts and money records are untouched.
BEGIN;
CREATE TABLE public.freelance_hq_website_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), enabled boolean NOT NULL DEFAULT false,
 currency text NOT NULL DEFAULT 'GBP' CHECK(currency IN('GBP','USD','EUR','PKR')),
 website_price_minor bigint NOT NULL DEFAULT 0 CHECK(website_price_minor BETWEEN 0 AND 100000000),
 extra_gb_month_minor bigint NOT NULL DEFAULT 0 CHECK(extra_gb_month_minor BETWEEN 0 AND 100000000),
 bank_details text NOT NULL DEFAULT '' CHECK(length(bank_details)<=4000),
 max_extra_gb integer NOT NULL DEFAULT 1 CHECK(max_extra_gb BETWEEN 0 AND 100),
 revision integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid,
 CHECK(NOT enabled OR (website_price_minor>0 AND length(trim(bank_details))>10))
);
INSERT INTO public.freelance_hq_website_settings(id) VALUES(true);
CREATE TABLE public.freelance_hq_website_payment_requests (
 id uuid PRIMARY KEY, client_id uuid NOT NULL REFERENCES public.freelance_hq_hosting_clients(id), actor_id uuid NOT NULL,
 request_key uuid NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','rejected')),
 currency text NOT NULL, amount_minor bigint NOT NULL CHECK(amount_minor>0), extra_gb_month_minor bigint NOT NULL CHECK(extra_gb_month_minor>=0),
 max_extra_gb integer NOT NULL, reference text NOT NULL DEFAULT '' CHECK(length(reference)<=200), proof_path text,
 settings_revision integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz, reviewed_by uuid,
 review_note text NOT NULL DEFAULT '' CHECK(length(review_note)<=500), UNIQUE(client_id,request_key),
 CHECK((status='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL) OR (status<>'pending' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
 CHECK(proof_path IS NULL OR proof_path=client_id::text||'/'||id::text||'/proof')
);
CREATE UNIQUE INDEX website_one_pending_payment ON public.freelance_hq_website_payment_requests(client_id) WHERE status='pending';
CREATE TABLE public.freelance_hq_website_credits (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL UNIQUE REFERENCES public.freelance_hq_website_payment_requests(id),
 client_id uuid NOT NULL REFERENCES public.freelance_hq_hosting_clients(id), currency text NOT NULL,
 extra_gb_month_minor bigint NOT NULL, max_extra_gb integer NOT NULL,
 app_id uuid UNIQUE REFERENCES public.freelance_hq_hosting_apps(id), created_at timestamptz NOT NULL DEFAULT now(), consumed_at timestamptz, UNIQUE(id,client_id), CHECK((app_id IS NULL)=(consumed_at IS NULL))
);
ALTER TABLE public.freelance_hq_hosting_apps ADD COLUMN website_credit_id uuid UNIQUE REFERENCES public.freelance_hq_website_credits(id),
 ADD COLUMN storage_limit_bytes bigint NOT NULL DEFAULT 1000000000 CHECK(storage_limit_bytes BETWEEN 1000000000 AND 101000000000),
 ADD COLUMN storage_used_bytes bigint CHECK(storage_used_bytes>=0), ADD COLUMN storage_reported_at timestamptz,
 ADD COLUMN creation_key uuid, ADD COLUMN active_deployment_id uuid REFERENCES public.freelance_hq_hosting_deployments(id),
 ADD COLUMN extra_storage_consent_at timestamptz;
ALTER TABLE public.freelance_hq_hosting_apps ADD CONSTRAINT website_credit_owner_fk FOREIGN KEY(website_credit_id,client_id) REFERENCES public.freelance_hq_website_credits(id,client_id);
CREATE UNIQUE INDEX website_app_owner_pair ON public.freelance_hq_hosting_apps(id,client_id);
ALTER TABLE public.freelance_hq_website_credits ADD CONSTRAINT website_credit_app_owner_fk FOREIGN KEY(app_id,client_id) REFERENCES public.freelance_hq_hosting_apps(id,client_id);
CREATE UNIQUE INDEX website_create_retry ON public.freelance_hq_hosting_apps(client_id,creation_key);
ALTER TABLE public.freelance_hq_hosting_apps DROP CONSTRAINT hosting_apps_source_check;
ALTER TABLE public.freelance_hq_hosting_apps ADD CONSTRAINT hosting_apps_source_check CHECK(source_kind IN('git','upload'));
ALTER TABLE public.freelance_hq_hosting_apps DROP CONSTRAINT hosting_apps_status_check;
ALTER TABLE public.freelance_hq_hosting_apps ADD CONSTRAINT hosting_apps_status_check CHECK(status IN('pending','uploading','building','running','stopped','failed','uncertain'));
ALTER TABLE public.freelance_hq_hosting_apps ADD CONSTRAINT website_approved_slot_required CHECK(website_credit_id IS NOT NULL AND client_id IS NOT NULL);
ALTER TABLE public.freelance_hq_hosting_deployments ADD COLUMN request_key uuid, ADD COLUMN requested_by uuid, ADD COLUMN requested_as_admin boolean NOT NULL DEFAULT false, ADD COLUMN used_bytes bigint CHECK(used_bytes>=0);
CREATE UNIQUE INDEX website_deploy_retry ON public.freelance_hq_hosting_deployments(app_id,request_key);
CREATE TABLE public.freelance_hq_website_usage_intervals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), app_id uuid NOT NULL REFERENCES public.freelance_hq_hosting_apps(id),
 deployment_id uuid NOT NULL UNIQUE REFERENCES public.freelance_hq_hosting_deployments(id), client_id uuid NOT NULL REFERENCES public.freelance_hq_hosting_clients(id),
 starts_at timestamptz NOT NULL, ends_at timestamptz, used_bytes bigint NOT NULL CHECK(used_bytes>=0),
 currency text NOT NULL, extra_gb_month_minor bigint NOT NULL, CHECK(ends_at IS NULL OR ends_at>=starts_at)
);
CREATE UNIQUE INDEX website_one_usage_interval ON public.freelance_hq_website_usage_intervals(app_id) WHERE ends_at IS NULL;
CREATE TABLE public.freelance_hq_website_storage_bills (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES public.freelance_hq_hosting_clients(id),
 period date NOT NULL CHECK(extract(day FROM period)=1), currency text NOT NULL,
 amount_minor bigint NOT NULL CHECK(amount_minor>=0), gb_seconds numeric NOT NULL CHECK(gb_seconds>=0),
 created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, UNIQUE(client_id,period,currency)
);

-- All functions are invoker, service-role-only. Actor/client authority is also rechecked in SQL.
CREATE FUNCTION public.freelance_hq_website_actor(p_actor uuid,p_client uuid,p_admin boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 IF p_admin THEN
  IF NOT EXISTS(SELECT 1 FROM public.freelance_hq_profiles WHERE id=p_actor AND role='admin') THEN RAISE EXCEPTION 'Admin required'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM public.freelance_hq_hosting_client_access a JOIN public.freelance_hq_hosting_clients c ON c.id=a.client_id
   WHERE a.auth_user_id=p_actor AND a.client_id=p_client AND a.enabled AND c.status='active') THEN RAISE EXCEPTION 'Active client access required'; END IF;
 END IF;
END $$;
CREATE FUNCTION public.freelance_hq_website_request_payment(p_actor uuid,p_client uuid,p_id uuid,p_key uuid,p_revision integer,p_reference text,p_proof text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE s public.freelance_hq_website_settings; r public.freelance_hq_website_payment_requests;
BEGIN
 PERFORM public.freelance_hq_website_actor(p_actor,p_client);
 -- Serialize one pending claim and check retries before changed settings.
 PERFORM 1 FROM public.freelance_hq_hosting_clients WHERE id=p_client FOR UPDATE;
 SELECT * INTO r FROM public.freelance_hq_website_payment_requests WHERE client_id=p_client AND request_key=p_key;
 IF FOUND THEN RETURN r.id; END IF;
 SELECT * INTO s FROM public.freelance_hq_website_settings WHERE id=true FOR SHARE;
 IF p_revision IS NULL OR NOT s.enabled OR s.revision<>p_revision THEN RAISE EXCEPTION 'Checkout settings changed or unavailable'; END IF;
 IF EXISTS(SELECT 1 FROM public.freelance_hq_website_payment_requests WHERE client_id=p_client AND status='pending') THEN RAISE EXCEPTION 'A payment is already pending'; END IF;
 INSERT INTO public.freelance_hq_website_payment_requests(id,client_id,actor_id,request_key,currency,amount_minor,extra_gb_month_minor,max_extra_gb,reference,proof_path,settings_revision)
 VALUES(p_id,p_client,p_actor,p_key,s.currency,s.website_price_minor,s.extra_gb_month_minor,s.max_extra_gb,coalesce(p_reference,''),p_proof,s.revision);
 INSERT INTO public.freelance_hq_hosting_audit_logs(actor_id,event,entity,entity_id) VALUES(p_actor,'website_bank_transfer_reported','website_payment_request',p_id);
 RETURN p_id;
END $$;
CREATE FUNCTION public.freelance_hq_website_review_payment(p_actor uuid,p_id uuid,p_approve boolean,p_note text)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE r public.freelance_hq_website_payment_requests; outcome text;
BEGIN
 PERFORM public.freelance_hq_website_actor(p_actor,NULL,true);
 SELECT * INTO r FROM public.freelance_hq_website_payment_requests WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Payment request not found'; END IF;
 outcome:=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END;
 IF r.status=outcome THEN RETURN r.status; END IF;
 IF r.status<>'pending' THEN RAISE EXCEPTION 'Payment was already reviewed'; END IF;
 IF p_approve AND NOT EXISTS(SELECT 1 FROM public.freelance_hq_hosting_clients WHERE id=r.client_id AND status='active') THEN RAISE EXCEPTION 'Client is not active'; END IF;
 UPDATE public.freelance_hq_website_payment_requests SET status=outcome,reviewed_at=now(),reviewed_by=p_actor,review_note=coalesce(p_note,'') WHERE id=p_id;
 IF p_approve THEN INSERT INTO public.freelance_hq_website_credits(request_id,client_id,currency,extra_gb_month_minor,max_extra_gb)
  VALUES(r.id,r.client_id,r.currency,r.extra_gb_month_minor,r.max_extra_gb); END IF;
 INSERT INTO public.freelance_hq_hosting_audit_logs(actor_id,event,entity,entity_id) VALUES(p_actor,'website_payment_'||outcome,'website_payment_request',p_id);
 RETURN outcome;
END $$;
CREATE FUNCTION public.freelance_hq_website_create(p_actor uuid,p_client uuid,p_credit uuid,p_key uuid,p_label text,p_framework text,p_kind text,p_url text,p_ref text,p_token text,p_extra_gb integer,p_consent boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE c public.freelance_hq_website_credits; a public.freelance_hq_hosting_apps; new_id uuid:=gen_random_uuid();
BEGIN
 PERFORM public.freelance_hq_website_actor(p_actor,p_client);
 SELECT * INTO c FROM public.freelance_hq_website_credits WHERE id=p_credit AND client_id=p_client FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Approved website credit required'; END IF;
 IF c.app_id IS NOT NULL THEN
  SELECT * INTO a FROM public.freelance_hq_hosting_apps WHERE id=c.app_id;
  IF a.creation_key=p_key THEN RETURN a.id; END IF;
  RAISE EXCEPTION 'Website credit already used';
 END IF;
 IF length(trim(p_label)) NOT BETWEEN 1 AND 80 OR p_framework NOT IN('static','react','vue','nextjs','nuxt','node') OR p_kind NOT IN('git','upload') THEN RAISE EXCEPTION 'Invalid website'; END IF;
 IF p_kind='git' AND p_url !~ '^https://github[.]com/[A-Za-z0-9_-]+/[A-Za-z0-9_.-]+([.]git)?$' THEN RAISE EXCEPTION 'GitHub repository required'; END IF;
 IF p_extra_gb<0 OR p_extra_gb>c.max_extra_gb OR (p_extra_gb>0 AND (NOT p_consent OR c.extra_gb_month_minor<=0)) THEN RAISE EXCEPTION 'Extra storage consent required'; END IF;
 INSERT INTO public.freelance_hq_hosting_apps(id,name,display_name,client_id,framework,source_kind,source_url,git_ref,git_token_encrypted,port,cpu,memory_mb,created_by,website_credit_id,creation_key,storage_limit_bytes,extra_storage_consent_at)
 VALUES(new_id,'w-'||replace(new_id::text,'-',''),trim(p_label),p_client,p_framework,p_kind,CASE WHEN p_kind='git' THEN p_url ELSE '' END,nullif(p_ref,''),nullif(p_token,''),CASE WHEN p_framework IN('static','react','vue') THEN 8080 ELSE 3000 END,1,512,p_actor,c.id,p_key,(1+p_extra_gb::bigint)*1000000000,CASE WHEN p_extra_gb>0 THEN now() ELSE NULL END);
 UPDATE public.freelance_hq_website_credits SET app_id=new_id,consumed_at=now() WHERE id=c.id;
 INSERT INTO public.freelance_hq_hosting_audit_logs(actor_id,event,entity,entity_id) VALUES(p_actor,'website_credit_consumed','hosting_apps',new_id);
 RETURN new_id;
END $$;
CREATE FUNCTION public.freelance_hq_website_begin_deploy(p_actor uuid,p_app uuid,p_key uuid,p_upload boolean,p_admin boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE a public.freelance_hq_hosting_apps; d public.freelance_hq_hosting_deployments; new_id uuid:=gen_random_uuid();
BEGIN
 SELECT * INTO a FROM public.freelance_hq_hosting_apps WHERE id=p_app FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Website not found'; END IF;
 PERFORM public.freelance_hq_website_actor(p_actor,a.client_id,p_admin);
 SELECT * INTO d FROM public.freelance_hq_hosting_deployments WHERE app_id=p_app AND request_key=p_key;
 IF FOUND THEN RETURN d.id; END IF;
 IF a.website_credit_id IS NULL THEN RAISE EXCEPTION 'Website credit missing'; END IF;
 IF EXISTS(SELECT 1 FROM public.freelance_hq_hosting_deployments WHERE app_id=p_app AND status IN('queued','building')) THEN RAISE EXCEPTION 'Another deployment is pending; refresh or cancel the expired upload'; END IF;
 INSERT INTO public.freelance_hq_hosting_deployments(id,app_id,status,trigger,request_key,requested_by,requested_as_admin) VALUES(new_id,p_app,'queued',CASE WHEN p_upload THEN 'upload' ELSE 'github' END,p_key,p_actor,p_admin);
 UPDATE public.freelance_hq_hosting_apps SET active_deployment_id=new_id,status=CASE WHEN p_upload THEN 'uploading' ELSE 'building' END,last_error=NULL,updated_at=now() WHERE id=p_app;
 RETURN new_id;
END $$;
CREATE FUNCTION public.freelance_hq_website_record_deploy(p_actor uuid,p_app uuid,p_deployment uuid,p_status text,p_bytes bigint,p_reported_at timestamptz,p_admin boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE a public.freelance_hq_hosting_apps; c public.freelance_hq_website_credits; d public.freelance_hq_hosting_deployments; started timestamptz;
BEGIN
 SELECT * INTO a FROM public.freelance_hq_hosting_apps WHERE id=p_app FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Website not found'; END IF;
 PERFORM public.freelance_hq_website_actor(p_actor,a.client_id,p_admin);
 IF a.active_deployment_id IS DISTINCT FROM p_deployment THEN RAISE EXCEPTION 'Stale deployment receipt'; END IF;
 SELECT * INTO d FROM public.freelance_hq_hosting_deployments WHERE id=p_deployment AND app_id=p_app FOR UPDATE;
 IF d.status IN('succeeded','failed') THEN RETURN; END IF;
 IF p_status NOT IN('running','failed','uncertain') THEN RAISE EXCEPTION 'Invalid receipt status'; END IF;
 IF p_status='running' AND (p_reported_at IS NULL OR p_bytes IS NULL OR p_bytes<0 OR p_bytes>a.storage_limit_bytes OR p_reported_at<d.created_at-interval '1 minute' OR p_reported_at>now()+interval '1 minute') THEN RAISE EXCEPTION 'Invalid storage receipt'; END IF;
 UPDATE public.freelance_hq_hosting_apps SET status=p_status,storage_used_bytes=CASE WHEN p_status='running' THEN p_bytes ELSE storage_used_bytes END,storage_reported_at=CASE WHEN p_status='running' THEN p_reported_at ELSE storage_reported_at END,updated_at=now() WHERE id=p_app;
 IF p_status='uncertain' THEN RETURN; END IF;
 UPDATE public.freelance_hq_hosting_deployments SET status=CASE WHEN p_status='running' THEN 'succeeded' ELSE 'failed' END,used_bytes=CASE WHEN p_status='running' THEN p_bytes ELSE NULL END,finished_at=now() WHERE id=p_deployment;
 IF p_status='running' THEN
  SELECT * INTO c FROM public.freelance_hq_website_credits WHERE id=a.website_credit_id;
  -- Receipt time is not backdated across an already finalized billing period.
  started:=greatest(p_reported_at,coalesce((SELECT max(starts_at) FROM public.freelance_hq_website_usage_intervals WHERE app_id=a.id),'-infinity'::timestamptz),coalesce((SELECT max((period+interval '1 month')::timestamp AT TIME ZONE 'UTC') FROM public.freelance_hq_website_storage_bills WHERE client_id=a.client_id),'-infinity'::timestamptz));
  UPDATE public.freelance_hq_website_usage_intervals SET ends_at=greatest(starts_at,started) WHERE app_id=p_app AND ends_at IS NULL;
  INSERT INTO public.freelance_hq_website_usage_intervals(app_id,deployment_id,client_id,starts_at,used_bytes,currency,extra_gb_month_minor) VALUES(a.id,p_deployment,a.client_id,started,p_bytes,c.currency,c.extra_gb_month_minor);
 END IF;
END $$;
CREATE FUNCTION public.freelance_hq_website_close_storage_month(p_actor uuid,p_period date)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE total integer;
BEGIN
 PERFORM public.freelance_hq_website_actor(p_actor,NULL,true);
 IF extract(day FROM p_period)<>1 OR p_period>=date_trunc('month',now() AT TIME ZONE 'UTC')::date THEN RAISE EXCEPTION 'Only a completed UTC month may be finalized'; END IF;
 -- Decimal GB, exact numeric byte-seconds, prorated by the actual UTC calendar month.
 INSERT INTO public.freelance_hq_website_storage_bills(client_id,period,currency,amount_minor,gb_seconds,created_by)
 SELECT client_id,p_period,currency,ceil(sum(extra_seconds*extra_gb_month_minor)/extract(epoch FROM ((p_period+interval '1 month')::timestamp-p_period::timestamp)))::bigint,sum(extra_seconds),p_actor
 FROM (
 SELECT i.client_id,i.currency,i.extra_gb_month_minor,
 greatest(i.used_bytes-1000000000,0)::numeric/1000000000 * extract(epoch FROM (least(coalesce(i.ends_at,(p_period+interval '1 month')::timestamp AT TIME ZONE 'UTC'),(p_period+interval '1 month')::timestamp AT TIME ZONE 'UTC')-greatest(i.starts_at,p_period::timestamp AT TIME ZONE 'UTC'))) AS extra_seconds
 FROM public.freelance_hq_website_usage_intervals i WHERE i.starts_at<(p_period+interval '1 month')::timestamp AT TIME ZONE 'UTC' AND coalesce(i.ends_at,'infinity')>p_period::timestamp AT TIME ZONE 'UTC'
 ) usage GROUP BY client_id,currency ON CONFLICT(client_id,period,currency) DO NOTHING;
 GET DIAGNOSTICS total=ROW_COUNT;
 RETURN total;
END $$;
DO $$ DECLARE t text; f record; BEGIN
 FOREACH t IN ARRAY ARRAY['website_settings','website_payment_requests','website_credits','website_usage_intervals','website_storage_bills'] LOOP
  EXECUTE format('ALTER TABLE public.freelance_hq_%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.freelance_hq_%I FROM PUBLIC,anon,authenticated,service_role',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON public.freelance_hq_%I TO service_role',t);
 END LOOP;
 FOR f IN SELECT oid::regprocedure AS signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'freelance_hq_website_%' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
 END LOOP;
END $$;
REVOKE UPDATE ON public.freelance_hq_website_storage_bills FROM service_role;
-- Private payment proof bucket; only the authenticated server uploads/signs objects.
DO $$ BEGIN
 IF to_regclass('storage.buckets') IS NOT NULL THEN
  INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  VALUES('hosting-website-payment-proofs','hosting-website-payment-proofs',false,2000000,ARRAY['image/png','image/jpeg'])
  ON CONFLICT(id) DO NOTHING;
  IF EXISTS(SELECT 1 FROM storage.buckets WHERE id='hosting-website-payment-proofs' AND public=true) THEN RAISE EXCEPTION 'Payment proof bucket must be private'; END IF;
 END IF;
END $$;
COMMIT;
