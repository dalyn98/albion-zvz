-- Phase 3: 자동 리기어 지원.
--
-- 전략: 이벤트 종료(battle_started_at + regear_window_minutes 경과) 이후 한
-- 번만 auto-regear cron 이 돌아, killboard_events 에서 길드 멤버의 victim
-- 기록을 읽고 AODP 시세로 장비를 평가해 `regear_requests` 를 status='approved'
-- 로 즉시 insert + point_ledger 적립. 관리자는 /approvals 에서 이력을
-- 확인·취소할 수 있고, `regear_requests.auto_generated=true` 필터로 수동 건과
-- 구분 가능하다.
--
-- 중복 방지: (event_id, killboard_event_id) 유니크로 한 killboard 이벤트당
-- 정확히 한 행. cron 이 다시 돌아도 upsert 로 안전.
--
-- 빌드 단위 opt-out: slots.auto_regear_excluded=true 인 슬롯에 배정된
-- 멤버는 auto-regear 대상에서 제외 (수동 신청은 여전히 가능).

-- 1) 슬롯 단위 제외 플래그. 편집기에서 체크박스로 표시하되 전역 toggle 이
--    켜져 있을 때만 UI 를 렌더링한다.
alter table public.slots
  add column if not exists auto_regear_excluded boolean not null default false;

-- 2) regear_requests 확장:
--    - auto_generated: 자동/수동 구분 (대시보드 필터·통계용)
--    - gear_breakdown: 슬롯별 item_id/price/city/mode 스냅샷 (감사·검토용)
alter table public.regear_requests
  add column if not exists auto_generated boolean not null default false,
  add column if not exists gear_breakdown jsonb;

-- 자동 생성 행은 스크린샷이 없다. 기존 manual submission 서버 액션은
-- 여전히 비어 있는 값을 거부하므로 런타임 계약은 유지.
alter table public.regear_requests
  alter column screenshot_path drop not null;

-- 3) events: 이 이벤트에 대해 auto-regear cron 이 이미 돌았는지 기록.
alter table public.events
  add column if not exists auto_regear_processed_at timestamptz;

-- 4) killboard 이벤트 id 당 자동 행 1개. 멤버가 같은 전투에서 여러 번
--    사망하면 EventId 가 다르므로 별개의 행이 된다.
create unique index if not exists regear_requests_auto_event_killboard_uniq
  on public.regear_requests (event_id, killboard_event_id)
  where auto_generated = true;

-- 5) 자동 리기어 insert + 적립 atomic RPC. cron 에서 호출.
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
  v_new_id uuid;
  v_credit integer;
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
  'killboard_event 기반 자동 리기어 승인 1건 생성 + point_ledger 적립. 재실행 idempotent.';
