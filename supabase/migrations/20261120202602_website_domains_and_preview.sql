-- Additive release: no customer/project/payment rows are deleted.
ALTER TABLE public.freelance_hq_hosting_app_domains
 ADD COLUMN dns_setup_detail text,
 ADD COLUMN group_host text,
 ADD COLUMN is_preview boolean NOT NULL DEFAULT false,
 ADD COLUMN dns_verified_at timestamptz;
UPDATE public.freelance_hq_hosting_app_domains SET group_host=hostname;
ALTER TABLE public.freelance_hq_hosting_registrar_operations
 ADD COLUMN website_app_id uuid REFERENCES public.freelance_hq_hosting_apps(id) ON DELETE RESTRICT;

CREATE FUNCTION public.freelance_hq_website_preview() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.name !~ '^w-[a-f0-9]{32}$' THEN RAISE EXCEPTION 'Invalid website preview name'; END IF;
 INSERT INTO freelance_hq_hosting_app_domains(app_id,hostname,group_host,verification_token,is_preview,status,detail,dns_verified_at)
 VALUES(NEW.id,NEW.name||'.deploy.housemysite.com',NEW.name||'.deploy.housemysite.com',
  substr(replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),1,48),true,'verifying',
  'Default preview URL. Available after the first successful deployment and wildcard DNS setup.',now());
 RETURN NEW;
END $$;
CREATE TRIGGER website_preview AFTER INSERT ON public.freelance_hq_hosting_apps FOR EACH ROW EXECUTE FUNCTION public.freelance_hq_website_preview();
INSERT INTO public.freelance_hq_hosting_app_domains(app_id,hostname,group_host,verification_token,is_preview,status,detail,dns_verified_at)
 SELECT id,name||'.deploy.housemysite.com',name||'.deploy.housemysite.com',substr(replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),1,48),true,'verifying',
 'Default preview URL. Deploy or refresh this website to check HTTPS.',now()
 FROM public.freelance_hq_hosting_apps WHERE name ~ '^w-[a-f0-9]{32}$'
 ON CONFLICT(hostname) DO NOTHING;

-- Row lock makes the pair, domain allowance and retries atomic.
CREATE FUNCTION public.freelance_hq_website_domain_pair(p_actor uuid,p_app uuid,p_host text,p_admin boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE a freelance_hq_hosting_apps; t text; n integer;
BEGIN
 SELECT * INTO STRICT a FROM freelance_hq_hosting_apps WHERE id=p_app FOR UPDATE;
 PERFORM freelance_hq_website_actor(p_actor,a.client_id,p_admin);
 IF p_host IS NULL OR length(p_host)>249 OR p_host !~ '^([a-z0-9]([a-z0-9-]*[a-z0-9])?[.])+[a-z]{2,63}$'
  OR p_host='housemysite.com' OR p_host LIKE '%.housemysite.com' OR p_host LIKE 'www.%'
  OR p_host ~ '[.](local|localhost|internal|invalid)$' THEN RAISE EXCEPTION 'Custom public domain required'; END IF;
 IF EXISTS(SELECT 1 FROM freelance_hq_hosting_app_domains WHERE hostname IN(p_host,'www.'||p_host) AND app_id<>p_app)
 THEN RAISE EXCEPTION 'Domain already assigned'; END IF;
 SELECT count(*) INTO n FROM freelance_hq_hosting_app_domains WHERE app_id=p_app AND NOT is_preview AND hostname NOT IN(p_host,'www.'||p_host);
 IF n+2>10 THEN RAISE EXCEPTION 'Ten custom hostnames maximum'; END IF;
 SELECT verification_token INTO t FROM freelance_hq_hosting_app_domains WHERE app_id=p_app AND hostname=p_host;
 t:=coalesce(t,substr(replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),1,48));
 INSERT INTO freelance_hq_hosting_app_domains(app_id,hostname,group_host,verification_token,status,is_primary)
 VALUES(p_app,p_host,p_host,t,'pending_dns',n=0),(p_app,'www.'||p_host,p_host,t,'pending_dns',false)
 ON CONFLICT(hostname) DO UPDATE SET group_host=excluded.group_host,verification_token=excluded.verification_token
 WHERE freelance_hq_hosting_app_domains.app_id=p_app AND NOT freelance_hq_hosting_app_domains.is_preview;
END $$;

-- A client may automate ONLY its admin-assigned account domain, never any name
-- found in the shared registrar inventory. All requests use the same global
-- operation lock as owner registrar edits and retain uncertain outcomes.
CREATE FUNCTION public.freelance_hq_website_dns_claim(p_actor uuid,p_app uuid,p_version uuid,p_zone text,p_intent jsonb,p_before jsonb,p_admin boolean DEFAULT false)
RETURNS public.freelance_hq_hosting_registrar_operations
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE a freelance_hq_hosting_apps; c freelance_hq_hosting_registrar_connection; op freelance_hq_hosting_registrar_operations; d freelance_hq_hosting_app_domains;
 r jsonb:=p_intent->'record'; relative_name text; expected_value text;
BEGIN
 PERFORM pg_advisory_xact_lock(88731031);
 SELECT * INTO STRICT a FROM freelance_hq_hosting_apps WHERE id=p_app FOR UPDATE;
 PERFORM freelance_hq_website_actor(p_actor,a.client_id,p_admin);
 SELECT * INTO STRICT c FROM freelance_hq_hosting_registrar_connection WHERE id=true FOR UPDATE;
 IF c.version<>p_version OR c.mode<>'production' OR p_zone='housemysite.com' OR p_zone LIKE '%.housemysite.com'
  OR NOT EXISTS(SELECT 1 FROM freelance_hq_hosting_registrar_domains WHERE connection_version=p_version AND name=p_zone AND lower(details->'glue'->>'glue_type')='dns')
  OR lower(p_before->'glue'->>'glue_type') IS DISTINCT FROM 'dns'
  OR p_before->>'name' IS DISTINCT FROM p_zone THEN RAISE EXCEPTION 'Dynadot DNS ownership changed'; END IF;
 IF NOT p_admin AND NOT EXISTS(SELECT 1 FROM freelance_hq_hosting_domains WHERE client_id=a.client_id AND hostname=p_zone)
 THEN RAISE EXCEPTION 'Admin domain assignment required'; END IF;
 IF EXISTS(SELECT 1 FROM freelance_hq_hosting_registrar_operations WHERE state IN('executing','uncertain')) THEN RAISE EXCEPTION 'Registrar outcome needs reconciliation'; END IF;
 IF p_intent->>'kind' IS DISTINCT FROM 'dns_add' OR r IS NULL OR r->>'type' NOT IN('a','cname','txt') OR r->>'value' IS NULL THEN RAISE EXCEPTION 'DNS additions only'; END IF;
 -- Bind the exact relative record and value to a saved, owned website domain.
 FOR d IN SELECT * FROM freelance_hq_hosting_app_domains WHERE app_id=p_app AND NOT is_preview AND (hostname=p_zone OR right(hostname,length(p_zone)+1)='.'||p_zone) LOOP
  relative_name:=CASE WHEN d.hostname=p_zone THEN '@' ELSE left(d.hostname,length(d.hostname)-length(p_zone)-1) END;
  expected_value:=CASE WHEN d.hostname='www.'||d.group_host THEN d.group_host ELSE '62.171.130.156' END;
  IF (r->>'host'=relative_name AND r->>'value'=expected_value AND r->>'type'=CASE WHEN d.hostname='www.'||d.group_host THEN 'cname' ELSE 'a' END)
   OR (d.hostname=d.group_host AND r->>'host'='_hms-verify.'||CASE WHEN relative_name='@' THEN '' ELSE relative_name END AND r->>'type'='txt' AND r->>'value'=d.verification_token)
   OR (d.hostname=p_zone AND r->>'host'='_hms-verify' AND r->>'type'='txt' AND r->>'value'=d.verification_token) THEN
    INSERT INTO freelance_hq_hosting_registrar_operations(actor_id,connection_version,domain,kind,intent,before_state,state,website_app_id)
    VALUES(p_actor,p_version,p_zone,'dns_add',p_intent,p_before,'executing',p_app) RETURNING * INTO op;
    INSERT INTO freelance_hq_hosting_audit_logs(actor_id,event,entity,entity_id) VALUES(p_actor,'website_dns_submitted','registrar',op.id);
    RETURN op;
  END IF;
 END LOOP;
 RAISE EXCEPTION 'DNS record is outside website authority';
END $$;
CREATE FUNCTION public.freelance_hq_website_dns_finish(p_actor uuid,p_id uuid,p_state text,p_admin boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE op freelance_hq_hosting_registrar_operations; a freelance_hq_hosting_apps;
BEGIN
 SELECT * INTO STRICT op FROM freelance_hq_hosting_registrar_operations WHERE id=p_id AND website_app_id IS NOT NULL FOR UPDATE;
 SELECT * INTO STRICT a FROM freelance_hq_hosting_apps WHERE id=op.website_app_id;
 PERFORM freelance_hq_website_actor(p_actor,a.client_id,p_admin);
 IF NOT p_admin AND op.actor_id<>p_actor THEN RAISE EXCEPTION 'Operation actor changed'; END IF;
 IF p_state NOT IN('confirmed','uncertain','failed') OR op.state NOT IN('executing','uncertain') OR (op.state='uncertain' AND p_state='failed') THEN RAISE EXCEPTION 'Operation state changed'; END IF;
 UPDATE freelance_hq_hosting_registrar_operations SET state=p_state,updated_at=now() WHERE id=p_id;
 INSERT INTO freelance_hq_hosting_audit_logs(actor_id,event,entity,entity_id) VALUES(p_actor,'website_dns_'||p_state,'registrar',p_id);
END $$;
REVOKE ALL ON FUNCTION public.freelance_hq_website_preview(),public.freelance_hq_website_domain_pair(uuid,uuid,text,boolean),public.freelance_hq_website_dns_claim(uuid,uuid,uuid,text,jsonb,jsonb,boolean),public.freelance_hq_website_dns_finish(uuid,uuid,text,boolean) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.freelance_hq_website_preview(),public.freelance_hq_website_domain_pair(uuid,uuid,text,boolean),public.freelance_hq_website_dns_claim(uuid,uuid,uuid,text,jsonb,jsonb,boolean),public.freelance_hq_website_dns_finish(uuid,uuid,text,boolean) TO service_role;
