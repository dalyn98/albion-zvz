-- 111: 리기어를 길드 장비 재고에서 직접 출고 (stocked fulfillment mode).
--
-- Phase 3 — 110 의 guild_inventory_gear 가 채워져 있는 길드라면, crafted
-- 모드 리기어를 굳이 새 craft_task 로 큐잉하지 않고 재고에서 바로 출고할 수
-- 있어야 한다. 출고 = 재고 -1, regear status='approved', fulfillment_mode
-- 을 'stocked' 로 업데이트, craft_task / point_ledger 둘 다 미생성.
--
-- 부분 출고는 지원하지 않는다 — 호출자가 build_snapshot 의 모든 재고 가능
-- itemId 를 한 번에 넘겨야 하고, 한 슬롯이라도 재고가 부족하면 INSUFFICIENT_
-- STOCK 으로 전체 롤백한다.

-- 1) fulfillment_mode CHECK 에 'stocked' 추가
alter table public.regear_requests
  drop constraint if exists regear_requests_fulfillment_mode_chk;

alter table public.regear_requests
  add constraint regear_requests_fulfillment_mode_chk
    check (fulfillment_mode in ('silver', 'crafted', 'stocked'));

-- 2) RPC: approve_regear_from_stock
create or replace function public.approve_regear_from_stock(
  p_id uuid,
  p_admin_id text,
  p_admin_username text,
  p_guild_id uuid,
  p_payout_silver integer default null,
  p_item_ids text[] default '{}'
) returns void language plpgsql security definer as $$
declare
  v_discord text;
  v_claimed integer;
  v_credit  integer;
  v_mode    text;
  v_item_id text;
  v_current_qty integer;
begin
  -- Lock regear row + validate pending crafted
  select discord_id, claimed_silver, fulfillment_mode
    into v_discord, v_claimed, v_mode
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

  if p_item_ids is null or array_length(p_item_ids, 1) is null then
    raise exception 'STOCK_NO_ITEMS';
  end if;

  -- payout_silver 는 정보 기록용 — point_ledger 에는 적립하지 않지만 DM/리포트용
  v_credit := coalesce(p_payout_silver, v_claimed);
  if v_credit < 0 then v_credit := 0; end if;
  if v_credit > v_claimed then v_credit := v_claimed; end if;

  -- 모든 itemId 의 현재 재고를 잠그면서 1 이상인지 검증.
  -- guild_inventory_gear 의 행이 없으면 quantity=0 으로 간주.
  foreach v_item_id in array p_item_ids loop
    if v_item_id is null or length(trim(v_item_id)) = 0 then
      raise exception 'STOCK_ITEM_ID_EMPTY';
    end if;

    select quantity into v_current_qty
      from guild_inventory_gear
     where guild_id = p_guild_id
       and item_id = v_item_id
     for update;

    if v_current_qty is null or v_current_qty < 1 then
      raise exception 'INSUFFICIENT_STOCK: %', v_item_id;
    end if;
  end loop;

  -- 모두 검증 통과 → 일괄 -1
  foreach v_item_id in array p_item_ids loop
    update guild_inventory_gear
       set quantity = quantity - 1,
           updated_at = now(),
           updated_by_discord_id = p_admin_id
     where guild_id = p_guild_id
       and item_id = v_item_id;
  end loop;

  -- regear 승인 + fulfillment_mode='stocked' 로 마킹
  update regear_requests
     set status = 'approved',
         resolved_at = now(),
         payout_silver = v_credit,
         fulfillment_mode = 'stocked',
         handled_by = p_admin_id,
         handled_by_username = p_admin_username
   where id = p_id
     and guild_id = p_guild_id;

  -- craft_tasks 생성 X, point_ledger 적립 X — 재고 출고로 이미 정산.
end;
$$;

comment on function public.approve_regear_from_stock(uuid, text, text, uuid, integer, text[]) is
  '재고 직접 출고로 crafted 리기어 승인. p_item_ids 의 모든 itemId 가 guild_inventory_gear 에 quantity>=1 일 때만 통과, 일괄 -1. fulfillment_mode 를 stocked 로 마킹하고 craft_tasks/point_ledger 는 만들지 않는다. 부족 시 INSUFFICIENT_STOCK 예외로 전체 롤백.';
