-- 129: create_auto_regear_request RPC 의 multi-tenant scope 복원.
--
-- 배경: migration 107 (auto-regear 에 fulfillment_mode/build_snapshot 추가) 에서
-- 함수 본문을 다시 작성하면서 mig 075 가 명시적으로 추가했던 `guild_id = p_guild_id`
-- 필터가 모든 SELECT 절에서 누락됐다. 결과: role_rewards 가 (guild_id, role_name) PK
-- 인데 role_name 만으로 lookup 하면 다른 테넌트의 silver 값이 (PG 가 임의로 고른
-- 한 행을 반환하므로) 잘못 들어와 자주 0/NULL 로 나오고, 그러면 함수가 NULL 반환
-- → 자동 청구가 차단된다. 2026-04-30 menhera 진단에서 21 victim 중 자동 행 0건
-- 생성 + 15건이 이 버그로 차단된 것이 확인됨 (auto-regear-debug 시뮬레이션 vs
-- 실제 prod RPC outcome 비교).
--
-- v_existing / v_manual_count 의 event_id 검색은 event_id 가 UUID 라 cross-tenant
-- 충돌이 사실상 없지만 정합성을 위해 동일하게 guild_id 스코프 복원.
--
-- 다른 동작 계약(status='pending', point_ledger 미적립, fulfillment_mode/build_snapshot
-- 처리, role_cap 0 차단) 은 mig 107 과 동일하게 유지.

drop function if exists public.create_auto_regear_request(
  uuid, uuid, text, text, text, text, integer, integer, integer, bigint, jsonb, text, text, jsonb
);

create or replace function public.create_auto_regear_request(
  p_guild_id uuid,
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
  p_price_warning_level text,
  p_fulfillment_mode text default 'silver',
  p_build_snapshot jsonb default null
) returns uuid language plpgsql security definer as $$
declare
  v_existing uuid;
  v_manual_count integer;
  v_new_id uuid;
  v_credit integer;
  v_role_cap integer;
  v_mode text;
begin
  if p_fulfillment_mode not in ('silver', 'crafted') then
    raise exception 'INVALID_FULFILLMENT_MODE';
  end if;
  v_mode := p_fulfillment_mode;

  select id into v_existing
    from regear_requests
   where guild_id = p_guild_id
     and event_id = p_event_id
     and killboard_event_id = p_killboard_event_id
     and auto_generated = true;
  if v_existing is not null then
    return v_existing;
  end if;

  select count(*) into v_manual_count
    from regear_requests
   where guild_id = p_guild_id
     and event_id = p_event_id
     and discord_id = p_discord_id
     and auto_generated = false
     and status <> 'rejected';
  if v_manual_count > 0 then
    return null;
  end if;

  select silver into v_role_cap
    from role_rewards
   where guild_id = p_guild_id
     and role_name = p_role_name;
  if v_role_cap is null or v_role_cap <= 0 then
    return null;
  end if;

  v_credit := p_payout_silver;
  if v_credit < 0 then v_credit := 0; end if;
  if v_credit > p_claimed_silver then v_credit := p_claimed_silver; end if;
  if v_credit > v_role_cap then v_credit := v_role_cap; end if;

  insert into regear_requests (
    guild_id,
    event_id, event_title_snapshot, discord_id, username, role_name,
    silver, claimed_silver, payout_silver,
    screenshot_path, killboard_verified, killboard_event_id,
    status, resolved_at, handled_by_username,
    auto_generated, gear_breakdown, request_type, price_warning_level,
    fulfillment_mode, build_snapshot
  ) values (
    p_guild_id,
    p_event_id, p_event_title, p_discord_id, p_username, p_role_name,
    p_silver, p_claimed_silver, v_credit,
    null, true, p_killboard_event_id,
    'pending', null, null,
    true, p_gear_breakdown, 'death', p_price_warning_level,
    v_mode, p_build_snapshot
  ) returning id into v_new_id;

  return v_new_id;
end;
$$;

comment on function public.create_auto_regear_request is
  'killboard_event 기반 자동 리기어 1건을 status=pending 으로 생성. fulfillment_mode 와 build_snapshot 까지 받아 길드 모드(silver/crafted) 에 따라 분기. 재실행 idempotent — (guild_id, event_id, killboard_event_id) 로 중복 방지. 모든 lookup 은 guild_id 로 스코프 (mig 129 에서 mig 107 의 누락 복원).';
