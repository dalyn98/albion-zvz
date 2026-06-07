-- 210: Backfill guild-shop reserved delivery reconciliation.
--
-- Root cause: stock is reserved at order submit time. Some delivery chest logs
-- were imported before the order was approved, so older app code did not match
-- those logs to the reserved pending order and applied another stock withdrawal.
-- This backfill corrects the affected Menhera rows discovered in production by
-- rewriting log fulfillment metadata from raw reservation windows, then setting
-- the current SKU stock to the raw physical chest-log net for those SKUs.

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

  create temporary table shop_reserved_delivery_log_fix (
    log_id uuid primary key,
    applied_quantity integer not null,
    ignored_quantity integer not null,
    ignored_reason text,
    matched_order_id uuid,
    matched_order_item_id uuid,
    matched_order_items jsonb not null
  ) on commit drop;

  insert into shop_reserved_delivery_log_fix (
    log_id,
    applied_quantity,
    ignored_quantity,
    ignored_reason,
    matched_order_id,
    matched_order_item_id,
    matched_order_items
  ) values
    (
      '92deb9d6-ce37-40e4-8a54-03b577d704a0',
      0,
      -1,
      'shop_order_fulfillment',
      '9f9e983f-3a54-46b4-9409-de98e1767c1f',
      '4ce2baec-86f7-465d-9e35-d01e710e4840',
      '[{"orderId":"9f9e983f-3a54-46b4-9409-de98e1767c1f","orderItemId":"4ce2baec-86f7-465d-9e35-d01e710e4840","quantity":1}]'::jsonb
    ),
    (
      '95ac35b7-c8a5-4331-a4b9-34212195ec42',
      0,
      -1,
      'shop_order_fulfillment',
      '1eec9752-415c-4c96-a6a4-782da8c45b18',
      'fc34b8fc-5275-4cde-955f-a6246e28c43a',
      '[{"orderId":"1eec9752-415c-4c96-a6a4-782da8c45b18","orderItemId":"fc34b8fc-5275-4cde-955f-a6246e28c43a","quantity":1}]'::jsonb
    ),
    (
      '6b62ae0f-5125-4752-a5a3-00a2e9ab58df',
      0,
      -2,
      'shop_order_fulfillment',
      '5ad1c571-083f-4846-bb4c-caef9cbb9e0e',
      '644dbba7-c5f7-46e8-98b6-a1a31aea0d23',
      '[{"orderId":"5ad1c571-083f-4846-bb4c-caef9cbb9e0e","orderItemId":"644dbba7-c5f7-46e8-98b6-a1a31aea0d23","quantity":2}]'::jsonb
    ),
    (
      'e1377fdf-0055-4168-9dd5-26b7ea69606e',
      0,
      -1,
      'shop_order_fulfillment',
      '96d16c1e-0eb7-4efc-9553-09de8b718d79',
      'b3d55fba-752e-4336-9821-72e602acff96',
      '[{"orderId":"96d16c1e-0eb7-4efc-9553-09de8b718d79","orderItemId":"b3d55fba-752e-4336-9821-72e602acff96","quantity":1}]'::jsonb
    ),
    (
      'bd941607-6125-48e7-afd3-71c04ca18e82',
      0,
      -1,
      'shop_order_fulfillment',
      '1eec9752-415c-4c96-a6a4-782da8c45b18',
      '7930fbad-9818-4ba2-a868-01dd2823e0e1',
      '[{"orderId":"1eec9752-415c-4c96-a6a4-782da8c45b18","orderItemId":"7930fbad-9818-4ba2-a868-01dd2823e0e1","quantity":1}]'::jsonb
    ),
    (
      '8c4879a3-9c33-4d89-b313-b4cd8c59250d',
      0,
      -2,
      'shop_order_fulfillment',
      '98ebc6da-cd6a-419f-9078-98e00d998dc7',
      '09f5cb74-6181-49f6-a341-33bb8f9e8f13',
      '[{"orderId":"98ebc6da-cd6a-419f-9078-98e00d998dc7","orderItemId":"09f5cb74-6181-49f6-a341-33bb8f9e8f13","quantity":2}]'::jsonb
    ),
    (
      'd0945bdb-f854-4372-85e0-9314d980826a',
      0,
      -1,
      'shop_order_fulfillment',
      'a99e7fac-22cf-43d6-994e-5cebc6b6a007',
      '360100db-0b84-4cfa-b197-191ed68bdc56',
      '[{"orderId":"a99e7fac-22cf-43d6-994e-5cebc6b6a007","orderItemId":"360100db-0b84-4cfa-b197-191ed68bdc56","quantity":1}]'::jsonb
    ),
    (
      'ff453601-1e38-4c88-8b18-464817bd7d63',
      0,
      -2,
      'shop_order_fulfillment',
      '622e1a05-a4b2-48e1-a2be-596caba3f30a',
      'a4bb2728-5c55-4ea1-bdbd-dc8cc0c3f6c8',
      '[{"orderId":"622e1a05-a4b2-48e1-a2be-596caba3f30a","orderItemId":"a4bb2728-5c55-4ea1-bdbd-dc8cc0c3f6c8","quantity":2}]'::jsonb
    ),
    (
      '488131fe-bf30-4f38-9feb-6acb276fa27d',
      0,
      -1,
      'shop_order_fulfillment',
      'e1ff6feb-f7b8-407a-aca0-0dcfc2d66a40',
      '64f91d4d-a6ba-4c51-a9b4-fd80675746a4',
      '[{"orderId":"e1ff6feb-f7b8-407a-aca0-0dcfc2d66a40","orderItemId":"64f91d4d-a6ba-4c51-a9b4-fd80675746a4","quantity":1}]'::jsonb
    ),
    (
      '061360a6-6c62-4770-b7c3-ad8bfbf8c66a',
      0,
      -1,
      'shop_order_fulfillment',
      'bf46adb5-50cb-475f-bccd-125e8da8e11e',
      'a116cd9f-40cc-4385-b9a6-eee21ee8221b',
      '[{"orderId":"bf46adb5-50cb-475f-bccd-125e8da8e11e","orderItemId":"a116cd9f-40cc-4385-b9a6-eee21ee8221b","quantity":1}]'::jsonb
    ),
    (
      '276ac6f6-da99-4872-9726-7aadaa4bedb5',
      0,
      -2,
      'shop_order_fulfillment',
      '5ad1c571-083f-4846-bb4c-caef9cbb9e0e',
      'a29547f3-c0ec-438a-b57a-2f4e6357088b',
      '[{"orderId":"5ad1c571-083f-4846-bb4c-caef9cbb9e0e","orderItemId":"a29547f3-c0ec-438a-b57a-2f4e6357088b","quantity":2}]'::jsonb
    ),
    (
      '12e015a9-696b-41e6-a869-e57b6202a95f',
      0,
      -2,
      'shop_order_fulfillment',
      '90666ec7-c654-4809-b143-1848924dae2d',
      'ed837a51-8654-40f5-82d2-aa7e36ab0d82',
      '[{"orderId":"90666ec7-c654-4809-b143-1848924dae2d","orderItemId":"ed837a51-8654-40f5-82d2-aa7e36ab0d82","quantity":2}]'::jsonb
    ),
    (
      'abfc6095-eb13-4bfd-b2b5-a0fe031b1988',
      0,
      -1,
      'shop_order_fulfillment',
      'ea315f55-3542-45cf-8331-703701dc0c70',
      '1d058c10-0483-469b-987e-de3cc2035b68',
      '[{"orderId":"ea315f55-3542-45cf-8331-703701dc0c70","orderItemId":"1d058c10-0483-469b-987e-de3cc2035b68","quantity":1}]'::jsonb
    ),
    (
      'c94094b1-c17a-4835-831c-2b53829cd210',
      -1,
      0,
      null,
      null,
      null,
      '[]'::jsonb
    ),
    (
      'f7e806a5-e5ec-4406-8f23-8ae1d0278a37',
      0,
      -2,
      'shop_order_fulfillment',
      '73cdc28a-cf70-42b6-9d2b-67f65edc6925',
      '7fae2915-bbbb-499e-954e-cb3b5c3771f7',
      '[{"orderId":"73cdc28a-cf70-42b6-9d2b-67f65edc6925","orderItemId":"7fae2915-bbbb-499e-954e-cb3b5c3771f7","quantity":2}]'::jsonb
    ),
    (
      'c4d1ce93-3148-4e67-a489-e02f5f96ee4d',
      0,
      -1,
      'shop_order_fulfillment',
      'ea315f55-3542-45cf-8331-703701dc0c70',
      '396910f7-e9bf-496c-8645-21df6e0f6a24',
      '[{"orderId":"ea315f55-3542-45cf-8331-703701dc0c70","orderItemId":"396910f7-e9bf-496c-8645-21df6e0f6a24","quantity":1}]'::jsonb
    ),
    (
      '76aab199-c0a6-472e-a4e4-7987c2470d6b',
      -1,
      0,
      null,
      null,
      null,
      '[]'::jsonb
    ),
    (
      '6a43e761-b84e-49fa-8359-171fe7f2ea3e',
      0,
      -1,
      'shop_order_fulfillment',
      '73cdc28a-cf70-42b6-9d2b-67f65edc6925',
      '147c1930-bbff-437f-b2ac-e332085d5b25',
      '[{"orderId":"73cdc28a-cf70-42b6-9d2b-67f65edc6925","orderItemId":"147c1930-bbff-437f-b2ac-e332085d5b25","quantity":1}]'::jsonb
    ),
    (
      'cb6d1313-9750-4ee3-b197-2cbd1f16085a',
      0,
      -2,
      'shop_order_fulfillment',
      '9f9e983f-3a54-46b4-9409-de98e1767c1f',
      'fc34331c-7a51-463d-a23c-a9146a032109',
      '[{"orderId":"9f9e983f-3a54-46b4-9409-de98e1767c1f","orderItemId":"fc34331c-7a51-463d-a23c-a9146a032109","quantity":2}]'::jsonb
    ),
    (
      '8d375394-67c0-4826-ae56-3f1d7aefbcc1',
      0,
      -1,
      'shop_order_fulfillment',
      '96d16c1e-0eb7-4efc-9553-09de8b718d79',
      '2a04cfa9-abdb-4b8f-bd28-ef9b12e7f8be',
      '[{"orderId":"96d16c1e-0eb7-4efc-9553-09de8b718d79","orderItemId":"2a04cfa9-abdb-4b8f-bd28-ef9b12e7f8be","quantity":1}]'::jsonb
    ),
    (
      'd8c373dd-7dd4-40ff-bfbb-87c8c3b4cc4f',
      0,
      -1,
      'shop_order_fulfillment',
      '96d16c1e-0eb7-4efc-9553-09de8b718d79',
      '2a04cfa9-abdb-4b8f-bd28-ef9b12e7f8be',
      '[{"orderId":"96d16c1e-0eb7-4efc-9553-09de8b718d79","orderItemId":"2a04cfa9-abdb-4b8f-bd28-ef9b12e7f8be","quantity":1}]'::jsonb
    );

  update public.shop_chest_logs l
     set applied_quantity = f.applied_quantity,
         ignored_quantity = f.ignored_quantity,
         ignored_reason = f.ignored_reason,
         matched_order_id = f.matched_order_id,
         matched_order_item_id = f.matched_order_item_id,
         matched_order_items = f.matched_order_items
    from shop_reserved_delivery_log_fix f
   where l.guild_id = v_guild
     and l.id = f.log_id;

  create temporary table shop_reserved_delivery_stock_fix (
    unique_name text not null,
    enchant integer not null,
    target_stock integer not null,
    name_ko text not null,
    category text,
    tier integer,
    primary key (unique_name, enchant)
  ) on commit drop;

  insert into shop_reserved_delivery_stock_fix (
    unique_name,
    enchant,
    target_stock,
    name_ko,
    category,
    tier
  ) values
    ('T7_ARMOR_LEATHER_HELL', 3, 2, '그랜드 마스터의 무법자 재킷', 'armor', 7),
    ('T6_ARMOR_LEATHER_HELL', 3, 3, '마스터의 무법자 재킷', 'armor', 6),
    ('T7_ARMOR_PLATE_HELL', 3, 0, '그랜드 마스터의 데몬 아머', 'armor', 7),
    ('T7_OFF_SPIKEDSHIELD_MORGANA', 3, 1, '그랜드 마스터의 페이스브레이커', 'offhand', 7),
    ('T6_2H_FIRE_RINGPAIR_AVALON', 3, 3, '마스터의 던송', 'weapon', 6),
    ('T5_MOUNT_GREYWOLF_FW_CAERLEON', 0, 0, '안장달린 회색늑대', 'mount', 5),
    ('T6_MOUNT_DIREWOLF', 0, 0, '다이어울프', 'mount', 6),
    ('T6_OFF_SPIKEDSHIELD_MORGANA', 3, 0, '마스터의 페이스브레이커', 'offhand', 6);

  insert into public.shop_inventory (
    guild_id,
    unique_name,
    enchant,
    quality,
    stock,
    name_ko,
    category,
    tier
  )
  select
    v_guild,
    f.unique_name,
    f.enchant,
    1,
    f.target_stock,
    f.name_ko,
    f.category,
    f.tier
  from shop_reserved_delivery_stock_fix f
  where f.target_stock > 0
  on conflict (guild_id, unique_name, enchant) do update
     set stock = excluded.stock,
         quality = 1,
         name_ko = coalesce(public.shop_inventory.name_ko, excluded.name_ko),
         category = coalesce(public.shop_inventory.category, excluded.category),
         tier = coalesce(public.shop_inventory.tier, excluded.tier),
         updated_at = now();

  update public.shop_inventory i
     set stock = 0,
         quality = 1,
         updated_at = now()
    from shop_reserved_delivery_stock_fix f
   where f.target_stock = 0
     and i.guild_id = v_guild
     and i.unique_name = f.unique_name
     and i.enchant = f.enchant;
end $$;
