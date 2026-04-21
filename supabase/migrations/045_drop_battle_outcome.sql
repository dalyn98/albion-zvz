-- 전투 승/패 기능 전면 삭제. 운영진이 기능이 불필요하다고 판단해
-- event_battles / opponent_guilds 테이블, events.outcome / finalized_at
-- 컬럼 모두 드랍. 히스토리 데이터도 함께 사라진다 (백업 없음).
--
-- 순서: FK가 있는 자식 테이블(event_battles)을 먼저, 그다음 부모(opponent_guilds).
-- events 컬럼은 맨 마지막. 인덱스는 테이블 DROP과 함께 사라진다.

DROP TABLE IF EXISTS public.event_battles CASCADE;
DROP TABLE IF EXISTS public.opponent_guilds CASCADE;

ALTER TABLE public.events
  DROP COLUMN IF EXISTS outcome,
  DROP COLUMN IF EXISTS finalized_at;
