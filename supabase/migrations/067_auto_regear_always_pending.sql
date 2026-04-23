-- 067: 자동 리기어 생성 시 항상 status='pending' 로 저장하고 point_ledger 적립 없음.
--
-- 기존 (migration 050~065) 은 killboard 매칭 + AODP 시세 추정이 끝나면 바로
-- status='approved' + point_ledger 즉시 적립했고, redzone 시세만 예외적으로
-- pending 으로 보류했다. 그런데 시세 추정의 불확실성 — 폴백 단계, 도시 스펙
-- 외곡, 빈손 사망 시 0 payout 등 — 을 관리자가 일일이 감사하려면 결국 모든
-- 자동 건이 승인 대기열에 올라와야 한다는 결론.
--
-- 변경: create_auto_regear_request 는 regear_requests 를 status='pending' 으로
-- 만들고 point_ledger 는 건드리지 않는다. 관리자가 /approvals 에서 승인을
-- 누르면 기존 approve_regear_request (migration 044) 가 ledger 에 credit 한다 —
-- 수동/자동 경로가 승인 시점에서 통일된다. 청구자는 승인 전에 부위별 가격을
-- 수정할 수 있다 (Phase B-3 에서 추가).
--
-- price_warning_level 은 감사용 메타데이터로 유지하되 status 결정에 쓰지
-- 않는다 — UI 경고 배지만 그대로 활용.

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
  v_manual_count integer;
  v_new_id uuid;
  v_credit integer;
  v_role_cap integer;
begin
  -- 같은 이벤트의 같은 killboard_event_id 에 대한 이전 auto 행이 있으면 그대로 반환.
  select id into v_existing
    from regear_requests
   where event_id = p_event_id
     and killboard_event_id = p_killboard_event_id
     and auto_generated = true;
  if v_existing is not null then
    return v_existing;
  end if;

  -- 같은 (event_id, discord_id) 에 non-rejected 수동 행이 있으면 skip (중복 지급 방지).
  -- rejected 는 허용 — 반려 후 자동 재생성은 정책상 OK.
  select count(*) into v_manual_count
    from regear_requests
   where event_id = p_event_id
     and discord_id = p_discord_id
     and auto_generated = false
     and status <> 'rejected';
  if v_manual_count > 0 then
    return null;
  end if;

  -- 역할 상한 확인. role_rewards.silver = 0 또는 미등록 → "이 역할은 리기어 차단"
  -- 으로 해석해 자동 생성 자체를 스킵. 호출부(auto-regear.ts) 가 이미 필터링해도
  -- DB 레벨에서 다시 방어.
  select silver into v_role_cap
    from role_rewards
   where role_name = p_role_name;
  if v_role_cap is null or v_role_cap <= 0 then
    return null;
  end if;

  -- 추정 지급액 정규화: payout <= claimed <= role_cap 을 모두 보장. 실제 승인
  -- 시점에는 approve_regear_request 가 override 받아 다시 계산할 수 있지만,
  -- 디폴트 노출값으로 여기서 클램프한 값을 사용.
  v_credit := p_payout_silver;
  if v_credit < 0 then v_credit := 0; end if;
  if v_credit > p_claimed_silver then v_credit := p_claimed_silver; end if;
  if v_credit > v_role_cap then v_credit := v_role_cap; end if;

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
    'pending', null, null,
    true, p_gear_breakdown, 'death', p_price_warning_level
  ) returning id into v_new_id;

  -- point_ledger insert 는 없음 — 관리자 승인 시 approve_regear_request 가 처리.

  return v_new_id;
end;
$$;

comment on function public.create_auto_regear_request is
  'killboard_event 기반 자동 리기어 1건을 status=pending 으로 생성. point_ledger 적립은 하지 않고 관리자 승인(approve_regear_request) 시점에만 이루어진다. 재실행 idempotent — (event_id, killboard_event_id) 로 중복 방지.';
