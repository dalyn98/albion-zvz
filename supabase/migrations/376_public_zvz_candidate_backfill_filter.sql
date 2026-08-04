-- 376: Keep v2 projection backfill focused on plausible official fights.
--
-- A season can contain tens of thousands of small Albion battle rows. They are
-- preserved as raw logs, but an official AGM fight requires at least one
-- alliance-level force with 20 players and at least 20 players across the
-- opposing forces. Filtering on the already-materialized force summaries keeps
-- backfill proportional to ranking work instead of the size of the raw archive.

create index if not exists idx_battle_force_summaries_large_alliance_battle
  on public.battle_force_summaries (battle_record_id, force_key)
  include (team_size)
  where force_level = 'alliance' and team_size >= 20;

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
  plausible_battles as materialized (
    select distinct home.battle_record_id
    from public.battle_force_summaries home
    join public.battle_records battle
      on battle.id = home.battle_record_id
    join current_seasons season
      on season.albion_server = battle.albion_server
     and battle.started_at >= season.starts_on::timestamptz
    where home.force_level = 'alliance'
      and home.team_size >= 20
      and (
        select coalesce(sum(opponent.team_size), 0)
        from public.battle_force_summaries opponent
        where opponent.battle_record_id = home.battle_record_id
          and opponent.force_level = 'alliance'
          and opponent.force_key <> home.force_key
      ) >= 20
  )
  select
    battle.id,
    battle.albion_server,
    battle.raw_battle,
    battle.engagement_source_hash
  from plausible_battles plausible
  join public.battle_records battle
    on battle.id = plausible.battle_record_id
  left join public.public_zvz_battle_projection_runs run
    on run.battle_record_id = battle.id
  where run.battle_record_id is null
     or run.source_hash is distinct from battle.engagement_source_hash
     or run.coverage <> 'complete'
  order by battle.started_at desc, battle.id
  limit least(100, greatest(1, coalesce(p_limit, 25)));
$$;

revoke all on function public.list_public_zvz_projection_backfill_candidates(integer)
  from public, anon, authenticated;
grant execute on function public.list_public_zvz_projection_backfill_candidates(integer)
  to service_role;

comment on function public.list_public_zvz_projection_backfill_candidates(integer) is
  'Returns only current-season battles whose force summaries can satisfy the official 20-v-20 floor and whose v2 projection is missing, stale, or incomplete.';
