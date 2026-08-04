-- Scale-specific rankings compare like-sized engagements only.
-- Overall rankings continue to preserve every finalized official engagement.

create or replace function public.normalize_public_zvz_engagement_scale()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_larger_side integer := greatest(
    new.home_side_team_size,
    new.opponent_side_team_size
  );
begin
  new.scale := case
    when v_larger_side <= 20 then 'small'
    when v_larger_side <= 40 then 'mid'
    when v_larger_side <= 80 then 'large'
    else 'zerg'
  end;
  new.qualification_version := 'agm_zvz_v2_comp75';
  return new;
end;
$$;

revoke all on function public.normalize_public_zvz_engagement_scale()
  from public, anon, authenticated;

drop trigger if exists trg_normalize_public_zvz_engagement_scale
  on public.public_zvz_engagements;

create trigger trg_normalize_public_zvz_engagement_scale
before insert or update on public.public_zvz_engagements
for each row execute function public.normalize_public_zvz_engagement_scale();

comment on function public.normalize_public_zvz_engagement_scale() is
  'Assigns one symmetric engagement scale from the larger result-eligible side and stamps the comparable-scale qualification version.';

create or replace function public.rebuild_public_zvz_v2_comparable_scale_rollups(
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
  v_server text;
  v_rollup_rows integer := 0;
  v_previous_guard text := current_setting(
    'agm.rebuilding_comparable_scale_rollups',
    true
  );
begin
  if coalesce(cardinality(p_snapshot_dates), 0) = 0 then
    return 0;
  end if;

  select season.albion_server
    into v_server
  from public.zvz_seasons season
  where season.id = p_season_id;

  if not found then
    raise exception 'season not found';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('public-zvz-v2-season:' || p_season_id::text, 0)
  );
  perform set_config('agm.rebuilding_comparable_scale_rollups', '1', true);

  delete from public.public_zvz_v2_season_rollups rollup
   where rollup.season_id = p_season_id
     and rollup.snapshot_date = any(p_snapshot_dates)
     and rollup.scope <> 'overall';

  with snapshot_days as (
    select snapshot.snapshot_date
    from public.public_zvz_v2_season_snapshots snapshot
    where snapshot.season_id = p_season_id
      and snapshot.snapshot_date = any(p_snapshot_dates)
  ),
  expanded as (
    select
      day.snapshot_date,
      evidence.*,
      case
        when greatest(
          evidence.side_team_size,
          evidence.opponent_side_team_size
        ) <= 20 then 'small'
        when greatest(
          evidence.side_team_size,
          evidence.opponent_side_team_size
        ) <= 40 then 'mid'
        when greatest(
          evidence.side_team_size,
          evidence.opponent_side_team_size
        ) <= 80 then 'large'
        else 'zerg'
      end as scope
    from snapshot_days day
    join public.public_zvz_v2_season_evidence evidence
      on evidence.season_id = p_season_id
     and evidence.evidence_date <= day.snapshot_date
    where least(
      evidence.side_team_size,
      evidence.opponent_side_team_size
    ) * 4 >= greatest(
      evidence.side_team_size,
      evidence.opponent_side_team_size
    ) * 3
  ),
  ordered as (
    select
      expanded.*,
      row_number() over (
        partition by
          expanded.snapshot_date,
          expanded.entity_kind,
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
      ordered.entity_kind,
      ordered.entity_albion_id,
      ordered.scope,
      (array_agg(
        ordered.entity_name
        order by ordered.battle_started_at desc, ordered.engagement_id desc
      ))[1] as entity_name,
      (array_agg(
        ordered.alliance_albion_id
        order by ordered.battle_started_at desc, ordered.engagement_id desc
      ))[1] as alliance_albion_id,
      (array_agg(
        ordered.alliance_name
        order by ordered.battle_started_at desc, ordered.engagement_id desc
      ))[1] as alliance_name,
      count(*)::integer as engagement_count,
      sum(ordered.battle_credit)::numeric as equivalent_battles,
      sum(ordered.kills)::integer as kills,
      sum(ordered.deaths)::integer as deaths,
      sum(ordered.kill_fame)::bigint as kill_fame,
      round(avg(ordered.own_team_size) filter (where ordered.size_order <= 3), 2)
        as representative_size,
      round(avg(ordered.own_team_size), 2) as average_size,
      max(ordered.own_team_size)::integer as max_size,
      round(avg(greatest(
        0::numeric,
        ordered.kills * 3
          + greatest(ordered.kills - ordered.deaths, 0) * 2
          + ordered.kill_fame::numeric / 500000
          - greatest(ordered.deaths - ordered.kills, 0) * 0.5
      )), 6) as combat_index,
      round(sum(ordered.battle_points), 6) as battle_points,
      max(ordered.battle_started_at) as latest_battle_at
    from ordered
    group by
      ordered.snapshot_date,
      ordered.entity_kind,
      ordered.entity_albion_id,
      ordered.scope
  ),
  enriched as (
    select
      aggregated.*,
      link.tenant_id,
      link.tenant_slug,
      coalesce(link.profile_enabled, false) as tenant_profile_enabled,
      case
        when aggregated.engagement_count >= 2 then 'ranked'
        else 'insufficient_sample'
      end as sample_status
    from aggregated
    left join lateral (
      select
        candidate.tenant_id,
        candidate.tenant_slug,
        candidate.profile_enabled
      from public.public_guild_tenant_links candidate
      where aggregated.entity_kind = 'guild'
        and candidate.albion_server = v_server
        and candidate.albion_guild_id = aggregated.entity_albion_id
      order by candidate.profile_enabled desc, candidate.tenant_slug asc
      limit 1
    ) link on true
  ),
  components as (
    select
      enriched.*,
      0::numeric as size_points,
      case
        when enriched.combat_index <= 0 then 0::numeric
        else 700::numeric * enriched.combat_index / (
          enriched.combat_index + 30
        )
      end as combat_points,
      case
        when enriched.equivalent_battles <= 0 then 0::numeric
        else 300::numeric * least(
          1::numeric,
          ln(1 + enriched.equivalent_battles) / ln(11::numeric)
        )
      end as activity_points
    from enriched
  ),
  scored as (
    select
      components.*,
      round(
        components.combat_points + components.activity_points,
        2
      ) as score
    from components
  ),
  ranked as (
    select
      scored.*,
      dense_rank() over (
        partition by scored.snapshot_date, scored.entity_kind, scored.scope
        order by
          case when scored.sample_status = 'ranked' then 0 else 1 end,
          scored.score desc,
          scored.kill_fame desc,
          scored.entity_name asc,
          scored.entity_albion_id asc
      )::integer as rank
    from scored
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
    battle_points,
    size_points,
    combat_points,
    activity_points,
    score,
    rank,
    sample_status,
    latest_battle_at,
    score_formula_version,
    updated_at
  )
  select
    p_season_id,
    ranked.snapshot_date,
    v_server,
    ranked.entity_kind,
    ranked.entity_albion_id,
    ranked.entity_name,
    ranked.alliance_albion_id,
    ranked.alliance_name,
    ranked.tenant_id,
    ranked.tenant_slug,
    ranked.tenant_profile_enabled,
    ranked.scope,
    ranked.engagement_count,
    ranked.equivalent_battles,
    ranked.kills,
    ranked.deaths,
    ranked.kill_fame,
    ranked.representative_size,
    ranked.average_size,
    ranked.max_size,
    ranked.combat_index,
    ranked.battle_points,
    round(ranked.size_points, 6),
    round(ranked.combat_points, 6),
    round(ranked.activity_points, 6),
    ranked.score,
    ranked.rank,
    ranked.sample_status,
    ranked.latest_battle_at,
    'agm_zvz_v2',
    clock_timestamp()
  from ranked;

  get diagnostics v_rollup_rows = row_count;
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

revoke all on function public.rebuild_public_zvz_v2_comparable_scale_rollups(uuid, date[])
  from public, anon, authenticated;
grant execute on function public.rebuild_public_zvz_v2_comparable_scale_rollups(uuid, date[])
  to service_role;

comment on function public.rebuild_public_zvz_v2_comparable_scale_rollups(uuid, date[]) is
  'Rebuilds scale-only rankings from comparable official engagements where the smaller result-eligible side is at least 75 percent of the larger side.';

create or replace function public.enforce_public_zvz_v2_comparable_scale_rollups()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch record;
begin
  if current_setting('agm.rebuilding_comparable_scale_rollups', true) = '1' then
    return null;
  end if;

  for v_batch in
    select
      inserted.season_id,
      array_agg(
        distinct inserted.snapshot_date
        order by inserted.snapshot_date
      ) as snapshot_dates
    from inserted_public_zvz_rollups inserted
    group by inserted.season_id
  loop
    perform public.rebuild_public_zvz_v2_comparable_scale_rollups(
      v_batch.season_id,
      v_batch.snapshot_dates
    );
  end loop;
  return null;
end;
$$;

revoke all on function public.enforce_public_zvz_v2_comparable_scale_rollups()
  from public, anon, authenticated;

drop trigger if exists trg_enforce_public_zvz_v2_comparable_scale_rollups
  on public.public_zvz_v2_season_rollups;

create trigger trg_enforce_public_zvz_v2_comparable_scale_rollups
after insert on public.public_zvz_v2_season_rollups
referencing new table as inserted_public_zvz_rollups
for each statement
execute function public.enforce_public_zvz_v2_comparable_scale_rollups();

comment on function public.enforce_public_zvz_v2_comparable_scale_rollups() is
  'Post-processes each snapshot publication so overall rows remain complete while scale rows contain comparable fights only.';
