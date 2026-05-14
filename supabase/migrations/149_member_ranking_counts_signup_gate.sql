-- 멤버 통계 정책 정렬: killboard_events 집계에 "사이트 가입 이후" 게이트
-- 추가. discord_id IS NOT NULL 필터로 가입 전 미연동 sync 된 이벤트를
-- 모집단에서 제외한다.
--
-- 같은 PR 에서 TS 측 surface (leaderboard.ts, members-admin.ts 의
-- fetchMemberDetail, guild-profile-activity.ts) 도 동일 필터를 적용해
-- 리더보드 / 길드 공개 페이지 / 멤버 상세 / 본 RPC 가 모두 같은 모집단
-- ("사이트 가입자 + 가입 이후 기록") 으로 일치되게 한다.
--
-- killboard sync 의 upsert (lib/killboard-sync.ts) 는 ignoreDuplicates=true
-- 라 가입 전 미연동 sync 이벤트는 discord_id=NULL 그대로 남는다. 따라서
-- discord_id IS NOT NULL = "OAuth 가입 시점 이후 발생" 의 정확한 게이트.
--
-- member_battle_participations RPC 는 raw_battle.players 기반이라
-- event-level 가입 게이트를 적용할 컬럼이 없음. 현행 활성 길드원 cohort
-- 필터 (agm.left_at IS NULL + guild_avatars LEFT JOIN) 유지.

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
      and ke.discord_id is not null
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
