-- 107: 자동 리기어 RPC 가 fulfillment_mode + build_snapshot 까지 받아 저장.
--
-- migration 106 이 regear_requests.fulfillment_mode 컬럼을 추가했지만 자동
-- 생성 경로(create_auto_regear_request) 는 default 'silver' 로만 들어갔다.
-- 길드가 craft 모드로 운영 중이면 자동 생성된 리기어도 'crafted' 로 들어가야
-- 하고, build_snapshot 도 victim 의 killboard equipment 에서 추출해 박아두면
-- 청구자/제작자가 별도 입력 없이 바로 작업할 수 있다.
--
-- killboard equipment 로 build_snapshot 을 만들지 못하는 경우 (시계열 sync
-- 지연으로 equipment NULL, 모든 슬롯 빈 등) 에는 호출부가 비어있는 snapshot
-- 을 넘긴다 — 청구자가 /me/regear/[id] 에서 tier+enchant 만 입력하도록 유도
-- (Phase 3 UI 에서 처리).

drop function if exists public.create_auto_regear_request(
  uuid, uuid, text, text, text, text, integer, integer, integer, bigint, jsonb, text
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
   where event_id = p_event_id
     and killboard_event_id = p_killboard_event_id
     and auto_generated = true;
  if v_existing is not null then
    return v_existing;
  end if;

  select count(*) into v_manual_count
    from regear_requests
   where event_id = p_event_id
     and discord_id = p_discord_id
     and auto_generated = false
     and status <> 'rejected';
  if v_manual_count > 0 then
    return null;
  end if;

  select silver into v_role_cap
    from role_rewards
   where role_name = p_role_name;
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
  'killboard_event 기반 자동 리기어 1건을 status=pending 으로 생성. fulfillment_mode 와 build_snapshot 까지 받아 길드 모드(silver/crafted) 에 따라 분기. 재실행 idempotent — (event_id, killboard_event_id) 로 중복 방지.';
