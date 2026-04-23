-- role_rewards multi-tenant PK fix.
--
-- mig 003 으로 PK=(role_name) 이었고, mig 072 에서 guild_id 컬럼은 추가했지만 PK
-- 는 그대로였다. 다중 tenant 를 허용하려면 (guild_id, role_name) 으로 바꿔야 한다.
-- TS 호출부(src/lib/auto-regear.ts, src/app/actions/regear.ts, regear-admin.ts)
-- 는 이미 모두 .eq('guild_id', ...) 로 스코프되므로 PK 변경만 해도 안전.
--
-- mig 073 의 create_auto_regear_request RPC 는 role_rewards / regear_requests
-- lookup 이 guild_id 로 스코프되지 않아 tenant-scope leak 위험이 있다 — 함께 수정.
-- 동작 계약(status=pending 으로 생성, point_ledger 는 승인 시점에만 적립) 은
-- mig 067 / 073 과 동일하게 유지한다.

alter table public.role_rewards drop constraint if exists role_rewards_pkey;
alter table public.role_rewards add primary key (guild_id, role_name);

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
  p_price_warning_level text
) returns uuid language plpgsql security definer as $$
declare
  v_existing uuid;
  v_manual_count integer;
  v_new_id uuid;
  v_credit integer;
  v_role_cap integer;
begin
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
    auto_generated, gear_breakdown, request_type, price_warning_level
  ) values (
    p_guild_id,
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
  'killboard_event 기반 자동 리기어 1건을 status=pending 으로 생성. point_ledger 적립은 하지 않고 관리자 승인(approve_regear_request) 시점에만 이루어진다. 재실행 idempotent — (guild_id, event_id, killboard_event_id) 로 중복 방지. role_rewards 조회는 (guild_id, role_name) 복합키 기준.';
