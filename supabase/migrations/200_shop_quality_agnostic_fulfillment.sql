-- 200: Treat guild-shop stock as quality-agnostic and reconcile reserved
-- order delivery logs that were imported before the site approval.
--
-- Raw chest logs still keep their original quality for audit/dedupe. Shop
-- inventory, orders, baseline snapshots, price updates, and rebuilds use the
-- tenant-scoped SKU key (guild_id, unique_name, enchant).

update public.shop_order_items
   set quality = 1
 where quality <> 1;

update public.shop_inventory_adjustments
   set quality = 1
 where quality <> 1;

drop table if exists pg_temp.shop_inventory_quality_merge;
create temporary table shop_inventory_quality_merge on commit drop as
with ranked as (
  select i.*,
         row_number() over (
           partition by guild_id, unique_name, enchant
           order by (manual_price is not null) desc,
                    (auto_price_silver is not null) desc,
                    stock desc,
                    updated_at desc,
                    id
         ) as rn,
         sum(stock) over (
           partition by guild_id, unique_name, enchant
         )::int as total_stock
    from public.shop_inventory i
)
select id as keeper_id,
       guild_id,
       unique_name,
       enchant,
       total_stock,
       name_ko,
       category,
       tier,
       manual_price,
       auto_price_silver,
       price_source,
       price_warning_level,
       price_updated_at
  from ranked
 where rn = 1;

delete from public.shop_inventory i
 using pg_temp.shop_inventory_quality_merge m
 where i.guild_id = m.guild_id
   and i.unique_name = m.unique_name
   and i.enchant = m.enchant
   and i.id <> m.keeper_id;

update public.shop_inventory i
   set quality = 1,
       stock = greatest(m.total_stock, 0),
       name_ko = coalesce(m.name_ko, i.name_ko),
       category = coalesce(m.category, i.category),
       tier = coalesce(m.tier, i.tier),
       manual_price = coalesce(m.manual_price, i.manual_price),
       auto_price_silver = coalesce(m.auto_price_silver, i.auto_price_silver),
       price_source = coalesce(m.price_source, i.price_source),
       price_warning_level = coalesce(m.price_warning_level, i.price_warning_level),
       price_updated_at = coalesce(m.price_updated_at, i.price_updated_at),
       updated_at = now()
  from pg_temp.shop_inventory_quality_merge m
 where i.id = m.keeper_id;

drop index if exists public.shop_inventory_guild_unique;
create unique index shop_inventory_guild_unique
  on public.shop_inventory (guild_id, unique_name, enchant);

comment on index public.shop_inventory_guild_unique is
  'quality is raw-log metadata; shop stock is keyed by guild_id, unique_name, enchant';

create or replace function public.normalize_shop_inventory_quality()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.quality := 1;
  return new;
end;
$$;

drop trigger if exists shop_inventory_quality_canonical on public.shop_inventory;
create trigger shop_inventory_quality_canonical
before insert or update of quality on public.shop_inventory
for each row
execute function public.normalize_shop_inventory_quality();

comment on function public.normalize_shop_inventory_quality() is
  'Keeps shop_inventory quality canonical. Raw chest-log quality remains in shop_chest_logs only.';

drop index if exists public.shop_inventory_adjustments_guild_sku_idx;
create index shop_inventory_adjustments_guild_sku_idx
  on public.shop_inventory_adjustments (
    guild_id, unique_name, enchant, created_at desc
  );

create or replace function public.apply_shop_stock_delta(
  p_guild_id    uuid,
  p_unique_name text,
  p_enchant     int,
  p_quality     int,
  p_delta       int,
  p_name_ko     text,
  p_category    text,
  p_tier        int
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stock int;
begin
  update public.shop_inventory
     set stock      = greatest(stock + p_delta, 0),
         quality    = 1,
         name_ko    = coalesce(p_name_ko, name_ko),
         category   = coalesce(p_category, category),
         tier       = coalesce(p_tier, tier),
         updated_at = now()
   where guild_id = p_guild_id
     and unique_name = p_unique_name
     and enchant = p_enchant
   returning stock into v_stock;

  if found then
    return greatest(coalesce(v_stock, 0), 0);
  end if;

  if p_delta <= 0 then
    return 0;
  end if;

  insert into public.shop_inventory (
    guild_id, unique_name, enchant, quality, stock, name_ko, category, tier
  ) values (
    p_guild_id, p_unique_name, p_enchant, 1, p_delta, p_name_ko, p_category, p_tier
  )
  on conflict (guild_id, unique_name, enchant) do update
     set stock      = greatest(public.shop_inventory.stock + excluded.stock, 0),
         quality    = 1,
         name_ko    = coalesce(excluded.name_ko, public.shop_inventory.name_ko),
         category   = coalesce(excluded.category, public.shop_inventory.category),
         tier       = coalesce(excluded.tier, public.shop_inventory.tier),
         updated_at = now()
  returning stock into v_stock;

  return greatest(coalesce(v_stock, 0), 0);
end;
$$;

comment on function public.apply_shop_stock_delta(uuid, text, int, int, int, text, text, int) is
  'Applies a tenant-scoped shop inventory delta. p_quality is accepted for compatibility but ignored; shop stock is keyed by guild_id, unique_name, enchant.';

revoke all on function public.apply_shop_stock_delta(uuid, text, int, int, int, text, text, int) from public;
revoke all on function public.apply_shop_stock_delta(uuid, text, int, int, int, text, text, int) from anon, authenticated;
grant execute on function public.apply_shop_stock_delta(uuid, text, int, int, int, text, text, int) to service_role;

create or replace function public.apply_shop_inventory_price_updates(
  p_guild_id uuid,
  p_updates jsonb
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated int := 0;
begin
  if p_updates is null or jsonb_typeof(p_updates) <> 'array' then
    raise exception 'p_updates must be a JSON array' using errcode = '22023';
  end if;

  if exists (
    select 1
      from jsonb_to_recordset(p_updates) as u(
        unique_name text,
        enchant int,
        quality int,
        auto_price_silver int,
        price_source text,
        price_warning_level text,
        price_updated_at timestamptz,
        updated_at timestamptz
      )
     where u.unique_name is null
        or btrim(u.unique_name) = ''
        or u.enchant is null
        or u.enchant < 0
        or u.enchant > 4
        or u.auto_price_silver is null
        or u.auto_price_silver < 0
        or u.price_source is null
        or btrim(u.price_source) = ''
        or (
          u.price_warning_level is not null
          and u.price_warning_level not in ('quality', 'window', 'bluezone', 'redzone')
        )
        or u.price_updated_at is null
        or u.updated_at is null
  ) then
    raise exception 'invalid shop price update payload' using errcode = '22023';
  end if;

  update public.shop_inventory i
     set quality = 1,
         auto_price_silver = u.auto_price_silver,
         price_source = u.price_source,
         price_warning_level = u.price_warning_level,
         price_updated_at = u.price_updated_at,
         updated_at = u.updated_at
    from jsonb_to_recordset(p_updates) as u(
      unique_name text,
      enchant int,
      quality int,
      auto_price_silver int,
      price_source text,
      price_warning_level text,
      price_updated_at timestamptz,
      updated_at timestamptz
    )
   where i.guild_id = p_guild_id
     and i.unique_name = u.unique_name
     and i.enchant = u.enchant;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

comment on function public.apply_shop_inventory_price_updates(uuid, jsonb) is
  'Applies tenant-scoped AODP price metadata updates for quality-agnostic shop_inventory SKUs in one batch.';

revoke all on function public.apply_shop_inventory_price_updates(uuid, jsonb) from public;
revoke all on function public.apply_shop_inventory_price_updates(uuid, jsonb) from anon, authenticated;
grant execute on function public.apply_shop_inventory_price_updates(uuid, jsonb) to service_role;

drop function if exists public.submit_shop_order(uuid, text, text, integer, text, jsonb);

create or replace function public.submit_shop_order(
  p_guild_id uuid,
  p_discord_id text,
  p_username text,
  p_total_points integer,
  p_member_note text,
  p_price_review_required boolean,
  p_lines jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_line record;
begin
  if p_guild_id is null then
    raise exception 'GUILD_REQUIRED';
  end if;
  if p_discord_id is null or btrim(p_discord_id) = '' then
    raise exception 'DISCORD_REQUIRED';
  end if;
  if p_total_points is null or p_total_points <= 0 then
    raise exception 'TOTAL_POINTS_NOT_POSITIVE';
  end if;
  if p_lines is null
     or jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) = 0 then
    raise exception 'LINES_EMPTY';
  end if;

  for v_line in
    select unique_name,
           enchant,
           sum(quantity)::int as quantity
      from jsonb_to_recordset(p_lines) as l(
        unique_name text,
        enchant int,
        quality int,
        quantity int
      )
     group by unique_name, enchant
  loop
    if v_line.unique_name is null
       or btrim(v_line.unique_name) = ''
       or v_line.enchant is null
       or v_line.quantity is null
       or v_line.quantity <= 0 then
      raise exception 'INVALID_LINE';
    end if;

    update public.shop_inventory
       set stock = stock - v_line.quantity,
           quality = 1,
           updated_at = now()
     where guild_id = p_guild_id
       and unique_name = v_line.unique_name
       and enchant = v_line.enchant
       and stock >= v_line.quantity;

    if not found then
      raise exception 'INSUFFICIENT_STOCK: % @%',
        v_line.unique_name, v_line.enchant;
    end if;
  end loop;

  insert into public.shop_orders (
    guild_id,
    discord_id,
    username,
    total_points,
    status,
    member_note,
    price_review_required,
    stock_reserved_at
  ) values (
    p_guild_id,
    p_discord_id,
    p_username,
    p_total_points,
    'pending',
    nullif(btrim(coalesce(p_member_note, '')), ''),
    coalesce(p_price_review_required, false),
    now()
  )
  returning id into v_order_id;

  insert into public.shop_order_items (
    guild_id,
    order_id,
    unique_name,
    enchant,
    quality,
    name_ko,
    quantity,
    unit_points,
    subtotal_points,
    pricing_source,
    catalog_unit_silver_snapshot,
    member_quote_unit_silver,
    member_quote_unit_points,
    member_quote_city,
    member_quote_note,
    member_quote_evidence_url
  )
  select
    p_guild_id,
    v_order_id,
    l->>'unique_name',
    (l->>'enchant')::int,
    1,
    l->>'name_ko',
    (l->>'quantity')::int,
    (l->>'unit_points')::int,
    (l->>'subtotal_points')::int,
    coalesce(nullif(l->>'pricing_source', ''), 'catalog'),
    nullif(l->>'catalog_unit_silver_snapshot', '')::int,
    nullif(l->>'member_quote_unit_silver', '')::int,
    nullif(l->>'member_quote_unit_points', '')::int,
    nullif(btrim(coalesce(l->>'member_quote_city', '')), ''),
    nullif(btrim(coalesce(l->>'member_quote_note', '')), ''),
    nullif(btrim(coalesce(l->>'member_quote_evidence_url', '')), '')
  from jsonb_array_elements(p_lines) as l;

  return v_order_id;
end;
$$;

comment on function public.submit_shop_order(uuid, text, text, integer, text, boolean, jsonb) is
  '길드원 상점 주문 제출. 품질을 무시한 SKU 단위로 가용 재고를 예약 차감하고, 취소/거절 시 복구한다.';

revoke all on function public.submit_shop_order(uuid, text, text, integer, text, boolean, jsonb) from public;
revoke all on function public.submit_shop_order(uuid, text, text, integer, text, boolean, jsonb) from anon, authenticated;
grant execute on function public.submit_shop_order(uuid, text, text, integer, text, boolean, jsonb) to service_role;

create or replace function public.approve_shop_order(
  p_id uuid,
  p_admin_id text,
  p_guild_id uuid,
  p_admin_note text default null,
  p_total_points_override integer default null
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
         stock_reserved_at = coalesce(stock_reserved_at, v_now)
   where id = p_id
     and guild_id = v_guild;

  insert into public.point_ledger (guild_id, discord_id, delta, reason, ref_id)
       values (v_guild, v_discord, -v_charge_total, 'shop_purchase', p_id);
end;
$$;

comment on function public.approve_shop_order(uuid, text, uuid, text, integer) is
  '길드 상점 주문 승인. 예약 주문은 재고를 다시 차감하지 않고, 이미 들어온 출고 로그를 배송 증빙으로 보정한다.';

revoke all on function public.approve_shop_order(uuid, text, uuid, text, integer) from public;
revoke all on function public.approve_shop_order(uuid, text, uuid, text, integer) from anon, authenticated;
grant execute on function public.approve_shop_order(uuid, text, uuid, text, integer) to service_role;

create or replace function public.reject_shop_order(
  p_id uuid,
  p_admin_id text,
  p_guild_id uuid,
  p_admin_note text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guild uuid;
  v_stock_reserved_at timestamptz;
  v_line record;
begin
  select guild_id, stock_reserved_at
    into v_guild, v_stock_reserved_at
    from public.shop_orders
   where id = p_id
     and guild_id = p_guild_id
     and status = 'pending'
   for update;

  if v_guild is null then
    raise exception 'ORDER_NOT_PENDING';
  end if;

  if v_stock_reserved_at is not null then
    for v_line in
      select unique_name, enchant, sum(quantity)::int as quantity, min(name_ko) as name_ko
        from public.shop_order_items
       where guild_id = v_guild
         and order_id = p_id
       group by unique_name, enchant
    loop
      insert into public.shop_inventory (
        guild_id, unique_name, enchant, quality, stock, name_ko
      ) values (
        v_guild, v_line.unique_name, v_line.enchant, 1, v_line.quantity, v_line.name_ko
      )
      on conflict (guild_id, unique_name, enchant) do update
         set stock = public.shop_inventory.stock + v_line.quantity,
             quality = 1,
             name_ko = coalesce(public.shop_inventory.name_ko, excluded.name_ko),
             updated_at = now();
    end loop;
  end if;

  update public.shop_orders
     set status = 'rejected',
         resolved_at = now(),
         resolved_by = p_admin_id,
         admin_note = p_admin_note
   where id = p_id
     and guild_id = v_guild;
end;
$$;

comment on function public.reject_shop_order(uuid, text, uuid, text) is
  '길드 상점 주문 거절. 제출 시 예약된 가용 재고를 품질 무시 SKU 단위로 복구한다.';

revoke all on function public.reject_shop_order(uuid, text, uuid, text) from public;
revoke all on function public.reject_shop_order(uuid, text, uuid, text) from anon, authenticated;
grant execute on function public.reject_shop_order(uuid, text, uuid, text) to service_role;

create or replace function public.cancel_shop_order(
  p_id uuid,
  p_guild_id uuid,
  p_discord_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guild uuid;
  v_stock_reserved_at timestamptz;
  v_line record;
begin
  select guild_id, stock_reserved_at
    into v_guild, v_stock_reserved_at
    from public.shop_orders
   where id = p_id
     and guild_id = p_guild_id
     and discord_id = p_discord_id
     and status = 'pending'
   for update;

  if v_guild is null then
    raise exception 'ORDER_NOT_PENDING';
  end if;

  if v_stock_reserved_at is not null then
    for v_line in
      select unique_name, enchant, sum(quantity)::int as quantity, min(name_ko) as name_ko
        from public.shop_order_items
       where guild_id = v_guild
         and order_id = p_id
       group by unique_name, enchant
    loop
      insert into public.shop_inventory (
        guild_id, unique_name, enchant, quality, stock, name_ko
      ) values (
        v_guild, v_line.unique_name, v_line.enchant, 1, v_line.quantity, v_line.name_ko
      )
      on conflict (guild_id, unique_name, enchant) do update
         set stock = public.shop_inventory.stock + v_line.quantity,
             quality = 1,
             name_ko = coalesce(public.shop_inventory.name_ko, excluded.name_ko),
             updated_at = now();
    end loop;
  end if;

  update public.shop_orders
     set status = 'cancelled',
         resolved_at = now(),
         resolved_by = p_discord_id
   where id = p_id
     and guild_id = v_guild;
end;
$$;

comment on function public.cancel_shop_order(uuid, uuid, text) is
  '길드원이 자신의 pending 상점 주문을 취소한다. 제출 시 예약된 가용 재고를 품질 무시 SKU 단위로 복구한다.';

revoke all on function public.cancel_shop_order(uuid, uuid, text) from public;
revoke all on function public.cancel_shop_order(uuid, uuid, text) from anon, authenticated;
grant execute on function public.cancel_shop_order(uuid, uuid, text) to service_role;

create or replace function public.apply_shop_baseline(
  p_guild_id       uuid,
  p_baseline_at    timestamptz,
  p_baseline_start timestamptz,
  p_snapshot       jsonb,
  p_total_items    int,
  p_total_events   int,
  p_depositor      text,
  p_admin_id       text,
  p_notes          text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_before_snapshot jsonb;
  v_drift jsonb;
  v_delta record;
begin
  update public.shop_baselines
     set status = 'superseded'
   where guild_id = p_guild_id
     and status = 'confirmed';

  select coalesce(jsonb_agg(jsonb_build_object(
           'unique_name', unique_name,
           'enchant',     enchant,
           'quality',     1,
           'name_ko',     name_ko,
           'stock',       stock
         )), '[]'::jsonb)
    into v_before_snapshot
    from public.shop_inventory
   where guild_id = p_guild_id
     and stock <> 0;

  drop table if exists pg_temp.shop_inventory_metadata;
  create temporary table shop_inventory_metadata on commit drop as
  select distinct on (unique_name, enchant)
         unique_name, enchant, name_ko, category, tier,
         manual_price, auto_price_silver, price_source,
         price_warning_level, price_updated_at
    from public.shop_inventory
   where guild_id = p_guild_id
   order by unique_name, enchant,
            (manual_price is not null) desc,
            (auto_price_silver is not null) desc,
            updated_at desc;

  insert into public.shop_baselines (
    guild_id, baseline_at, baseline_start, snapshot,
    total_items, total_events, depositor, confirmed_by, notes
  ) values (
    p_guild_id, p_baseline_at, p_baseline_start, p_snapshot,
    p_total_items, p_total_events, p_depositor, p_admin_id, p_notes
  ) returning id into v_id;

  update public.shop_inventory
     set stock = 0,
         quality = 1,
         updated_at = now()
   where guild_id = p_guild_id;

  insert into public.shop_inventory (
    guild_id, unique_name, enchant, quality, stock, name_ko, category, tier,
    manual_price, auto_price_silver, price_source,
    price_warning_level, price_updated_at
  )
  select p_guild_id,
         s."uniqueName",
         s.enchant,
         1,
         sum(s.quantity)::int,
         coalesce(max(s."nameKo"), max(m.name_ko), s."uniqueName"),
         coalesce(max(s.category), max(m.category)),
         coalesce(max(s.tier), max(m.tier)),
         max(m.manual_price),
         max(m.auto_price_silver),
         max(m.price_source),
         max(m.price_warning_level),
         max(m.price_updated_at)
    from jsonb_to_recordset(p_snapshot) as s(
      "uniqueName" text,
      "nameKo" text,
      category text,
      tier int,
      enchant int,
      quality int,
      quantity int
    )
    left join pg_temp.shop_inventory_metadata m
      on m.unique_name = s."uniqueName"
     and m.enchant = s.enchant
   where s.quantity > 0
   group by s."uniqueName", s.enchant
  on conflict (guild_id, unique_name, enchant) do update
     set stock               = excluded.stock,
         quality             = 1,
         name_ko             = coalesce(excluded.name_ko, public.shop_inventory.name_ko),
         category            = coalesce(excluded.category, public.shop_inventory.category),
         tier                = coalesce(excluded.tier, public.shop_inventory.tier),
         manual_price        = coalesce(public.shop_inventory.manual_price, excluded.manual_price),
         auto_price_silver   = coalesce(public.shop_inventory.auto_price_silver, excluded.auto_price_silver),
         price_source        = coalesce(public.shop_inventory.price_source, excluded.price_source),
         price_warning_level = coalesce(public.shop_inventory.price_warning_level, excluded.price_warning_level),
         price_updated_at    = coalesce(public.shop_inventory.price_updated_at, excluded.price_updated_at),
         updated_at          = now();

  for v_delta in
    select l.unique_name,
           l.enchant,
           1 as quality,
           coalesce(l.applied_quantity, l.quantity)::int as delta,
           coalesce(m.name_ko, l.item_name_raw) as name_ko,
           m.category,
           m.tier
      from public.shop_chest_logs l
      left join pg_temp.shop_inventory_metadata m
        on m.unique_name = l.unique_name
       and m.enchant = l.enchant
     where l.guild_id = p_guild_id
       and l.logged_at > p_baseline_at
       and l.unique_name is not null
       and coalesce(l.applied_quantity, l.quantity) <> 0
       and not exists (
         select 1
           from public.shop_blacklist b
          where b.guild_id = p_guild_id
            and b.item_name_raw = l.item_name_raw
       )
     order by l.logged_at asc,
              l.imported_at asc,
              l.import_sequence asc nulls last,
              l.player asc,
              l.item_name_raw asc,
              l.enchant asc,
              l.quality asc,
              l.quantity asc,
              l.id asc
  loop
    perform public.apply_shop_stock_delta(
      p_guild_id,
      v_delta.unique_name,
      v_delta.enchant,
      v_delta.quality,
      v_delta.delta,
      v_delta.name_ko,
      v_delta.category,
      v_delta.tier
    );
  end loop;

  with before_tbl as (
    select (b->>'unique_name')::text as unique_name,
           (b->>'enchant')::int      as enchant,
           1                         as quality,
           (b->>'name_ko')::text     as name_ko,
           sum((b->>'stock')::int)   as stock
      from jsonb_array_elements(v_before_snapshot) b
     group by (b->>'unique_name')::text, (b->>'enchant')::int, (b->>'name_ko')::text
  ),
  after_tbl as (
    select unique_name, enchant, 1 as quality, name_ko, stock
      from public.shop_inventory
     where guild_id = p_guild_id
       and stock <> 0
  ),
  joined as (
    select coalesce(a.unique_name, b.unique_name) as unique_name,
           coalesce(a.enchant,     b.enchant)     as enchant,
           1                                      as quality,
           coalesce(a.name_ko,     b.name_ko)     as name_ko,
           coalesce(b.stock, 0)                   as before_stock,
           coalesce(a.stock, 0)                   as after_stock
      from after_tbl a
      full outer join before_tbl b
        on  a.unique_name = b.unique_name
        and a.enchant     = b.enchant
  ),
  changed as (
    select *, after_stock - before_stock as delta
      from joined
     where before_stock <> after_stock
  )
  select jsonb_build_object(
    'before_total',  coalesce((select sum(stock) from before_tbl), 0),
    'after_total',   coalesce((select sum(stock) from after_tbl), 0),
    'changed_items', (select count(*) from changed),
    'restored',      (select count(*) from changed where before_stock = 0 and after_stock > 0),
    'cleared',       (select count(*) from changed where before_stock > 0 and after_stock = 0),
    'increased',     (select count(*) from changed where before_stock > 0 and after_stock > before_stock),
    'decreased',     (select count(*) from changed where before_stock > 0 and after_stock > 0 and after_stock < before_stock),
    'top_changes',   coalesce((
      select jsonb_agg(jsonb_build_object(
               'unique_name',   unique_name,
               'name_ko',       name_ko,
               'enchant',       enchant,
               'quality',       quality,
               'before_stock',  before_stock,
               'after_stock',   after_stock,
               'delta',         delta
             ) order by abs(delta) desc, unique_name)
        from (select * from changed order by abs(delta) desc, unique_name limit 20) c
    ), '[]'::jsonb)
  ) into v_drift;

  update public.shop_baselines
     set drift_report = v_drift
   where id = v_id;

  return v_id;
end;
$$;

revoke all on function public.apply_shop_baseline(uuid, timestamptz, timestamptz, jsonb, int, int, text, text, text) from public;
revoke all on function public.apply_shop_baseline(uuid, timestamptz, timestamptz, jsonb, int, int, text, text, text) from anon, authenticated;
grant execute on function public.apply_shop_baseline(uuid, timestamptz, timestamptz, jsonb, int, int, text, text, text) to service_role;

create or replace function public.rebuild_shop_inventory_from_chest_logs(
  p_guild_id uuid,
  p_start_at timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before_snapshot jsonb;
  v_drift jsonb;
  v_delta record;
  v_adjustment record;
  v_baseline_id uuid;
  v_baseline_at timestamptz;
  v_baseline_snapshot jsonb;
  v_replay_start timestamptz;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
           'unique_name', unique_name,
           'enchant',     enchant,
           'quality',     1,
           'name_ko',     name_ko,
           'stock',       stock
         )), '[]'::jsonb)
    into v_before_snapshot
    from public.shop_inventory
   where guild_id = p_guild_id
     and stock <> 0;

  drop table if exists pg_temp.shop_inventory_metadata;
  create temporary table shop_inventory_metadata on commit drop as
  select distinct on (unique_name, enchant)
         unique_name, enchant, name_ko, category, tier,
         manual_price, auto_price_silver, price_source,
         price_warning_level, price_updated_at
    from public.shop_inventory
   where guild_id = p_guild_id
   order by unique_name, enchant,
            (manual_price is not null) desc,
            (auto_price_silver is not null) desc,
            updated_at desc;

  select id, baseline_at, snapshot
    into v_baseline_id, v_baseline_at, v_baseline_snapshot
    from public.shop_baselines
   where guild_id = p_guild_id
     and status = 'confirmed'
     and (p_start_at is null or baseline_at >= p_start_at)
   order by baseline_at desc, confirmed_at desc
   limit 1;

  update public.shop_inventory
     set stock = 0,
         quality = 1,
         updated_at = now()
   where guild_id = p_guild_id;

  if v_baseline_id is not null then
    insert into public.shop_inventory (
      guild_id, unique_name, enchant, quality, stock, name_ko, category, tier,
      manual_price, auto_price_silver, price_source,
      price_warning_level, price_updated_at
    )
    select p_guild_id,
           s."uniqueName",
           s.enchant,
           1,
           sum(s.quantity)::int,
           coalesce(max(s."nameKo"), max(m.name_ko), s."uniqueName"),
           coalesce(max(s.category), max(m.category)),
           coalesce(max(s.tier), max(m.tier)),
           max(m.manual_price),
           max(m.auto_price_silver),
           max(m.price_source),
           max(m.price_warning_level),
           max(m.price_updated_at)
      from jsonb_to_recordset(v_baseline_snapshot) as s(
        "uniqueName" text,
        "nameKo" text,
        category text,
        tier int,
        enchant int,
        quality int,
        quantity int
      )
      left join pg_temp.shop_inventory_metadata m
        on m.unique_name = s."uniqueName"
       and m.enchant = s.enchant
     where s.quantity > 0
     group by s."uniqueName", s.enchant
    on conflict (guild_id, unique_name, enchant) do update
       set stock               = excluded.stock,
           quality             = 1,
           name_ko             = coalesce(excluded.name_ko, public.shop_inventory.name_ko),
           category            = coalesce(excluded.category, public.shop_inventory.category),
           tier                = coalesce(excluded.tier, public.shop_inventory.tier),
           manual_price        = coalesce(public.shop_inventory.manual_price, excluded.manual_price),
           auto_price_silver   = coalesce(public.shop_inventory.auto_price_silver, excluded.auto_price_silver),
           price_source        = coalesce(public.shop_inventory.price_source, excluded.price_source),
           price_warning_level = coalesce(public.shop_inventory.price_warning_level, excluded.price_warning_level),
           price_updated_at    = coalesce(public.shop_inventory.price_updated_at, excluded.price_updated_at),
           updated_at          = now();
    v_replay_start := v_baseline_at;
  else
    v_replay_start := p_start_at;
  end if;

  for v_delta in
    select l.unique_name,
           l.enchant,
           1 as quality,
           coalesce(l.applied_quantity, l.quantity)::int as delta,
           coalesce(m.name_ko, l.item_name_raw) as name_ko,
           m.category,
           m.tier
      from public.shop_chest_logs l
      left join pg_temp.shop_inventory_metadata m
        on m.unique_name = l.unique_name
       and m.enchant = l.enchant
     where l.guild_id = p_guild_id
       and (
         (v_baseline_id is not null and l.logged_at > v_replay_start)
         or (v_baseline_id is null and (v_replay_start is null or l.logged_at >= v_replay_start))
       )
       and l.unique_name is not null
       and coalesce(l.applied_quantity, l.quantity) <> 0
       and not exists (
         select 1
          from public.shop_blacklist b
         where b.guild_id = p_guild_id
           and b.item_name_raw = l.item_name_raw
       )
     order by l.logged_at asc,
              l.imported_at asc,
              l.import_sequence asc nulls last,
              l.player asc,
              l.item_name_raw asc,
              l.enchant asc,
              l.quality asc,
              l.quantity asc,
              l.id asc
  loop
    perform public.apply_shop_stock_delta(
      p_guild_id,
      v_delta.unique_name,
      v_delta.enchant,
      v_delta.quality,
      v_delta.delta,
      v_delta.name_ko,
      v_delta.category,
      v_delta.tier
    );
  end loop;

  for v_adjustment in
    select a.unique_name,
           a.enchant,
           1 as quality,
           a.after_stock,
           a.name_ko,
           coalesce(m.category, a.category) as category,
           coalesce(m.tier, a.tier) as tier,
           m.manual_price,
           m.auto_price_silver,
           m.price_source,
           m.price_warning_level,
           m.price_updated_at
      from public.shop_inventory_adjustments a
      left join pg_temp.shop_inventory_metadata m
        on m.unique_name = a.unique_name
       and m.enchant = a.enchant
     where a.guild_id = p_guild_id
       and (
         (v_baseline_id is not null and a.created_at > v_replay_start)
         or (v_baseline_id is null and (v_replay_start is null or a.created_at >= v_replay_start))
       )
     order by a.created_at asc, a.id asc
  loop
    if v_adjustment.after_stock > 0 then
      insert into public.shop_inventory (
        guild_id, unique_name, enchant, quality, stock, name_ko, category, tier,
        manual_price, auto_price_silver, price_source,
        price_warning_level, price_updated_at
      ) values (
        p_guild_id,
        v_adjustment.unique_name,
        v_adjustment.enchant,
        v_adjustment.quality,
        v_adjustment.after_stock,
        v_adjustment.name_ko,
        v_adjustment.category,
        v_adjustment.tier,
        v_adjustment.manual_price,
        v_adjustment.auto_price_silver,
        v_adjustment.price_source,
        v_adjustment.price_warning_level,
        v_adjustment.price_updated_at
      )
      on conflict (guild_id, unique_name, enchant) do update
         set stock               = excluded.stock,
             quality             = 1,
             name_ko             = coalesce(excluded.name_ko, public.shop_inventory.name_ko),
             category            = coalesce(excluded.category, public.shop_inventory.category),
             tier                = coalesce(excluded.tier, public.shop_inventory.tier),
             manual_price        = coalesce(public.shop_inventory.manual_price, excluded.manual_price),
             auto_price_silver   = coalesce(public.shop_inventory.auto_price_silver, excluded.auto_price_silver),
             price_source        = coalesce(public.shop_inventory.price_source, excluded.price_source),
             price_warning_level = coalesce(public.shop_inventory.price_warning_level, excluded.price_warning_level),
             price_updated_at    = coalesce(public.shop_inventory.price_updated_at, excluded.price_updated_at),
             updated_at          = now();
    else
      update public.shop_inventory
         set stock = 0,
             quality = 1,
             updated_at = now()
       where guild_id = p_guild_id
         and unique_name = v_adjustment.unique_name
         and enchant = v_adjustment.enchant;
    end if;
  end loop;

  update public.shop_inventory i
     set quality             = 1,
         name_ko             = coalesce(i.name_ko, m.name_ko),
         category            = coalesce(i.category, m.category),
         tier                = coalesce(i.tier, m.tier),
         manual_price        = coalesce(i.manual_price, m.manual_price),
         auto_price_silver   = coalesce(i.auto_price_silver, m.auto_price_silver),
         price_source        = coalesce(i.price_source, m.price_source),
         price_warning_level = coalesce(i.price_warning_level, m.price_warning_level),
         price_updated_at    = coalesce(i.price_updated_at, m.price_updated_at)
    from pg_temp.shop_inventory_metadata m
   where i.guild_id = p_guild_id
     and i.unique_name = m.unique_name
     and i.enchant = m.enchant;

  with before_tbl as (
    select (b->>'unique_name')::text as unique_name,
           (b->>'enchant')::int      as enchant,
           1                         as quality,
           (b->>'name_ko')::text     as name_ko,
           sum((b->>'stock')::int)   as stock
      from jsonb_array_elements(v_before_snapshot) b
     group by (b->>'unique_name')::text, (b->>'enchant')::int, (b->>'name_ko')::text
  ),
  after_tbl as (
    select unique_name, enchant, 1 as quality, name_ko, stock
      from public.shop_inventory
     where guild_id = p_guild_id
       and stock <> 0
  ),
  joined as (
    select coalesce(a.unique_name, b.unique_name) as unique_name,
           coalesce(a.enchant,     b.enchant)     as enchant,
           1                                      as quality,
           coalesce(a.name_ko,     b.name_ko)     as name_ko,
           coalesce(b.stock, 0)                   as before_stock,
           coalesce(a.stock, 0)                   as after_stock
      from after_tbl a
      full outer join before_tbl b
        on  a.unique_name = b.unique_name
        and a.enchant     = b.enchant
  ),
  changed as (
    select *, after_stock - before_stock as delta
      from joined
     where before_stock <> after_stock
  )
  select jsonb_build_object(
    'before_total',  coalesce((select sum(stock) from before_tbl), 0),
    'after_total',   coalesce((select sum(stock) from after_tbl), 0),
    'changed_items', (select count(*) from changed),
    'restored',      (select count(*) from changed where before_stock = 0 and after_stock > 0),
    'cleared',       (select count(*) from changed where before_stock > 0 and after_stock = 0),
    'increased',     (select count(*) from changed where before_stock > 0 and after_stock > before_stock),
    'decreased',     (select count(*) from changed where before_stock > 0 and after_stock > 0 and after_stock < before_stock),
    'top_changes',   coalesce((
      select jsonb_agg(jsonb_build_object(
               'unique_name',   unique_name,
               'name_ko',       name_ko,
               'enchant',       enchant,
               'quality',       quality,
               'before_stock',  before_stock,
               'after_stock',   after_stock,
               'delta',         delta
             ) order by abs(delta) desc, unique_name)
        from (select * from changed order by abs(delta) desc, unique_name limit 20) c
    ), '[]'::jsonb)
  ) into v_drift;

  return v_drift;
end;
$$;

comment on function public.rebuild_shop_inventory_from_chest_logs(uuid, timestamptz) is
  '길드 상점 재고를 원본 shop_chest_logs 로 품질 무시 SKU 기준 재계산한다. 주문 배송 매칭은 applied_quantity 기준으로 재생하고, 이후 수동 재고 보정을 시간순으로 재적용한다.';

revoke all on function public.rebuild_shop_inventory_from_chest_logs(uuid, timestamptz) from public;
revoke all on function public.rebuild_shop_inventory_from_chest_logs(uuid, timestamptz) from anon, authenticated;
grant execute on function public.rebuild_shop_inventory_from_chest_logs(uuid, timestamptz) to service_role;
