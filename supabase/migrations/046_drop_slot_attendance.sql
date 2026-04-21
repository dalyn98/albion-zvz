-- 참석 체크 / 노쇼 기능 전면 삭제. 새 정책: "빌드(슬롯)에 신청 = 참석"
-- 이므로 별도의 attended_at 확인 단계가 불필요. 컬럼과 partial index 모두 드랍.
-- 슬롯 배정 자체(assigned_discord_id)가 참여 지표가 된다.

DROP INDEX IF EXISTS public.slots_attended_at_idx;

ALTER TABLE public.slots
  DROP COLUMN IF EXISTS attended_at;
