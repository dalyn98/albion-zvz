-- Attribute season rankings to each guild's most recently observed alliance
-- at the selected snapshot. Battle-time alliance facts remain immutable and
-- are returned separately for evidence logs.
--
-- Alliance ranking evidence is rebuilt from guild rows. At least two guilds
-- that currently resolve to the same alliance must have fought in the same
-- joint sortie, preventing a lone transferred guild from creating alliance
-- credit. A forward migration can restore battle-time attribution by replacing
-- these functions and force-refreshing the derived snapshots.

create or replace function public.get_public_zvz_v2_latest_guild_alliances(
  p_season_id uuid,
  p_snapshot_date date
)
returns table (
  guild_albion_id text,
  guild_name text,
  alliance_albion_id text,
  alliance_name text,
  observed_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (evidence.entity_albion_id)
    evidence.entity_albion_id,
    evidence.entity_name,
    evidence.alliance_albion_id,
    evidence.alliance_name,
    evidence.battle_started_at
  from public.public_zvz_v2_season_evidence evidence
  where evidence.season_id = p_season_id
    and evidence.entity_kind = 'guild'
    and evidence.evidence_date <= p_snapshot_date
  order by
    evidence.entity_albion_id,
    evidence.battle_started_at desc,
    evidence.engagement_id desc;
$$;

revoke all on function public.get_public_zvz_v2_latest_guild_alliances(uuid, date)
  from public, anon, authenticated;
grant execute on function public.get_public_zvz_v2_latest_guild_alliances(uuid, date)
  to service_role;

comment on function public.get_public_zvz_v2_latest_guild_alliances(uuid, date) is
  'Resolves each observed guild to its latest battle-observed alliance at one season snapshot date; a latest null alliance remains null.';

create or replace function public.get_public_zvz_v2_entity_evidence(
  p_season_id uuid,
  p_snapshot_date date,
  p_entity_kind text,
  p_entity_albion_id text,
  p_limit integer default 5000
)
returns table (
  season_id uuid,
  evidence_date date,
  engagement_id uuid,
  battle_record_id uuid,
  albion_server text,
  battle_started_at timestamptz,
  battle_ended_at timestamptz,
  engagement_key text,
  result text,
  scale text,
  entity_kind text,
  entity_albion_id text,
  entity_name text,
  alliance_albion_id text,
  alliance_name text,
  battle_alliance_albion_id text,
  battle_alliance_name text,
  own_team_size integer,
  side_team_size integer,
  opponent_side_team_size integer,
  participation_share numeric,
  battle_credit numeric,
  battle_points numeric,
  kills integer,
  deaths integer,
  kill_fame bigint,
  average_item_power numeric,
  item_power_sample_count integer,
  participation_kind text,
  opponents jsonb,
  qualification_version text,
  member_guilds jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with latest_membership as (
    select *
    from public.get_public_zvz_v2_latest_guild_alliances(
      p_season_id,
      p_snapshot_date
    )
  ),
  guild_rows as (
    select
      evidence.season_id,
      evidence.evidence_date,
      evidence.engagement_id,
      evidence.battle_record_id,
      evidence.albion_server,
      evidence.battle_started_at,
      evidence.battle_ended_at,
      evidence.engagement_key,
      evidence.result,
      evidence.scale,
      evidence.entity_kind,
      evidence.entity_albion_id,
      evidence.entity_name,
      membership.alliance_albion_id,
      membership.alliance_name,
      evidence.alliance_albion_id as battle_alliance_albion_id,
      evidence.alliance_name as battle_alliance_name,
      evidence.own_team_size,
      evidence.side_team_size,
      evidence.opponent_side_team_size,
      evidence.participation_share,
      evidence.battle_credit,
      evidence.battle_points,
      evidence.kills,
      evidence.deaths,
      evidence.kill_fame,
      evidence.average_item_power,
      evidence.item_power_sample_count,
      evidence.participation_kind,
      evidence.opponents,
      evidence.qualification_version,
      '[]'::jsonb as member_guilds
    from public.public_zvz_v2_season_evidence evidence
    left join latest_membership membership
      on membership.guild_albion_id = evidence.entity_albion_id
    where p_entity_kind = 'guild'
      and evidence.season_id = p_season_id
      and evidence.evidence_date <= p_snapshot_date
      and evidence.entity_kind = 'guild'
      and evidence.entity_albion_id = p_entity_albion_id
  ),
  alliance_group_members as (
    select
      evidence.engagement_id,
      evidence.alliance_albion_id as battle_alliance_albion_id,
      membership.alliance_albion_id as current_alliance_albion_id,
      coalesce(
        (array_agg(
          membership.alliance_name
          order by membership.observed_at desc nulls last,
            membership.guild_albion_id
        ))[1],
        membership.alliance_albion_id
      ) as current_alliance_name,
      sum(evidence.own_team_size)::numeric as observed_team_size,
      jsonb_agg(
        jsonb_build_object(
          'guildAlbionId', evidence.entity_albion_id,
          'guildName', evidence.entity_name,
          'teamSize', evidence.own_team_size,
          'kills', evidence.kills,
          'deaths', evidence.deaths,
          'killFame', evidence.kill_fame,
          'battleCredit', evidence.battle_credit
        )
        order by evidence.own_team_size desc, evidence.entity_albion_id
      ) as member_guilds
    from public.public_zvz_v2_season_evidence evidence
    join latest_membership membership
      on membership.guild_albion_id = evidence.entity_albion_id
     and membership.alliance_albion_id = p_entity_albion_id
    where p_entity_kind = 'alliance'
      and evidence.season_id = p_season_id
      and evidence.evidence_date <= p_snapshot_date
      and evidence.entity_kind = 'guild'
      and evidence.participation_kind = 'joint_sortie'
    group by
      evidence.engagement_id,
      evidence.alliance_albion_id,
      membership.alliance_albion_id
    having count(distinct evidence.entity_albion_id) >= 2
  ),
  alliance_observed_totals as (
    select
      evidence.engagement_id,
      evidence.alliance_albion_id as battle_alliance_albion_id,
      sum(evidence.own_team_size)::numeric as observed_team_size
    from public.public_zvz_v2_season_evidence evidence
    where evidence.season_id = p_season_id
      and evidence.evidence_date <= p_snapshot_date
      and evidence.entity_kind = 'guild'
      and evidence.participation_kind = 'joint_sortie'
    group by evidence.engagement_id, evidence.alliance_albion_id
  ),
  alliance_rows as (
    select
      force.season_id,
      force.evidence_date,
      force.engagement_id,
      force.battle_record_id,
      force.albion_server,
      force.battle_started_at,
      force.battle_ended_at,
      force.engagement_key,
      force.result,
      case
        when greatest(
          greatest(
            1,
            round(
              force.own_team_size
                * members.observed_team_size
                / nullif(total.observed_team_size, 0)
            )::integer
          ),
          force.opponent_side_team_size
        ) <= 20 then 'small'
        when greatest(
          greatest(
            1,
            round(
              force.own_team_size
                * members.observed_team_size
                / nullif(total.observed_team_size, 0)
            )::integer
          ),
          force.opponent_side_team_size
        ) <= 40 then 'mid'
        when greatest(
          greatest(
            1,
            round(
              force.own_team_size
                * members.observed_team_size
                / nullif(total.observed_team_size, 0)
            )::integer
          ),
          force.opponent_side_team_size
        ) <= 80 then 'large'
        else 'zerg'
      end as scale,
      'alliance'::text as entity_kind,
      members.current_alliance_albion_id as entity_albion_id,
      members.current_alliance_name as entity_name,
      members.current_alliance_albion_id as alliance_albion_id,
      members.current_alliance_name as alliance_name,
      force.entity_albion_id as battle_alliance_albion_id,
      force.entity_name as battle_alliance_name,
      greatest(
        1,
        round(
          force.own_team_size
            * members.observed_team_size
            / nullif(total.observed_team_size, 0)
        )::integer
      ) as own_team_size,
      greatest(
        1,
        round(
          force.own_team_size
            * members.observed_team_size
            / nullif(total.observed_team_size, 0)
        )::integer
      ) as side_team_size,
      force.opponent_side_team_size,
      force.participation_share
        * members.observed_team_size
        / nullif(total.observed_team_size, 0) as participation_share,
      force.battle_credit
        * members.observed_team_size
        / nullif(total.observed_team_size, 0) as battle_credit,
      force.battle_points
        * members.observed_team_size
        / nullif(total.observed_team_size, 0) as battle_points,
      round(
        force.kills
          * members.observed_team_size
          / nullif(total.observed_team_size, 0)
      )::integer as kills,
      round(
        force.deaths
          * members.observed_team_size
          / nullif(total.observed_team_size, 0)
      )::integer as deaths,
      round(
        force.kill_fame
          * members.observed_team_size
          / nullif(total.observed_team_size, 0)
      )::bigint as kill_fame,
      case
        when round(
          force.item_power_sample_count
            * members.observed_team_size
            / nullif(total.observed_team_size, 0)
        ) > 0 then force.average_item_power
        else null
      end as average_item_power,
      round(
        force.item_power_sample_count
          * members.observed_team_size
          / nullif(total.observed_team_size, 0)
      )::integer as item_power_sample_count,
      'joint_sortie'::text as participation_kind,
      force.opponents,
      force.qualification_version,
      members.member_guilds
    from alliance_group_members members
    join alliance_observed_totals total
      on total.engagement_id = members.engagement_id
     and total.battle_alliance_albion_id = members.battle_alliance_albion_id
    join public.public_zvz_v2_season_evidence force
      on force.season_id = p_season_id
     and force.evidence_date <= p_snapshot_date
     and force.engagement_id = members.engagement_id
     and force.entity_kind = 'alliance'
     and force.entity_albion_id = members.battle_alliance_albion_id
  ),
  combined as (
    select * from guild_rows
    union all
    select * from alliance_rows
  )
  select *
  from combined
  order by combined.battle_started_at desc, combined.engagement_id desc
  limit least(5000, greatest(1, coalesce(p_limit, 5000)));
$$;

revoke all on function public.get_public_zvz_v2_entity_evidence(
  uuid, date, text, text, integer
) from public, anon, authenticated;
grant execute on function public.get_public_zvz_v2_entity_evidence(
  uuid, date, text, text, integer
) to service_role;

comment on function public.get_public_zvz_v2_entity_evidence(
  uuid, date, text, text, integer
) is
  'Returns guild evidence with current alliance metadata or current-alliance joint evidence synthesized from member guild shares, while preserving battle-time alliance fields for logs.';

create or replace function public.get_public_zvz_v2_representative_guilds(
  p_season_id uuid,
  p_snapshot_date date,
  p_scope text,
  p_alliance_ids text[]
)
returns table (
  alliance_albion_id text,
  guild_albion_id text,
  guild_name text,
  engagement_count integer,
  equivalent_battles numeric,
  kills integer
)
language sql
stable
security definer
set search_path = public
as $$
  with attributed as (
    select
      requested.alliance_albion_id,
      evidence.engagement_id,
      evidence.battle_started_at,
      evidence.scale,
      evidence.side_team_size,
      evidence.opponent_side_team_size,
      evidence.member_guilds
    from unnest(coalesce(p_alliance_ids, array[]::text[]))
      requested(alliance_albion_id)
    cross join lateral public.get_public_zvz_v2_entity_evidence(
      p_season_id,
      p_snapshot_date,
      'alliance',
      requested.alliance_albion_id,
      5000
    ) evidence
    where p_scope = 'overall'
       or (
         p_scope in ('small', 'mid', 'large', 'zerg')
         and evidence.scale = p_scope
         and least(
           evidence.side_team_size,
           evidence.opponent_side_team_size
         ) * 4 >= greatest(
           evidence.side_team_size,
           evidence.opponent_side_team_size
         ) * 3
       )
  ),
  contributions as (
    select
      attributed.alliance_albion_id,
      attributed.engagement_id,
      attributed.battle_started_at,
      member.value->>'guildAlbionId' as guild_albion_id,
      member.value->>'guildName' as guild_name,
      (member.value->>'battleCredit')::numeric as battle_credit,
      (member.value->>'kills')::integer as kills
    from attributed
    cross join lateral jsonb_array_elements(attributed.member_guilds) member(value)
  ),
  aggregated as (
    select
      contribution.alliance_albion_id,
      contribution.guild_albion_id,
      (array_agg(
        contribution.guild_name
        order by contribution.battle_started_at desc,
          contribution.engagement_id desc
      ))[1] as guild_name,
      count(distinct contribution.engagement_id)::integer as engagement_count,
      sum(contribution.battle_credit)::numeric as equivalent_battles,
      sum(contribution.kills)::integer as kills
    from contributions contribution
    group by contribution.alliance_albion_id, contribution.guild_albion_id
  ),
  ranked as (
    select
      aggregated.*,
      row_number() over (
        partition by aggregated.alliance_albion_id
        order by
          aggregated.equivalent_battles desc,
          aggregated.kills desc,
          aggregated.engagement_count desc,
          aggregated.guild_name asc,
          aggregated.guild_albion_id asc
      ) as contribution_rank
    from aggregated
  )
  select
    ranked.alliance_albion_id,
    ranked.guild_albion_id,
    ranked.guild_name,
    ranked.engagement_count,
    ranked.equivalent_battles,
    ranked.kills
  from ranked
  where ranked.contribution_rank = 1
  order by ranked.alliance_albion_id;
$$;

revoke all on function public.get_public_zvz_v2_representative_guilds(
  uuid, date, text, text[]
) from public, anon, authenticated;
grant execute on function public.get_public_zvz_v2_representative_guilds(
  uuid, date, text, text[]
) to service_role;

comment on function public.get_public_zvz_v2_representative_guilds(
  uuid, date, text, text[]
) is
  'Returns the lead guild from current-alliance-attributed joint evidence in the requested ranking scope.';

create or replace function public.rebuild_public_zvz_v5_rollups(
  p_season_id uuid,
  p_snapshot_dates date[]
)
returns integer
language plpgsql
security definer
set search_path = public
set statement_timeout = '180s'
as $$
declare
  v_rollup_rows integer;
  v_previous_guard text := current_setting(
    'agm.rebuilding_comparable_scale_rollups',
    true
  );
begin
  if coalesce(cardinality(p_snapshot_dates), 0) = 0 then
    return 0;
  end if;

  perform set_config('agm.rebuilding_comparable_scale_rollups', '1', true);

  -- Retain the proven guild aggregation and v4 mobilization curve. Its
  -- battle-time alliance rows are replaced below before publication.
  perform public.rebuild_public_zvz_v4_rollups_legacy(
    p_season_id,
    p_snapshot_dates
  );

  delete from public.public_zvz_v2_season_rollups rollup
   where rollup.season_id = p_season_id
     and rollup.snapshot_date = any(p_snapshot_dates)
     and rollup.entity_kind = 'alliance';

  with snapshot_days as (
    select snapshot.snapshot_date
    from public.public_zvz_v2_season_snapshots snapshot
    where snapshot.season_id = p_season_id
      and snapshot.snapshot_date = any(p_snapshot_dates)
  ),
  alliance_group_members as (
    select
      day.snapshot_date,
      evidence.engagement_id,
      evidence.alliance_albion_id as battle_alliance_albion_id,
      membership.alliance_albion_id as current_alliance_albion_id,
      coalesce(
        (array_agg(
          membership.alliance_name
          order by membership.observed_at desc nulls last,
            membership.guild_albion_id
        ))[1],
        membership.alliance_albion_id
      ) as current_alliance_name,
      sum(evidence.own_team_size)::numeric as observed_team_size
    from snapshot_days day
    join public.public_zvz_v2_season_evidence evidence
      on evidence.season_id = p_season_id
     and evidence.evidence_date <= day.snapshot_date
     and evidence.entity_kind = 'guild'
     and evidence.participation_kind = 'joint_sortie'
    join lateral public.get_public_zvz_v2_latest_guild_alliances(
      p_season_id,
      day.snapshot_date
    ) membership
      on membership.guild_albion_id = evidence.entity_albion_id
     and membership.alliance_albion_id is not null
    group by
      day.snapshot_date,
      evidence.engagement_id,
      evidence.alliance_albion_id,
      membership.alliance_albion_id
    having count(distinct evidence.entity_albion_id) >= 2
  ),
  alliance_observed_totals as (
    select
      day.snapshot_date,
      evidence.engagement_id,
      evidence.alliance_albion_id as battle_alliance_albion_id,
      sum(evidence.own_team_size)::numeric as observed_team_size
    from snapshot_days day
    join public.public_zvz_v2_season_evidence evidence
      on evidence.season_id = p_season_id
     and evidence.evidence_date <= day.snapshot_date
     and evidence.entity_kind = 'guild'
     and evidence.participation_kind = 'joint_sortie'
    group by
      day.snapshot_date,
      evidence.engagement_id,
      evidence.alliance_albion_id
  ),
  alliance_engagements as (
    select
      members.snapshot_date,
      force.engagement_id,
      force.battle_started_at,
      members.current_alliance_albion_id as entity_albion_id,
      members.current_alliance_name as entity_name,
      greatest(
        1,
        round(
          force.own_team_size
            * members.observed_team_size
            / nullif(total.observed_team_size, 0)
        )::integer
      ) as own_team_size,
      greatest(
        1,
        round(
          force.own_team_size
            * members.observed_team_size
            / nullif(total.observed_team_size, 0)
        )::integer
      ) as side_team_size,
      force.opponent_side_team_size,
      force.battle_credit
        * members.observed_team_size
        / nullif(total.observed_team_size, 0) as battle_credit,
      force.battle_points
        * members.observed_team_size
        / nullif(total.observed_team_size, 0) as battle_points,
      round(
        force.kills
          * members.observed_team_size
          / nullif(total.observed_team_size, 0)
      )::integer as kills,
      round(
        force.deaths
          * members.observed_team_size
          / nullif(total.observed_team_size, 0)
      )::integer as deaths,
      round(
        force.kill_fame
          * members.observed_team_size
          / nullif(total.observed_team_size, 0)
      )::bigint as kill_fame,
      case
        when round(
          force.item_power_sample_count
            * members.observed_team_size
            / nullif(total.observed_team_size, 0)
        ) > 0 then force.average_item_power
        else null
      end as average_item_power,
      round(
        force.item_power_sample_count
          * members.observed_team_size
          / nullif(total.observed_team_size, 0)
      )::integer as item_power_sample_count
    from alliance_group_members members
    join alliance_observed_totals total
      on total.snapshot_date = members.snapshot_date
     and total.engagement_id = members.engagement_id
     and total.battle_alliance_albion_id = members.battle_alliance_albion_id
    join public.public_zvz_v2_season_evidence force
      on force.season_id = p_season_id
     and force.evidence_date <= members.snapshot_date
     and force.engagement_id = members.engagement_id
     and force.entity_kind = 'alliance'
     and force.entity_albion_id = members.battle_alliance_albion_id
  ),
  classified as (
    select
      alliance.*,
      case
        when greatest(
          alliance.side_team_size,
          alliance.opponent_side_team_size
        ) <= 20 then 'small'
        when greatest(
          alliance.side_team_size,
          alliance.opponent_side_team_size
        ) <= 40 then 'mid'
        when greatest(
          alliance.side_team_size,
          alliance.opponent_side_team_size
        ) <= 80 then 'large'
        else 'zerg'
      end as scale,
      greatest(
        0::numeric,
        alliance.kills * 3
          + alliance.kill_fame::numeric / 750000
          - greatest(alliance.deaths - alliance.kills, 0) * 1.5
      ) as combat_contribution
    from alliance_engagements alliance
  ),
  expanded as (
    select
      classified.*,
      scope.value as scope
    from classified
    cross join lateral (
      select 'overall'::text as value
      union all
      select classified.scale
      where least(
        classified.side_team_size,
        classified.opponent_side_team_size
      ) * 4 >= greatest(
        classified.side_team_size,
        classified.opponent_side_team_size
      ) * 3
    ) scope
  ),
  ordered as (
    select
      expanded.*,
      row_number() over (
        partition by
          expanded.snapshot_date,
          expanded.entity_albion_id,
          expanded.scope
        order by
          expanded.own_team_size desc,
          expanded.battle_started_at desc,
          expanded.engagement_id
      ) as size_order
    from expanded
  ),
  aggregated as (
    select
      ordered.snapshot_date,
      ordered.entity_albion_id,
      ordered.scope,
      (array_agg(
        ordered.entity_name
        order by ordered.battle_started_at desc, ordered.engagement_id desc
      ))[1] as entity_name,
      count(*)::integer as engagement_count,
      sum(ordered.battle_credit)::numeric as equivalent_battles,
      sum(ordered.kills)::integer as kills,
      sum(ordered.deaths)::integer as deaths,
      sum(ordered.kill_fame)::bigint as kill_fame,
      round(
        avg(ordered.own_team_size) filter (where ordered.size_order <= 3),
        2
      ) as representative_size,
      round(avg(ordered.own_team_size), 2) as average_size,
      max(ordered.own_team_size)::integer as max_size,
      round(avg(ordered.combat_contribution), 6) as combat_index,
      round(sum(ordered.battle_points), 6) as battle_points,
      round(
        sum(ordered.average_item_power * ordered.item_power_sample_count)
          filter (where ordered.item_power_sample_count > 0)
          / nullif(
              sum(ordered.item_power_sample_count)
                filter (where ordered.item_power_sample_count > 0),
              0
            ),
        2
      ) as average_item_power,
      coalesce(sum(ordered.item_power_sample_count), 0)::integer
        as item_power_sample_count,
      max(ordered.battle_started_at) as latest_battle_at
    from ordered
    group by
      ordered.snapshot_date,
      ordered.entity_albion_id,
      ordered.scope
  ),
  metrics as (
    select
      aggregated.*,
      (
        aggregated.kills + aggregated.engagement_count * 5
      )::numeric / (
        aggregated.kills
          + aggregated.deaths
          + aggregated.engagement_count * 10
      )::numeric as efficiency_index
    from aggregated
  ),
  components as (
    select
      metrics.*,
      case
        when metrics.scope = 'overall'
          then 350::numeric * metrics.representative_size
            / (metrics.representative_size + 100::numeric)
        else 0::numeric
      end as size_points,
      case
        when metrics.combat_index <= 0 then 0::numeric
        when metrics.scope = 'overall'
          then 300::numeric * metrics.combat_index
            / (metrics.combat_index + 60::numeric)
        else 550::numeric * metrics.combat_index
          / (metrics.combat_index + 60::numeric)
      end as combat_points,
      case
        when metrics.scope = 'overall'
          then 200::numeric * metrics.efficiency_index
        else 300::numeric * metrics.efficiency_index
      end as efficiency_points,
      case
        when metrics.equivalent_battles <= 0 then 0::numeric
        else 150::numeric * least(
          1::numeric,
          ln(1 + metrics.equivalent_battles) / ln(11::numeric)
        )
      end as activity_points
    from metrics
  ),
  scored as (
    select
      components.*,
      round(
        components.size_points
          + components.combat_points
          + components.efficiency_points
          + components.activity_points,
        2
      ) as score
    from components
  )
  insert into public.public_zvz_v2_season_rollups (
    season_id,
    snapshot_date,
    albion_server,
    entity_kind,
    entity_albion_id,
    entity_name,
    alliance_albion_id,
    alliance_name,
    tenant_id,
    tenant_slug,
    tenant_profile_enabled,
    scope,
    engagement_count,
    equivalent_battles,
    kills,
    deaths,
    kill_fame,
    representative_size,
    average_size,
    max_size,
    combat_index,
    efficiency_index,
    battle_points,
    size_points,
    combat_points,
    efficiency_points,
    activity_points,
    average_item_power,
    item_power_sample_count,
    score,
    rank,
    sample_status,
    latest_battle_at,
    score_formula_version,
    updated_at
  )
  select
    p_season_id,
    scored.snapshot_date,
    season.albion_server,
    'alliance',
    scored.entity_albion_id,
    scored.entity_name,
    scored.entity_albion_id,
    scored.entity_name,
    null,
    null,
    false,
    scored.scope,
    scored.engagement_count,
    scored.equivalent_battles,
    scored.kills,
    scored.deaths,
    scored.kill_fame,
    scored.representative_size,
    scored.average_size,
    scored.max_size,
    round(scored.combat_index, 6),
    round(scored.efficiency_index, 6),
    scored.battle_points,
    round(scored.size_points, 6),
    round(scored.combat_points, 6),
    round(scored.efficiency_points, 6),
    round(scored.activity_points, 6),
    scored.average_item_power,
    scored.item_power_sample_count,
    scored.score,
    1,
    case
      when scored.engagement_count >= 2 then 'ranked'
      else 'insufficient_sample'
    end,
    scored.latest_battle_at,
    'agm_zvz_v5',
    clock_timestamp()
  from scored
  join public.zvz_seasons season on season.id = p_season_id;

  -- Apply the unchanged v5 combat and efficiency formula to guild rows only.
  -- Alliance rows above were already calculated from attributed evidence.
  with snapshot_days as (
    select snapshot.snapshot_date
    from public.public_zvz_v2_season_snapshots snapshot
    where snapshot.season_id = p_season_id
      and snapshot.snapshot_date = any(p_snapshot_dates)
  ),
  expanded as (
    select
      day.snapshot_date,
      evidence.entity_kind,
      evidence.entity_albion_id,
      scope.value as scope,
      evidence.kills,
      evidence.deaths,
      greatest(
        0::numeric,
        evidence.kills * 3
          + evidence.kill_fame::numeric / 750000
          - greatest(evidence.deaths - evidence.kills, 0) * 1.5
      ) as combat_contribution
    from snapshot_days day
    join public.public_zvz_v2_season_evidence evidence
      on evidence.season_id = p_season_id
     and evidence.evidence_date <= day.snapshot_date
     and evidence.entity_kind = 'guild'
    cross join lateral (
      select 'overall'::text as value
      union all
      select evidence.scale
      where least(
        evidence.side_team_size,
        evidence.opponent_side_team_size
      ) * 4 >= greatest(
        evidence.side_team_size,
        evidence.opponent_side_team_size
      ) * 3
    ) scope
  ),
  aggregated as (
    select
      expanded.snapshot_date,
      expanded.entity_kind,
      expanded.entity_albion_id,
      expanded.scope,
      count(*)::integer as engagement_count,
      sum(expanded.kills)::integer as kills,
      sum(expanded.deaths)::integer as deaths,
      avg(expanded.combat_contribution) as combat_index
    from expanded
    group by
      expanded.snapshot_date,
      expanded.entity_kind,
      expanded.entity_albion_id,
      expanded.scope
  ),
  metrics as (
    select
      aggregated.*,
      (
        aggregated.kills + aggregated.engagement_count * 5
      )::numeric / (
        aggregated.kills
          + aggregated.deaths
          + aggregated.engagement_count * 10
      )::numeric as efficiency_index
    from aggregated
  )
  update public.public_zvz_v2_season_rollups rollup
     set combat_index = round(metrics.combat_index, 6),
         efficiency_index = round(metrics.efficiency_index, 6),
         combat_points = round(
           case
             when metrics.combat_index <= 0 then 0::numeric
             when rollup.scope = 'overall'
               then 300::numeric * metrics.combat_index
                 / (metrics.combat_index + 60::numeric)
             else 550::numeric * metrics.combat_index
               / (metrics.combat_index + 60::numeric)
           end,
           6
         ),
         efficiency_points = round(
           case
             when rollup.scope = 'overall'
               then 200::numeric * metrics.efficiency_index
             else 300::numeric * metrics.efficiency_index
           end,
           6
         ),
         activity_points = round(
           case
             when rollup.equivalent_battles <= 0 then 0::numeric
             else 150::numeric * least(
               1::numeric,
               ln(1 + rollup.equivalent_battles) / ln(11::numeric)
             )
           end,
           6
         ),
         score_formula_version = 'agm_zvz_v5',
         updated_at = clock_timestamp()
    from metrics
   where rollup.season_id = p_season_id
     and rollup.snapshot_date = metrics.snapshot_date
     and rollup.entity_kind = metrics.entity_kind
     and rollup.entity_albion_id = metrics.entity_albion_id
     and rollup.scope = metrics.scope;

  update public.public_zvz_v2_season_rollups rollup
     set score = round(
           rollup.size_points
             + rollup.combat_points
             + rollup.efficiency_points
             + rollup.activity_points,
           2
         ),
         updated_at = clock_timestamp()
   where rollup.season_id = p_season_id
     and rollup.snapshot_date = any(p_snapshot_dates);

  with recalculated as (
    select
      rollup.season_id,
      rollup.snapshot_date,
      rollup.entity_kind,
      rollup.entity_albion_id,
      rollup.scope,
      dense_rank() over (
        partition by
          rollup.snapshot_date,
          rollup.entity_kind,
          rollup.scope
        order by
          case when rollup.sample_status = 'ranked' then 0 else 1 end,
          rollup.score desc,
          rollup.kill_fame desc,
          rollup.entity_name asc,
          rollup.entity_albion_id asc
      )::integer as new_rank
    from public.public_zvz_v2_season_rollups rollup
    where rollup.season_id = p_season_id
      and rollup.snapshot_date = any(p_snapshot_dates)
  )
  update public.public_zvz_v2_season_rollups target
     set rank = recalculated.new_rank,
         updated_at = clock_timestamp()
    from recalculated
   where target.season_id = recalculated.season_id
     and target.snapshot_date = recalculated.snapshot_date
     and target.entity_kind = recalculated.entity_kind
     and target.entity_albion_id = recalculated.entity_albion_id
     and target.scope = recalculated.scope;

  select count(*)::integer
    into v_rollup_rows
  from public.public_zvz_v2_season_rollups rollup
  where rollup.season_id = p_season_id
    and rollup.snapshot_date = any(p_snapshot_dates);

  perform set_config(
    'agm.rebuilding_comparable_scale_rollups',
    coalesce(v_previous_guard, ''),
    true
  );
  return v_rollup_rows;
exception
  when others then
    perform set_config(
      'agm.rebuilding_comparable_scale_rollups',
      coalesce(v_previous_guard, ''),
      true
    );
    raise;
end;
$$;

revoke all on function public.rebuild_public_zvz_v5_rollups(uuid, date[])
  from public, anon, authenticated;
grant execute on function public.rebuild_public_zvz_v5_rollups(uuid, date[])
  to service_role;

comment on function public.rebuild_public_zvz_v5_rollups(uuid, date[]) is
  'Rebuilds guild v5 rankings unchanged and reattributes joint alliance evidence to the latest observed alliance of participating guilds at each snapshot.';

create or replace function public.search_public_zvz_entities(
  p_query text,
  p_albion_server text default null,
  p_season_id uuid default null,
  p_as_of_date date default null,
  p_limit integer default 12
)
returns table (
  period_kind text,
  albion_server text,
  season_id uuid,
  snapshot_date date,
  week_start date,
  entity_kind text,
  albion_id text,
  entity_name text,
  alliance_name text,
  division text,
  rank integer,
  battle_count integer,
  related_guild_count integer,
  latest_battle_at timestamptz,
  tenant_slug text,
  tenant_profile_enabled boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_query text := regexp_replace(btrim(coalesce(p_query, '')), '\s+', ' ', 'g');
  v_today date := (clock_timestamp() at time zone 'UTC')::date;
  v_target_date date := least(coalesce(p_as_of_date, v_today), v_today);
  v_limit integer := least(24, greatest(1, coalesce(p_limit, 12)));
begin
  if char_length(v_query) < 2 or char_length(v_query) > 80 then
    return;
  end if;
  if p_albion_server is not null
     and p_albion_server not in ('west', 'east', 'europe') then
    raise exception 'invalid Albion server';
  end if;
  if p_season_id is not null and p_albion_server is null then
    raise exception 'an explicit season requires an Albion server';
  end if;

  return query
  with server_scope(server) as (
    select unnest(
      case
        when p_albion_server is null
          then array['west', 'europe', 'east']::text[]
        else array[p_albion_server]::text[]
      end
    )
  ),
  season_bounds as (
    select
      season.id,
      season.albion_server as server,
      bounds.starts_on,
      bounds.starts_at,
      bounds.last_snapshot_date,
      case
        when bounds.last_snapshot_date is null then null
        else bounds.last_snapshot_date + 1
      end as ends_on
    from public.zvz_seasons season
    cross join lateral public.get_public_zvz_season_bounds(season.id) bounds
  ),
  selected_seasons as (
    select distinct on (scope.server)
      scope.server,
      season.id as season_id,
      season.starts_on,
      season.ends_on
    from server_scope scope
    join season_bounds season on season.server = scope.server
    where (
      p_season_id is not null and season.id = p_season_id
    ) or (
      p_season_id is null
      and season.starts_on <= v_target_date
      and (season.ends_on is null or v_target_date < season.ends_on)
      and (p_as_of_date is not null or season.starts_at <= clock_timestamp())
    )
    order by scope.server, season.starts_at desc
  ),
  selected_periods as (
    select
      season.server,
      season.season_id,
      snapshot.snapshot_date
    from selected_seasons season
    join lateral (
      select candidate.snapshot_date
      from public.public_zvz_v2_season_snapshots candidate
      where candidate.season_id = season.season_id
        and candidate.snapshot_date <= least(
          greatest(v_target_date, season.starts_on),
          coalesce(season.ends_on - 1, v_target_date)
        )
      order by candidate.snapshot_date desc
      limit 1
    ) snapshot on true
  ),
  matched as (
    select
      period.server,
      period.season_id,
      period.snapshot_date,
      rollup.entity_kind,
      rollup.entity_albion_id,
      rollup.entity_name,
      rollup.alliance_name,
      case
        when rollup.representative_size <= 20 then 'small'
        when rollup.representative_size <= 40 then 'mid'
        when rollup.representative_size <= 80 then 'large'
        else 'zerg'
      end as division,
      rollup.rank,
      rollup.engagement_count,
      case
        when rollup.entity_kind = 'guild' then 1
        else (
          select count(*)::integer
          from public.get_public_zvz_v2_latest_guild_alliances(
            period.season_id,
            period.snapshot_date
          ) membership
          where membership.alliance_albion_id = rollup.entity_albion_id
        )
      end as related_guild_count,
      rollup.latest_battle_at,
      rollup.tenant_slug,
      rollup.tenant_profile_enabled,
      case
        when lower(rollup.entity_name) = lower(v_query)
          or lower(rollup.entity_albion_id) = lower(v_query) then 0
        when left(lower(rollup.entity_name), char_length(v_query)) = lower(v_query)
          or left(lower(rollup.entity_albion_id), char_length(v_query)) = lower(v_query)
          then 1
        else 2
      end as relevance
    from selected_periods period
    join public.public_zvz_v2_season_rollups rollup
      on rollup.season_id = period.season_id
     and rollup.snapshot_date = period.snapshot_date
     and rollup.albion_server = period.server
     and rollup.scope = 'overall'
    where position(lower(v_query) in lower(rollup.entity_name)) > 0
       or position(lower(v_query) in lower(rollup.entity_albion_id)) > 0
  )
  select
    'season'::text,
    matched.server,
    matched.season_id,
    matched.snapshot_date,
    null::date,
    matched.entity_kind,
    matched.entity_albion_id,
    matched.entity_name,
    matched.alliance_name,
    matched.division,
    matched.rank,
    matched.engagement_count,
    matched.related_guild_count,
    matched.latest_battle_at,
    matched.tenant_slug,
    matched.tenant_profile_enabled
  from matched
  order by
    matched.relevance,
    case matched.entity_kind when 'guild' then 0 else 1 end,
    lower(matched.entity_name),
    matched.server
  limit v_limit;
end;
$$;

revoke all on function public.search_public_zvz_entities(
  text, text, uuid, date, integer
) from public, anon, authenticated;
grant execute on function public.search_public_zvz_entities(
  text, text, uuid, date, integer
) to service_role;

comment on function public.search_public_zvz_entities(
  text, text, uuid, date, integer
) is
  'Searches exact-bound season rankings and reports alliance guild counts from latest observed snapshot membership.';
