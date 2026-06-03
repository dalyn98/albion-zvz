-- 190: Reserve shop stock at order submit time and keep shop-order delivery
-- withdrawals out of later chest-log inventory replay.

alter table public.shop_orders
  add column if not exists stock_reserved_at timestamptz;

update public.shop_orders
   set stock_reserved_at = resolved_at
 where status = 'approved'
   and stock_reserved_at is null;

alter table public.shop_chest_logs
  add column if not exists applied_quantity integer,
  add column if not exists ignored_quantity integer not null default 0,
  add column if not exists ignored_reason text,
  add column if not exists matched_order_id uuid,
  add column if not exists matched_order_item_id uuid,
  add column if not exists matched_order_items jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'shop_chest_logs_ignored_reason_check'
  ) then
    alter table public.shop_chest_logs
      add constraint shop_chest_logs_ignored_reason_check
      check (ignored_reason is null or ignored_reason in ('shop_order_fulfillment'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'shop_chest_logs_matched_order_items_array_check'
  ) then
    alter table public.shop_chest_logs
      add constraint shop_chest_logs_matched_order_items_array_check
      check (jsonb_typeof(matched_order_items) = 'array');
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'shop_chest_logs_matched_order_id_fkey'
  ) then
    alter table public.shop_chest_logs
      add constraint shop_chest_logs_matched_order_id_fkey
      foreign key (matched_order_id) references public.shop_orders(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'shop_chest_logs_matched_order_item_id_fkey'
  ) then
    alter table public.shop_chest_logs
      add constraint shop_chest_logs_matched_order_item_id_fkey
      foreign key (matched_order_item_id) references public.shop_order_items(id) on delete set null;
  end if;
end $$;

create index if not exists shop_orders_reserved_pending_idx
  on public.shop_orders (guild_id, status, stock_reserved_at)
  where stock_reserved_at is not null;

create index if not exists shop_chest_logs_fulfillment_idx
  on public.shop_chest_logs (guild_id, ignored_reason, matched_order_item_id)
  where ignored_reason = 'shop_order_fulfillment';

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
           quality,
           sum(quantity)::int as quantity
      from jsonb_to_recordset(p_lines) as l(
        unique_name text,
        enchant int,
        quality int,
        quantity int
      )
     group by unique_name, enchant, quality
  loop
    if v_line.unique_name is null
       or btrim(v_line.unique_name) = ''
       or v_line.enchant is null
       or v_line.quality is null
       or v_line.quantity is null
       or v_line.quantity <= 0 then
      raise exception 'INVALID_LINE';
    end if;

    update public.shop_inventory
       set stock = stock - v_line.quantity,
           updated_at = now()
     where guild_id = p_guild_id
       and unique_name = v_line.unique_name
       and enchant = v_line.enchant
       and quality = v_line.quality
       and stock >= v_line.quantity;

    if not found then
      raise exception 'INSUFFICIENT_STOCK: % @% q%',
        v_line.unique_name, v_line.enchant, v_line.quality;
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
    (l->>'quality')::int,
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
  '길드원 상점 주문 제출. 제출 시 가용 재고를 예약 차감하고, 취소/거절 시 복구한다.';

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
  v_line record;
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
  end if;

  update public.shop_orders
     set status = 'approved',
         total_points = v_charge_total,
         resolved_at = now(),
         resolved_by = p_admin_id,
         admin_note = coalesce(p_admin_note, admin_note),
         stock_reserved_at = coalesce(stock_reserved_at, now())
   where id = p_id
     and guild_id = v_guild;

  insert into public.point_ledger (guild_id, discord_id, delta, reason, ref_id)
       values (v_guild, v_discord, -v_charge_total, 'shop_purchase', p_id);
end;
$$;

comment on function public.approve_shop_order(uuid, text, uuid, text, integer) is
  '길드 상점 주문 승인. 제출 시 예약된 주문은 재고를 다시 차감하지 않고 포인트 차감/상태 변경만 원자 처리한다.';

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
      select unique_name, enchant, quality, quantity, name_ko
        from public.shop_order_items
       where guild_id = v_guild
         and order_id = p_id
    loop
      insert into public.shop_inventory (
        guild_id, unique_name, enchant, quality, stock, name_ko
      ) values (
        v_guild, v_line.unique_name, v_line.enchant, v_line.quality, v_line.quantity, v_line.name_ko
      )
      on conflict (guild_id, unique_name, enchant, quality) do update
         set stock = public.shop_inventory.stock + v_line.quantity,
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
  '길드 상점 주문 거절. 제출 시 예약된 가용 재고를 복구한 뒤 주문을 rejected 로 변경한다.';

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
      select unique_name, enchant, quality, quantity, name_ko
        from public.shop_order_items
       where guild_id = v_guild
         and order_id = p_id
    loop
      insert into public.shop_inventory (
        guild_id, unique_name, enchant, quality, stock, name_ko
      ) values (
        v_guild, v_line.unique_name, v_line.enchant, v_line.quality, v_line.quantity, v_line.name_ko
      )
      on conflict (guild_id, unique_name, enchant, quality) do update
         set stock = public.shop_inventory.stock + v_line.quantity,
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
  '길드원이 자신의 pending 상점 주문을 취소한다. 제출 시 예약된 가용 재고를 복구한다.';

revoke all on function public.cancel_shop_order(uuid, uuid, text) from public;
revoke all on function public.cancel_shop_order(uuid, uuid, text) from anon, authenticated;
grant execute on function public.cancel_shop_order(uuid, uuid, text) to service_role;

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
  v_baseline_id uuid;
  v_baseline_at timestamptz;
  v_baseline_snapshot jsonb;
  v_replay_start timestamptz;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
           'unique_name', unique_name,
           'enchant',     enchant,
           'quality',     quality,
           'name_ko',     name_ko,
           'stock',       stock
         )), '[]'::jsonb)
    into v_before_snapshot
    from public.shop_inventory
   where guild_id = p_guild_id
     and stock <> 0;

  drop table if exists pg_temp.shop_inventory_metadata;
  create temporary table shop_inventory_metadata on commit drop as
  select unique_name, enchant, quality, name_ko, category, tier,
         manual_price, auto_price_silver, price_source,
         price_warning_level, price_updated_at
    from public.shop_inventory
   where guild_id = p_guild_id;

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
           s.quality,
           s.quantity,
           coalesce(s."nameKo", m.name_ko, s."uniqueName"),
           coalesce(s.category, m.category),
           coalesce(s.tier, m.tier),
           m.manual_price,
           m.auto_price_silver,
           m.price_source,
           m.price_warning_level,
           m.price_updated_at
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
       and m.quality = s.quality
     where s.quantity > 0
    on conflict (guild_id, unique_name, enchant, quality) do update
       set stock               = excluded.stock,
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
           l.quality,
           coalesce(l.applied_quantity, l.quantity)::int as delta,
           coalesce(m.name_ko, l.item_name_raw) as name_ko,
           m.category,
           m.tier
      from public.shop_chest_logs l
      left join pg_temp.shop_inventory_metadata m
        on m.unique_name = l.unique_name
       and m.enchant = l.enchant
       and m.quality = l.quality
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

  update public.shop_inventory i
     set name_ko             = coalesce(i.name_ko, m.name_ko),
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
     and i.enchant = m.enchant
     and i.quality = m.quality;

  with before_tbl as (
    select (b->>'unique_name')::text as unique_name,
           (b->>'enchant')::int      as enchant,
           (b->>'quality')::int      as quality,
           (b->>'name_ko')::text     as name_ko,
           (b->>'stock')::int        as stock
      from jsonb_array_elements(v_before_snapshot) b
  ),
  after_tbl as (
    select unique_name, enchant, quality, name_ko, stock
      from public.shop_inventory
     where guild_id = p_guild_id
       and stock <> 0
  ),
  joined as (
    select coalesce(a.unique_name, b.unique_name) as unique_name,
           coalesce(a.enchant,     b.enchant)     as enchant,
           coalesce(a.quality,     b.quality)     as quality,
           coalesce(a.name_ko,     b.name_ko)     as name_ko,
           coalesce(b.stock, 0)                   as before_stock,
           coalesce(a.stock, 0)                   as after_stock
      from after_tbl a
      full outer join before_tbl b
        on  a.unique_name = b.unique_name
        and a.enchant     = b.enchant
        and a.quality     = b.quality
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
  '길드 상자 로그를 운영 시작시간부터 다시 적용해 재고를 재계산한다. 주문 배송으로 매칭된 로그는 applied_quantity 기준으로 재생해 중복 차감을 막는다.';

revoke all on function public.rebuild_shop_inventory_from_chest_logs(uuid, timestamptz) from public;
revoke all on function public.rebuild_shop_inventory_from_chest_logs(uuid, timestamptz) from anon, authenticated;
grant execute on function public.rebuild_shop_inventory_from_chest_logs(uuid, timestamptz) to service_role;
