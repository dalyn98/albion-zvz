-- low-engagement 컷을 RPC 측에도 적용. tenant_battle_records 의 raw 행은
-- 그대로 두고, 통계/업적/리스트 집계 쿼리에서 hide. RPC 두 개 (member_ranking_counts,
-- member_battle_participations) 가 컷 미적용이라 TS-only 필터로는 멤버 카운트와
-- 랭킹이 일치하지 않아 사용자 혼란 발생.
--
-- 컷 조건 (TS lib/low-engagement-cut.ts 와 동기화):
--   NOT (
--     (home_kills + home_deaths) < (home_team_size * 0.1)
--     AND home_deaths < 3
--   )
-- = (home_kills + home_deaths) >= (home_team_size * 0.1) OR home_deaths >= 3
--
-- 직관: "70명 길드인데 K1/D0" 같은 드라이브바이는 hide. 단 D >= 3 이면 진성 패배
-- (포지셔닝 실패해서 다 죽음) 로 판정해 keep.

drop function if exists public.member_battle_participations(uuid);

create or replace function member_battle_participations(p_guild_id uuid)
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
  select distinct
    ga.discord_id,
    agm.albion_player_id,
    tbr.started_at as raw_started_at,
    tbr.outcome    as outcome
  from public.tenant_battle_records tbr
  inner join public.battle_records br on br.id = tbr.battle_record_id
  cross join lateral jsonb_each(br.raw_battle->'players') p
  inner join public.albion_guild_members agm
    on agm.guild_id = tbr.guild_id
   and agm.albion_player_id = p.value->>'id'
  left join public.guild_avatars ga
    on ga.guild_id = tbr.guild_id
   and ga.albion_player_id = agm.albion_player_id
   and ga.withdrawn_at is null
  where tbr.guild_id = p_guild_id
    and br.ended_at is not null
    and agm.left_at is null
    and (
      (tbr.home_kills + tbr.home_deaths) >= (tbr.home_team_size * 0.1)
      or tbr.home_deaths >= 3
    );
$$;

revoke all on function member_battle_participations(uuid) from public;
grant execute on function member_battle_participations(uuid) to authenticated, service_role;


drop function if exists public.member_ranking_counts(uuid);

create or replace function member_ranking_counts(p_guild_id uuid)
returns table(
  discord_id        text,
  albion_player_id  text,
  kills             integer,
  deaths            integer,
  participations    integer
)
language sql
security definer
set search_path = public
as $$
  with windows as (
    select
      tbr.started_at - interval '15 minutes' as window_start,
      br.ended_at    + interval '15 minutes' as window_end,
      tbr.started_at                         as raw_start,
      br.raw_battle                          as raw_battle
    from public.tenant_battle_records tbr
    inner join public.battle_records br on br.id = tbr.battle_record_id
    where tbr.guild_id = p_guild_id
      and br.ended_at is not null
      and (
        (tbr.home_kills + tbr.home_deaths) >= (tbr.home_team_size * 0.1)
        or tbr.home_deaths >= 3
      )
  ),
  kill_death_counts as (
    select
      ke.albion_player_id,
      count(*) filter (where ke.role = 'killer')::integer as kills,
      count(*) filter (where ke.role = 'victim')::integer as deaths
    from public.killboard_events ke
    where ke.guild_id = p_guild_id
      and exists (
        select 1 from windows w
        where ke.occurred_at between w.window_start and w.window_end
      )
    group by ke.albion_player_id
  ),
  participation_counts as (
    select
      agm.albion_player_id,
      count(distinct w.raw_start)::integer as participations
    from windows w
    cross join lateral jsonb_each(w.raw_battle->'players') p
    inner join public.albion_guild_members agm
      on agm.guild_id = p_guild_id
     and agm.albion_player_id = p.value->>'id'
    where agm.left_at is null
    group by agm.albion_player_id
  )
  select
    ga.discord_id,
    coalesce(k.albion_player_id, p.albion_player_id) as albion_player_id,
    coalesce(k.kills, 0)                              as kills,
    coalesce(k.deaths, 0)                             as deaths,
    coalesce(p.participations, 0)                     as participations
  from kill_death_counts k
  full outer join participation_counts p on p.albion_player_id = k.albion_player_id
  left join public.guild_avatars ga
    on ga.albion_player_id = coalesce(k.albion_player_id, p.albion_player_id)
   and ga.guild_id = p_guild_id
   and ga.withdrawn_at is null;
$$;

revoke all on function member_ranking_counts(uuid) from public;
grant execute on function member_ranking_counts(uuid) to authenticated, service_role;
