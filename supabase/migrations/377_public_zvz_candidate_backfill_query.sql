-- 377: Make plausible-fight backfill use the current-season battle index.
--
-- Grouping every historical force summary can exceed the production statement
-- timeout. An official 20-v-20 engagement necessarily has at least 40 players in
-- the raw battle, so scan only those current-season rows newest-first and verify
-- the exact force-summary condition with indexed per-battle lookups.

create index if not exists idx_battle_records_zvz_candidate_started
  on public.battle_records (albion_server, started_at desc, id)
  include (engagement_source_hash)
  where total_players >= 40;

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
    and exists (
      select 1
      from public.battle_force_summaries home
      where home.battle_record_id = battle.id
        and home.force_level = 'alliance'
        and home.team_size >= 20
        and (
          select coalesce(sum(opponent.team_size), 0)
          from public.battle_force_summaries opponent
          where opponent.battle_record_id = battle.id
            and opponent.force_level = 'alliance'
            and opponent.force_key <> home.force_key
        ) >= 20
    )
  order by battle.started_at desc, battle.id
  limit least(100, greatest(1, coalesce(p_limit, 25)));
$$;

revoke all on function public.list_public_zvz_projection_backfill_candidates(integer)
  from public, anon, authenticated;
grant execute on function public.list_public_zvz_projection_backfill_candidates(integer)
  to service_role;

comment on function public.list_public_zvz_projection_backfill_candidates(integer) is
  'Returns current-season 40+ player battles that can satisfy the exact force-summary 20-v-20 floor and whose v2 projection is missing, stale, or incomplete.';
