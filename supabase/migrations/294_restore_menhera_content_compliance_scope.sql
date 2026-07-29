-- 294: Restore the Menhera-only boundary for content compliance.
--
-- Migration 288 broadened the resolver and installed a tenant bootstrap trigger.
-- Keep its generic manual exchange restriction feature, but make every existing
-- compliance and recent-gameplay-video RPC use the original slug-and-setting
-- entitlement again.

create or replace function public.alliance_content_compliance_enabled(p_guild_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.tenants t
      join public.app_settings s
        on s.guild_id = t.id
       and s.key = 'alliance_content_compliance_enabled'
       and s.value = 'true'
     where t.id = p_guild_id
       and t.slug = 'menhera'
  );
$$;

revoke all on function public.alliance_content_compliance_enabled(uuid)
  from public, anon, authenticated;
grant execute on function public.alliance_content_compliance_enabled(uuid)
  to service_role;

drop trigger if exists tenants_initialize_alliance_content_compliance
  on public.tenants;
drop function if exists public.initialize_alliance_content_compliance();

comment on function public.alliance_content_compliance_enabled(uuid) is
  'Single Menhera slug-and-setting entitlement for compliance UI, RPCs, and the recent-video exchange gate.';
