-- 231: Member trade posts with multiple item lines.
--
-- Keep member_trade_listings as the post/header table for compatibility, then
-- move sellable stock and order snapshots into child rows. Existing single-item
-- listings and orders are backfilled as one-line posts.

alter table public.member_trade_listings
  add column if not exists title text,
  add column if not exists description text,
  add column if not exists item_count integer not null default 1 check (item_count >= 0);

alter table public.member_trade_orders
  add column if not exists listing_title text;

update public.member_trade_listings
   set title = coalesce(title, case when enchant > 0 then name_ko || ' .' || enchant::text else name_ko end),
       item_count = greatest(item_count, 1)
 where title is null
    or item_count = 0;

update public.member_trade_orders o
   set listing_title = coalesce(o.listing_title, l.title, o.name_ko)
  from public.member_trade_listings l
 where o.listing_id = l.id
   and o.guild_id = l.guild_id
   and o.listing_title is null;

create table if not exists public.member_trade_listing_items (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  listing_id uuid not null references public.member_trade_listings(id) on delete cascade,
  unique_name text not null,
  enchant integer not null check (enchant between 0 and 4),
  quality integer check (quality between 1 and 5),
  name_ko text not null,
  category text,
  tier integer,
  quantity_total integer not null check (quantity_total > 0),
  quantity_available integer not null check (quantity_available >= 0),
  unit_points integer not null check (unit_points > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (quantity_available <= quantity_total),
  unique (guild_id, listing_id, sort_order)
);

create index if not exists member_trade_listing_items_listing_idx
  on public.member_trade_listing_items (guild_id, listing_id, sort_order);

create index if not exists member_trade_listing_items_available_idx
  on public.member_trade_listing_items (guild_id, listing_id, quantity_available desc)
  where quantity_available > 0;

create table if not exists public.member_trade_order_items (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  order_id uuid not null references public.member_trade_orders(id) on delete cascade,
  listing_item_id uuid references public.member_trade_listing_items(id) on delete restrict,
  unique_name text not null,
  enchant integer not null check (enchant between 0 and 4),
  quality integer check (quality between 1 and 5),
  name_ko text not null,
  quantity integer not null check (quantity > 0),
  unit_points integer not null check (unit_points > 0),
  total_points integer not null check (total_points > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists member_trade_order_items_order_idx
  on public.member_trade_order_items (guild_id, order_id, sort_order);

alter table public.member_trade_listing_items enable row level security;
alter table public.member_trade_order_items enable row level security;

insert into public.member_trade_listing_items (
  guild_id,
  listing_id,
  unique_name,
  enchant,
  quality,
  name_ko,
  category,
  tier,
  quantity_total,
  quantity_available,
  unit_points,
  sort_order
)
select
  l.guild_id,
  l.id,
  l.unique_name,
  l.enchant,
  l.quality,
  l.name_ko,
  l.category,
  l.tier,
  l.quantity_total,
  l.quantity_available,
  l.unit_points,
  0
from public.member_trade_listings l
where not exists (
  select 1
    from public.member_trade_listing_items li
   where li.guild_id = l.guild_id
     and li.listing_id = l.id
);

insert into public.member_trade_order_items (
  guild_id,
  order_id,
  listing_item_id,
  unique_name,
  enchant,
  quality,
  name_ko,
  quantity,
  unit_points,
  total_points,
  sort_order
)
select
  o.guild_id,
  o.id,
  li.id,
  o.unique_name,
  o.enchant,
  o.quality,
  o.name_ko,
  o.quantity,
  o.unit_points,
  o.total_points,
  0
from public.member_trade_orders o
left join public.member_trade_listing_items li
  on li.guild_id = o.guild_id
 and li.listing_id = o.listing_id
 and li.unique_name = o.unique_name
 and li.enchant = o.enchant
 and coalesce(li.quality, 0) = coalesce(o.quality, 0)
where not exists (
  select 1
    from public.member_trade_order_items oi
   where oi.guild_id = o.guild_id
     and oi.order_id = o.id
);

update public.member_trade_listings l
   set quantity_total = coalesce(s.quantity_total, l.quantity_total),
       quantity_available = coalesce(s.quantity_available, l.quantity_available),
       item_count = coalesce(s.item_count, l.item_count),
       status = case
         when l.status = 'active' and coalesce(s.quantity_available, l.quantity_available) = 0 then 'sold_out'
         else l.status
       end,
       updated_at = now()
  from (
    select
      listing_id,
      guild_id,
      sum(quantity_total)::integer as quantity_total,
      sum(quantity_available)::integer as quantity_available,
      count(*) filter (where quantity_available > 0)::integer as item_count
    from public.member_trade_listing_items
    group by listing_id, guild_id
  ) s
 where l.id = s.listing_id
   and l.guild_id = s.guild_id;

create or replace function public.create_member_trade_listing_post(
  p_guild_id uuid,
  p_seller_discord_id text,
  p_seller_username text,
  p_title text,
  p_description text,
  p_city text,
  p_delivery_note text,
  p_expires_at timestamptz,
  p_items jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing_id uuid;
  v_first jsonb;
  v_total_quantity integer;
  v_item_count integer;
begin
  if p_guild_id is null then
    raise exception 'INVALID_GUILD';
  end if;
  if p_seller_discord_id is null or btrim(p_seller_discord_id) = '' then
    raise exception 'INVALID_SELLER';
  end if;
  if p_title is null or char_length(btrim(p_title)) < 2 or char_length(btrim(p_title)) > 80 then
    raise exception 'INVALID_TITLE';
  end if;
  if jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0
     or jsonb_array_length(p_items) > 30 then
    raise exception 'INVALID_ITEMS';
  end if;

  select item
    into v_first
    from jsonb_array_elements(p_items) with ordinality as input(item, ord)
   order by ord
   limit 1;

  select
    sum((item->>'quantity')::integer)::integer,
    count(*)::integer
    into v_total_quantity, v_item_count
    from jsonb_array_elements(p_items) as input(item);

  if v_total_quantity is null or v_total_quantity <= 0 then
    raise exception 'INVALID_QUANTITY';
  end if;

  insert into public.member_trade_listings (
    guild_id,
    seller_discord_id,
    seller_username,
    title,
    description,
    unique_name,
    enchant,
    quality,
    name_ko,
    category,
    tier,
    quantity_total,
    quantity_available,
    unit_points,
    item_count,
    city,
    delivery_note,
    expires_at
  ) values (
    p_guild_id,
    p_seller_discord_id,
    p_seller_username,
    nullif(btrim(p_title), ''),
    nullif(btrim(coalesce(p_description, '')), ''),
    v_first->>'uniqueName',
    (v_first->>'enchant')::integer,
    nullif(v_first->>'quality', '')::integer,
    v_first->>'nameKo',
    nullif(v_first->>'category', ''),
    nullif(v_first->>'tier', '')::integer,
    v_total_quantity,
    v_total_quantity,
    (v_first->>'unitPoints')::integer,
    v_item_count,
    nullif(btrim(coalesce(p_city, '')), ''),
    nullif(btrim(coalesce(p_delivery_note, '')), ''),
    p_expires_at
  )
  returning id into v_listing_id;

  insert into public.member_trade_listing_items (
    guild_id,
    listing_id,
    unique_name,
    enchant,
    quality,
    name_ko,
    category,
    tier,
    quantity_total,
    quantity_available,
    unit_points,
    sort_order
  )
  select
    p_guild_id,
    v_listing_id,
    item->>'uniqueName',
    (item->>'enchant')::integer,
    nullif(item->>'quality', '')::integer,
    item->>'nameKo',
    nullif(item->>'category', ''),
    nullif(item->>'tier', '')::integer,
    (item->>'quantity')::integer,
    (item->>'quantity')::integer,
    (item->>'unitPoints')::integer,
    (ord - 1)::integer
  from jsonb_array_elements(p_items) with ordinality as input(item, ord);

  return v_listing_id;
end;
$$;

revoke all on function public.create_member_trade_listing_post(uuid, text, text, text, text, text, text, timestamptz, jsonb) from public;
revoke all on function public.create_member_trade_listing_post(uuid, text, text, text, text, text, text, timestamptz, jsonb) from anon, authenticated;
grant execute on function public.create_member_trade_listing_post(uuid, text, text, text, text, text, text, timestamptz, jsonb) to service_role;

create or replace function public.buy_member_trade_listing_items(
  p_listing_id uuid,
  p_guild_id uuid,
  p_buyer_discord_id text,
  p_buyer_username text,
  p_items jsonb,
  p_buyer_note text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing public.member_trade_listings%rowtype;
  v_order_id uuid;
  v_escrow_id uuid;
  v_total bigint := 0;
  v_balance integer;
  v_buyer_exists integer;
  v_selected_count integer;
  v_matched_count integer;
  v_total_quantity integer;
  v_first_item record;
  v_remaining integer;
  v_item_count integer;
  v_item record;
begin
  if jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0
     or jsonb_array_length(p_items) > 30 then
    raise exception 'INVALID_ITEMS';
  end if;

  drop table if exists pg_temp.member_trade_buy_items;
  create temporary table member_trade_buy_items (
    item_id uuid primary key,
    quantity integer not null check (quantity > 0)
  ) on commit drop;

  insert into member_trade_buy_items (item_id, quantity)
  select
    (item->>'itemId')::uuid,
    sum((item->>'quantity')::integer)::integer
  from jsonb_array_elements(p_items) as input(item)
  group by (item->>'itemId')::uuid;

  select count(*), coalesce(sum(quantity), 0)::integer
    into v_selected_count, v_total_quantity
    from member_trade_buy_items;

  if v_selected_count = 0 or v_total_quantity <= 0 then
    raise exception 'INVALID_QUANTITY';
  end if;

  select *
    into v_listing
    from public.member_trade_listings
   where id = p_listing_id
     and guild_id = p_guild_id
   for update;

  if not found then
    raise exception 'LISTING_NOT_FOUND';
  end if;
  if v_listing.status <> 'active'
     or v_listing.quantity_available <= 0
     or (v_listing.expires_at is not null and v_listing.expires_at <= now()) then
    raise exception 'LISTING_NOT_PURCHASABLE';
  end if;
  if v_listing.seller_discord_id = p_buyer_discord_id then
    raise exception 'SELF_TRADE';
  end if;

  select count(*)
    into v_buyer_exists
    from public.guild_avatars
   where guild_id = p_guild_id
     and discord_id = p_buyer_discord_id;
  if v_buyer_exists = 0 then
    raise exception 'BUYER_NOT_MEMBER';
  end if;

  select count(*)
    into v_matched_count
    from member_trade_buy_items bi
    join public.member_trade_listing_items li
      on li.id = bi.item_id
     and li.guild_id = p_guild_id
     and li.listing_id = p_listing_id;
  if v_matched_count <> v_selected_count then
    raise exception 'LISTING_ITEM_NOT_FOUND';
  end if;

  for v_item in
    select li.*, bi.quantity as buy_quantity
      from member_trade_buy_items bi
      join public.member_trade_listing_items li
        on li.id = bi.item_id
       and li.guild_id = p_guild_id
       and li.listing_id = p_listing_id
     order by li.sort_order, li.id
     for update of li
  loop
    if v_item.buy_quantity <= 0 then
      raise exception 'INVALID_QUANTITY';
    end if;
    if v_item.quantity_available < v_item.buy_quantity then
      raise exception 'LISTING_NOT_PURCHASABLE';
    end if;
    if v_item.unit_points > 2147483647 / v_item.buy_quantity then
      raise exception 'INVALID_TOTAL_POINTS';
    end if;
    v_total := v_total + (v_item.unit_points * v_item.buy_quantity)::bigint;
  end loop;

  if v_total <= 0 or v_total > 2147483647 then
    raise exception 'INVALID_TOTAL_POINTS';
  end if;

  select li.*, bi.quantity as buy_quantity
    into v_first_item
    from member_trade_buy_items bi
    join public.member_trade_listing_items li
      on li.id = bi.item_id
     and li.guild_id = p_guild_id
     and li.listing_id = p_listing_id
   order by li.sort_order, li.id
   limit 1;

  perform pg_advisory_xact_lock(hashtextextended(p_guild_id::text || ':' || p_buyer_discord_id, 0));
  v_balance := public.member_spendable_point_balance(p_guild_id, p_buyer_discord_id);
  if v_balance < v_total then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  update public.member_trade_listing_items li
     set quantity_available = li.quantity_available - bi.quantity,
         updated_at = now()
    from member_trade_buy_items bi
   where li.id = bi.item_id
     and li.guild_id = p_guild_id
     and li.listing_id = p_listing_id;

  select
    coalesce(sum(quantity_available), 0)::integer,
    count(*) filter (where quantity_available > 0)::integer
    into v_remaining, v_item_count
    from public.member_trade_listing_items
   where guild_id = p_guild_id
     and listing_id = p_listing_id;

  update public.member_trade_listings
     set quantity_available = v_remaining,
         item_count = v_item_count,
         status = case when v_remaining = 0 then 'sold_out' else status end,
         updated_at = now()
   where id = p_listing_id
     and guild_id = p_guild_id;

  insert into public.member_trade_orders (
    guild_id,
    listing_id,
    listing_title,
    buyer_discord_id,
    buyer_username,
    seller_discord_id,
    seller_username,
    unique_name,
    enchant,
    quality,
    name_ko,
    quantity,
    unit_points,
    total_points,
    buyer_note
  ) values (
    p_guild_id,
    p_listing_id,
    v_listing.title,
    p_buyer_discord_id,
    p_buyer_username,
    v_listing.seller_discord_id,
    v_listing.seller_username,
    v_first_item.unique_name,
    v_first_item.enchant,
    v_first_item.quality,
    v_first_item.name_ko,
    v_total_quantity,
    v_first_item.unit_points,
    v_total::integer,
    nullif(btrim(coalesce(p_buyer_note, '')), '')
  )
  returning id into v_order_id;

  insert into public.member_trade_order_items (
    guild_id,
    order_id,
    listing_item_id,
    unique_name,
    enchant,
    quality,
    name_ko,
    quantity,
    unit_points,
    total_points,
    sort_order
  )
  select
    p_guild_id,
    v_order_id,
    li.id,
    li.unique_name,
    li.enchant,
    li.quality,
    li.name_ko,
    bi.quantity,
    li.unit_points,
    (bi.quantity * li.unit_points)::integer,
    li.sort_order
  from member_trade_buy_items bi
  join public.member_trade_listing_items li
    on li.id = bi.item_id
   and li.guild_id = p_guild_id
   and li.listing_id = p_listing_id
  order by li.sort_order, li.id;

  insert into public.point_escrows (
    guild_id,
    discord_id,
    amount,
    source_kind,
    source_id
  ) values (
    p_guild_id,
    p_buyer_discord_id,
    v_total::integer,
    'member_trade_order',
    v_order_id
  )
  returning id into v_escrow_id;

  update public.member_trade_orders
     set escrow_id = v_escrow_id
   where id = v_order_id
     and guild_id = p_guild_id;

  insert into public.member_trade_events (guild_id, order_id, actor_discord_id, event_type, note)
  values (p_guild_id, v_order_id, p_buyer_discord_id, 'created', null);

  return v_order_id;
end;
$$;

revoke all on function public.buy_member_trade_listing_items(uuid, uuid, text, text, jsonb, text) from public;
revoke all on function public.buy_member_trade_listing_items(uuid, uuid, text, text, jsonb, text) from anon, authenticated;
grant execute on function public.buy_member_trade_listing_items(uuid, uuid, text, text, jsonb, text) to service_role;

create or replace function public.buy_member_trade_listing(
  p_listing_id uuid,
  p_guild_id uuid,
  p_buyer_discord_id text,
  p_buyer_username text,
  p_quantity integer,
  p_buyer_note text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_id uuid;
begin
  select id
    into v_item_id
    from public.member_trade_listing_items
   where listing_id = p_listing_id
     and guild_id = p_guild_id
     and quantity_available >= p_quantity
   order by sort_order, id
   limit 1;

  if v_item_id is null then
    raise exception 'LISTING_NOT_PURCHASABLE';
  end if;

  return public.buy_member_trade_listing_items(
    p_listing_id,
    p_guild_id,
    p_buyer_discord_id,
    p_buyer_username,
    jsonb_build_array(jsonb_build_object('itemId', v_item_id, 'quantity', p_quantity)),
    p_buyer_note
  );
end;
$$;

revoke all on function public.buy_member_trade_listing(uuid, uuid, text, text, integer, text) from public;
revoke all on function public.buy_member_trade_listing(uuid, uuid, text, text, integer, text) from anon, authenticated;
grant execute on function public.buy_member_trade_listing(uuid, uuid, text, text, integer, text) to service_role;

create or replace function public.cancel_member_trade_order(
  p_order_id uuid,
  p_guild_id uuid,
  p_actor_discord_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.member_trade_orders%rowtype;
  v_restore_count integer;
  v_remaining integer;
  v_item_count integer;
begin
  select *
    into v_order
    from public.member_trade_orders
   where id = p_order_id
     and guild_id = p_guild_id
     and status = 'awaiting_delivery'
     and (buyer_discord_id = p_actor_discord_id or seller_discord_id = p_actor_discord_id)
   for update;

  if not found then
    raise exception 'ORDER_NOT_CANCELLABLE';
  end if;

  update public.point_escrows
     set status = 'refunded',
         resolved_at = now(),
         resolved_by = p_actor_discord_id
   where id = v_order.escrow_id
     and guild_id = p_guild_id
     and status = 'held';

  if not found then
    raise exception 'ESCROW_NOT_HELD';
  end if;

  update public.member_trade_listing_items li
     set quantity_available = li.quantity_available + oi.quantity,
         updated_at = now()
    from public.member_trade_order_items oi
   where oi.order_id = v_order.id
     and oi.guild_id = p_guild_id
     and li.id = oi.listing_item_id
     and li.guild_id = p_guild_id;
  get diagnostics v_restore_count = row_count;

  if v_restore_count = 0 then
    update public.member_trade_listings
       set quantity_available = quantity_available + v_order.quantity,
           status = case when status = 'sold_out' then 'active' else status end,
           updated_at = now()
     where id = v_order.listing_id
       and guild_id = p_guild_id;
  else
    select
      coalesce(sum(quantity_available), 0)::integer,
      count(*) filter (where quantity_available > 0)::integer
      into v_remaining, v_item_count
      from public.member_trade_listing_items
     where guild_id = p_guild_id
       and listing_id = v_order.listing_id;

    update public.member_trade_listings
       set quantity_available = v_remaining,
           item_count = v_item_count,
           status = case when status = 'sold_out' and v_remaining > 0 then 'active' else status end,
           updated_at = now()
     where id = v_order.listing_id
       and guild_id = p_guild_id;
  end if;

  update public.member_trade_orders
     set status = 'cancelled',
         cancelled_at = now(),
         resolved_at = now(),
         resolved_by = p_actor_discord_id
   where id = p_order_id
     and guild_id = p_guild_id;

  insert into public.member_trade_events (guild_id, order_id, actor_discord_id, event_type, note)
  values (p_guild_id, p_order_id, p_actor_discord_id, 'cancelled', null);
end;
$$;

revoke all on function public.cancel_member_trade_order(uuid, uuid, text) from public;
revoke all on function public.cancel_member_trade_order(uuid, uuid, text) from anon, authenticated;
grant execute on function public.cancel_member_trade_order(uuid, uuid, text) to service_role;

create or replace function public.expire_member_trade_orders(
  p_now timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing_count integer := 0;
  v_order_count integer := 0;
  v_restore_count integer;
  v_remaining integer;
  v_item_count integer;
  v_order record;
begin
  update public.member_trade_listings
     set status = 'expired',
         updated_at = p_now,
         closed_at = p_now
   where status = 'active'
     and expires_at is not null
     and expires_at <= p_now;
  get diagnostics v_listing_count = row_count;

  for v_order in
    select *
      from public.member_trade_orders
     where status = 'awaiting_delivery'
       and delivery_due_at <= p_now
     for update
  loop
    update public.point_escrows
       set status = 'expired',
           resolved_at = p_now,
           resolved_by = 'system'
     where id = v_order.escrow_id
       and status = 'held';

    update public.member_trade_listing_items li
       set quantity_available = li.quantity_available + oi.quantity,
           updated_at = p_now
      from public.member_trade_order_items oi
     where oi.order_id = v_order.id
       and oi.guild_id = v_order.guild_id
       and li.id = oi.listing_item_id
       and li.guild_id = v_order.guild_id;
    get diagnostics v_restore_count = row_count;

    if v_restore_count = 0 then
      update public.member_trade_listings
         set quantity_available = quantity_available + v_order.quantity,
             status = case when status = 'sold_out' then 'active' else status end,
             updated_at = p_now
       where id = v_order.listing_id
         and guild_id = v_order.guild_id;
    else
      select
        coalesce(sum(quantity_available), 0)::integer,
        count(*) filter (where quantity_available > 0)::integer
        into v_remaining, v_item_count
        from public.member_trade_listing_items
       where guild_id = v_order.guild_id
         and listing_id = v_order.listing_id;

      update public.member_trade_listings
         set quantity_available = v_remaining,
             item_count = v_item_count,
             status = case when status = 'sold_out' and v_remaining > 0 then 'active' else status end,
             updated_at = p_now
       where id = v_order.listing_id
         and guild_id = v_order.guild_id;
    end if;

    update public.member_trade_orders
       set status = 'cancelled',
           cancelled_at = p_now,
           resolved_at = p_now,
           resolved_by = 'system'
     where id = v_order.id
       and guild_id = v_order.guild_id;

    insert into public.member_trade_events (guild_id, order_id, actor_discord_id, event_type, note)
    values (v_order.guild_id, v_order.id, 'system', 'expired', null);

    v_order_count := v_order_count + 1;
  end loop;

  return jsonb_build_object(
    'expiredListings', v_listing_count,
    'expiredOrders', v_order_count
  );
end;
$$;

revoke all on function public.expire_member_trade_orders(timestamptz) from public;
revoke all on function public.expire_member_trade_orders(timestamptz) from anon, authenticated;
grant execute on function public.expire_member_trade_orders(timestamptz) to service_role;
