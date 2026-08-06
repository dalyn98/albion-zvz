-- Ranking v5 makes combat efficiency materially affect both overall and
-- scale-specific ranks. It uses only frozen official-engagement evidence:
-- no queue, roster, adjacent-cluster, or side-ratio estimates are introduced.

alter table public.public_zvz_v2_season_rollups
  alter column score_formula_version set default 'agm_zvz_v5',
  drop constraint if exists public_zvz_v2_season_rollups_score_formula_version_check,
  add constraint public_zvz_v2_season_rollups_score_formula_version_check
    check (score_formula_version in (
      'agm_zvz_v2',
      'agm_zvz_v3',
      'agm_zvz_v4',
      'agm_zvz_v5'
    )),
  drop constraint if exists public_zvz_v2_season_rollups_efficiency_points_check,
  add constraint public_zvz_v2_season_rollups_efficiency_points_check
    check (efficiency_points between 0 and 300);

comment on column public.public_zvz_v2_season_rollups.combat_index is
  'Average per-engagement v5 combat output: kills*3 + kill_fame/750000 - excess_deaths*1.5, floored at zero.';
comment on column public.public_zvz_v2_season_rollups.efficiency_index is
  'Smoothed official-engagement kill share: (kills + engagements*5) / (kills + deaths + engagements*10).';
comment on column public.public_zvz_v2_season_rollups.combat_points is
  'Diminishing v5 combat-output points with curve 60: maximum 300 overall or 550 in comparable scale rankings.';
comment on column public.public_zvz_v2_season_rollups.efficiency_points is
  'Direct v5 K/D efficiency points: smoothed kill share times 200 overall or 300 in comparable scale rankings.';
comment on column public.public_zvz_v2_season_rollups.activity_points is
  'Activity-confidence points with diminishing gains to 150 in both overall and comparable scale rankings.';

alter function public.rebuild_public_zvz_v4_rollups(uuid, date[])
  rename to rebuild_public_zvz_v4_rollups_legacy;

revoke all on function public.rebuild_public_zvz_v4_rollups_legacy(uuid, date[])
  from public, anon, authenticated, service_role;

create function public.rebuild_public_zvz_v5_rollups(
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
begin
  if coalesce(cardinality(p_snapshot_dates), 0) = 0 then
    return 0;
  end if;

  -- Preserve the audited evidence aggregation, alliance/guild attribution,
  -- observed deployment curve, and comparable-scale eligibility from v4.
  v_rollup_rows := public.rebuild_public_zvz_v4_rollups_legacy(
    p_season_id,
    p_snapshot_dates
  );

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
    cross join lateral (
      select 'overall'::text as value
      union all
      select evidence.scale
      where least(evidence.side_team_size, evidence.opponent_side_team_size) * 4
        >= greatest(evidence.side_team_size, evidence.opponent_side_team_size) * 3
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

  return v_rollup_rows;
end;
$$;

revoke all on function public.rebuild_public_zvz_v5_rollups(uuid, date[])
  from public, anon, authenticated;
grant execute on function public.rebuild_public_zvz_v5_rollups(uuid, date[])
  to service_role;

comment on function public.rebuild_public_zvz_v5_rollups(uuid, date[]) is
  'Rebuilds v5 overall and comparable-scale rankings with stronger excess-death penalties and direct smoothed K/D efficiency.';

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
    perform public.rebuild_public_zvz_v5_rollups(
      v_batch.season_id,
      v_batch.snapshot_dates
    );
  end loop;
  return null;
end;
$$;

comment on function public.enforce_public_zvz_v2_comparable_scale_rollups() is
  'Atomically replaces temporary publication rows with observed-participant overall and comparable scale-only v5 rollups.';

do $$
declare
  v_batch record;
begin
  for v_batch in
    select
      snapshot.season_id,
      array_agg(snapshot.snapshot_date order by snapshot.snapshot_date)
        as snapshot_dates
    from public.public_zvz_v2_season_snapshots snapshot
    group by snapshot.season_id
  loop
    perform public.rebuild_public_zvz_v5_rollups(
      v_batch.season_id,
      v_batch.snapshot_dates
    );
  end loop;
end;
$$;

do $$
begin
  if exists (
    select 1
    from public.public_zvz_v2_season_rollups rollup
    where rollup.score_formula_version <> 'agm_zvz_v5'
  ) then
    raise exception 'legacy public ZvZ score rows remain after v5 rebuild';
  end if;

  if exists (
    select 1
    from public.public_zvz_v2_season_rollups rollup
    where abs(
      rollup.score - (
        rollup.size_points
          + rollup.combat_points
          + rollup.efficiency_points
          + rollup.activity_points
      )
    ) > 0.02
  ) then
    raise exception 'public ZvZ v5 component sum does not match score';
  end if;

  if exists (
    select 1
    from public.public_zvz_v2_season_rollups rollup
    where rollup.efficiency_index < 0
       or rollup.efficiency_index > 1
       or (
         rollup.scope = 'overall'
         and (
           rollup.size_points >= 350
           or rollup.combat_points > 300
           or rollup.efficiency_points > 200
           or rollup.activity_points > 150
         )
       )
       or (
         rollup.scope <> 'overall'
         and (
           rollup.size_points <> 0
           or rollup.combat_points > 550
           or rollup.efficiency_points > 300
           or rollup.activity_points > 150
         )
       )
  ) then
    raise exception 'public ZvZ v5 component bounds are invalid';
  end if;
end;
$$;
