-- 304: Versioned same-guild recovery export/preview/apply commands.
--
-- Contract:
-- - schemaVersion 2 restores current economic/supply state only.
-- - reusable templates, settings, permissions, future events, closed history,
--   statistics, notifications, and caches are not part of recovery state.
-- - the source workspace UUID and immutable Albion home-guild ID must both
--   match the target at preview and apply time.
-- - apply is one PostgreSQL transaction. A failure rolls back the safety
--   snapshot receipt and every domain mutation together.

create or replace function public.assert_guild_recovery_state(
  p_state jsonb
) returns void
language plpgsql
immutable
security definer
set search_path = public
as $$
declare
  v_expected_keys constant text[] := array[
    'craftOrders',
    'craftTasks',
    'eventPolicySnapshots',
    'eventRefs',
    'exchangeRequests',
    'memberRefs',
    'pointBalances',
    'pointEscrows',
    'regearRequests',
    'regearWindowRefs',
    'shopInventory',
    'shopOrderItems',
    'shopOrders',
    'supplyInventory',
    'tradeEvents',
    'tradeListingItems',
    'tradeListings',
    'tradeOrderItems',
    'tradeOrders',
    'tradePriceOfferItems',
    'tradePriceOffers'
  ];
  v_actual_keys text[];
  v_key text;
  v_id_key text;
  v_total_rows integer := 0;
  v_uuid_pattern constant text :=
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$';
begin
  if p_state is null or jsonb_typeof(p_state) <> 'object' then
    raise exception 'GUILD_RECOVERY_STATE_INVALID';
  end if;

  select array_agg(key order by key)
    into v_actual_keys
    from jsonb_object_keys(p_state) as keys(key);

  if coalesce(v_actual_keys, array[]::text[]) <> v_expected_keys then
    raise exception 'GUILD_RECOVERY_STATE_KEYS_INVALID';
  end if;

  -- Leave headroom for the manifest envelope inside the action's 10MB limit.
  if octet_length(p_state::text) > 9437184 then
    raise exception 'GUILD_RECOVERY_STATE_TOO_LARGE';
  end if;

  foreach v_key in array v_expected_keys loop
    if jsonb_typeof(p_state->v_key) <> 'array' then
      raise exception 'GUILD_RECOVERY_STATE_ARRAY_REQUIRED: %', v_key;
    end if;
    if jsonb_array_length(p_state->v_key) > 10000 then
      raise exception 'GUILD_RECOVERY_STATE_ARRAY_TOO_LARGE: %', v_key;
    end if;
    v_total_rows := v_total_rows + jsonb_array_length(p_state->v_key);
    if exists (
      select 1
        from jsonb_array_elements(p_state->v_key) as entry(value)
       where jsonb_typeof(entry.value) <> 'object'
          or entry.value ? 'guild_id'
    ) then
      raise exception 'GUILD_RECOVERY_STATE_ROW_INVALID: %', v_key;
    end if;
  end loop;

  if v_total_rows > 30000 then
    raise exception 'GUILD_RECOVERY_STATE_ROW_LIMIT';
  end if;

  foreach v_id_key in array array[
    'craftOrders',
    'craftTasks',
    'eventPolicySnapshots',
    'eventRefs',
    'exchangeRequests',
    'pointEscrows',
    'regearRequests',
    'regearWindowRefs',
    'shopOrderItems',
    'shopOrders',
    'tradeEvents',
    'tradeListingItems',
    'tradeListings',
    'tradeOrderItems',
    'tradeOrders',
    'tradePriceOfferItems',
    'tradePriceOffers'
  ] loop
    if exists (
      select 1
        from jsonb_array_elements(p_state->v_id_key) as entry(value)
       where coalesce(entry.value->>'id', '') !~ v_uuid_pattern
    ) then
      raise exception 'GUILD_RECOVERY_STATE_ID_INVALID: %', v_id_key;
    end if;
    if (
      select count(*) <> count(distinct entry.value->>'id')
        from jsonb_array_elements(p_state->v_id_key) as entry(value)
    ) then
      raise exception 'GUILD_RECOVERY_STATE_DUPLICATE_ID: %', v_id_key;
    end if;
  end loop;

  if exists (
    select 1
      from jsonb_array_elements(p_state->'memberRefs') as entry(value)
     where length(btrim(coalesce(entry.value->>'discordId', ''))) = 0
        or length(btrim(coalesce(entry.value->>'username', ''))) = 0
        or char_length(entry.value->>'discordId') > 128
        or char_length(entry.value->>'username') > 128
  ) or (
    select count(*) <> count(distinct entry.value->>'discordId')
      from jsonb_array_elements(p_state->'memberRefs') as entry(value)
  ) then
    raise exception 'GUILD_RECOVERY_MEMBER_REFS_INVALID';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_state->'pointBalances') as entry(value)
     where length(btrim(coalesce(entry.value->>'discordId', ''))) = 0
        or coalesce(entry.value->>'balance', '') !~ '^-?[0-9]{1,19}$'
        or (entry.value->>'balance')::numeric = 0
        or (entry.value->>'balance')::numeric < -2147483648
        or (entry.value->>'balance')::numeric > 2147483647
  ) or (
    select count(*) <> count(distinct entry.value->>'discordId')
      from jsonb_array_elements(p_state->'pointBalances') as entry(value)
  ) then
    raise exception 'GUILD_RECOVERY_POINT_BALANCES_INVALID';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_state->'shopInventory') as entry(value)
     where length(btrim(coalesce(entry.value->>'unique_name', ''))) = 0
        or coalesce(entry.value->>'enchant', '') !~ '^[0-4]$'
        or coalesce(entry.value->>'stock', '') !~ '^[1-9][0-9]{0,9}$'
        or (entry.value->>'stock')::numeric > 2147483647
        or length(btrim(coalesce(entry.value->>'name_ko', ''))) = 0
  ) or (
    select count(*) <> count(
      distinct (entry.value->>'unique_name') || ':' || (entry.value->>'enchant')
    )
      from jsonb_array_elements(p_state->'shopInventory') as entry(value)
  ) then
    raise exception 'GUILD_RECOVERY_SHOP_INVENTORY_INVALID';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_state->'supplyInventory') as entry(value)
     where length(btrim(coalesce(entry.value->>'item_id', ''))) = 0
        or coalesce(entry.value->>'quantity', '') !~ '^[1-9][0-9]{0,9}$'
        or (entry.value->>'quantity')::numeric > 2147483647
  ) or (
    select count(*) <> count(distinct entry.value->>'item_id')
      from jsonb_array_elements(p_state->'supplyInventory') as entry(value)
  ) then
    raise exception 'GUILD_RECOVERY_SUPPLY_INVENTORY_INVALID';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_state->'exchangeRequests') as entry(value)
     where entry.value->>'status' <> 'pending'
  ) then
    raise exception 'GUILD_RECOVERY_EXCHANGE_STATUS_INVALID';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_state->'shopOrders') as entry(value)
     where entry.value->>'status' <> 'pending'
        or entry.value->>'stock_reserved_at' is null
  ) then
    raise exception 'GUILD_RECOVERY_SHOP_ORDER_STATUS_INVALID';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_state->'pointEscrows') as entry(value)
     where entry.value->>'status' <> 'held'
        or entry.value->>'source_kind' <> 'member_trade_order'
        or coalesce(entry.value->>'amount', '') !~ '^[1-9][0-9]{0,9}$'
        or (entry.value->>'amount')::numeric > 2147483647
  ) then
    raise exception 'GUILD_RECOVERY_POINT_ESCROW_INVALID';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_state->'regearRequests') as entry(value)
     where entry.value->>'status' not in ('pending', 'approved')
  ) then
    raise exception 'GUILD_RECOVERY_REGEAR_STATUS_INVALID';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_state->'craftOrders') as entry(value)
     where entry.value->>'status' <> 'open'
  ) then
    raise exception 'GUILD_RECOVERY_CRAFT_ORDER_STATUS_INVALID';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_state->'craftTasks') as entry(value)
     where entry.value->>'status' not in (
       'queued', 'claimed', 'delivered', 'collected', 'expired', 'approved'
     )
        or entry.value->>'task_kind' not in ('regear', 'guild_order')
        or (
          entry.value->>'status' in ('collected', 'expired')
          and entry.value->>'reimbursement_status' <> 'pending'
        )
  ) then
    raise exception 'GUILD_RECOVERY_CRAFT_TASK_STATUS_INVALID';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_state->'tradeListings') as entry(value)
     where entry.value->>'status' not in ('active', 'paused', 'sold_out')
  ) then
    raise exception 'GUILD_RECOVERY_TRADE_LISTING_STATUS_INVALID';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_state->'tradeOrders') as entry(value)
     where entry.value->>'status' not in ('awaiting_delivery', 'delivered', 'disputed')
  ) then
    raise exception 'GUILD_RECOVERY_TRADE_ORDER_STATUS_INVALID';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_state->'tradePriceOffers') as entry(value)
     where entry.value->>'status' <> 'pending'
  ) then
    raise exception 'GUILD_RECOVERY_TRADE_OFFER_STATUS_INVALID';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_state->'shopOrderItems') as child(value)
     where not exists (
       select 1
         from jsonb_array_elements(p_state->'shopOrders') as parent(value)
        where parent.value->>'id' = child.value->>'order_id'
     )
  ) then
    raise exception 'GUILD_RECOVERY_SHOP_ORDER_REFERENCE_INVALID';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_state->'pointEscrows') as escrow(value)
     where not exists (
       select 1
         from jsonb_array_elements(p_state->'tradeOrders') as trade_order(value)
        where trade_order.value->>'id' = escrow.value->>'source_id'
          and trade_order.value->>'escrow_id' = escrow.value->>'id'
          and trade_order.value->>'total_points' = escrow.value->>'amount'
     )
  ) then
    raise exception 'GUILD_RECOVERY_ESCROW_REFERENCE_INVALID';
  end if;

  if exists (
    with escrow_totals as (
      select
        entry.value->>'discord_id' as discord_id,
        sum((entry.value->>'amount')::numeric) as amount
      from jsonb_array_elements(p_state->'pointEscrows') as entry(value)
      group by entry.value->>'discord_id'
    ),
    balances as (
      select
        entry.value->>'discordId' as discord_id,
        (entry.value->>'balance')::numeric as balance
      from jsonb_array_elements(p_state->'pointBalances') as entry(value)
    )
    select 1
      from escrow_totals
      left join balances using (discord_id)
     where coalesce(balances.balance, 0) < escrow_totals.amount
  ) then
    raise exception 'GUILD_RECOVERY_ESCROW_BALANCE_INVALID';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_state->'tradeListingItems') as child(value)
     where not exists (
       select 1
         from jsonb_array_elements(p_state->'tradeListings') as parent(value)
        where parent.value->>'id' = child.value->>'listing_id'
     )
  ) or exists (
    select 1
      from jsonb_array_elements(p_state->'tradeOrderItems') as child(value)
     where not exists (
       select 1
         from jsonb_array_elements(p_state->'tradeOrders') as parent(value)
        where parent.value->>'id' = child.value->>'order_id'
     )
  ) or exists (
    select 1
      from jsonb_array_elements(p_state->'tradeEvents') as child(value)
     where not exists (
       select 1
         from jsonb_array_elements(p_state->'tradeOrders') as parent(value)
        where parent.value->>'id' = child.value->>'order_id'
     )
  ) or exists (
    select 1
      from jsonb_array_elements(p_state->'tradePriceOfferItems') as child(value)
     where not exists (
       select 1
         from jsonb_array_elements(p_state->'tradePriceOffers') as parent(value)
        where parent.value->>'id' = child.value->>'offer_id'
     )
  ) then
    raise exception 'GUILD_RECOVERY_TRADE_REFERENCE_INVALID';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_state->'craftTasks') as task(value)
     where (
       task.value->>'task_kind' = 'regear'
       and not exists (
         select 1
           from jsonb_array_elements(p_state->'regearRequests') as request(value)
          where request.value->>'id' = task.value->>'regear_request_id'
       )
     ) or (
       task.value->>'task_kind' = 'guild_order'
       and not exists (
         select 1
           from jsonb_array_elements(p_state->'craftOrders') as craft_order(value)
          where craft_order.value->>'id' = task.value->>'craft_order_id'
       )
     )
  ) then
    raise exception 'GUILD_RECOVERY_CRAFT_REFERENCE_INVALID';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_state->'regearRequests') as request(value)
     where (
       request.value->>'event_id' is not null
       and not exists (
         select 1
           from jsonb_array_elements(p_state->'eventRefs') as event_ref(value)
          where event_ref.value->>'id' = request.value->>'event_id'
       )
     ) or (
       request.value->>'regear_window_id' is not null
       and not exists (
         select 1
           from jsonb_array_elements(p_state->'regearWindowRefs') as window_ref(value)
          where window_ref.value->>'id' = request.value->>'regear_window_id'
       )
     ) or (
       request.value->>'event_regear_policy_snapshot_id' is not null
       and not exists (
         select 1
           from jsonb_array_elements(p_state->'eventPolicySnapshots') as policy_ref(value)
          where policy_ref.value->>'id' =
            request.value->>'event_regear_policy_snapshot_id'
       )
     )
  ) then
    raise exception 'GUILD_RECOVERY_REGEAR_REFERENCE_INVALID';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_state->'eventRefs') as event_ref(value)
     where not exists (
       select 1
         from jsonb_array_elements(p_state->'regearRequests') as request(value)
        where request.value->>'event_id' = event_ref.value->>'id'
     )
  ) or exists (
    select 1
      from jsonb_array_elements(p_state->'regearWindowRefs') as window_ref(value)
     where not exists (
       select 1
         from jsonb_array_elements(p_state->'regearRequests') as request(value)
        where request.value->>'regear_window_id' = window_ref.value->>'id'
     )
  ) or exists (
    select 1
      from jsonb_array_elements(p_state->'eventPolicySnapshots') as policy_ref(value)
     where not exists (
       select 1
         from jsonb_array_elements(p_state->'regearRequests') as request(value)
        where request.value->>'event_regear_policy_snapshot_id' =
          policy_ref.value->>'id'
     )
  ) then
    raise exception 'GUILD_RECOVERY_UNUSED_REFERENCE_INVALID';
  end if;

  if exists (
    with referenced(discord_id) as (
      select value->>'discordId'
        from jsonb_array_elements(p_state->'pointBalances')
      union
      select value->>'discord_id'
        from jsonb_array_elements(p_state->'pointEscrows')
      union
      select value->>'discord_id'
        from jsonb_array_elements(p_state->'exchangeRequests')
      union
      select value->>'discord_id'
        from jsonb_array_elements(p_state->'shopOrders')
      union
      select value->>'discord_id'
        from jsonb_array_elements(p_state->'regearRequests')
      union
      select value->>'crafter_discord_id'
        from jsonb_array_elements(p_state->'craftTasks')
      union
      select value->>'posted_by_discord_id'
        from jsonb_array_elements(p_state->'craftOrders')
      union
      select value->>'seller_discord_id'
        from jsonb_array_elements(p_state->'tradeListings')
      union
      select value->>'buyer_discord_id'
        from jsonb_array_elements(p_state->'tradeOrders')
      union
      select value->>'seller_discord_id'
        from jsonb_array_elements(p_state->'tradeOrders')
      union
      select value->>'buyer_discord_id'
        from jsonb_array_elements(p_state->'tradePriceOffers')
      union
      select value->>'seller_discord_id'
        from jsonb_array_elements(p_state->'tradePriceOffers')
    )
    select 1
      from referenced
     where nullif(btrim(discord_id), '') is not null
       and not exists (
         select 1
           from jsonb_array_elements(p_state->'memberRefs') as member(value)
          where member.value->>'discordId' = referenced.discord_id
       )
  ) then
    raise exception 'GUILD_RECOVERY_MEMBER_REFERENCE_MISSING';
  end if;

  if exists (
    with referenced(discord_id) as (
      select value->>'discordId'
        from jsonb_array_elements(p_state->'pointBalances')
      union
      select value->>'discord_id'
        from jsonb_array_elements(p_state->'pointEscrows')
      union
      select value->>'discord_id'
        from jsonb_array_elements(p_state->'exchangeRequests')
      union
      select value->>'discord_id'
        from jsonb_array_elements(p_state->'shopOrders')
      union
      select value->>'discord_id'
        from jsonb_array_elements(p_state->'regearRequests')
      union
      select value->>'crafter_discord_id'
        from jsonb_array_elements(p_state->'craftTasks')
      union
      select value->>'posted_by_discord_id'
        from jsonb_array_elements(p_state->'craftOrders')
      union
      select value->>'seller_discord_id'
        from jsonb_array_elements(p_state->'tradeListings')
      union
      select value->>'buyer_discord_id'
        from jsonb_array_elements(p_state->'tradeOrders')
      union
      select value->>'seller_discord_id'
        from jsonb_array_elements(p_state->'tradeOrders')
      union
      select value->>'buyer_discord_id'
        from jsonb_array_elements(p_state->'tradePriceOffers')
      union
      select value->>'seller_discord_id'
        from jsonb_array_elements(p_state->'tradePriceOffers')
    )
    select 1
      from jsonb_array_elements(p_state->'memberRefs') as member(value)
     where not exists (
       select 1
         from referenced
        where referenced.discord_id = member.value->>'discordId'
     )
  ) then
    raise exception 'GUILD_RECOVERY_UNUSED_MEMBER_REFERENCE';
  end if;
end;
$$;

revoke all on function public.assert_guild_recovery_state(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.guild_recovery_upsert_records(
  p_table_name text,
  p_rows jsonb,
  p_guild_id uuid,
  p_conflict_mode text default 'update'
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed constant text[] := array[
    'craft_orders',
    'craft_tasks',
    'event_regear_policy_snapshots',
    'events',
    'exchange_requests',
    'member_trade_events',
    'member_trade_listing_items',
    'member_trade_listings',
    'member_trade_order_items',
    'member_trade_orders',
    'member_trade_price_offer_items',
    'member_trade_price_offers',
    'point_escrows',
    'regear_requests',
    'regear_windows',
    'shop_order_items',
    'shop_orders'
  ];
  v_insert_columns text;
  v_select_columns text;
  v_update_columns text;
  v_conflict boolean;
  v_sql text;
  v_count integer;
begin
  if p_table_name is null or not (p_table_name = any(v_allowed)) then
    raise exception 'GUILD_RECOVERY_TABLE_NOT_ALLOWED';
  end if;
  if p_conflict_mode not in ('update', 'ignore') then
    raise exception 'GUILD_RECOVERY_CONFLICT_MODE_INVALID';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'GUILD_RECOVERY_ROWS_INVALID';
  end if;
  if jsonb_array_length(p_rows) = 0 then
    return 0;
  end if;

  v_sql := format(
    'select exists (
       select 1
         from public.%1$I as target
         join jsonb_array_elements($1) as source(value)
           on target.id = (source.value->>''id'')::uuid
        where target.guild_id <> $2
     )',
    p_table_name
  );
  execute v_sql into v_conflict using p_rows, p_guild_id;
  if v_conflict then
    raise exception 'GUILD_RECOVERY_CROSS_TENANT_ROW_ID_CONFLICT: %',
      p_table_name;
  end if;

  select
    string_agg(format('%I', attribute.attname), ', ' order by attribute.attnum),
    string_agg(
      format('restored.%I', attribute.attname),
      ', ' order by attribute.attnum
    ),
    string_agg(
      format('%1$I = excluded.%1$I', attribute.attname),
      ', ' order by attribute.attnum
    ) filter (where attribute.attname <> 'id')
  into v_insert_columns, v_select_columns, v_update_columns
  from pg_attribute as attribute
  where attribute.attrelid = format('public.%I', p_table_name)::regclass
    and attribute.attnum > 0
    and not attribute.attisdropped
    and attribute.attname <> 'guild_id'
    and attribute.attidentity = ''
    and attribute.attgenerated = '';

  if v_insert_columns is null or v_update_columns is null then
    raise exception 'GUILD_RECOVERY_TABLE_COLUMNS_INVALID: %', p_table_name;
  end if;

  v_sql := format(
    'insert into public.%1$I (guild_id, %2$s)
     select $2, %3$s
       from jsonb_populate_recordset(
         null::public.%1$I,
         $1
       ) as restored
     on conflict (id) do %4$s',
    p_table_name,
    v_insert_columns,
    v_select_columns,
    case
      when p_conflict_mode = 'ignore' then 'nothing'
      else format(
        'update set %s where %I.guild_id = $2',
        v_update_columns,
        p_table_name
      )
    end
  );

  execute v_sql using p_rows, p_guild_id;
  get diagnostics v_count = row_count;

  -- Re-check after the write as well. This closes the UUID collision race
  -- between the preflight lookup and ON CONFLICT.
  v_sql := format(
    'select exists (
       select 1
         from jsonb_array_elements($1) as source(value)
         left join public.%1$I as target
           on target.id = (source.value->>''id'')::uuid
          and target.guild_id = $2
        where target.id is null
     )',
    p_table_name
  );
  execute v_sql into v_conflict using p_rows, p_guild_id;
  if v_conflict then
    raise exception 'GUILD_RECOVERY_ROW_NOT_RESTORED: %', p_table_name;
  end if;

  return v_count;
end;
$$;

revoke all on function public.guild_recovery_upsert_records(
  text, jsonb, uuid, text
) from public, anon, authenticated, service_role;

create or replace function public.export_guild_recovery_state(
  p_guild_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_albion_guild_id text;
  v_configured_albion_guild_id text;
  v_guild_name text;
  v_state jsonb;
begin
  if p_guild_id is null then
    raise exception 'GUILD_RECOVERY_GUILD_REQUIRED';
  end if;

  select tenant.name
    into v_guild_name
    from public.tenants as tenant
   where tenant.id = p_guild_id;
  if not found then
    raise exception 'GUILD_RECOVERY_GUILD_NOT_FOUND';
  end if;

  select nullif(btrim(setting.value), '')
    into v_configured_albion_guild_id
    from public.app_settings as setting
   where setting.guild_id = p_guild_id
     and setting.key = 'albion_home_guild_id';
  if v_configured_albion_guild_id is null then
    raise exception 'GUILD_RECOVERY_LOGICAL_ID_REQUIRED';
  end if;

  insert into public.guild_recovery_identities (guild_id, albion_guild_id)
  values (p_guild_id, v_configured_albion_guild_id)
  on conflict (guild_id) do nothing;

  select identity.albion_guild_id
    into v_albion_guild_id
    from public.guild_recovery_identities as identity
   where identity.guild_id = p_guild_id;

  if v_albion_guild_id is distinct from v_configured_albion_guild_id then
    raise exception 'GUILD_RECOVERY_LOGICAL_ID_CHANGED';
  end if;

  with
  point_balances as (
    select
      ledger.discord_id,
      sum(ledger.delta)::bigint as balance
    from public.point_ledger as ledger
    where ledger.guild_id = p_guild_id
    group by ledger.discord_id
    having sum(ledger.delta) <> 0
  ),
  held_escrows as (
    select escrow.*
    from public.point_escrows as escrow
    where escrow.guild_id = p_guild_id
      and escrow.status = 'held'
  ),
  open_exchange_requests as (
    select request.*
    from public.exchange_requests as request
    where request.guild_id = p_guild_id
      and request.status = 'pending'
  ),
  open_shop_orders as (
    select shop_order.*
    from public.shop_orders as shop_order
    where shop_order.guild_id = p_guild_id
      and shop_order.status = 'pending'
      and shop_order.stock_reserved_at is not null
  ),
  recovery_craft_tasks as (
    select task.*
    from public.craft_tasks as task
    where task.guild_id = p_guild_id
      and (
        task.status in ('queued', 'claimed', 'delivered')
        or task.reimbursement_status = 'pending'
        or (
          task.task_kind = 'guild_order'
          and task.status = 'approved'
          and exists (
            select 1
            from public.craft_orders as craft_order
            where craft_order.guild_id = p_guild_id
              and craft_order.id = task.craft_order_id
              and craft_order.status = 'open'
          )
        )
      )
  ),
  recovery_regear_ids as (
    select request.id
    from public.regear_requests as request
    where request.guild_id = p_guild_id
      and request.status = 'pending'
    union
    select task.regear_request_id
    from recovery_craft_tasks as task
    where task.regear_request_id is not null
  ),
  recovery_regear_requests as (
    select request.*
    from public.regear_requests as request
    join recovery_regear_ids as recovery
      on recovery.id = request.id
    where request.guild_id = p_guild_id
  ),
  open_craft_orders as (
    select craft_order.*
    from public.craft_orders as craft_order
    where craft_order.guild_id = p_guild_id
      and craft_order.status = 'open'
  ),
  open_trade_orders as (
    select trade_order.*
    from public.member_trade_orders as trade_order
    where trade_order.guild_id = p_guild_id
      and trade_order.status in ('awaiting_delivery', 'delivered', 'disputed')
  ),
  open_trade_offers as (
    select offer.*
    from public.member_trade_price_offers as offer
    where offer.guild_id = p_guild_id
      and offer.status = 'pending'
  ),
  open_trade_listing_ids as (
    select listing.id
    from public.member_trade_listings as listing
    where listing.guild_id = p_guild_id
      and listing.status in ('active', 'paused', 'sold_out')
    union
    select trade_order.listing_id
    from open_trade_orders as trade_order
    union
    select offer.listing_id
    from open_trade_offers as offer
  ),
  open_trade_listings as (
    select listing.*
    from public.member_trade_listings as listing
    join open_trade_listing_ids as recovery
      on recovery.id = listing.id
    where listing.guild_id = p_guild_id
  ),
  referenced_members as (
    select balances.discord_id from point_balances as balances
    union
    select escrow.discord_id from held_escrows as escrow
    union
    select request.discord_id from open_exchange_requests as request
    union
    select shop_order.discord_id from open_shop_orders as shop_order
    union
    select request.discord_id from recovery_regear_requests as request
    union
    select task.crafter_discord_id
      from recovery_craft_tasks as task
     where task.crafter_discord_id is not null
    union
    select craft_order.posted_by_discord_id
      from open_craft_orders as craft_order
    union
    select listing.seller_discord_id
      from open_trade_listings as listing
    union
    select trade_order.buyer_discord_id
      from open_trade_orders as trade_order
    union
    select trade_order.seller_discord_id
      from open_trade_orders as trade_order
    union
    select offer.buyer_discord_id
      from open_trade_offers as offer
    union
    select offer.seller_discord_id
      from open_trade_offers as offer
  )
  select jsonb_build_object(
    'memberRefs',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'discordId', member.discord_id,
            'username', coalesce(avatar.username, member.discord_id),
            'avatar', avatar.avatar,
            'withdrawnAt', avatar.withdrawn_at
          )
          order by member.discord_id
        )
        from referenced_members as member
        left join public.guild_avatars as avatar
          on avatar.guild_id = p_guild_id
         and avatar.discord_id = member.discord_id
        where nullif(btrim(member.discord_id), '') is not null
      ), '[]'::jsonb),
    'pointBalances',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'discordId', balances.discord_id,
            'balance', balances.balance::text
          )
          order by balances.discord_id
        )
        from point_balances as balances
      ), '[]'::jsonb),
    'pointEscrows',
      coalesce((
        select jsonb_agg(to_jsonb(escrow) - 'guild_id' order by escrow.id)
        from held_escrows as escrow
      ), '[]'::jsonb),
    'shopInventory',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'unique_name', inventory.unique_name,
            'enchant', inventory.enchant,
            'stock', inventory.stock,
            'name_ko', inventory.name_ko,
            'category', inventory.category,
            'tier', inventory.tier
          )
          order by inventory.unique_name, inventory.enchant
        )
        from public.shop_inventory as inventory
        where inventory.guild_id = p_guild_id
          and inventory.stock > 0
      ), '[]'::jsonb),
    'shopOrders',
      coalesce((
        select jsonb_agg(to_jsonb(shop_order) - 'guild_id' order by shop_order.id)
        from open_shop_orders as shop_order
      ), '[]'::jsonb),
    'shopOrderItems',
      coalesce((
        select jsonb_agg(to_jsonb(item) - 'guild_id' order by item.order_id, item.id)
        from public.shop_order_items as item
        join open_shop_orders as shop_order
          on shop_order.id = item.order_id
        where item.guild_id = p_guild_id
      ), '[]'::jsonb),
    'supplyInventory',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'item_id', inventory.item_id,
            'quantity', inventory.quantity
          )
          order by inventory.item_id
        )
        from public.guild_inventory_gear as inventory
        where inventory.guild_id = p_guild_id
          and inventory.quantity > 0
      ), '[]'::jsonb),
    'exchangeRequests',
      coalesce((
        select jsonb_agg(to_jsonb(request) - 'guild_id' order by request.id)
        from open_exchange_requests as request
      ), '[]'::jsonb),
    'regearRequests',
      coalesce((
        select jsonb_agg(to_jsonb(request) - 'guild_id' order by request.id)
        from recovery_regear_requests as request
      ), '[]'::jsonb),
    'craftTasks',
      coalesce((
        select jsonb_agg(to_jsonb(task) - 'guild_id' order by task.id)
        from recovery_craft_tasks as task
      ), '[]'::jsonb),
    'craftOrders',
      coalesce((
        select jsonb_agg(to_jsonb(craft_order) - 'guild_id' order by craft_order.id)
        from open_craft_orders as craft_order
      ), '[]'::jsonb),
    'eventRefs',
      coalesce((
        select jsonb_agg(to_jsonb(event_ref) - 'guild_id' order by event_ref.id)
        from public.events as event_ref
        where event_ref.guild_id = p_guild_id
          and exists (
            select 1
            from recovery_regear_requests as request
            where request.event_id = event_ref.id
          )
      ), '[]'::jsonb),
    'regearWindowRefs',
      coalesce((
        select jsonb_agg(to_jsonb(window_ref) - 'guild_id' order by window_ref.id)
        from public.regear_windows as window_ref
        where window_ref.guild_id = p_guild_id
          and exists (
            select 1
            from recovery_regear_requests as request
            where request.regear_window_id = window_ref.id
          )
      ), '[]'::jsonb),
    'eventPolicySnapshots',
      coalesce((
        select jsonb_agg(to_jsonb(policy_ref) - 'guild_id' order by policy_ref.id)
        from public.event_regear_policy_snapshots as policy_ref
        where policy_ref.guild_id = p_guild_id
          and exists (
            select 1
            from recovery_regear_requests as request
            where request.event_regear_policy_snapshot_id = policy_ref.id
          )
      ), '[]'::jsonb),
    'tradeListings',
      coalesce((
        select jsonb_agg(to_jsonb(listing) - 'guild_id' order by listing.id)
        from open_trade_listings as listing
      ), '[]'::jsonb),
    'tradeListingItems',
      coalesce((
        select jsonb_agg(to_jsonb(item) - 'guild_id' order by item.listing_id, item.sort_order, item.id)
        from public.member_trade_listing_items as item
        join open_trade_listings as listing
          on listing.id = item.listing_id
        where item.guild_id = p_guild_id
      ), '[]'::jsonb),
    'tradeOrders',
      coalesce((
        select jsonb_agg(to_jsonb(trade_order) - 'guild_id' order by trade_order.id)
        from open_trade_orders as trade_order
      ), '[]'::jsonb),
    'tradeOrderItems',
      coalesce((
        select jsonb_agg(to_jsonb(item) - 'guild_id' order by item.order_id, item.sort_order, item.id)
        from public.member_trade_order_items as item
        join open_trade_orders as trade_order
          on trade_order.id = item.order_id
        where item.guild_id = p_guild_id
      ), '[]'::jsonb),
    'tradeEvents',
      coalesce((
        select jsonb_agg(to_jsonb(event) - 'guild_id' order by event.order_id, event.created_at, event.id)
        from public.member_trade_events as event
        join open_trade_orders as trade_order
          on trade_order.id = event.order_id
        where event.guild_id = p_guild_id
      ), '[]'::jsonb),
    'tradePriceOffers',
      coalesce((
        select jsonb_agg(to_jsonb(offer) - 'guild_id' order by offer.id)
        from open_trade_offers as offer
      ), '[]'::jsonb),
    'tradePriceOfferItems',
      coalesce((
        select jsonb_agg(to_jsonb(item) - 'guild_id' order by item.offer_id, item.sort_order, item.id)
        from public.member_trade_price_offer_items as item
        join open_trade_offers as offer
          on offer.id = item.offer_id
        where item.guild_id = p_guild_id
      ), '[]'::jsonb)
  )
  into v_state;

  perform public.assert_guild_recovery_state(v_state);

  return jsonb_build_object(
    'sourceWorkspaceId', p_guild_id,
    'sourceAlbionGuildId', v_albion_guild_id,
    'sourceGuildName', v_guild_name,
    'state', v_state
  );
end;
$$;

revoke all on function public.export_guild_recovery_state(uuid)
  from public, anon, authenticated;
grant execute on function public.export_guild_recovery_state(uuid)
  to service_role;

create or replace function public.register_guild_recovery_manifest(
  p_guild_id uuid,
  p_manifest jsonb,
  p_verified_sha256 text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_backup_id uuid;
  v_albion_guild_id text;
  v_created_at timestamptz;
begin
  if p_manifest->>'kind' <> 'guild-operational-recovery'
     or coalesce((p_manifest->>'schemaVersion')::integer, 0) <> 2 then
    raise exception 'GUILD_RECOVERY_MANIFEST_VERSION_INVALID';
  end if;
  if p_verified_sha256 is null
     or p_verified_sha256 !~ '^[0-9a-f]{64}$'
     or p_manifest#>>'{integrity,algorithm}' <> 'SHA-256'
     or p_manifest#>>'{integrity,digest}' <> p_verified_sha256 then
    raise exception 'GUILD_RECOVERY_INTEGRITY_INVALID';
  end if;
  if p_manifest#>>'{source,workspaceId}' <> p_guild_id::text then
    raise exception 'GUILD_RECOVERY_SOURCE_MISMATCH';
  end if;

  select identity.albion_guild_id
    into v_albion_guild_id
    from public.guild_recovery_identities as identity
   where identity.guild_id = p_guild_id;
  if v_albion_guild_id is null
     or p_manifest#>>'{source,albionGuildId}' <> v_albion_guild_id then
    raise exception 'GUILD_RECOVERY_SOURCE_MISMATCH';
  end if;

  perform public.assert_guild_recovery_state(p_manifest->'state');
  v_backup_id := (p_manifest->>'backupId')::uuid;
  v_created_at := (p_manifest->>'createdAt')::timestamptz;

  insert into public.guild_recovery_exports (
    backup_id,
    guild_id,
    source_albion_guild_id,
    schema_version,
    manifest_sha256,
    source_created_at
  ) values (
    v_backup_id,
    p_guild_id,
    v_albion_guild_id,
    2,
    p_verified_sha256,
    v_created_at
  )
  on conflict (backup_id) do nothing;

  if not exists (
    select 1
      from public.guild_recovery_exports as issued
     where issued.backup_id = v_backup_id
       and issued.guild_id = p_guild_id
       and issued.source_albion_guild_id = v_albion_guild_id
       and issued.schema_version = 2
       and issued.manifest_sha256 = p_verified_sha256
       and issued.source_created_at = v_created_at
  ) then
    raise exception 'GUILD_RECOVERY_EXPORT_REGISTRATION_CONFLICT';
  end if;
end;
$$;

revoke all on function public.register_guild_recovery_manifest(
  uuid, jsonb, text
) from public, anon, authenticated;
grant execute on function public.register_guild_recovery_manifest(
  uuid, jsonb, text
) to service_role;

create or replace function public.guild_recovery_state_summary(
  p_state jsonb
) returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_counts jsonb;
  v_point_total numeric;
  v_escrow_total numeric;
  v_shop_stock_total numeric;
  v_supply_stock_total numeric;
begin
  perform public.assert_guild_recovery_state(p_state);

  select coalesce(
    jsonb_object_agg(entry.key, jsonb_array_length(entry.value)),
    '{}'::jsonb
  )
  into v_counts
  from jsonb_each(p_state) as entry(key, value);

  select coalesce(sum((entry.value->>'balance')::numeric), 0)
    into v_point_total
    from jsonb_array_elements(p_state->'pointBalances') as entry(value);
  select coalesce(sum((entry.value->>'amount')::numeric), 0)
    into v_escrow_total
    from jsonb_array_elements(p_state->'pointEscrows') as entry(value);
  select coalesce(sum((entry.value->>'stock')::numeric), 0)
    into v_shop_stock_total
    from jsonb_array_elements(p_state->'shopInventory') as entry(value);
  select coalesce(sum((entry.value->>'quantity')::numeric), 0)
    into v_supply_stock_total
    from jsonb_array_elements(p_state->'supplyInventory') as entry(value);

  return jsonb_build_object(
    'counts', v_counts,
    'totals', jsonb_build_object(
      'pointBalance', v_point_total::text,
      'pointEscrow', v_escrow_total::text,
      'shopStock', v_shop_stock_total::text,
      'supplyStock', v_supply_stock_total::text
    )
  );
end;
$$;

revoke all on function public.guild_recovery_state_summary(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.guild_recovery_state_diff(
  p_before jsonb,
  p_after jsonb
) returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_key text;
  v_counts jsonb := '{}'::jsonb;
begin
  perform public.assert_guild_recovery_state(p_before);
  perform public.assert_guild_recovery_state(p_after);

  for v_key in
    select key
      from jsonb_object_keys(p_before) as keys(key)
     order by key
  loop
    v_counts := v_counts || jsonb_build_object(
      v_key,
      jsonb_build_object(
        'before', jsonb_array_length(p_before->v_key),
        'after', jsonb_array_length(p_after->v_key),
        'changed', p_before->v_key is distinct from p_after->v_key
      )
    );
  end loop;

  return jsonb_build_object(
    'domains', v_counts,
    'beforeTotals', public.guild_recovery_state_summary(p_before)->'totals',
    'afterTotals', public.guild_recovery_state_summary(p_after)->'totals'
  );
end;
$$;

revoke all on function public.guild_recovery_state_diff(jsonb, jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.preview_guild_recovery_manifest(
  p_guild_id uuid,
  p_manifest jsonb,
  p_verified_sha256 text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_albion_guild_id text;
  v_current_export jsonb;
  v_state jsonb;
  v_current_state jsonb;
begin
  if p_manifest->>'kind' <> 'guild-operational-recovery'
     or coalesce((p_manifest->>'schemaVersion')::integer, 0) <> 2 then
    raise exception 'GUILD_RECOVERY_MANIFEST_VERSION_INVALID';
  end if;
  if p_verified_sha256 is null
     or p_verified_sha256 !~ '^[0-9a-f]{64}$'
     or p_manifest#>>'{integrity,algorithm}' <> 'SHA-256'
     or p_manifest#>>'{integrity,digest}' <> p_verified_sha256 then
    raise exception 'GUILD_RECOVERY_INTEGRITY_INVALID';
  end if;
  if p_manifest#>>'{source,workspaceId}' <> p_guild_id::text then
    raise exception 'GUILD_RECOVERY_SOURCE_MISMATCH';
  end if;

  v_current_export := public.export_guild_recovery_state(p_guild_id);
  v_current_albion_guild_id :=
    v_current_export->>'sourceAlbionGuildId';
  if v_current_albion_guild_id is null
     or p_manifest#>>'{source,albionGuildId}' <>
       v_current_albion_guild_id then
    raise exception 'GUILD_RECOVERY_SOURCE_MISMATCH';
  end if;

  v_state := p_manifest->'state';
  perform public.assert_guild_recovery_state(v_state);
  if not exists (
    select 1
      from public.guild_recovery_exports as issued
     where issued.backup_id = (p_manifest->>'backupId')::uuid
       and issued.guild_id = p_guild_id
       and issued.source_albion_guild_id = v_current_albion_guild_id
       and issued.schema_version = 2
       and issued.manifest_sha256 = p_verified_sha256
       and issued.source_created_at =
         (p_manifest->>'createdAt')::timestamptz
  ) then
    raise exception 'GUILD_RECOVERY_EXPORT_NOT_RECOGNIZED';
  end if;
  v_current_state := v_current_export->'state';

  return jsonb_build_object(
    'backupId', p_manifest->>'backupId',
    'createdAt', p_manifest->>'createdAt',
    'source', p_manifest->'source',
    'summary', public.guild_recovery_state_summary(v_state),
    'currentSummary', public.guild_recovery_state_summary(v_current_state),
    'diff', public.guild_recovery_state_diff(v_current_state, v_state),
    'manifestSha256', p_verified_sha256
  );
end;
$$;

revoke all on function public.preview_guild_recovery_manifest(
  uuid, jsonb, text
) from public, anon, authenticated;
grant execute on function public.preview_guild_recovery_manifest(
  uuid, jsonb, text
) to service_role;

create or replace function public.restore_guild_recovery_manifest(
  p_guild_id uuid,
  p_manifest jsonb,
  p_verified_sha256 text,
  p_idempotency_key uuid,
  p_actor_discord_id text,
  p_actor_username text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.guild_recovery_runs%rowtype;
  v_run_id uuid := gen_random_uuid();
  v_backup_id uuid;
  v_state jsonb;
  v_before_export jsonb;
  v_safety_snapshot jsonb;
  v_before_state jsonb;
  v_after_state jsonb;
  v_before_summary jsonb;
  v_after_summary jsonb;
  v_diff jsonb;
  v_completed_at timestamptz;
  v_balance record;
  v_delta bigint;
  v_chunk integer;
begin
  if p_guild_id is null
     or p_idempotency_key is null
     or nullif(btrim(p_actor_discord_id), '') is null then
    raise exception 'GUILD_RECOVERY_COMMAND_INVALID';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('guild-recovery:' || p_guild_id::text, 0)
  );

  select run.*
    into v_existing
    from public.guild_recovery_runs as run
   where run.guild_id = p_guild_id
     and run.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.manifest_sha256 <> p_verified_sha256 then
      raise exception 'GUILD_RECOVERY_IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object(
      'runId', v_existing.id,
      'backupId', v_existing.backup_id,
      'completedAt', v_existing.completed_at,
      'source', jsonb_build_object(
        'workspaceId', v_existing.source_workspace_id,
        'albionGuildId', v_existing.source_albion_guild_id,
        'guildName', v_existing.source_guild_name
      ),
      'beforeSummary', v_existing.before_summary,
      'afterSummary', v_existing.after_summary,
      'diff', v_existing.restore_diff,
      'safetySnapshotStored', true,
      'replayed', true
    );
  end if;

  perform public.preview_guild_recovery_manifest(
    p_guild_id,
    p_manifest,
    p_verified_sha256
  );

  v_backup_id := (p_manifest->>'backupId')::uuid;
  v_state := p_manifest->'state';
  v_before_export := public.export_guild_recovery_state(p_guild_id);
  v_before_state := v_before_export->'state';
  v_safety_snapshot := jsonb_build_object(
    'kind', 'guild-operational-recovery-safety-snapshot',
    'schemaVersion', 2,
    'capturedAt', now(),
    'source', jsonb_build_object(
      'workspaceId', v_before_export->>'sourceWorkspaceId',
      'albionGuildId', v_before_export->>'sourceAlbionGuildId',
      'guildName', v_before_export->'sourceGuildName'
    ),
    'state', v_before_state
  );
  v_before_summary :=
    public.guild_recovery_state_summary(v_before_state);

  insert into public.guild_recovery_runs (
    id,
    guild_id,
    idempotency_key,
    backup_id,
    source_workspace_id,
    source_albion_guild_id,
    source_guild_name,
    source_created_at,
    schema_version,
    manifest_sha256,
    actor_discord_id,
    actor_username,
    safety_snapshot,
    before_summary,
    after_summary,
    restore_diff
  ) values (
    v_run_id,
    p_guild_id,
    p_idempotency_key,
    v_backup_id,
    (p_manifest#>>'{source,workspaceId}')::uuid,
    p_manifest#>>'{source,albionGuildId}',
    p_manifest#>>'{source,guildName}',
    (p_manifest->>'createdAt')::timestamptz,
    (p_manifest->>'schemaVersion')::integer,
    p_verified_sha256,
    p_actor_discord_id,
    p_actor_username,
    v_safety_snapshot,
    v_before_summary,
    '{}'::jsonb,
    '{}'::jsonb
  );

  -- Close only currently-open obligations missing from the recovery point.
  -- Completed history is retained rather than deleted.
  update public.exchange_requests as request
     set status = 'rejected',
         resolved_at = now(),
         handled_by = p_actor_discord_id,
         handled_by_username = p_actor_username,
         admin_notes = concat_ws(
           E'\n',
           nullif(request.admin_notes, ''),
           'Closed by guild operational recovery'
         )
   where request.guild_id = p_guild_id
     and request.status = 'pending'
     and not exists (
       select 1
         from jsonb_array_elements(v_state->'exchangeRequests') as wanted(value)
        where wanted.value->>'id' = request.id::text
     );

  update public.shop_orders as shop_order
     set status = 'cancelled',
         resolved_at = now(),
         resolved_by = p_actor_discord_id,
         admin_note = concat_ws(
           E'\n',
           nullif(shop_order.admin_note, ''),
           'Closed by guild operational recovery'
         )
   where shop_order.guild_id = p_guild_id
     and shop_order.status = 'pending'
     and shop_order.stock_reserved_at is not null
     and not exists (
       select 1
         from jsonb_array_elements(v_state->'shopOrders') as wanted(value)
        where wanted.value->>'id' = shop_order.id::text
     );

  update public.member_trade_price_offers as offer
     set status = 'cancelled',
         responded_at = now(),
         updated_at = now(),
         seller_note = concat_ws(
           E'\n',
           nullif(offer.seller_note, ''),
           'Closed by guild operational recovery'
         )
   where offer.guild_id = p_guild_id
     and offer.status = 'pending'
     and not exists (
       select 1
         from jsonb_array_elements(v_state->'tradePriceOffers') as wanted(value)
        where wanted.value->>'id' = offer.id::text
     );

  update public.member_trade_orders as trade_order
     set status = 'refunded',
         resolved_at = now(),
         resolved_by = p_actor_discord_id,
         admin_note = concat_ws(
           E'\n',
           nullif(trade_order.admin_note, ''),
           'Closed by guild operational recovery'
         )
   where trade_order.guild_id = p_guild_id
     and trade_order.status in ('awaiting_delivery', 'delivered', 'disputed')
     and not exists (
       select 1
         from jsonb_array_elements(v_state->'tradeOrders') as wanted(value)
        where wanted.value->>'id' = trade_order.id::text
     );

  update public.point_escrows as escrow
     set status = 'refunded',
         resolved_at = now(),
         resolved_by = p_actor_discord_id
   where escrow.guild_id = p_guild_id
     and escrow.status = 'held'
     and not exists (
       select 1
         from jsonb_array_elements(v_state->'pointEscrows') as wanted(value)
        where wanted.value->>'id' = escrow.id::text
     );

  update public.member_trade_listings as listing
     set status = 'closed',
         closed_at = now(),
         updated_at = now()
   where listing.guild_id = p_guild_id
     and listing.status in ('active', 'paused', 'sold_out')
     and not exists (
       select 1
         from jsonb_array_elements(v_state->'tradeListings') as wanted(value)
        where wanted.value->>'id' = listing.id::text
     );

  update public.craft_tasks as task
     set status = case
           when task.status = 'approved' then 'rejected'
           when task.status in ('queued', 'claimed', 'delivered') then 'cancelled'
           else task.status
         end,
         cancelled_at = case
           when task.status in ('queued', 'claimed', 'delivered') then now()
           else task.cancelled_at
         end,
         reimbursement_status = case
           when task.reimbursement_status = 'pending' then 'rejected'
           else task.reimbursement_status
         end,
         reimbursement_rejected_at = case
           when task.reimbursement_status = 'pending' then now()
           else task.reimbursement_rejected_at
         end,
         reimbursement_rejected_by = case
           when task.reimbursement_status = 'pending' then p_actor_discord_id
           else task.reimbursement_rejected_by
         end,
         reimbursement_rejected_by_username = case
           when task.reimbursement_status = 'pending' then p_actor_username
           else task.reimbursement_rejected_by_username
         end,
         reimbursement_reject_reason = case
           when task.reimbursement_status = 'pending'
             then 'Closed by guild operational recovery'
           else task.reimbursement_reject_reason
         end
   where task.guild_id = p_guild_id
     and (
       task.status in ('queued', 'claimed', 'delivered')
       or task.reimbursement_status = 'pending'
       or (
         task.status = 'approved'
         and task.task_kind = 'guild_order'
         and exists (
           select 1
             from public.craft_orders as craft_order
            where craft_order.guild_id = p_guild_id
              and craft_order.id = task.craft_order_id
              and craft_order.status = 'open'
         )
       )
     )
     and not exists (
       select 1
         from jsonb_array_elements(v_state->'craftTasks') as wanted(value)
        where wanted.value->>'id' = task.id::text
     );

  update public.craft_orders as craft_order
     set status = 'cancelled',
         cancelled_at = now(),
         cancelled_by_discord_id = p_actor_discord_id
   where craft_order.guild_id = p_guild_id
     and craft_order.status = 'open'
     and not exists (
       select 1
         from jsonb_array_elements(v_state->'craftOrders') as wanted(value)
        where wanted.value->>'id' = craft_order.id::text
     );

  update public.regear_requests as request
     set status = 'rejected',
         resolved_at = now(),
         handled_by = p_actor_discord_id,
         handled_by_username = p_actor_username,
         admin_notes = concat_ws(
           E'\n',
           nullif(request.admin_notes, ''),
           'Closed by guild operational recovery'
         )
   where request.guild_id = p_guild_id
     and request.status = 'pending'
     and not exists (
       select 1
         from jsonb_array_elements(v_state->'regearRequests') as wanted(value)
        where wanted.value->>'id' = request.id::text
     );

  -- Minimal member references are created only when a referenced row no longer
  -- exists. Existing profile, roles, and permissions are never overwritten.
  insert into public.guild_avatars (
    guild_id,
    discord_id,
    username,
    avatar,
    withdrawn_at
  )
  select
    p_guild_id,
    member.value->>'discordId',
    member.value->>'username',
    member.value->>'avatar',
    nullif(member.value->>'withdrawnAt', '')::timestamptz
  from jsonb_array_elements(v_state->'memberRefs') as member(value)
  on conflict (guild_id, discord_id) do nothing;

  perform public.guild_recovery_upsert_records(
    'events', v_state->'eventRefs', p_guild_id, 'ignore'
  );
  perform public.guild_recovery_upsert_records(
    'regear_windows', v_state->'regearWindowRefs', p_guild_id, 'ignore'
  );
  perform public.guild_recovery_upsert_records(
    'event_regear_policy_snapshots',
    v_state->'eventPolicySnapshots',
    p_guild_id,
    'ignore'
  );

  -- Exact child snapshots for restored open parents.
  delete from public.shop_order_items as item
   where item.guild_id = p_guild_id
     and exists (
       select 1
         from jsonb_array_elements(v_state->'shopOrders') as wanted(value)
        where wanted.value->>'id' = item.order_id::text
     );
  delete from public.member_trade_order_items as item
   where item.guild_id = p_guild_id
     and exists (
       select 1
         from jsonb_array_elements(v_state->'tradeOrders') as wanted(value)
        where wanted.value->>'id' = item.order_id::text
     );
  delete from public.member_trade_events as event
   where event.guild_id = p_guild_id
     and exists (
       select 1
         from jsonb_array_elements(v_state->'tradeOrders') as wanted(value)
        where wanted.value->>'id' = event.order_id::text
     );
  delete from public.member_trade_price_offer_items as item
   where item.guild_id = p_guild_id
     and exists (
       select 1
         from jsonb_array_elements(v_state->'tradePriceOffers') as wanted(value)
        where wanted.value->>'id' = item.offer_id::text
     );
  update public.member_trade_listing_items as item
     set quantity_available = 0,
         updated_at = now()
   where item.guild_id = p_guild_id
     and exists (
       select 1
         from jsonb_array_elements(v_state->'tradeListings') as wanted(value)
        where wanted.value->>'id' = item.listing_id::text
     );

  perform public.guild_recovery_upsert_records(
    'member_trade_listings',
    v_state->'tradeListings',
    p_guild_id
  );
  perform public.guild_recovery_upsert_records(
    'member_trade_listing_items',
    v_state->'tradeListingItems',
    p_guild_id
  );
  perform public.guild_recovery_upsert_records(
    'point_escrows', v_state->'pointEscrows', p_guild_id
  );
  perform public.guild_recovery_upsert_records(
    'member_trade_orders', v_state->'tradeOrders', p_guild_id
  );
  perform public.guild_recovery_upsert_records(
    'member_trade_order_items',
    v_state->'tradeOrderItems',
    p_guild_id
  );
  perform public.guild_recovery_upsert_records(
    'member_trade_events', v_state->'tradeEvents', p_guild_id
  );
  perform public.guild_recovery_upsert_records(
    'member_trade_price_offers',
    v_state->'tradePriceOffers',
    p_guild_id
  );
  perform public.guild_recovery_upsert_records(
    'member_trade_price_offer_items',
    v_state->'tradePriceOfferItems',
    p_guild_id
  );
  perform public.guild_recovery_upsert_records(
    'exchange_requests', v_state->'exchangeRequests', p_guild_id
  );
  perform public.guild_recovery_upsert_records(
    'shop_orders', v_state->'shopOrders', p_guild_id
  );
  perform public.guild_recovery_upsert_records(
    'shop_order_items', v_state->'shopOrderItems', p_guild_id
  );
  perform public.guild_recovery_upsert_records(
    'regear_requests', v_state->'regearRequests', p_guild_id
  );
  perform public.guild_recovery_upsert_records(
    'craft_orders', v_state->'craftOrders', p_guild_id
  );
  perform public.guild_recovery_upsert_records(
    'craft_tasks', v_state->'craftTasks', p_guild_id
  );

  -- Inventory snapshots are exact current quantities. Pricing, raw chest logs,
  -- and material inventory are deliberately outside the recovery payload.
  update public.shop_inventory
     set stock = 0,
         updated_at = now()
   where guild_id = p_guild_id
     and stock <> 0;

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
    p_guild_id,
    inventory.value->>'unique_name',
    (inventory.value->>'enchant')::integer,
    4,
    (inventory.value->>'stock')::integer,
    inventory.value->>'name_ko',
    inventory.value->>'category',
    nullif(inventory.value->>'tier', '')::integer
  from jsonb_array_elements(v_state->'shopInventory') as inventory(value)
  on conflict (guild_id, unique_name, enchant)
  do update set
    stock = excluded.stock,
    name_ko = excluded.name_ko,
    category = excluded.category,
    tier = excluded.tier,
    updated_at = now();

  update public.guild_inventory_gear
     set quantity = 0,
         updated_at = now(),
         updated_by_discord_id = p_actor_discord_id
   where guild_id = p_guild_id
     and quantity <> 0;

  insert into public.guild_inventory_gear (
    guild_id,
    item_id,
    quantity,
    updated_by_discord_id
  )
  select
    p_guild_id,
    inventory.value->>'item_id',
    (inventory.value->>'quantity')::integer,
    p_actor_discord_id
  from jsonb_array_elements(v_state->'supplyInventory') as inventory(value)
  on conflict (guild_id, item_id)
  do update set
    quantity = excluded.quantity,
    updated_at = now(),
    updated_by_discord_id = excluded.updated_by_discord_id;

  -- Point history remains append-only. Chunk deltas to the ledger's int range
  -- while making the resulting current balance exactly match the manifest.
  for v_balance in
    with current_balances as (
      select ledger.discord_id, sum(ledger.delta)::bigint as balance
        from public.point_ledger as ledger
       where ledger.guild_id = p_guild_id
       group by ledger.discord_id
    ),
    target_balances as (
      select
        entry.value->>'discordId' as discord_id,
        (entry.value->>'balance')::bigint as balance
      from jsonb_array_elements(v_state->'pointBalances') as entry(value)
    ),
    members as (
      select discord_id from current_balances
      union
      select discord_id from target_balances
    )
    select
      members.discord_id,
      coalesce(current_balances.balance, 0)::bigint as current_balance,
      coalesce(target_balances.balance, 0)::bigint as target_balance
    from members
    left join current_balances using (discord_id)
    left join target_balances using (discord_id)
    order by members.discord_id
  loop
    v_delta := v_balance.target_balance - v_balance.current_balance;
    while v_delta <> 0 loop
      v_chunk := least(
        2147483647::bigint,
        greatest(-2147483648::bigint, v_delta)
      )::integer;
      insert into public.point_ledger (
        guild_id,
        discord_id,
        delta,
        reason,
        ref_id,
        memo,
        handled_by,
        handled_by_username
      ) values (
        p_guild_id,
        v_balance.discord_id,
        v_chunk,
        'admin_adjust',
        v_run_id,
        'guild_recovery_restore',
        p_actor_discord_id,
        p_actor_username
      );
      v_delta := v_delta - v_chunk;
    end loop;
  end loop;

  v_after_state :=
    public.export_guild_recovery_state(p_guild_id)->'state';
  v_after_summary :=
    public.guild_recovery_state_summary(v_after_state);
  v_diff :=
    public.guild_recovery_state_diff(v_before_state, v_after_state);
  v_completed_at := now();

  update public.guild_recovery_runs
     set after_summary = v_after_summary,
         restore_diff = v_diff,
         completed_at = v_completed_at
   where id = v_run_id
     and guild_id = p_guild_id;

  insert into public.admin_audit_log (
    guild_id,
    admin_discord_id,
    action,
    target_id,
    target_kind,
    details
  ) values (
    p_guild_id,
    p_actor_discord_id,
    'backup.import',
    v_run_id::text,
    'guild_backup',
    jsonb_build_object(
      'backupId', v_backup_id,
      'manifestSha256', p_verified_sha256,
      'source', p_manifest->'source',
      'createdAt', p_manifest->>'createdAt',
      'beforeSummary', v_before_summary,
      'afterSummary', v_after_summary,
      'diff', v_diff,
      'safetySnapshotStored', true
    )
  );

  return jsonb_build_object(
    'runId', v_run_id,
    'backupId', v_backup_id,
    'completedAt', v_completed_at,
    'source', p_manifest->'source',
    'beforeSummary', v_before_summary,
    'afterSummary', v_after_summary,
    'diff', v_diff,
    'safetySnapshotStored', true,
    'replayed', false
  );
end;
$$;

revoke all on function public.restore_guild_recovery_manifest(
  uuid, jsonb, text, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.restore_guild_recovery_manifest(
  uuid, jsonb, text, uuid, text, text
) to service_role;

create or replace function public.guild_template_package_has_sensitive_keys(
  p_value jsonb
) returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v_key text;
  v_child jsonb;
  v_normalized_key text;
  v_forbidden constant text[] := array[
    'assigneddiscordid',
    'assignedusername',
    'balance',
    'discordid',
    'escrow',
    'guildid',
    'inventory',
    'ledger',
    'memberid',
    'points',
    'requesteddiscordid',
    'requestedusername',
    'silver',
    'stock',
    'username'
  ];
begin
  if jsonb_typeof(p_value) = 'object' then
    for v_key, v_child in
      select entry.key, entry.value
        from jsonb_each(p_value) as entry(key, value)
    loop
      v_normalized_key :=
        regexp_replace(lower(v_key), '[^a-z0-9]', '', 'g');
      if v_normalized_key = any(v_forbidden)
         or public.guild_template_package_has_sensitive_keys(v_child) then
        return true;
      end if;
    end loop;
  elsif jsonb_typeof(p_value) = 'array' then
    for v_child in
      select entry.value
        from jsonb_array_elements(p_value) as entry(value)
    loop
      if public.guild_template_package_has_sensitive_keys(v_child) then
        return true;
      end if;
    end loop;
  end if;
  return false;
end;
$$;

revoke all on function public.guild_template_package_has_sensitive_keys(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.import_guild_template_package(
  p_guild_id uuid,
  p_package jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_top_keys text[];
  v_template_keys text[];
  v_entry jsonb;
  v_added_events integer := 0;
  v_updated_events integer := 0;
  v_added_slots integer := 0;
  v_updated_slots integer := 0;
begin
  select array_agg(key order by key)
    into v_top_keys
    from jsonb_object_keys(p_package) as keys(key);
  select array_agg(key order by key)
    into v_template_keys
    from jsonb_object_keys(p_package->'templates') as keys(key);

  if p_guild_id is null
     or coalesce(v_top_keys, array[]::text[]) <> array[
       'createdAt',
       'integrity',
       'kind',
       'packageId',
       'schemaVersion',
       'source',
       'templates'
     ]::text[]
     or p_package->>'kind' <> 'guild-template-package'
     or coalesce((p_package->>'schemaVersion')::integer, 0) <> 1
     or coalesce(v_template_keys, array[]::text[]) <>
       array['events', 'slots']::text[]
     or jsonb_typeof(p_package#>'{templates,events}') <> 'array'
     or jsonb_typeof(p_package#>'{templates,slots}') <> 'array'
     or jsonb_array_length(p_package#>'{templates,events}') > 1000
     or jsonb_array_length(p_package#>'{templates,slots}') > 1000
     or public.guild_template_package_has_sensitive_keys(
       p_package->'templates'
     ) then
    raise exception 'GUILD_TEMPLATE_PACKAGE_INVALID';
  end if;

  for v_entry in
    select value
      from jsonb_array_elements(p_package#>'{templates,events}')
  loop
    if jsonb_typeof(v_entry) <> 'object'
       or length(btrim(coalesce(v_entry->>'name', ''))) not between 1 and 80
       or jsonb_typeof(v_entry->'data') <> 'object'
       or jsonb_typeof(v_entry#>'{data,parties}') <> 'array' then
      raise exception 'GUILD_TEMPLATE_EVENT_INVALID';
    end if;

    update public.event_templates
       set data = v_entry->'data'
     where guild_id = p_guild_id
       and name = btrim(v_entry->>'name');
    if found then
      v_updated_events := v_updated_events + 1;
    else
      insert into public.event_templates (guild_id, name, data)
      values (p_guild_id, btrim(v_entry->>'name'), v_entry->'data');
      v_added_events := v_added_events + 1;
    end if;
  end loop;

  for v_entry in
    select value
      from jsonb_array_elements(p_package#>'{templates,slots}')
  loop
    if jsonb_typeof(v_entry) <> 'object'
       or length(btrim(coalesce(v_entry->>'name', ''))) not between 1 and 80
       or jsonb_typeof(v_entry->'data') <> 'object'
       or v_entry->>'category' not in ('전투', 'FF', '갱킹') then
      raise exception 'GUILD_TEMPLATE_SLOT_INVALID';
    end if;

    update public.slot_templates
       set data = v_entry->'data',
           category = v_entry->>'category'
     where guild_id = p_guild_id
       and name = btrim(v_entry->>'name');
    if found then
      v_updated_slots := v_updated_slots + 1;
    else
      insert into public.slot_templates (guild_id, name, data, category)
      values (
        p_guild_id,
        btrim(v_entry->>'name'),
        v_entry->'data',
        v_entry->>'category'
      );
      v_added_slots := v_added_slots + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'events', jsonb_build_object(
      'added', v_added_events,
      'updated', v_updated_events
    ),
    'slots', jsonb_build_object(
      'added', v_added_slots,
      'updated', v_updated_slots
    )
  );
end;
$$;

revoke all on function public.import_guild_template_package(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.import_guild_template_package(uuid, jsonb)
  to service_role;
