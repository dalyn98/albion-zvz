-- 398: Let projection backfill advance past recently incomplete Albion event logs.
--
-- A partial or unavailable projection remains eligible for a later retry, but
-- selecting it on every cron run blocks older missing projections and can
-- amplify Albion API throttling. Give matching incomplete runs a six-hour
-- cooldown while stale source hashes remain immediately eligible.

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
        and battle.total_players >= 40
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
  'Returns exact-current-season 40+ player battles whose projection is missing or stale, retrying incomplete matching projections after a six-hour cooldown.';
