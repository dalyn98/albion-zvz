-- 116: approve_regear_request = 항상 실버 지급 의도 + craft_task 정리 atomic.
--
-- 마이그 106 이후 RPC 는 fulfillment_mode='crafted' 면 craft_task 을 만들고,
-- TS (regear-admin.ts) 에서 후속으로 convert_craft_task_to_silver 를 호출해
-- silver 로 변환하던 2-step. RPC 와 후속 호출 사이에 실패하면 craft_task 이
-- 큐에 남고 멤버는 실버를 못 받는 leak 가 발생.
--
-- UI 에는 "approve as crafted" 버튼이 없고 admin 의 approve 는 항상 silver
-- 의도이므로 (제작 큐 진입은 별도의 자동 흐름 또는 수동 RPC 로만), RPC 자체를
-- 1-step 으로 합친다: status=approved + fulfillment_mode=silver + ledger
-- credit + 잔존 craft_task cancel 을 모두 한 트랜잭션에서.
--
-- 백필: 마이그 9642db5 이전 deploy 시점에 만들어진 orphan craft_task 들을
-- 정리. mode='crafted' 인 채로 status='approved' 인 regear 는 멤버가 실버를
-- 못 받은 상태이므로 ledger credit 도 같이 채워준다.

create or replace function public.approve_regear_request(
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
begin
  select discord_id, claimed_silver
    into v_discord, v_claimed
    from regear_requests
   where id = p_id
     and guild_id = p_guild_id
     and status = 'pending'
   for update;

  if v_discord is null then
    raise exception 'REGEAR_NOT_PENDING';
  end if;

  v_credit := coalesce(p_payout_silver, v_claimed);
  if v_credit < 0 then v_credit := 0; end if;
  if v_credit > v_claimed then v_credit := v_claimed; end if;

  update regear_requests
     set status = 'approved',
         resolved_at = now(),
         payout_silver = v_credit,
         fulfillment_mode = 'silver',
         handled_by = p_admin_id,
         handled_by_username = p_admin_username
   where id = p_id
     and guild_id = p_guild_id;

  insert into point_ledger (guild_id, discord_id, delta, reason, ref_id)
       values (p_guild_id, v_discord, v_credit, 'regear_approved', p_id);

  -- 잔존 craft_task (queued/claimed) 가 있으면 같은 트랜잭션에서 cancel.
  -- 마이그 106 이전 RPC 가 crafted 모드에서 만든 task 가 있다면 여기서 정리된다.
  -- delivered 는 박스에 이미 물건이 있으니 손대지 않는다 — 멤버가 collect 가능.
  update craft_tasks
     set status = 'cancelled',
         cancelled_at = now()
   where regear_request_id = p_id
     and guild_id = p_guild_id
     and status in ('queued', 'claimed');
end;
$$;

comment on function public.approve_regear_request(uuid, text, text, uuid, integer) is
  '리기어 승인 = 항상 실버 지급 의도. crafted 모드였더라도 silver 로 flip + ledger credit + 잔존 craft_task cancel 을 한 트랜잭션에서. UI 에 별도 approve-as-crafted 가 없어 admin approve 는 모두 실버.';

-- ────────────────────────────────────────────────────────────
-- 백필: 이미 approved 인 regear 에 매달려 있는 orphan craft_task 정리.
-- ────────────────────────────────────────────────────────────
do $$
declare
  rec record;
begin
  for rec in
    select ct.id            as task_id,
           ct.guild_id       as guild_id,
           ct.regear_request_id as request_id,
           rr.fulfillment_mode  as mode,
           rr.discord_id     as discord_id,
           coalesce(rr.payout_silver, rr.claimed_silver, 0) as credit
      from public.craft_tasks ct
      join public.regear_requests rr on rr.id = ct.regear_request_id
     where ct.status = 'queued'
       and rr.status = 'approved'
  loop
    update public.craft_tasks
       set status = 'cancelled',
           cancelled_at = now()
     where id = rec.task_id;

    -- 모드가 아직 'crafted' 면 멤버가 실버를 못 받은 상태. silver flip + credit.
    -- 이미 'silver' 또는 'stocked' 면 어느 시점엔가 정산이 끝났으므로 cancel 만.
    if rec.mode = 'crafted' then
      update public.regear_requests
         set fulfillment_mode = 'silver'
       where id = rec.request_id;
      if rec.credit > 0 and rec.discord_id is not null then
        insert into public.point_ledger (guild_id, discord_id, delta, reason, ref_id)
        values (rec.guild_id, rec.discord_id, rec.credit, 'regear_approved', rec.request_id);
      end if;
    end if;
  end loop;
end $$;
