-- 길드원간 포인트(실버) 양도.
--
-- 기존 포인트 흐름은 리기어 승인(+), 환전 승인(-), 관리자 수동 조정(±) 세 갈래였다.
-- 이제 길드원이 자신의 포인트를 다른 길드원에게 넘겨줄 수 있게 한다. 한 번의
-- 요청으로 여러 명에게 동시 지급할 수 있어야 하며 (쪼개기/선물 일괄 처리), 송신자
-- 잔액이 총 지급액보다 적으면 전체가 실패한다(부분 성공 없음).
--
-- 설계:
--   - 포인트 원장은 append-only 유지. 양도 한 건당 두 줄 기록(-송신자/+수신자).
--   - 한 번에 여러 명 지급 시 모든 쌍에 같은 ref_id(uuid)를 공유해 UI에서 묶어
--     보여줄 수 있게 한다. ref_id 는 DB 측 pending 행을 참조하는 게 아니라
--     그저 배치 식별자이므로 regear_requests/exchange_requests 와 달리 별도
--     테이블은 두지 않는다.
--   - 원자성은 RPC 내부에서 advisory lock + SUM(delta) 체크로 보장. 동시에 두
--     양도가 날아와도 잔액 초과로 찢어지지 않는다.

-- 1) reason CHECK 확장. 기존 제약을 drop 한 뒤 transfer_in / transfer_out 을 더해
--    재생성. ENUM 이 아니라 text + CHECK 이므로 제약만 교체하면 된다.
ALTER TABLE point_ledger DROP CONSTRAINT IF EXISTS point_ledger_reason_check;
ALTER TABLE point_ledger
  ADD CONSTRAINT point_ledger_reason_check
  CHECK (reason IN ('regear_approved','exchange_paid','admin_adjust','transfer_in','transfer_out'));

-- 2) 양도 RPC. 송신자 1명 → 수신자 N명 (N >= 1).
--    p_transfers 는 [{discord_id, username, amount, memo?}] 형식의 jsonb 배열.
--    각 요소는 동일한 송신자에게서 해당 수신자로 `amount` silver 를 옮긴다.
--
--    실패 케이스:
--      - SELF_TRANSFER     : 수신자 목록에 송신자 본인 포함
--      - NO_RECIPIENTS     : 수신자 0명
--      - INVALID_AMOUNT    : amount <= 0 또는 정수 아님
--      - MEMBER_NOT_FOUND  : 수신자 discord_id 가 guild_avatars 에 없음
--      - INSUFFICIENT_BALANCE : 송신자 잔액 < 총 지급액
CREATE OR REPLACE FUNCTION transfer_points(p_from text, p_transfers jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_ref       uuid := gen_random_uuid();
  v_total     integer := 0;
  v_balance   integer;
  v_recipient record;
  v_valid_ids integer;
BEGIN
  IF p_from IS NULL OR p_from = '' THEN
    RAISE EXCEPTION 'INVALID_SENDER';
  END IF;

  IF jsonb_typeof(p_transfers) <> 'array' OR jsonb_array_length(p_transfers) = 0 THEN
    RAISE EXCEPTION 'NO_RECIPIENTS';
  END IF;

  -- 송신자 본인 잠금. 동시에 두 양도가 들어와도 잔액 차감이 직렬화된다.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_from, 0));

  -- 각 요소 검증 + 총합 계산. 본인에게 보내기 금지.
  FOR v_recipient IN
    SELECT
      (elem->>'discord_id') AS discord_id,
      COALESCE(elem->>'username', '') AS username,
      ((elem->>'amount')::numeric)::integer AS amount,
      COALESCE(elem->>'memo', NULL) AS memo
    FROM jsonb_array_elements(p_transfers) AS elem
  LOOP
    IF v_recipient.discord_id IS NULL OR v_recipient.discord_id = '' THEN
      RAISE EXCEPTION 'MEMBER_NOT_FOUND';
    END IF;
    IF v_recipient.discord_id = p_from THEN
      RAISE EXCEPTION 'SELF_TRANSFER';
    END IF;
    IF v_recipient.amount IS NULL OR v_recipient.amount <= 0 THEN
      RAISE EXCEPTION 'INVALID_AMOUNT';
    END IF;
    v_total := v_total + v_recipient.amount;
  END LOOP;

  -- 수신자 존재 검증 — 한 번의 쿼리로 전부 체크. guild_avatars 는 길드 멤버십
  -- 진실 원천이므로, guest 로는 양도 불가. (필요해지면 별도 허용 리스트로 확장.)
  SELECT COUNT(*)
    INTO v_valid_ids
    FROM guild_avatars
   WHERE discord_id IN (
     SELECT elem->>'discord_id'
       FROM jsonb_array_elements(p_transfers) AS elem
   );
  IF v_valid_ids <> (
    SELECT COUNT(DISTINCT elem->>'discord_id')
      FROM jsonb_array_elements(p_transfers) AS elem
  ) THEN
    RAISE EXCEPTION 'MEMBER_NOT_FOUND';
  END IF;

  -- 잔액 확인. append-only 원장이라 SUM 으로 계산.
  SELECT COALESCE(SUM(delta), 0) INTO v_balance
    FROM point_ledger WHERE discord_id = p_from;
  IF v_balance < v_total THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE';
  END IF;

  -- 쌍(-/+)을 차례로 기록. 동일 ref_id 로 배치 식별.
  FOR v_recipient IN
    SELECT
      (elem->>'discord_id') AS discord_id,
      COALESCE(elem->>'username', '') AS username,
      ((elem->>'amount')::numeric)::integer AS amount,
      COALESCE(elem->>'memo', NULL) AS memo
    FROM jsonb_array_elements(p_transfers) AS elem
  LOOP
    INSERT INTO point_ledger (discord_id, delta, reason, ref_id, memo)
         VALUES (p_from, -v_recipient.amount, 'transfer_out', v_ref,
                 COALESCE(v_recipient.memo, v_recipient.username));
    INSERT INTO point_ledger (discord_id, delta, reason, ref_id, memo)
         VALUES (v_recipient.discord_id, v_recipient.amount, 'transfer_in', v_ref,
                 COALESCE(v_recipient.memo, p_from));
  END LOOP;

  RETURN v_ref;
END;
$$;
