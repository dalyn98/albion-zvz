-- Activate ranking v6 only after the compatible application from migration
-- 407 has reached production. References and ranks are isolated by Albion
-- server even if a future season configuration ever spans multiple servers.

create or replace function public.rebuild_public_zvz_v6_rollups(
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

  v_rollup_rows := public.rebuild_public_zvz_v5_rollups(
    p_season_id,
    p_snapshot_dates
  );

  with cohort_references as (
    select
      rollup.season_id,
      rollup.snapshot_date,
      rollup.albion_server,
      rollup.entity_kind,
      rollup.scope,
      case
        when rollup.scope = 'overall' then greatest(
          40::numeric,
          coalesce((
            percentile_cont(0.9) within group (
              order by rollup.representative_size::double precision
            ) filter (where rollup.sample_status = 'ranked')
          )::numeric, 0::numeric)
        )
        else 0::numeric
      end as size_reference,
      greatest(
        60::numeric,
        coalesce((
          percentile_cont(0.9) within group (
            order by rollup.combat_index::double precision
          ) filter (where rollup.sample_status = 'ranked')
        )::numeric, 0::numeric)
      ) as combat_reference,
      greatest(
        0.60::numeric,
        coalesce((
          percentile_cont(0.9) within group (
            order by rollup.efficiency_index::double precision
          ) filter (where rollup.sample_status = 'ranked')
        )::numeric, 0::numeric)
      ) as efficiency_reference,
      greatest(
        10::numeric,
        coalesce((
          percentile_cont(0.9) within group (
            order by rollup.equivalent_battles::double precision
          ) filter (where rollup.sample_status = 'ranked')
        )::numeric, 0::numeric)
      ) as activity_reference
    from public.public_zvz_v2_season_rollups rollup
    where rollup.season_id = p_season_id
      and rollup.snapshot_date = any(p_snapshot_dates)
    group by
      rollup.season_id,
      rollup.snapshot_date,
      rollup.albion_server,
      rollup.entity_kind,
      rollup.scope
  )
  update public.public_zvz_v2_season_rollups rollup
     set size_reference = round(reference.size_reference, 6),
         combat_reference = round(reference.combat_reference, 6),
         efficiency_reference = round(reference.efficiency_reference, 6),
         activity_reference = round(reference.activity_reference, 6),
         size_points = round(
           case
             when rollup.scope <> 'overall'
               or rollup.representative_size <= 0
               or reference.size_reference <= 0 then 0::numeric
             else 300::numeric * least(
               1::numeric,
               sqrt(rollup.representative_size / reference.size_reference)
             )
           end,
           6
         ),
         combat_points = round(
           case
             when rollup.combat_index <= 0
               or reference.combat_reference <= 0 then 0::numeric
             else (
               case when rollup.scope = 'overall'
                 then 300::numeric
                 else 500::numeric
               end
             ) * least(
               1::numeric,
               rollup.combat_index / reference.combat_reference
             )
           end,
           6
         ),
         efficiency_points = round(
           case
             when rollup.efficiency_index <= 0
               or reference.efficiency_reference <= 0 then 0::numeric
             else (
               case when rollup.scope = 'overall'
                 then 200::numeric
                 else 300::numeric
               end
             ) * least(
               1::numeric,
               rollup.efficiency_index / reference.efficiency_reference
             )
           end,
           6
         ),
         activity_points = round(
           case
             when rollup.equivalent_battles <= 0
               or reference.activity_reference <= 0 then 0::numeric
             else 200::numeric * least(
               1::numeric,
               rollup.equivalent_battles / reference.activity_reference
             )
           end,
           6
         ),
         score_formula_version = 'agm_zvz_v6',
         updated_at = clock_timestamp()
    from cohort_references reference
   where rollup.season_id = reference.season_id
     and rollup.snapshot_date = reference.snapshot_date
     and rollup.albion_server = reference.albion_server
     and rollup.entity_kind = reference.entity_kind
     and rollup.scope = reference.scope;

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
      rollup.albion_server,
      rollup.entity_kind,
      rollup.entity_albion_id,
      rollup.scope,
      dense_rank() over (
        partition by
          rollup.season_id,
          rollup.snapshot_date,
          rollup.albion_server,
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
     and target.albion_server = recalculated.albion_server
     and target.entity_kind = recalculated.entity_kind
     and target.entity_albion_id = recalculated.entity_albion_id
     and target.scope = recalculated.scope;

  return v_rollup_rows;
end;
$$;

revoke all on function public.rebuild_public_zvz_v6_rollups(uuid, date[])
  from public, anon, authenticated;
grant execute on function public.rebuild_public_zvz_v6_rollups(uuid, date[])
  to service_role;

comment on function public.rebuild_public_zvz_v6_rollups(uuid, date[]) is
  'Builds audited V5 metrics, then scores each server/season/snapshot/entity/scope cohort against ranked-entity P90 references with sparse-cohort floors.';

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
    perform public.rebuild_public_zvz_v6_rollups(
      v_batch.season_id,
      v_batch.snapshot_dates
    );
  end loop;
  return null;
end;
$$;

comment on function public.enforce_public_zvz_v2_comparable_scale_rollups() is
  'Atomically publishes audited metrics and server-isolated P90-relative V6 overall and comparable-scale rankings.';

set statement_timeout = '15min';

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
    perform public.rebuild_public_zvz_v6_rollups(
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
    where rollup.score_formula_version <> 'agm_zvz_v6'
  ) then
    raise exception 'legacy public ZvZ score rows remain after v6 rebuild';
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
    raise exception 'public ZvZ v6 component sum does not match score';
  end if;

  if exists (
    select 1
    from public.public_zvz_v2_season_rollups rollup
    where rollup.combat_reference < 60
       or rollup.efficiency_reference < 0.60
       or rollup.efficiency_reference > 1
       or rollup.activity_reference < 10
       or (
         rollup.scope = 'overall'
         and rollup.size_reference < 40
       )
       or (
         rollup.scope <> 'overall'
         and rollup.size_reference <> 0
       )
  ) then
    raise exception 'public ZvZ v6 cohort reference floors are invalid';
  end if;

  if exists (
    select 1
    from public.public_zvz_v2_season_rollups rollup
    where rollup.size_points < 0
       or rollup.combat_points < 0
       or rollup.efficiency_points < 0
       or rollup.activity_points < 0
       or (
         rollup.scope = 'overall'
         and (
           rollup.size_points > 300
           or rollup.combat_points > 300
           or rollup.efficiency_points > 200
           or rollup.activity_points > 200
         )
       )
       or (
         rollup.scope <> 'overall'
         and (
           rollup.size_points <> 0
           or rollup.combat_points > 500
           or rollup.efficiency_points > 300
           or rollup.activity_points > 200
         )
       )
  ) then
    raise exception 'public ZvZ v6 component bounds are invalid';
  end if;
end;
$$;

reset statement_timeout;
