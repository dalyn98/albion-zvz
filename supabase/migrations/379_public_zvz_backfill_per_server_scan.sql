-- 379: Force bounded, index-backed candidate scans per Albion server.
--
-- A global three-server sort made Postgres choose a plan that crossed the
-- PostgREST statement timeout. Each server scan is fast on
-- idx_battle_records_zvz_candidate_started, so cap each scan first and merge at
-- most 3 * p_limit lightweight candidates afterward.
-- public-zvz-projection-sync.ts then applies isPublicZvzProjectionCandidate.

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
      season.starts_on
    from public.zvz_seasons season
    where season.starts_on <= (clock_timestamp() at time zone 'UTC')::date
    order by season.albion_server, season.starts_on desc
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
        and battle.started_at >= season.starts_on::timestamptz
        and battle.total_players >= 40
        and not exists (
          select 1
          from public.public_zvz_battle_projection_runs run
          where run.battle_record_id = battle.id
            and run.source_hash is not distinct from battle.engagement_source_hash
            and run.coverage = 'complete'
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
  'Returns current-season 40+ player coarse candidates using a bounded newest-first scan per server; application code enforces the exact alliance-force 20-v-20 rule.';
