-- AODP 폴백 단계(tier) 를 DB 에 기록해 UI 경고·자동 리기어 안전 게이트에 쓴다.
--
-- 폴백 단계 (src/lib/shop/aodp.ts 의 AodpFallbackTier 와 동기화):
--   null     — exact hit. 사용자 설정 그대로 시세 찾음. 경고 없음.
--   quality  — 품질 낮춰서 hit. 노란 경고.
--   window   — 평균 기간 14일로 풀어 hit. 노란 경고.
--   bluezone — 블루존 시티까지 확장해 hit. 주황 경고.
--   redzone  — 레드존(Caerleon/Brecilien)까지 확장해 hit. 빨간 경고 + 자동 리기어 보류.
--   none     — 모든 폴백 실패. price = null (저장 안 됨).
--
-- 왜 'exact' 가 빈 값(null)인가: 별도 단계 컬럼이므로 경고가 필요 없는 정상
-- 케이스는 NULL 로 두어 인덱스/쿼리가 단순해진다. WHERE price_warning_level
-- IS NOT NULL 이 "부정확한 시세" 필터가 됨.

alter table public.shop_inventory
  add column if not exists price_warning_level text
    check (
      price_warning_level is null
      or price_warning_level in ('quality', 'window', 'bluezone', 'redzone')
    );

alter table public.regear_requests
  add column if not exists price_warning_level text
    check (
      price_warning_level is null
      or price_warning_level in ('quality', 'window', 'bluezone', 'redzone')
    );

-- create_auto_regear_request 시그니처 변경: p_price_warning_level 추가.
-- redzone 이면 status='pending' + point_ledger 적립 skip → 관리자 검토 대기열로.
-- 그 외엔 기존 동작 유지 (status='approved' + 즉시 적립).
drop function if exists public.create_auto_regear_request(
  uuid, text, text, text, text, integer, integer, integer, bigint, jsonb
);

create or replace function public.create_auto_regear_request(
  p_event_id uuid,
  p_event_title text,
  p_discord_id text,
  p_username text,
  p_role_name text,
  p_silver integer,
  p_claimed_silver integer,
  p_payout_silver integer,
  p_killboard_event_id bigint,
  p_gear_breakdown jsonb,
  p_price_warning_level text
) returns uuid language plpgsql security definer as $$
declare
  v_existing uuid;
  v_new_id uuid;
  v_credit integer;
  v_needs_review boolean;
  v_status text;
begin
  -- 중복 실행 방지: 이미 만든 auto-regear 가 있으면 그대로 반환.
  select id into v_existing
    from regear_requests
   where event_id = p_event_id
     and killboard_event_id = p_killboard_event_id
     and auto_generated = true;
  if v_existing is not null then
    return v_existing;
  end if;

  -- claimed_silver 는 [0, silver] 로 제약되므로 입력을 방어적으로 클램프.
  v_credit := p_payout_silver;
  if v_credit < 0 then v_credit := 0; end if;
  if v_credit > p_claimed_silver then v_credit := p_claimed_silver; end if;

  -- 레드존 시세로 추정된 건은 관리자 검토 대기열로 — 자동 승인하지 않는다.
  -- 그 외는 기존처럼 즉시 승인.
  v_needs_review := (p_price_warning_level = 'redzone');
  v_status := case when v_needs_review then 'pending' else 'approved' end;

  insert into regear_requests (
    event_id, event_title_snapshot, discord_id, username, role_name,
    silver, claimed_silver, payout_silver,
    screenshot_path, killboard_verified, killboard_event_id,
    status, resolved_at, handled_by_username,
    auto_generated, gear_breakdown, request_type, price_warning_level
  ) values (
    p_event_id, p_event_title, p_discord_id, p_username, p_role_name,
    p_silver, p_claimed_silver, v_credit,
    null, true, p_killboard_event_id,
    v_status,
    case when v_needs_review then null else now() end,
    case when v_needs_review then null else 'auto' end,
    true, p_gear_breakdown, 'death', p_price_warning_level
  ) returning id into v_new_id;

  -- 레드존 건은 승인 시점에 approve_regear_request 가 ledger 를 적립하도록 보류.
  if not v_needs_review then
    insert into point_ledger (discord_id, delta, reason, ref_id)
         values (p_discord_id, v_credit, 'regear_approved', v_new_id);
  end if;

  return v_new_id;
end;
$$;

comment on function public.create_auto_regear_request is
  'killboard_event 기반 자동 리기어 1건 생성. 가격 경고 단계 = redzone 이면 status=pending 으로 관리자 검토 대기, 그 외는 status=approved + point_ledger 즉시 적립. 재실행 idempotent.';
