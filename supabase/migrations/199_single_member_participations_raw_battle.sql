-- Shadow battle tables are intentionally paused in production because their
-- write/read amplification was too high. Single-member participation stats
-- must match member_battle_participations(uuid): use raw_battle players as
-- the live source of truth instead of partial shadow projection rows.

create or replace function public.member_battle_participations_for_member(
  p_guild_id uuid,
  p_albion_player_id text default null,
  p_discord_id text default null
)
returns table(
  discord_id        text,
  albion_player_id  text,
  raw_started_at    timestamptz,
  outcome           text
)
language sql
stable
security definer
set search_path = public
as $$
  with target_members as (
    select
      agm.guild_id,
      agm.albion_player_id,
      ga.discord_id
    from public.albion_guild_members agm
    left join public.guild_avatars ga
      on ga.guild_id = agm.guild_id
     and ga.albion_player_id = agm.albion_player_id
     and ga.withdrawn_at is null
    where agm.guild_id = p_guild_id
      and agm.left_at is null
      and (
        (p_albion_player_id is not null and agm.albion_player_id = p_albion_player_id)
        or (
          p_albion_player_id is null
          and p_discord_id is not null
          and ga.discord_id = p_discord_id
        )
      )
  ),
  tracked as (
    select
      tbr.guild_id,
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
  )
  select distinct
    tm.discord_id,
    tm.albion_player_id,
    t.started_at as raw_started_at,
    t.outcome    as outcome
  from tracked t
  cross join lateral jsonb_each(t.raw_battle->'players') p
  inner join target_members tm
    on tm.guild_id = t.guild_id
   and tm.albion_player_id = p.value->>'id'
  order by 3 asc, 2 asc, 1 asc, 4 asc;
$$;

revoke all on function public.member_battle_participations_for_member(uuid, text, text) from public;
revoke all on function public.member_battle_participations_for_member(uuid, text, text) from anon, authenticated;
grant execute on function public.member_battle_participations_for_member(uuid, text, text) to service_role;
