-- Apply ONLY after the extension-removal application release is serving production.
-- Retain historical rows and foreign keys. No DROP, DELETE, TRUNCATE or credential export.
-- The archive is deliberately outside the API's exposed public schema.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE SCHEMA IF NOT EXISTS freelance_hq_retired_extensions AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA freelance_hq_retired_extensions FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON SCHEMA freelance_hq_retired_extensions IS
  'Private historical archive of retired human-monitoring and WhatsApp extensions; owner access only.';

DO $retirement$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'freelance_hq_activity_logs',
    'freelance_hq_activity_settings',
    'freelance_hq_ai_prompt_logs',
    'freelance_hq_browser_sessions',
    'freelance_hq_employee_devices',
    'freelance_hq_extension_pair_attempts',
    'freelance_hq_extension_pairing_tokens',
    'freelance_hq_member_presence',
    'freelance_hq_project_domain_mappings',
    'freelance_hq_screen_share_sessions',
    'freelance_hq_screen_share_signals',
    'freelance_hq_whatsapp_admin_chats',
    'freelance_hq_whatsapp_audio_jobs',
    'freelance_hq_whatsapp_bridge_devices',
    'freelance_hq_whatsapp_bridge_pairing_tokens',
    'freelance_hq_whatsapp_bridge_requests',
    'freelance_hq_whatsapp_chat_access',
    'freelance_hq_whatsapp_client_links',
    'freelance_hq_whatsapp_message_shares',
    'freelance_hq_whatsapp_message_translations',
    'freelance_hq_whatsapp_messages',
    'freelance_hq_whatsapp_translation_settings'
  ] LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      -- An unexpected duplicate must abort instead of overwriting any archive.
      IF to_regclass(format('freelance_hq_retired_extensions.%I', table_name)) IS NOT NULL THEN
        RAISE EXCEPTION 'Retirement archive collision for %', table_name;
      END IF;
      EXECUTE format('ALTER TABLE public.%I SET SCHEMA freelance_hq_retired_extensions', table_name);
    END IF;
    IF to_regclass(format('freelance_hq_retired_extensions.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE freelance_hq_retired_extensions.%I ENABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format('REVOKE ALL ON TABLE freelance_hq_retired_extensions.%I FROM PUBLIC, anon, authenticated, service_role', table_name);
      EXECUTE format('COMMENT ON TABLE freelance_hq_retired_extensions.%I IS %L', table_name,
        'Retired extension archive. Historical data retained; application roles have no access.');
    END IF;
  END LOOP;
END;
$retirement$;

-- No archive object is available to application roles, including attached sequences.
REVOKE ALL ON ALL TABLES IN SCHEMA freelance_hq_retired_extensions FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA freelance_hq_retired_extensions FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA freelance_hq_retired_extensions FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA freelance_hq_retired_extensions REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA freelance_hq_retired_extensions REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA freelance_hq_retired_extensions REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
