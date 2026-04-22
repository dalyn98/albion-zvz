-- Phase 3 자동 리기어 — 역할 상한(role_rewards.silver) 을 자동 flow 에도 적용.
--
-- 수동 flow 에서는 `role_rewards.silver` 가 역할별 상한으로 작동하고, 0 또는
-- 미등록 역할은 아예 리기어 신청이 차단된다. migration 050 의 자동 flow 는
-- 이 규칙을 우회해 시장가 그대로 지급했다. semantic 불일치가 치명적이어서
-- — 특히 현재 `기타`/`BM` 역할이 silver=0 으로 세팅돼 있는데 이들에게도
-- 자동 지급되는 문제 — 다음 두 층으로 수정:
--
--   1. 호출부(src/lib/auto-regear.ts) 가 1차 체크 + 관측 카운터 기록.
--      `requests_skipped_no_role_cap` 이 cron 응답에 포함됨.
--
--   2. RPC 가 defense-in-depth 로 role_rewards 재조회 + v_credit 상한.
--      호출부 버그로 잘못된 값이 와도 DB 층에서 차단.
--
-- 호출부가 이제 p_silver=role_cap, p_claimed_silver=min(market, cap),
-- p_payout_silver=floor(claimed*rate/100) 로 전달한다. RPC 는 이 규약을
-- 문서화하고 역할 상한 기준으로 재보정.

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

  insert into point_ledger (discord_id, delta, reason, ref_id)
       values (p_discord_id, v_credit, 'regear_approved', v_new_id);

  return v_new_id;
end;
$$;

comment on function public.create_auto_regear_request is
  'killboard victim 1건 → auto regear_requests + point_ledger. 같은 event+killboard_event 재실행 idempotent. 호출 규약: p_silver=role_cap, p_claimed_silver=min(market,cap), p_payout_silver=floor(claimed*rate/100). RPC 는 (a) 같은 event 에 수동 non-rejected 행 존재, (b) role_rewards.silver=0/미등록 인 경우 NULL 반환.';
