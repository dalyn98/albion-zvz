-- Performance indexes uncovered by 2026-04-20 efficiency audit.
--
-- 1) slots(assigned_discord_id) — used in /me/[discordId], member detail,
--    "내가 신청한 슬롯" 조회 등. partial index 로 NULL(빈 슬롯) 제외해서
--    크기를 작게 유지.
-- 2) parties(event_id) — slots → parties → events 조인에서 parties.event_id
--    로 자주 필터링. FK 컬럼이지만 Postgres는 FK 자동 인덱스를 만들지
--    않으므로 명시적 추가.
--
-- listExchangeRequests의 ledger 합산은 단일 IN 쿼리이고 admin-scale 호출이라
-- 별도 RPC 추가 없이 기존 point_ledger_discord_created 인덱스로 충분.

CREATE INDEX IF NOT EXISTS idx_slots_assigned_discord_id
  ON slots (assigned_discord_id)
  WHERE assigned_discord_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_parties_event_id
  ON parties (event_id);
