-- 127: 새 RPC `approve_regear_as_crafted` — admin 이 명시적으로 crafted
-- 청구를 제작 큐에 보낼 수 있게 추가.
--
-- 마이그 116 의 `approve_regear_request` 는 항상 silver 로 flip (어드민이
-- "승인" 버튼을 누르면 무조건 실버 정산) 하므로, fulfillment_mode='crafted'
-- 청구라도 그대로 crafted 큐에 들어가는 경로가 사라졌다. UI 에 "제작 의뢰로
-- 보내기" 버튼을 별도로 추가하면서 그 호출용 RPC 도 따로 마련한다.
--
-- 동작:
--   1. pending + crafted + build_snapshot 보유 청구만 받음 (UI 가 사전 가드)
--   2. status=approved, fulfillment_mode='crafted' 유지, payout_silver 정보 기록
--   3. craft_tasks 에 status='queued' 행 enqueue (이미 (queued/claimed/delivered) 행이
--      있으면 idempotent — 마이그 106 RPC 와 동일한 정책)
--   4. point_ledger 적립 X — 실버 정산은 crafter delivers 시점에 reimbursement 로
--      발생 (마이그 106 의 제작 보상 흐름).

create or replace function public.approve_regear_as_crafted(
  p_id uuid,
  p_admin_id text,
  p_admin_username text,
  p_guild_id uuid,
  p_payout_silver integer default null
) returns void language plpgsql security definer as $$
declare
  v_discord text;
  v_claimed integer;
  v_credit  integer;
  v_mode    text;
  v_snapshot jsonb;
  v_existing_task uuid;
begin
  select discord_id, claimed_silver, fulfillment_mode, build_snapshot
    into v_discord, v_claimed, v_mode, v_snapshot
    from regear_requests
   where id = p_id
     and guild_id = p_guild_id
     and status = 'pending'
   for update;

  if v_discord is null then
    raise exception 'REGEAR_NOT_PENDING';
  end if;
  if v_mode <> 'crafted' then
    raise exception 'REGEAR_NOT_CRAFTED_MODE';
  end if;
  if v_snapshot is null then
    raise exception 'REGEAR_NO_BUILD_SNAPSHOT';
  end if;

  v_credit := coalesce(p_payout_silver, v_claimed);
  if v_credit < 0 then v_credit := 0; end if;
  if v_credit > v_claimed then v_credit := v_claimed; end if;

  update regear_requests
     set status = 'approved',
         resolved_at = now(),
         payout_silver = v_credit,
         handled_by = p_admin_id,
         handled_by_username = p_admin_username
   where id = p_id
     and guild_id = p_guild_id;

  -- Idempotent enqueue. one_active_per_request 인덱스가 (queued/claimed/delivered)
  -- 중복을 막아주지만 명확한 에러 대신 silently skip.
  select id into v_existing_task
    from craft_tasks
   where regear_request_id = p_id
     and status in ('queued', 'claimed', 'delivered');

  if v_existing_task is null then
    insert into craft_tasks (guild_id, regear_request_id, status)
         values (p_guild_id, p_id, 'queued');
  end if;
end;
$$;

comment on function public.approve_regear_as_crafted(uuid, text, text, uuid, integer) is
  'crafted 모드 리기어를 제작 큐에 enqueue 하는 명시 승인 경로. 청구는 status=approved + fulfillment_mode=crafted 유지, craft_tasks 에 queued 행 추가. 실버 정산은 crafter delivers 시점에 reimbursement 로 별도 발생.';
