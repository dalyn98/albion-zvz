-- 128: 새 RPC `revert_crafted_to_pending` — admin 이 "제작 의뢰로 보내기"
-- (마이그 127) 결정을 잘못 내렸을 때 청구를 다시 pending 으로 되돌릴 수
-- 있게 한다.
--
-- 동작:
--   1. craft_task status='cancelled'
--   2. regear_requests 를 처음 신청 직후 상태로 복구 — status='pending',
--      resolved_at=null, payout_silver=null, handled_by/username 클리어
--   3. fulfillment_mode 는 보존 ('crafted' 그대로) — 청구자가 처음 선택한
--      모드라서 admin 이 다시 결정하기 전까지 유지하는 게 자연스럽다
--   4. point_ledger 변동 없음 (제작 큐 진입은 ledger 적립을 안 했었음)
--
-- queue 가 아닌 'claimed' 상태 (제작자가 잡은 상태) 에서도 동일하게 되돌릴
-- 수 있도록 허용. 단 이미 delivered/collected 인 경우는 픽업 흐름이 진행
-- 됐기 때문에 차단 — admin 이 직접 silver 변환 / 취소 중 하나를 골라야 함.
create or replace function public.revert_crafted_to_pending(
  p_task_id uuid,
  p_guild_id uuid
) returns void language plpgsql security definer as $$
declare
  v_request_id uuid;
  v_status text;
begin
  select ct.regear_request_id, ct.status
    into v_request_id, v_status
    from craft_tasks ct
   where ct.id = p_task_id
     and ct.guild_id = p_guild_id
   for update;

  if v_request_id is null then
    raise exception 'CRAFT_TASK_NOT_FOUND';
  end if;
  if v_status not in ('queued', 'claimed') then
    raise exception 'CRAFT_TASK_NOT_REVERTIBLE';
  end if;

  update craft_tasks
     set status = 'cancelled',
         cancelled_at = now()
   where id = p_task_id
     and guild_id = p_guild_id;

  update regear_requests
     set status = 'pending',
         resolved_at = null,
         payout_silver = null,
         handled_by = null,
         handled_by_username = null
   where id = v_request_id
     and guild_id = p_guild_id;
end;
$$;

comment on function public.revert_crafted_to_pending(uuid, uuid) is
  '제작 큐에 진입한 (queued/claimed) crafted 청구를 처음 pending 상태로 되돌린다. craft_task 는 cancelled, regear_requests 는 status=pending 으로 복구. fulfillment_mode 는 crafted 유지.';
