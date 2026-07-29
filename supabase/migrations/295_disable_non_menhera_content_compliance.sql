-- 295: Isolate settings accidentally backfilled outside Menhera.
--
-- Preserve policies, submissions, and other historical rows for audit and
-- recovery. Only deactivate the stale setting written by migration 288; the
-- hard slug gate in migration 293 remains authoritative even if a stale value
-- is later reintroduced.

update public.app_settings setting
   set value = 'false',
       updated_at = now()
  from public.tenants tenant
 where setting.guild_id = tenant.id
   and setting.key = 'alliance_content_compliance_enabled'
   and tenant.slug is distinct from 'menhera'
   and setting.value is distinct from 'false';
