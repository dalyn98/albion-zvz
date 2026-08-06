-- Re-run current-season projections under the Small 10-20 rule. Existing
-- snapshots remain available until the completed backfill is force-refreshed.
-- This is intentionally separate from migration 401's schema/function changes.

delete from public.public_zvz_battle_projection_runs run
using public.battle_records battle
where run.battle_record_id = battle.id
  and battle.total_players >= 20
  and exists (
    select 1
    from public.zvz_seasons season
    cross join lateral public.get_public_zvz_season_bounds(season.id) bounds
    where season.albion_server = battle.albion_server
      and bounds.starts_at <= clock_timestamp()
      and (bounds.ends_at is null or clock_timestamp() < bounds.ends_at)
      and battle.started_at >= bounds.starts_at
      and (bounds.ends_at is null or battle.started_at < bounds.ends_at)
  );
