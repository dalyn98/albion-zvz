-- member_ranking_counts 를 killboard + tenant_battle_records 기반으로 재정의.
-- 기존(079): kills/deaths 는 전 killboard 집계, participations 는 slots 기준이라
-- 멤버 상세 페이지의 "배틀 창 필터" 집계와 범주가 달랐다 → 같은 멤버의
-- "내 킬" 과 "랭킹 기준 킬" 이 어긋나고, 참여 랭크는 killboard 기반 개인 통계
-- 와 비교 불가.
--
-- 새 정의:
--   kills          — killboard role='killer' 중 tenant_battle_records 시간창
--                    (±15분 padding) 안에 들어오는 것만 집계
--   deaths         — killboard role='victim' 중 같은 창 안
--   participations — 창 기준 "참여 배틀 수" (한 배틀에서 multi kill/death 도 1)
--
-- 슬롯 배정과 실제 참여가 분리됐다는 사용자의 아키텍처 결정을 반영.
-- 참고: feedback_albion_zvz_achievement_rules.md 규칙 1 (전투기록 필터 기반 집계)

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
    -- tenant_battle_records ↔ battle_records.ended_at 조인해 창 범위 생성.
    -- JS helper (fetchTrackedBattleWindows) 와 동일한 ±15분 padding.
    select
      tbr.started_at - interval '15 minutes' as window_start,
      br.ended_at    + interval '15 minutes' as window_end,
      tbr.started_at as raw_start
    from public.tenant_battle_records tbr
    inner join public.battle_records br on br.id = tbr.battle_record_id
    where tbr.guild_id = p_guild_id
      and br.ended_at is not null
  ),
  matched as (
    -- 각 killboard row 를 창과 조인. 겹치는 창이 여러 개일 경우 가장 이른 raw_start
    -- 를 골라 "하나의 참여 배틀" 로 귀결 (JS groupMemberKillsByBattle 가 인접 후보
    -- 20개 중 endedAtMs 안에 드는 첫 창을 고르는 것과 동등한 선택).
    select distinct on (ke.id)
      ke.id,
      ke.discord_id,
      ke.role,
      w.raw_start
    from public.killboard_events ke
    inner join windows w
      on ke.occurred_at between w.window_start and w.window_end
    where ke.guild_id = p_guild_id
    order by ke.id, w.raw_start
  )
  select
    m.discord_id,
    count(*) filter (where m.role = 'killer')::integer as kills,
    count(*) filter (where m.role = 'victim')::integer as deaths,
    count(distinct m.raw_start)::integer               as participations
  from matched m
  group by m.discord_id;
$$;

revoke all on function member_ranking_counts(uuid) from public;
grant execute on function member_ranking_counts(uuid) to authenticated, service_role;
