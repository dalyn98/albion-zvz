-- /battles 페이지의 over-fetch (limit × 3) 를 SQL-side 필터로 대체하기 위한
-- 컴퓨티드 컬럼 + 인덱스. 기존 TS 측 isHighEngagement / RPC 의 인라인 표현식
-- (lib/low-engagement-cut.ts, mig 099) 와 같은 정의:
--
--   NOT ((home_kills + home_deaths) < home_team_size * 0.1 AND home_deaths < 3)
-- = (home_kills + home_deaths) >= home_team_size * 0.1 OR home_deaths >= 3
--
-- 부하 최적화 (#29): /battles 페이지가 cut 통과율 ~30% 가정으로 3 배 fetch 한
-- 뒤 TS 에서 필터링하던 패턴 → 인덱스 활용한 정확 fetch 로 전환. 50 row →
-- 150 row 의 SELECT 부담을 50 row 로 축소.
--
-- 생성된 컬럼은 STORED — 인덱싱 가능, 매 SELECT 마다 재계산하지 않음.

alter table public.tenant_battle_records
  add column if not exists is_high_engagement boolean
  generated always as (
    (home_kills + home_deaths) >= (home_team_size * 0.1)
    or home_deaths >= 3
  ) stored;

-- /battles 페이지 쿼리 패턴: guild_id + size_category(옵션) + outcome(옵션) +
-- is_high_engagement=true + 정렬 started_at desc, match_index asc. 가장 선택성
-- 높은 (guild_id, started_at) 와 is_high_engagement 부분 인덱스 조합.
create index if not exists idx_tenant_battle_records_high_engagement
  on public.tenant_battle_records (guild_id, started_at desc, match_index asc)
  where is_high_engagement = true;
