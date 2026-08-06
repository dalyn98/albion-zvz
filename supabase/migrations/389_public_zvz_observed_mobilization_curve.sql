-- Ranking v4 scores only directly observed engagement participants. Queue,
-- adjacent-cluster, roster, and inferred reserve counts are deliberately absent.
-- Mobilization keeps a 350-point asymptote without treating 100 or 300 players
-- as a hard cap.

alter table public.public_zvz_v2_season_rollups
  alter column score_formula_version set default 'agm_zvz_v4',
  drop constraint if exists public_zvz_v2_season_rollups_score_formula_version_check,
  add constraint public_zvz_v2_season_rollups_score_formula_version_check
    check (score_formula_version in ('agm_zvz_v2', 'agm_zvz_v3', 'agm_zvz_v4'));

comment on column public.public_zvz_v2_season_rollups.representative_size is
  'Average of the entity own_team_size from its three largest included engagements. own_team_size contains directly observed combat participants, never inferred queue or adjacent-cluster reserves.';
comment on column public.public_zvz_v2_season_rollups.size_points is
  'Overall-only observed mobilization points: 350 * representative_size / (representative_size + 100). No player-count hard cap or queue estimate.';

alter function public.rebuild_public_zvz_v3_rollups(uuid, date[])
  rename to rebuild_public_zvz_v3_rollups_legacy;

revoke all on function public.rebuild_public_zvz_v3_rollups_legacy(uuid, date[])
  from public, anon, authenticated, service_role;

create function public.rebuild_public_zvz_v4_rollups(
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

  -- Keep the proven atomic evidence aggregation and comparable-scale rebuild.
  -- Only the overall mobilization component and resulting ranks change in v4.
  v_rollup_rows := public.rebuild_public_zvz_v3_rollups_legacy(
    p_season_id,
    p_snapshot_dates
  );

  update public.public_zvz_v2_season_rollups rollup
     set size_points = round(
           case
             when rollup.scope = 'overall'
               then 350::numeric * rollup.representative_size
                 / (rollup.representative_size + 100::numeric)
             else 0::numeric
           end,
           6
         ),
         score = round(
           case
             when rollup.scope = 'overall'
               then 350::numeric * rollup.representative_size
                 / (rollup.representative_size + 100::numeric)
             else 0::numeric
           end
             + rollup.combat_points
             + rollup.efficiency_points
             + rollup.activity_points,
           2
         ),
         score_formula_version = 'agm_zvz_v4',
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

revoke all on function public.rebuild_public_zvz_v4_rollups(uuid, date[])
  from public, anon, authenticated;
grant execute on function public.rebuild_public_zvz_v4_rollups(uuid, date[])
  to service_role;

comment on function public.rebuild_public_zvz_v4_rollups(uuid, date[]) is
  'Rebuilds rankings from directly observed per-engagement participants, applies a no-hard-cap diminishing mobilization curve, and never estimates cluster-queue reserves.';

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
    perform public.rebuild_public_zvz_v4_rollups(
      v_batch.season_id,
      v_batch.snapshot_dates
    );
  end loop;
  return null;
end;
$$;

comment on function public.enforce_public_zvz_v2_comparable_scale_rollups() is
  'Atomically replaces temporary publication rows with observed-participant overall v4 and comparable scale-only rollups.';

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
    perform public.rebuild_public_zvz_v4_rollups(
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
    where rollup.score_formula_version <> 'agm_zvz_v4'
  ) then
    raise exception 'legacy public ZvZ score rows remain after v4 rebuild';
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
    raise exception 'public ZvZ v4 component sum does not match score';
  end if;

  if exists (
    select 1
    from public.public_zvz_v2_season_rollups rollup
    where (
      rollup.scope = 'overall'
      and (
        rollup.size_points >= 350
        or rollup.combat_points > 350
        or rollup.efficiency_points > 150
        or rollup.activity_points > 150
      )
    ) or (
      rollup.scope <> 'overall'
      and (
        rollup.size_points <> 0
        or rollup.efficiency_points <> 0
        or rollup.combat_points > 700
        or rollup.activity_points > 300
      )
    )
  ) then
    raise exception 'public ZvZ v4 component bounds are invalid';
  end if;
end;
$$;
