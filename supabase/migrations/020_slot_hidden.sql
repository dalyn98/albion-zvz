-- 슬롯(빌드) 숨김 플래그.
--
-- 관리자가 특정 빌드를 구성원에게 숨기고 싶을 때 사용. 기존 신청자
-- 데이터는 보존하되(assigned_* 컬럼 유지), 구성원 뷰에서 해당 슬롯을
-- 표시하지 않는다. 숨김 해제 시 그대로 복구된다.
--
-- DEFAULT false NOT NULL — 기존 슬롯은 전부 보이는 상태로 유지.

ALTER TABLE slots
  ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;

-- 구성원 뷰가 is_hidden=false만 필터링하므로, false 쪽에 치우친 조건
-- 인덱스가 이벤트별 슬롯 조회를 가속한다.
CREATE INDEX IF NOT EXISTS idx_slots_visible
  ON slots (party_id)
  WHERE is_hidden = false;
