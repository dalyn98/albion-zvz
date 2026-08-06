-- Public AGM Battles treats 10-20 players per side as the Small band.
-- Mid and larger engagements keep the existing 20-player minimum per side.
-- Forward rollback: add a new migration restoring the 20-player final/evidence
-- constraints, trigger version, and 40-player backfill prefilter.

do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select constraint_row.conname
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.public_zvz_engagements'::regclass
      and constraint_row.contype = 'c'
      and pg_get_constraintdef(constraint_row.oid) ilike '%status <>%final%'
      and pg_get_constraintdef(constraint_row.oid) ilike '%home_side_team_size >= 20%'
      and pg_get_constraintdef(constraint_row.oid) ilike '%opponent_side_team_size >= 20%'
  loop
    execute format(
      'alter table public.public_zvz_engagements drop constraint %I',
      v_constraint.conname
    );
  end loop;
end;
$$;

alter table public.public_zvz_engagements
  add constraint public_zvz_engagements_final_size_check
  check (
    status <> 'final'
    or (
      least(home_side_team_size, opponent_side_team_size) >= 10
      and (
        greatest(home_side_team_size, opponent_side_team_size) <= 20
        or least(home_side_team_size, opponent_side_team_size) >= 20
      )
    )
  ) not valid;

alter table public.public_zvz_engagements
  validate constraint public_zvz_engagements_final_size_check;

do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select constraint_row.conname
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.public_zvz_v2_season_evidence'::regclass
      and constraint_row.contype = 'c'
      and pg_get_constraintdef(constraint_row.oid) ilike '%opponent_side_team_size >= 20%'
  loop
    execute format(
      'alter table public.public_zvz_v2_season_evidence drop constraint %I',
      v_constraint.conname
    );
  end loop;
end;
$$;

alter table public.public_zvz_v2_season_evidence
  add constraint public_zvz_v2_season_evidence_opponent_size_check
  check (opponent_side_team_size >= 10) not valid;

alter table public.public_zvz_v2_season_evidence
  validate constraint public_zvz_v2_season_evidence_opponent_size_check;

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
  new.qualification_version := 'agm_zvz_v2_small10_comp75';
  return new;
end;
$$;

revoke all on function public.normalize_public_zvz_engagement_scale()
  from public, anon, authenticated;

create index if not exists idx_battle_records_zvz_small_candidate_started
  on public.battle_records (albion_server, started_at desc, id)
  include (engagement_source_hash)
  where total_players >= 20;

create or replace function public.list_public_zvz_projection_backfill_candidates(
  p_limit integer default 25
)
returns table (
  battle_record_id uuid,
  albion_server text,
  raw_battle jsonb,
  engagement_source_hash text
)
language sql
stable
security definer
set search_path = public
as $$
  with current_seasons as (
    select distinct on (season.albion_server)
      season.albion_server,
      bounds.starts_at,
      bounds.ends_at
    from public.zvz_seasons season
    cross join lateral public.get_public_zvz_season_bounds(season.id) bounds
    where bounds.starts_at <= clock_timestamp()
      and (bounds.ends_at is null or clock_timestamp() < bounds.ends_at)
    order by season.albion_server, bounds.starts_at desc
  ),
  per_server as (
    select candidate.*
    from current_seasons season
    cross join lateral (
      select
        battle.id as battle_record_id,
        battle.albion_server,
        battle.raw_battle,
        battle.engagement_source_hash,
        battle.started_at
      from public.battle_records battle
      where battle.albion_server = season.albion_server
        and battle.started_at >= season.starts_at
        and (season.ends_at is null or battle.started_at < season.ends_at)
        and battle.total_players >= 20
        and not exists (
          select 1
          from public.public_zvz_battle_projection_runs run
          where run.battle_record_id = battle.id
            and run.source_hash is not distinct from battle.engagement_source_hash
            and (
              run.coverage = 'complete'
              or run.projected_at > clock_timestamp() - interval '6 hours'
            )
        )
      order by battle.started_at desc, battle.id
      limit least(100, greatest(1, coalesce(p_limit, 25)))
    ) candidate
  )
  select
    candidate.battle_record_id,
    candidate.albion_server,
    candidate.raw_battle,
    candidate.engagement_source_hash
  from per_server candidate
  order by candidate.started_at desc, candidate.battle_record_id
  limit least(100, greatest(1, coalesce(p_limit, 25)));
$$;

revoke all on function public.list_public_zvz_projection_backfill_candidates(integer)
  from public, anon, authenticated;
grant execute on function public.list_public_zvz_projection_backfill_candidates(integer)
  to service_role;

comment on function public.list_public_zvz_projection_backfill_candidates(integer) is
  'Returns exact-current-season 20+ total-player battles whose projection is missing or stale; application code enforces Small 10-20 and Mid+ 20-player side rules.';

comment on constraint public_zvz_engagements_final_size_check
  on public.public_zvz_engagements is
  'Final Small engagements require both sides in 10-20; Mid and larger require at least 20 on each side.';
