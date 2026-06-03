-- Shadow battle tables are intentionally paused in production because their
-- write/read amplification was too high. Live member stats must therefore not
-- prefer paused participant shadow rows: partial shadow rows can undercount
-- participation for a battle. Keep shadow tables for diagnostics only.

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
  order by 3 asc, 2 asc, 1 asc, 4 asc;
$$;

revoke all on function public.member_battle_participations(uuid) from public;
grant execute on function public.member_battle_participations(uuid) to authenticated, service_role;

create or replace function public.member_leaderboard_rollups(
  p_guild_id uuid,
  p_since timestamptz,
  p_bundle_splits boolean default false
)
returns table (
  albion_player_id text,
  kills integer,
  deaths integer,
  participations integer,
  death_battles integer,
  wins integer,
  losses integer
)
language sql
stable
security definer
set search_path = public
as $$
  with scoped as (
    select
      tbr.id,
      tbr.guild_id,
      tbr.battle_record_id,
      tbr.started_at,
      tbr.outcome,
      coalesce(tbr.home_kills, 0) as home_kills,
      coalesce(tbr.home_deaths, 0) as home_deaths,
      coalesce(tbr.home_team_size, 0) as home_team_size,
      coalesce(tbr.main_opponent_team_size, 0) as main_opponent_team_size,
      br.ended_at,
      br.albion_battle_id,
      br.raw_battle
    from public.tenant_battle_records tbr
    inner join public.battle_records br on br.id = tbr.battle_record_id
    where tbr.guild_id = p_guild_id
      and tbr.started_at >= p_since
      and br.ended_at is not null
  ),
  unbundled as (
    select
      s.guild_id,
      s.battle_record_id,
      s.started_at,
      s.outcome,
      s.ended_at,
      s.albion_battle_id,
      s.raw_battle
    from scoped s
    where not p_bundle_splits
      and (
        (s.home_kills + s.home_deaths) >= (s.home_team_size * 0.1)
        or s.home_deaths >= 3
      )
  ),
  bundled_totals as (
    select
      s.battle_record_id,
      sum(s.home_kills)::integer as home_kills,
      sum(s.home_deaths)::integer as home_deaths,
      max(s.home_team_size)::integer as home_team_size
    from scoped s
    where p_bundle_splits
    group by s.battle_record_id
  ),
  bundled_canonical as (
    select distinct on (s.battle_record_id)
      s.guild_id,
      s.battle_record_id,
      s.started_at,
      s.outcome,
      s.ended_at,
      s.albion_battle_id,
      s.raw_battle
    from scoped s
    where p_bundle_splits
    order by
      s.battle_record_id,
      s.main_opponent_team_size desc,
      s.started_at desc,
      s.id desc
  ),
  bundled as (
    select bc.*
    from bundled_canonical bc
    inner join bundled_totals bt using (battle_record_id)
    where (bt.home_kills + bt.home_deaths) >= (bt.home_team_size * 0.1)
       or bt.home_deaths >= 3
  ),
  tracked as (
    select * from unbundled
    union all
    select * from bundled
  ),
  kill_tracked as (
    select distinct on (t.battle_record_id)
      t.*
    from tracked t
    order by
      t.battle_record_id,
      t.started_at desc
  ),
  raw_participations as (
    select distinct
      agm.albion_player_id,
      t.battle_record_id,
      t.started_at,
      t.outcome,
      0::integer as kill_count,
      0::integer as death_count
    from tracked t
    cross join lateral jsonb_each(t.raw_battle->'players') p
    inner join public.albion_guild_members agm
      on agm.guild_id = t.guild_id
     and agm.albion_player_id = p.value->>'id'
    where agm.left_at is null
  ),
  kill_event_matches as (
    select
      ke.albion_player_id,
      ke.role,
      kt.battle_record_id,
      kt.started_at,
      kt.outcome,
      row_number() over (
        partition by ke.event_id, ke.role, ke.albion_player_id
        order by kt.started_at desc, kt.battle_record_id
      ) as match_rank
    from public.killboard_events ke
    inner join kill_tracked kt
      on (
        ke.battle_id is not null
        and kt.albion_battle_id is not null
        and ke.battle_id = kt.albion_battle_id
      )
      or (
        ke.battle_id is null
        and ke.occurred_at >= kt.started_at - interval '15 minutes'
        and ke.occurred_at <= kt.ended_at + interval '15 minutes'
      )
    where ke.guild_id = p_guild_id
      and ke.discord_id is not null
      and ke.albion_player_id is not null
      and ke.occurred_at >= p_since
  ),
  kill_events as (
    select
      kem.albion_player_id,
      kem.battle_record_id,
      kem.started_at,
      kem.outcome,
      count(*) filter (where kem.role = 'killer')::integer as kill_count,
      count(*) filter (where kem.role = 'victim')::integer as death_count
    from kill_event_matches kem
    where kem.match_rank = 1
    group by
      kem.albion_player_id,
      kem.battle_record_id,
      kem.started_at,
      kem.outcome
  ),
  per_battle as (
    select
      rows.albion_player_id,
      rows.battle_record_id,
      min(rows.started_at) as started_at,
      max(rows.outcome) as outcome,
      sum(rows.kill_count)::integer as kill_count,
      sum(rows.death_count)::integer as death_count
    from (
      select * from raw_participations
      union all
      select * from kill_events
    ) rows
    where rows.albion_player_id is not null
    group by rows.albion_player_id, rows.battle_record_id
  )
  select
    pb.albion_player_id,
    coalesce(sum(pb.kill_count), 0)::integer as kills,
    coalesce(sum(pb.death_count), 0)::integer as deaths,
    count(*)::integer as participations,
    count(*) filter (where pb.death_count > 0)::integer as death_battles,
    count(*) filter (where pb.outcome = 'win')::integer as wins,
    count(*) filter (where pb.outcome = 'loss')::integer as losses
  from per_battle pb
  group by pb.albion_player_id
  order by pb.albion_player_id asc;
$$;

revoke all on function public.member_leaderboard_rollups(uuid, timestamptz, boolean) from public;
revoke all on function public.member_leaderboard_rollups(uuid, timestamptz, boolean) from anon, authenticated;
grant execute on function public.member_leaderboard_rollups(uuid, timestamptz, boolean) to service_role;
