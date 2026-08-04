-- 378: Keep the DB backfill selector deliberately coarse and fast.
--
-- Forty total players is a necessary (but not sufficient) condition for an
-- official 20-v-20 engagement. The application applies the exact alliance-force
-- rule through isPublicZvzProjectionCandidate before requesting event pages.
-- This split admits harmless false positives while preventing false negatives
-- and keeps the hourly selector below the production statement timeout.

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
  )
  select
    battle.id,
    battle.albion_server,
    battle.raw_battle,
    battle.engagement_source_hash
  from current_seasons season
  join public.battle_records battle
    on battle.albion_server = season.albion_server
   and battle.started_at >= season.starts_on::timestamptz
  left join public.public_zvz_battle_projection_runs run
    on run.battle_record_id = battle.id
  where battle.total_players >= 40
    and (
      run.battle_record_id is null
      or run.source_hash is distinct from battle.engagement_source_hash
      or run.coverage <> 'complete'
    )
  order by battle.started_at desc, battle.id
  limit least(100, greatest(1, coalesce(p_limit, 25)));
$$;

revoke all on function public.list_public_zvz_projection_backfill_candidates(integer)
  from public, anon, authenticated;
grant execute on function public.list_public_zvz_projection_backfill_candidates(integer)
  to service_role;

comment on function public.list_public_zvz_projection_backfill_candidates(integer) is
  'Returns current-season 40+ player coarse candidates whose exact v2 projection is missing, stale, or incomplete; application code enforces the alliance-force 20-v-20 rule.';
