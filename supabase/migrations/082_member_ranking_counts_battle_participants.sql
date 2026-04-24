-- participations 를 battle_records.raw_battle.players 기반으로 재정의.
-- 기존(080): participations 도 killboard 기반 (창 안에 킬/데스가 있어야 참여로
-- 인정). 0킬 0데스 참여자(탱커/힐러/서포터가 교전 전에 끝났거나 드물게 아무
-- 판정 없이 끝난 경우) 가 통째로 집계 누락됨.
--
-- 새 정의:
--   kills          — killboard role='killer', tracked window 안 (변경 없음)
--   deaths         — killboard role='victim', tracked window 안 (변경 없음)
--   participations — tenant_battle_records 와 엮인 battle_records.raw_battle.players
--                    중 guild_avatars 로 매칭되는 멤버. 킬/데스 유무 무관.
--
-- 참고: 0킬 0데스 참여자 커버리지 — 참여만 잡혀도 출석은 인정하되 킬/데스는
-- 사실 그대로 0 으로 남는다. raw_battle 은 이미 저장되어 있으므로 추가 API 호출
-- 없음.

create or replace function member_ranking_counts(p_guild_id uuid)
returns table(
  discord_id     text,
  kills          integer,
  deaths         integer,
  participations integer
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
    -- killboard 기반 kills/deaths. 창 안에 들어오는 이벤트만 집계.
    select
      ke.discord_id,
      count(*) filter (where ke.role = 'killer')::integer as kills,
      count(*) filter (where ke.role = 'victim')::integer as deaths
    from public.killboard_events ke
    where ke.guild_id = p_guild_id
      and exists (
        select 1 from windows w
        where ke.occurred_at between w.window_start and w.window_end
      )
    group by ke.discord_id
  ),
  participation_counts as (
    -- raw_battle.players 와 guild_avatars.albion_player_id 를 조인 → 멤버가
    -- 해당 배틀에 실제 참여했는지 판정. 같은 멤버가 여러 배틀에 등장하면
    -- distinct raw_start 로 창별 1회 카운트.
    select
      ga.discord_id,
      count(distinct w.raw_start)::integer as participations
    from windows w
    cross join lateral jsonb_each(w.raw_battle->'players') p
    inner join public.guild_avatars ga
      on ga.guild_id = p_guild_id
     and ga.albion_player_id = p.value->>'id'
    group by ga.discord_id
  )
  select
    coalesce(k.discord_id, p.discord_id) as discord_id,
    coalesce(k.kills, 0)                 as kills,
    coalesce(k.deaths, 0)                as deaths,
    coalesce(p.participations, 0)        as participations
  from kill_death_counts k
  full outer join participation_counts p on p.discord_id = k.discord_id;
$$;

revoke all on function member_ranking_counts(uuid) from public;
grant execute on function member_ranking_counts(uuid) to authenticated, service_role;

-- Server action (leaderboard.ts, members-admin.ts) 에서 멤버별 참여 배틀 목록과
-- outcome 을 JS 로 합치기 위한 helper. 멤버 상세는 1명만, 리더보드는 전체.
-- 반환 row: (discord_id, raw_started_at, outcome) — 같은 멤버가 여러 배틀이면
-- 여러 행. JS 쪽에서 killboard 기반 battles 와 병합해 0k0d 참여를 보강한다.
create or replace function member_battle_participations(p_guild_id uuid)
returns table(
  discord_id     text,
  raw_started_at timestamptz,
  outcome        text
)
language sql
security definer
set search_path = public
as $$
  select distinct
    ga.discord_id,
    tbr.started_at as raw_started_at,
    tbr.outcome    as outcome
  from public.tenant_battle_records tbr
  inner join public.battle_records br on br.id = tbr.battle_record_id
  cross join lateral jsonb_each(br.raw_battle->'players') p
  inner join public.guild_avatars ga
    on ga.guild_id = tbr.guild_id
   and ga.albion_player_id = p.value->>'id'
  where tbr.guild_id = p_guild_id
    and br.ended_at is not null;
$$;

revoke all on function member_battle_participations(uuid) from public;
grant execute on function member_battle_participations(uuid) to authenticated, service_role;
