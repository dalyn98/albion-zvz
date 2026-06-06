-- 202: Persist guild-shop pickup instructions separately from admin notes.
-- Notification opt-out users can still read the pickup/chest location on site.

alter table public.shop_orders
  add column if not exists pickup_note text;

comment on column public.shop_orders.pickup_note is
  'Member-facing pickup or chest location note recorded when a guild shop order is approved.';

drop function if exists public.approve_shop_order(uuid, text, uuid, text, integer);

create or replace function public.approve_shop_order(
  p_id uuid,
  p_admin_id text,
  p_guild_id uuid,
  p_admin_note text default null,
  p_total_points_override integer default null,
  p_pickup_note text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_discord text;
  v_requested_total integer;
  v_charge_total integer;
  v_balance integer;
  v_guild uuid;
  v_stock_reserved_at timestamptz;
  v_now timestamptz := now();
  v_line record;
  v_log record;
  v_remaining integer;
  v_match_qty integer;
begin
  select discord_id, total_points, guild_id, stock_reserved_at
    into v_discord, v_requested_total, v_guild, v_stock_reserved_at
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

  if v_stock_reserved_at is null then
    for v_line in
      select unique_name, enchant, sum(quantity)::int as quantity
        from public.shop_order_items
       where guild_id = v_guild
         and order_id = p_id
       group by unique_name, enchant
    loop
      update public.shop_inventory
         set stock = stock - v_line.quantity,
             quality = 1,
             updated_at = now()
       where guild_id = v_guild
         and unique_name = v_line.unique_name
         and enchant = v_line.enchant
         and stock >= v_line.quantity;

      if not found then
        raise exception 'INSUFFICIENT_STOCK: % @%',
          v_line.unique_name, v_line.enchant;
      end if;
    end loop;
  else
    for v_line in
      select id, unique_name, enchant, name_ko, quantity
        from public.shop_order_items
       where guild_id = v_guild
         and order_id = p_id
       order by id
    loop
      v_remaining := v_line.quantity;

      for v_log in
        select l.id,
               coalesce(l.applied_quantity, l.quantity)::int as applied_qty
          from public.shop_chest_logs l
         where l.guild_id = v_guild
           and l.unique_name = v_line.unique_name
           and l.enchant = v_line.enchant
           and l.quantity < 0
           and coalesce(l.applied_quantity, l.quantity) < 0
           and l.logged_at >= v_stock_reserved_at
           and l.logged_at <= v_now
           and not exists (
             select 1
               from public.shop_blacklist b
              where b.guild_id = v_guild
                and b.item_name_raw = l.item_name_raw
           )
         order by l.logged_at asc,
                  l.imported_at asc,
                  l.import_sequence asc nulls last,
                  l.id asc
         for update
      loop
        exit when v_remaining <= 0;
        v_match_qty := least(v_remaining, abs(v_log.applied_qty));
        if v_match_qty <= 0 then
          continue;
        end if;

        update public.shop_chest_logs
           set applied_quantity = v_log.applied_qty + v_match_qty,
               ignored_quantity = coalesce(ignored_quantity, 0) - v_match_qty,
               ignored_reason = 'shop_order_fulfillment',
               matched_order_id = coalesce(matched_order_id, p_id),
               matched_order_item_id = coalesce(matched_order_item_id, v_line.id),
               matched_order_items = coalesce(matched_order_items, '[]'::jsonb)
                 || jsonb_build_array(jsonb_build_object(
                      'orderId', p_id,
                      'orderItemId', v_line.id,
                      'quantity', v_match_qty
                    ))
         where id = v_log.id;

        perform public.apply_shop_stock_delta(
          v_guild,
          v_line.unique_name,
          v_line.enchant,
          1,
          v_match_qty,
          v_line.name_ko,
          null,
          null
        );

        v_remaining := v_remaining - v_match_qty;
      end loop;
    end loop;
  end if;

  update public.shop_orders
     set status = 'approved',
         total_points = v_charge_total,
         resolved_at = v_now,
         resolved_by = p_admin_id,
         admin_note = coalesce(p_admin_note, admin_note),
         pickup_note = case
           when p_pickup_note is null then pickup_note
           else nullif(btrim(p_pickup_note), '')
         end,
         stock_reserved_at = coalesce(stock_reserved_at, v_now)
   where id = p_id
     and guild_id = v_guild;

  insert into public.point_ledger (guild_id, discord_id, delta, reason, ref_id)
       values (v_guild, v_discord, -v_charge_total, 'shop_purchase', p_id);
end;
$$;

comment on function public.approve_shop_order(uuid, text, uuid, text, integer, text) is
  '길드 상점 주문 승인. 예약 주문은 재고를 다시 차감하지 않고, 이미 들어온 출고 로그를 배송 증빙으로 보정하며 수령 위치 메모를 저장한다.';

revoke all on function public.approve_shop_order(uuid, text, uuid, text, integer, text) from public;
revoke all on function public.approve_shop_order(uuid, text, uuid, text, integer, text) from anon, authenticated;
grant execute on function public.approve_shop_order(uuid, text, uuid, text, integer, text) to service_role;
