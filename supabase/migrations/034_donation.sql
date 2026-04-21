-- 길드 기부 기능.
--
-- 길드원이 길드 금고에 실버/아이템을 직접 기부하고, 인증 스크린샷을 올린
-- 뒤 관리자가 확인하면 그 금액이 포인트로 적립된다. 구조는 리기어와 똑같다
-- (스크린샷 업로드 + 청구 금액 + pending 상태 + 관리자 승인/거절).
-- 다른 점:
--   - 이벤트에 종속되지 않음 — 언제든 신청 가능
--   - 역할 상한(role_rewards) 없음 — 기부액 = 적립 포인트
--   - 킬보드 검증 없음 — 순수 관리자 심사
--
-- point_ledger 에 기록되는 reason 은 'donation_approved' (+).

-- 1) reason CHECK 확장. 033 에서 transfer_in/out 을 추가했고 여기서 donation_approved 추가.
ALTER TABLE point_ledger DROP CONSTRAINT IF EXISTS point_ledger_reason_check;
ALTER TABLE point_ledger
  ADD CONSTRAINT point_ledger_reason_check
  CHECK (reason IN (
    'regear_approved',
    'exchange_paid',
    'admin_adjust',
    'transfer_in',
    'transfer_out',
    'donation_approved'
  ));

-- 2) 기부 신청 테이블.
CREATE TABLE donation_requests (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  discord_id      text NOT NULL,
  username        text NOT NULL,
  silver          integer NOT NULL CHECK (silver > 0),   -- 신청자가 기부했다고 주장한 금액
  screenshot_path text NOT NULL,                         -- donation-screenshots 버킷 내 경로
  memo            text,                                  -- 신청자가 덧붙인 메모 (아이템 목록 등)
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected')),
  admin_notes     text,                                  -- 거절 사유 / 관리자 메모
  created_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz
);

CREATE INDEX donation_requests_status_created ON donation_requests (status, created_at DESC);
CREATE INDEX donation_requests_discord_created ON donation_requests (discord_id, created_at DESC);

ALTER TABLE donation_requests ENABLE ROW LEVEL SECURITY;

-- 3) 승인 RPC. 원자적으로 상태 flip + ledger 삽입. 중복 승인 방지 위해 FOR UPDATE.
CREATE OR REPLACE FUNCTION approve_donation_request(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_discord text;
  v_silver  integer;
BEGIN
  SELECT discord_id, silver INTO v_discord, v_silver
    FROM donation_requests
   WHERE id = p_id AND status = 'pending'
   FOR UPDATE;

  IF v_discord IS NULL THEN
    RAISE EXCEPTION 'DONATION_NOT_PENDING';
  END IF;

  UPDATE donation_requests
     SET status = 'approved', resolved_at = now()
   WHERE id = p_id;

  INSERT INTO point_ledger (discord_id, delta, reason, ref_id)
       VALUES (v_discord, v_silver, 'donation_approved', p_id);
END;
$$;

CREATE OR REPLACE FUNCTION reject_donation_request(p_id uuid, p_notes text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE donation_requests
     SET status = 'rejected', resolved_at = now(), admin_notes = p_notes
   WHERE id = p_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DONATION_NOT_PENDING';
  END IF;
END;
$$;

-- 4) 전용 스토리지 버킷. 기존 regear-screenshots 와 섞이면 정리가 힘들어 분리.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('donation-screenshots', 'donation-screenshots', false, 10485760,
        ARRAY['image/png','image/jpeg','image/webp'])
ON CONFLICT (id) DO NOTHING;
