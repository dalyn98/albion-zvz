-- Ranking v6 scores each published cohort relative to a robust seasonal
-- leader benchmark. The benchmark is the P90 value among entities with at
-- least two official engagements in the same server, snapshot, entity kind,
-- and ranking scope. Floors keep early/sparse cohorts from awarding full
-- credit for one small observation.
--
-- This migration is compatibility-only: it adds the columns and calculation
-- function without switching the publication trigger. Migration 408 activates
-- v6 after the compatible application has reached production.

alter table public.public_zvz_v2_season_rollups
  add column if not exists size_reference numeric(18, 6) not null default 0,
  add column if not exists combat_reference numeric(18, 6) not null default 0,
  add column if not exists efficiency_reference numeric(18, 6) not null default 0,
  add column if not exists activity_reference numeric(18, 6) not null default 0,
  alter column score_formula_version set default 'agm_zvz_v6',
  drop constraint if exists public_zvz_v2_season_rollups_score_formula_version_check,
  add constraint public_zvz_v2_season_rollups_score_formula_version_check
    check (score_formula_version in (
      'agm_zvz_v2',
      'agm_zvz_v3',
      'agm_zvz_v4',
      'agm_zvz_v5',
      'agm_zvz_v6'
    )),
  add constraint public_zvz_v2_season_rollups_size_reference_check
    check (size_reference >= 0),
  add constraint public_zvz_v2_season_rollups_combat_reference_check
    check (combat_reference >= 0),
  add constraint public_zvz_v2_season_rollups_efficiency_reference_check
    check (efficiency_reference >= 0 and efficiency_reference <= 1),
  add constraint public_zvz_v2_season_rollups_activity_reference_check
    check (activity_reference >= 0);

comment on column public.public_zvz_v2_season_rollups.size_reference is
  'V6 P90 representative deployment benchmark for the same published cohort, with a 40-player floor overall and zero in scale-only ranks.';
comment on column public.public_zvz_v2_season_rollups.combat_reference is
  'V6 P90 combat-index benchmark for the same published cohort, with a 60-point floor.';
comment on column public.public_zvz_v2_season_rollups.efficiency_reference is
  'V6 P90 smoothed kill-share benchmark for the same published cohort, with a 0.60 floor.';
comment on column public.public_zvz_v2_season_rollups.activity_reference is
  'V6 P90 equivalent-battle benchmark for the same published cohort, with a 10-battle floor.';

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

  -- V5 remains the audited evidence, attribution, comparable-scale, K/D, and
  -- kill-fame metric builder. V6 changes only cohort references and points.
  v_rollup_rows := public.rebuild_public_zvz_v5_rollups(
    p_season_id,
    p_snapshot_dates
  );

  with cohort_references as (
    select
      rollup.season_id,
      rollup.snapshot_date,
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
      rollup.entity_kind,
      rollup.entity_albion_id,
      rollup.scope,
      dense_rank() over (
        partition by
          rollup.season_id,
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

revoke all on function public.rebuild_public_zvz_v6_rollups(uuid, date[])
  from public, anon, authenticated;
grant execute on function public.rebuild_public_zvz_v6_rollups(uuid, date[])
  to service_role;

comment on function public.rebuild_public_zvz_v6_rollups(uuid, date[]) is
  'Builds V5 audited metrics, then scores each server/season/snapshot/entity/scope cohort against ranked-entity P90 references with sparse-cohort floors.';
