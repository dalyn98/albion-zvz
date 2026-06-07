-- 211: Align remaining reserved-delivery metadata with the deterministic matcher.
--
-- Migration 210 corrected the stock-affecting rows. A full replay against the
-- current matcher found five remaining rows whose applied/ignored quantities
-- were already correct but whose matched order metadata still pointed at a
-- later order. That leaves older order items looking under-fulfilled and can
-- cause future delivery logs to be ignored against the wrong order.

do $$
declare
  v_guild uuid;
begin
  select id
    into v_guild
    from public.tenants
   where slug = 'menhera'
   limit 1;

  if v_guild is null then
    return;
  end if;

  create temporary table shop_reserved_delivery_metadata_fix (
    log_id uuid primary key,
    matched_order_id uuid not null,
    matched_order_item_id uuid not null,
    matched_order_items jsonb not null
  ) on commit drop;

  insert into shop_reserved_delivery_metadata_fix (
    log_id,
    matched_order_id,
    matched_order_item_id,
    matched_order_items
  ) values
    (
      'bd941607-6125-48e7-afd3-71c04ca18e82',
      'b8bef67e-bf7f-4f1b-80eb-ced957b0e450',
      '63d29081-538c-45e3-a167-b6ab962a1578',
      '[{"orderId":"b8bef67e-bf7f-4f1b-80eb-ced957b0e450","orderItemId":"63d29081-538c-45e3-a167-b6ab962a1578","quantity":1}]'::jsonb
    ),
    (
      '0647b7b9-973d-4749-9f15-34316b7563de',
      '43a82ff0-ca8f-46ba-ba2a-493ddc5f0870',
      'cb6c7617-f9a7-4aa8-9998-fd424d9cfc26',
      '[{"orderId":"43a82ff0-ca8f-46ba-ba2a-493ddc5f0870","orderItemId":"cb6c7617-f9a7-4aa8-9998-fd424d9cfc26","quantity":1}]'::jsonb
    ),
    (
      'bd05aba6-2735-49c6-9c8a-bbd77d1c61e8',
      'ea315f55-3542-45cf-8331-703701dc0c70',
      'f3ce3a9a-d3dc-4925-a1ad-ae4d9b6cab4a',
      '[{"orderId":"ea315f55-3542-45cf-8331-703701dc0c70","orderItemId":"f3ce3a9a-d3dc-4925-a1ad-ae4d9b6cab4a","quantity":1}]'::jsonb
    ),
    (
      '8c4879a3-9c33-4d89-b313-b4cd8c59250d',
      'b8bef67e-bf7f-4f1b-80eb-ced957b0e450',
      '63d29081-538c-45e3-a167-b6ab962a1578',
      '[{"orderId":"b8bef67e-bf7f-4f1b-80eb-ced957b0e450","orderItemId":"63d29081-538c-45e3-a167-b6ab962a1578","quantity":2}]'::jsonb
    ),
    (
      'd0945bdb-f854-4372-85e0-9314d980826a',
      'b8bef67e-bf7f-4f1b-80eb-ced957b0e450',
      '63d29081-538c-45e3-a167-b6ab962a1578',
      '[{"orderId":"b8bef67e-bf7f-4f1b-80eb-ced957b0e450","orderItemId":"63d29081-538c-45e3-a167-b6ab962a1578","quantity":1}]'::jsonb
    );

  update public.shop_chest_logs l
     set matched_order_id = f.matched_order_id,
         matched_order_item_id = f.matched_order_item_id,
         matched_order_items = f.matched_order_items
    from shop_reserved_delivery_metadata_fix f
   where l.guild_id = v_guild
     and l.id = f.log_id
     and l.applied_quantity = 0
     and l.ignored_quantity < 0
     and l.ignored_reason = 'shop_order_fulfillment';
end $$;
