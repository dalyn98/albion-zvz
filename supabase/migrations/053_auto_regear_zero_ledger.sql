-- Phase 3 자동 리기어 — 0 지급 행의 point_ledger 노이즈 제거.
--
-- migration 052 까지: 시세 0 / 장비 빈손 / role cap = claimed 0 등의 케이스에
-- regear_requests 는 payout_silver=0 으로 남고, point_ledger 에 delta=0 행이
-- 함께 생겼다. 감사 이력에 0 delta 행이 쌓여 포인트 변화 추적을 혼란스럽게 한다.
--
-- 변경: v_credit = 0 이면 regear_requests 는 그대로 남기고(처리 완료 marker)
-- point_ledger insert 만 생략. 멱등성/감사 이력은 유지, 노이즈만 제거.

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
  p_gear_breakdown jsonb
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
  -- rejected 는 허용 — 반려 후 자동 재지급은 정책상 OK.
  select count(*) into v_manual_count
    from regear_requests
   where event_id = p_event_id
     and discord_id = p_discord_id
     and auto_generated = false
     and status <> 'rejected';
  if v_manual_count > 0 then
    return null;
  end if;

  -- defense in depth: 역할 상한 확인. 호출부(auto-regear.ts) 가 이미 동일한
  -- 체크를 하지만 DB 레벨에서도 차단해 미래 버그 / 잘못된 수동 호출 방어.
  -- role_rewards.silver = 0 또는 미등록 역할 → 자동/수동 모두 차단 의도.
  select silver into v_role_cap
    from role_rewards
   where role_name = p_role_name;
  if v_role_cap is null or v_role_cap <= 0 then
    return null;
  end if;

  -- 지급액 정규화: payout <= claimed <= role_cap 을 모두 보장.
  v_credit := p_payout_silver;
  if v_credit < 0 then v_credit := 0; end if;
  if v_credit > p_claimed_silver then v_credit := p_claimed_silver; end if;
  if v_credit > v_role_cap then v_credit := v_role_cap; end if;

  insert into regear_requests (
    event_id, event_title_snapshot, discord_id, username, role_name,
    silver, claimed_silver, payout_silver,
    screenshot_path, killboard_verified, killboard_event_id,
    status, resolved_at, handled_by_username,
    auto_generated, gear_breakdown, request_type
  ) values (
    p_event_id, p_event_title, p_discord_id, p_username, p_role_name,
    p_silver, p_claimed_silver, v_credit,
    null, true, p_killboard_event_id,
    'approved', now(), 'auto',
    true, p_gear_breakdown, 'death'
  ) returning id into v_new_id;

  -- v_credit = 0 이면 ledger 건너뜀. regear_requests 는 남아서 재실행 시
  -- (event_id, killboard_event_id) idempotency 로 재처리 방지.
  if v_credit > 0 then
    insert into point_ledger (discord_id, delta, reason, ref_id)
         values (p_discord_id, v_credit, 'regear_approved', v_new_id);
  end if;

  return v_new_id;
end;
$$;

comment on function public.create_auto_regear_request is
  'killboard victim 1건 → auto regear_requests + (조건부) point_ledger. 같은 event+killboard_event 재실행 idempotent. 호출 규약: p_silver=role_cap, p_claimed_silver=min(market,cap), p_payout_silver=floor(claimed*rate/100). RPC 는 (a) 같은 event 에 수동 non-rejected 행 존재, (b) role_rewards.silver=0/미등록 인 경우 NULL 반환. v_credit=0 이면 point_ledger 생략.';
