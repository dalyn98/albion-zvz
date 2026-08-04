-- The production battle table is indexed by started_at DESC. Backfilling the
-- current season newest-first lets the bounded candidate query use that index
-- immediately instead of sorting/scanning toward the oldest season row.

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
  from public.battle_records battle
  join current_seasons season
    on season.albion_server = battle.albion_server
   and battle.started_at >= season.starts_on::timestamptz
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
  'Returns current-season v2 projection work newest-first using the battle started_at index.';
