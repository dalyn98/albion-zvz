-- Product read model for the battle ledger UI.
--
-- The legacy /battles product surface used tenant_battle_records as the primary
-- row. The battle ledger model keeps battle_records as the immutable Albion
-- source and battle_view_projections as the guild-facing interpretation.
--
-- This view binds projections to active tenants through each tenant's configured
-- Albion home guild id. tenant_battle_records stays as a legacy compatibility
-- join only; it is not the source of the new list/detail UI.

create or replace view public.guild_battle_views
with (security_invoker = true)
as
with tenant_home as (
  select
    t.id as tenant_id,
    home.value as home_guild_id,
    nullif(server.value, '') as albion_server
  from public.tenants t
  join public.app_settings home
    on home.guild_id = t.id
   and home.key = 'albion_home_guild_id'
   and btrim(home.value) <> ''
  left join public.app_settings server
    on server.guild_id = t.id
   and server.key = 'albion_server'
  where t.status = 'active'
)
select
  bvp.id,
  th.tenant_id,
  bvp.battle_record_id,
  tbr.id as legacy_tenant_battle_record_id,
  br.albion_server,
  br.albion_battle_id,
  br.started_at,
  br.ended_at,
  br.cluster_name,
  br.total_players,
  br.total_kills,
  br.total_fame,
  bvp.subject_type,
  bvp.subject_albion_id,
  bvp.subject_name,
  bvp.subject_alliance_id,
  bvp.subject_alliance_name,
  bvp.relation_scope,
  bvp.opponent_force_key,
  bvp.opponent_force_kind,
  bvp.opponent_force_albion_id,
  bvp.opponent_force_name,
  bvp.opponent_alliance_id,
  bvp.subject_team_size,
  bvp.subject_kills,
  bvp.subject_deaths,
  bvp.subject_kill_fame,
  bvp.opponent_team_size,
  bvp.opponent_kills,
  bvp.opponent_deaths,
  bvp.opponent_kill_fame,
  bvp.status,
  bvp.evidence_source,
  bvp.is_meaningful,
  bvp.view_policy,
  bvp.result_estimate,
  bvp.size_category,
  bvp.legacy_outcome,
  tbr.outcome as legacy_row_outcome,
  tbr.is_provisional as legacy_is_provisional,
  tbr.match_index,
  tbr.match_total,
  exists (
    select 1
    from public.battle_projection_diffs diff
    where diff.battle_record_id = bvp.battle_record_id
      and diff.subject_type = bvp.subject_type
      and diff.subject_albion_id = bvp.subject_albion_id
      and diff.resolved_at is null
  ) as has_active_diff,
  coalesce(
    (
      select array_agg(distinct diff.diff_type order by diff.diff_type)
      from public.battle_projection_diffs diff
      where diff.battle_record_id = bvp.battle_record_id
        and diff.subject_type = bvp.subject_type
        and diff.subject_albion_id = bvp.subject_albion_id
        and diff.resolved_at is null
    ),
    '{}'::text[]
  ) as active_diff_types,
  bvp.evaluated_at,
  bvp.created_at,
  bvp.updated_at
from public.battle_view_projections bvp
join public.battle_records br
  on br.id = bvp.battle_record_id
join tenant_home th
  on th.home_guild_id = bvp.subject_albion_id
 and (th.albion_server is null or th.albion_server = br.albion_server)
left join public.tenant_battle_records tbr
  on tbr.guild_id = th.tenant_id
 and tbr.battle_record_id = bvp.battle_record_id
 and tbr.main_opponent_force_key = bvp.opponent_force_key;

revoke all on public.guild_battle_views from anon, authenticated;

comment on view public.guild_battle_views is
  'Tenant-bound battle ledger read model for /battles. Uses battle_view_projections as the product source and tenant_battle_records only as legacy compatibility metadata.';
