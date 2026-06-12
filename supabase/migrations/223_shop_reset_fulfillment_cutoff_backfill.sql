-- 223: Backfill fulfillment cutoff settings and unmatch reset-era old orders.
--
-- This repairs rows imported after a full shop reset that were matched to
-- orders reserved before that reset. Those rows belong to the new inventory
-- epoch and must affect stock normally.

do $$
declare
  v_delta record;
begin
  create temporary table shop_reset_fulfillment_cutoffs (
    guild_id uuid primary key,
    cutoff_at timestamptz not null
  ) on commit drop;

  insert into shop_reset_fulfillment_cutoffs (guild_id, cutoff_at)
  select guild_id,
         max(created_at) as cutoff_at
    from public.admin_audit_log
   where action = 'shop.item.remove'
     and details->>'kind' = 'inventory.reset_all'
   group by guild_id;

  insert into public.app_settings (
    guild_id,
    key,
    value,
    updated_at
  )
  select guild_id,
         'shop_order_fulfillment_cutoff_at',
         to_char(cutoff_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         now()
    from shop_reset_fulfillment_cutoffs
  on conflict (guild_id, key) do update
     set value = excluded.value,
         updated_at = excluded.updated_at;

  create temporary table shop_reset_fulfillment_log_unmatches (
    log_id uuid primary key,
    guild_id uuid not null,
    unique_name text not null,
    enchant integer not null,
    quality integer not null,
    stock_delta integer not null,
    name_ko text not null
  ) on commit drop;

  insert into shop_reset_fulfillment_log_unmatches (
    log_id,
    guild_id,
    unique_name,
    enchant,
    quality,
    stock_delta,
    name_ko
  )
  select l.id,
         l.guild_id,
         l.unique_name,
         l.enchant,
         1,
         (l.quantity - coalesce(l.applied_quantity, l.quantity))::int,
         l.item_name_raw
    from public.shop_chest_logs l
    join shop_reset_fulfillment_cutoffs c
      on c.guild_id = l.guild_id
    join public.shop_orders o
      on o.guild_id = l.guild_id
     and o.id = l.matched_order_id
   where l.ignored_reason = 'shop_order_fulfillment'
     and l.quantity < 0
     and l.unique_name is not null
     and l.imported_at >= c.cutoff_at
     and coalesce(o.stock_reserved_at, o.resolved_at, o.created_at) <= c.cutoff_at
     and l.quantity <> coalesce(l.applied_quantity, l.quantity);

  update public.shop_chest_logs l
     set applied_quantity = l.quantity,
         ignored_quantity = 0,
         ignored_reason = null,
         matched_order_id = null,
         matched_order_item_id = null,
         matched_order_items = '[]'::jsonb
    from shop_reset_fulfillment_log_unmatches f
   where l.id = f.log_id
     and l.guild_id = f.guild_id;

  for v_delta in
    select guild_id,
           unique_name,
           enchant,
           quality,
           sum(stock_delta)::int as stock_delta,
           min(name_ko) as name_ko
      from shop_reset_fulfillment_log_unmatches
     group by guild_id, unique_name, enchant, quality
  loop
    perform public.apply_shop_stock_delta(
      v_delta.guild_id,
      v_delta.unique_name,
      v_delta.enchant,
      v_delta.quality,
      v_delta.stock_delta,
      v_delta.name_ko,
      null,
      null
    );
  end loop;
end $$;
