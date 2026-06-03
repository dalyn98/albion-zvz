-- 180: approve_regear_as_crafted task idempotency lookup tenant scope.
--
-- regear_request_id is globally unique today, but all security-definer RPCs in
-- this project keep tenant scope explicit. The crafted enqueue idempotency
-- check should therefore bind craft_tasks by both request id and guild id,
-- matching the later insert and the rest of the craft task state machine.

create or replace function public.approve_regear_as_crafted(
  p_id uuid,
  p_admin_id text,
  p_admin_username text,
  p_guild_id uuid,
  p_payout_silver integer default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
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

  -- Idempotent enqueue. Scope by guild_id even though regear_request_id is
  -- globally unique, so this security-definer RPC keeps tenant boundaries
  -- explicit and aligned with the active-task index policy.
  select id into v_existing_task
    from craft_tasks
   where regear_request_id = p_id
     and guild_id = p_guild_id
     and status in ('queued', 'claimed', 'delivered');

  if v_existing_task is null then
    insert into craft_tasks (guild_id, regear_request_id, status)
         values (p_guild_id, p_id, 'queued');
  end if;
end;
$$;

comment on function public.approve_regear_as_crafted(uuid, text, text, uuid, integer) is
  'crafted 모드 리기어를 제작 큐에 enqueue 하는 명시 승인 경로. task idempotency 조회도 guild_id 로 스코프한다. 청구는 status=approved + fulfillment_mode=crafted 유지, craft_tasks 에 queued 행 추가. 실버 정산은 crafter delivers 시점에 reimbursement 로 별도 발생.';

revoke all on function public.approve_regear_as_crafted(uuid, text, text, uuid, integer) from public;
revoke all on function public.approve_regear_as_crafted(uuid, text, text, uuid, integer) from anon, authenticated;
grant execute on function public.approve_regear_as_crafted(uuid, text, text, uuid, integer) to service_role;
