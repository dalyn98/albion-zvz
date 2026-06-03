-- 183: make member battle participation RPC pagination-safe and projection-backed.
--
-- The app reads this RPC in 1000-row pages to avoid PostgREST response caps.
-- Keep the result order deterministic so page boundaries do not duplicate or
-- skip rows while the underlying data is unchanged during one request.
--
-- Prefer battle_participant_snapshots when the shadow projection exists. Older
-- battles that have not been shadow-projected yet fall back to raw_battle JSON
-- expansion, so this migration is safe before a full historical backfill.

create or replace function public.member_battle_participations(p_guild_id uuid)
returns table(
  discord_id        text,
  albion_player_id  text,
  raw_started_at    timestamptz,
  outcome           text
)
language sql
security definer
set search_path = public
as $$
  with tracked as (
    select
      tbr.guild_id,
      tbr.battle_record_id,
      tbr.started_at,
      tbr.outcome,
      br.raw_battle
    from public.tenant_battle_records tbr
    inner join public.battle_records br on br.id = tbr.battle_record_id
    where tbr.guild_id = p_guild_id
      and br.ended_at is not null
      and (
        (tbr.home_kills + tbr.home_deaths) >= (tbr.home_team_size * 0.1)
        or tbr.home_deaths >= 3
      )
  ),
  projected_participations as (
    select
      ga.discord_id,
      agm.albion_player_id,
      t.started_at as raw_started_at,
      t.outcome    as outcome
    from tracked t
    inner join public.battle_participant_snapshots bps
      on bps.battle_record_id = t.battle_record_id
     and bps.participant_type = 'player'
    inner join public.albion_guild_members agm
      on agm.guild_id = t.guild_id
     and agm.albion_player_id = bps.entity_albion_id
    left join public.guild_avatars ga
      on ga.guild_id = t.guild_id
     and ga.albion_player_id = agm.albion_player_id
     and ga.withdrawn_at is null
    where agm.left_at is null
  ),
  raw_participations as (
    select
      ga.discord_id,
      agm.albion_player_id,
      t.started_at as raw_started_at,
      t.outcome    as outcome
    from tracked t
    cross join lateral jsonb_each(t.raw_battle->'players') p
    inner join public.albion_guild_members agm
      on agm.guild_id = t.guild_id
     and agm.albion_player_id = p.value->>'id'
    left join public.guild_avatars ga
      on ga.guild_id = t.guild_id
     and ga.albion_player_id = agm.albion_player_id
     and ga.withdrawn_at is null
    where agm.left_at is null
      and not exists (
        select 1
          from public.battle_participant_snapshots bps
         where bps.battle_record_id = t.battle_record_id
           and bps.participant_type = 'player'
      )
  )
  select distinct
    rows.discord_id,
    rows.albion_player_id,
    rows.raw_started_at,
    rows.outcome
  from (
    select * from projected_participations
    union all
    select * from raw_participations
  ) rows
  order by 3 asc, 2 asc, 1 asc, 4 asc;
$$;

revoke all on function public.member_battle_participations(uuid) from public;
grant execute on function public.member_battle_participations(uuid) to authenticated, service_role;
