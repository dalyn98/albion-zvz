-- 173: Allow shop admins to approve an order with an adjusted point total.
--
-- The order lines still determine which inventory rows are issued. Only the
-- charged point total changes, and the RPC keeps the balance check, inventory
-- decrement, order update, and ledger insert in one transaction.

drop function if exists public.approve_shop_order(uuid, text, uuid, text);

create or replace function public.approve_shop_order(
  p_id uuid,
  p_admin_id text,
  p_guild_id uuid,
  p_admin_note text default null,
  p_total_points_override integer default null
) returns void language plpgsql security definer as $$
declare
  v_discord text;
  v_requested_total integer;
  v_charge_total integer;
  v_balance integer;
  v_guild uuid;
  v_line record;
begin
  select discord_id, total_points, guild_id
    into v_discord, v_requested_total, v_guild
    from public.shop_orders
   where id = p_id
     and guild_id = p_guild_id
     and status = 'pending'
   for update;

  if v_discord is null then
    raise exception 'ORDER_NOT_PENDING';
  end if;

  if p_total_points_override is not null then
    if p_total_points_override <= 0 then
      raise exception 'INVALID_TOTAL_POINTS';
    end if;
    v_charge_total := p_total_points_override;
  else
    v_charge_total := v_requested_total;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_discord, 0));

  select coalesce(sum(delta), 0) into v_balance
    from public.point_ledger
   where guild_id = v_guild
     and discord_id = v_discord;

  if v_balance < v_charge_total then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  for v_line in
    select unique_name, enchant, quality, quantity
      from public.shop_order_items
     where guild_id = v_guild
       and order_id = p_id
  loop
    update public.shop_inventory
       set stock = stock - v_line.quantity,
           updated_at = now()
     where guild_id = v_guild
       and unique_name = v_line.unique_name
       and enchant = v_line.enchant
       and quality = v_line.quality
       and stock >= v_line.quantity;

    if not found then
      raise exception 'INSUFFICIENT_STOCK: % @% q%',
        v_line.unique_name, v_line.enchant, v_line.quality;
    end if;
  end loop;

  update public.shop_orders
     set status = 'approved',
         total_points = v_charge_total,
         resolved_at = now(),
         resolved_by = p_admin_id,
         admin_note = coalesce(p_admin_note, admin_note)
   where id = p_id
     and guild_id = v_guild;

  insert into public.point_ledger (guild_id, discord_id, delta, reason, ref_id)
       values (v_guild, v_discord, -v_charge_total, 'shop_purchase', p_id);
end;
$$;

comment on function public.approve_shop_order(uuid, text, uuid, text, integer) is
  '길드 상점 주문 승인. p_total_points_override 가 있으면 해당 총액으로 잔액 확인, 주문 total_points 갱신, point_ledger 차감까지 원자 처리한다.';

revoke all on function public.approve_shop_order(uuid, text, uuid, text, integer) from public;
revoke all on function public.approve_shop_order(uuid, text, uuid, text, integer) from anon, authenticated;
grant execute on function public.approve_shop_order(uuid, text, uuid, text, integer) to service_role;
