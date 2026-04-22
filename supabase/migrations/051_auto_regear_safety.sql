-- Phase 3 auto-regear 안전 가드. migration 050 직후 배포된 코드가 아직 toggle
-- OFF 상태라 아직 피해는 없지만, 다음 두 가지를 선제적으로 막는다:
--
--   1. 역소급 처리: migration 050 배포 이전에 발생한 이벤트들은
--      `auto_regear_processed_at` 이 NULL 이다. 관리자가 toggle 을 ON 하는
--      순간 cron 이 과거 이벤트 전부를 스캔해 (이미 수동 지급 완료된 death 에
--      대해) 중복 auto 행을 만든다. 모든 기존 이벤트를 "이미 처리됨" 으로 park.
--
--   2. 수동/자동 중복 지급: 같은 (event_id, discord_id) 에 수동 승인된
--      regear 가 있는데 auto cron 이 돌면 2중 지급. RPC 에 guard 추가.
--      rejected 는 허용(관리자가 반려한 뒤 자동 재처리 케이스).

-- 1) 역소급 park.
update public.events
   set auto_regear_processed_at = now()
 where battle_started_at is not null
   and auto_regear_processed_at is null;

-- 2) RPC 재정의 — 기존 RPC 의 모든 시그니처/동작은 그대로 유지하되,
--    insert 직전에 (event_id, discord_id) 의 non-rejected 수동 행 존재 여부
--    체크를 추가. 존재하면 NULL 반환 — cron 로그에선 "skipped" 으로 보인다.
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
  'killboard victim 1건 → auto regear_requests + point_ledger. 같은 event+killboard_event 재실행 idempotent. 같은 event 에 수동 non-rejected 행 있으면 skip (NULL 반환).';
