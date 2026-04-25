-- 통계/리더보드 모집단을 "Discord 연동 멤버" 에서 "전 길드 멤버" 로 확장.
--
-- 배경: mig 090 에서 albion_guild_members (전 길드 로스터), mig 091 에서
-- killboard_events.discord_id 를 nullable 로 풀고 albion_player_id 인덱스를
-- 추가했다. 이제 RPC 도 albion_player_id 기준으로 집계하면 미연동 멤버까지
-- 포함된다.
--
-- 변경:
--   1) member_battle_participations: 반환 컬럼에 albion_player_id 추가, JOIN 을
--      guild_avatars → albion_guild_members 로 전환. discord_id 는 LEFT JOIN
--      으로 채우되 nullable.
--   2) member_ranking_counts: kills/deaths 를 ke.albion_player_id 로 group,
--      participations 도 albion_guild_members 매칭. 반환 컬럼에 albion_player_id
--      추가, discord_id LEFT JOIN.
--
-- 호환성: 반환 컬럼 추가/순서 변경이라 기존 호출자는 코드 수정 필요. JS 쪽
-- (tracked-kills.ts, leaderboard.ts, members-admin.ts) 도 같은 PR 에서 함께 수정.

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
    ga.discord_id,                 -- nullable (미연동 멤버는 null)
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
    and agm.left_at is null;
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
  ),
  kill_death_counts as (
    -- killboard 는 미연동 멤버도 albion_player_id 로 행을 가진다 (mig 091).
    -- discord_id 가 아니라 albion_player_id 로 group 해야 미연동 K/D 가 잡힘.
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
    -- raw_battle.players → albion_guild_members 매칭. 0K0D 참여자 (탱커/힐러 등)
    -- 까지 잡히되 left_at IS NULL 활성 멤버만.
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
    on ga.guild_id = p_guild_id
   and ga.albion_player_id = coalesce(k.albion_player_id, p.albion_player_id)
   and ga.withdrawn_at is null;
$$;

revoke all on function member_ranking_counts(uuid) from public;
grant execute on function member_ranking_counts(uuid) to authenticated, service_role;
