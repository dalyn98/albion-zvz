-- 233: Member trade price offers.
--
-- Offers do not reserve stock or escrow points while pending. When the seller
-- accepts, the RPC re-checks listing stock and buyer spendable points, then
-- creates a normal member_trade_order with point escrow.

create table if not exists public.member_trade_price_offers (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  listing_id uuid not null references public.member_trade_listings(id) on delete cascade,
  listing_title text not null,
  buyer_discord_id text not null,
  buyer_username text not null,
  seller_discord_id text not null,
  seller_username text not null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  total_points integer not null check (total_points > 0),
  buyer_note text,
  seller_note text,
  accepted_order_id uuid references public.member_trade_orders(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  responded_at timestamptz,
  check (buyer_discord_id <> seller_discord_id)
);

create index if not exists member_trade_price_offers_listing_idx
  on public.member_trade_price_offers (guild_id, listing_id, created_at desc);

create index if not exists member_trade_price_offers_buyer_idx
  on public.member_trade_price_offers (guild_id, buyer_discord_id, created_at desc);

create index if not exists member_trade_price_offers_seller_idx
  on public.member_trade_price_offers (guild_id, seller_discord_id, created_at desc);

create index if not exists member_trade_price_offers_pending_seller_idx
  on public.member_trade_price_offers (guild_id, seller_discord_id, created_at desc)
  where status = 'pending';

create table if not exists public.member_trade_price_offer_items (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  offer_id uuid not null references public.member_trade_price_offers(id) on delete cascade,
  listing_item_id uuid references public.member_trade_listing_items(id) on delete set null,
  unique_name text not null,
  enchant integer not null check (enchant between 0 and 4),
  quality integer check (quality between 1 and 5),
  name_ko text not null,
  quantity integer not null check (quantity > 0),
  offered_unit_points integer not null check (offered_unit_points > 0),
  offered_total_points integer not null check (offered_total_points > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  check (offered_total_points = quantity * offered_unit_points)
);

create index if not exists member_trade_price_offer_items_offer_idx
  on public.member_trade_price_offer_items (guild_id, offer_id, sort_order);

alter table public.member_trade_price_offers enable row level security;
alter table public.member_trade_price_offer_items enable row level security;

create or replace function public.create_member_trade_price_offer(
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
  v_offer_id uuid;
  v_total bigint := 0;
  v_balance integer;
  v_buyer_exists integer;
  v_selected_count integer;
  v_distinct_count integer;
  v_matched_count integer;
  v_total_quantity integer;
  v_item record;
begin
  if jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0
     or jsonb_array_length(p_items) > 30 then
    raise exception 'INVALID_ITEMS';
  end if;

  drop table if exists pg_temp.member_trade_price_offer_input_items;
  create temporary table member_trade_price_offer_input_items (
    item_id uuid not null,
    quantity integer not null check (quantity > 0),
    offered_unit_points integer not null check (offered_unit_points > 0)
  ) on commit drop;

  insert into member_trade_price_offer_input_items (item_id, quantity, offered_unit_points)
  select
    (item->>'itemId')::uuid,
    (item->>'quantity')::integer,
    (item->>'unitPoints')::integer
  from jsonb_array_elements(p_items) as input(item);

  select count(*), count(distinct item_id), coalesce(sum(quantity), 0)::integer
    into v_selected_count, v_distinct_count, v_total_quantity
    from member_trade_price_offer_input_items;

  if v_selected_count = 0 or v_total_quantity <= 0 then
    raise exception 'INVALID_QUANTITY';
  end if;
  if v_selected_count <> v_distinct_count then
    raise exception 'INVALID_ITEMS';
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
    from member_trade_price_offer_input_items oi
    join public.member_trade_listing_items li
      on li.id = oi.item_id
     and li.guild_id = p_guild_id
     and li.listing_id = p_listing_id;
  if v_matched_count <> v_selected_count then
    raise exception 'LISTING_ITEM_NOT_FOUND';
  end if;

  for v_item in
    select
      li.*,
      oi.quantity as offer_quantity,
      oi.offered_unit_points as offer_unit_points
      from member_trade_price_offer_input_items oi
      join public.member_trade_listing_items li
        on li.id = oi.item_id
       and li.guild_id = p_guild_id
       and li.listing_id = p_listing_id
     order by li.sort_order, li.id
     for update of li
  loop
    if v_item.quantity_available < v_item.offer_quantity then
      raise exception 'LISTING_NOT_PURCHASABLE';
    end if;
    if v_item.offer_unit_points > 2147483647 / v_item.offer_quantity then
      raise exception 'INVALID_TOTAL_POINTS';
    end if;
    v_total := v_total + (v_item.offer_unit_points * v_item.offer_quantity)::bigint;
  end loop;

  if v_total <= 0 or v_total > 2147483647 then
    raise exception 'INVALID_TOTAL_POINTS';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_guild_id::text || ':' || p_buyer_discord_id, 0));
  v_balance := public.member_spendable_point_balance(p_guild_id, p_buyer_discord_id);
  if v_balance < v_total then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  insert into public.member_trade_price_offers (
    guild_id,
    listing_id,
    listing_title,
    buyer_discord_id,
    buyer_username,
    seller_discord_id,
    seller_username,
    total_points,
    buyer_note
  ) values (
    p_guild_id,
    p_listing_id,
    coalesce(v_listing.title, v_listing.name_ko),
    p_buyer_discord_id,
    p_buyer_username,
    v_listing.seller_discord_id,
    v_listing.seller_username,
    v_total::integer,
    nullif(btrim(coalesce(p_buyer_note, '')), '')
  )
  returning id into v_offer_id;

  insert into public.member_trade_price_offer_items (
    guild_id,
    offer_id,
    listing_item_id,
    unique_name,
    enchant,
    quality,
    name_ko,
    quantity,
    offered_unit_points,
    offered_total_points,
    sort_order
  )
  select
    p_guild_id,
    v_offer_id,
    li.id,
    li.unique_name,
    li.enchant,
    li.quality,
    li.name_ko,
    oi.quantity,
    oi.offered_unit_points,
    (oi.quantity * oi.offered_unit_points)::integer,
    li.sort_order
  from member_trade_price_offer_input_items oi
  join public.member_trade_listing_items li
    on li.id = oi.item_id
   and li.guild_id = p_guild_id
   and li.listing_id = p_listing_id
  order by li.sort_order, li.id;

  return v_offer_id;
end;
$$;

revoke all on function public.create_member_trade_price_offer(uuid, uuid, text, text, jsonb, text) from public;
revoke all on function public.create_member_trade_price_offer(uuid, uuid, text, text, jsonb, text) from anon, authenticated;
grant execute on function public.create_member_trade_price_offer(uuid, uuid, text, text, jsonb, text) to service_role;

create or replace function public.accept_member_trade_price_offer(
  p_offer_id uuid,
  p_guild_id uuid,
  p_seller_discord_id text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer public.member_trade_price_offers%rowtype;
  v_listing public.member_trade_listings%rowtype;
  v_order_id uuid;
  v_escrow_id uuid;
  v_total bigint := 0;
  v_balance integer;
  v_buyer_exists integer;
  v_selected_count integer;
  v_matched_count integer := 0;
  v_total_quantity integer;
  v_remaining integer;
  v_item_count integer;
  v_first_item record;
  v_item record;
begin
  select *
    into v_offer
    from public.member_trade_price_offers
   where id = p_offer_id
     and guild_id = p_guild_id
     and seller_discord_id = p_seller_discord_id
     and status = 'pending'
   for update;

  if not found then
    raise exception 'OFFER_NOT_PENDING';
  end if;

  if v_offer.expires_at <= now() then
    update public.member_trade_price_offers
       set status = 'expired',
           updated_at = now(),
           responded_at = now()
     where id = p_offer_id
       and guild_id = p_guild_id;
    raise exception 'OFFER_NOT_PENDING';
  end if;

  select *
    into v_listing
    from public.member_trade_listings
   where id = v_offer.listing_id
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

  select count(*)
    into v_buyer_exists
    from public.guild_avatars
   where guild_id = p_guild_id
     and discord_id = v_offer.buyer_discord_id;
  if v_buyer_exists = 0 then
    raise exception 'BUYER_NOT_MEMBER';
  end if;

  select count(*), coalesce(sum(quantity), 0)::integer
    into v_selected_count, v_total_quantity
    from public.member_trade_price_offer_items
   where guild_id = p_guild_id
     and offer_id = p_offer_id;
  if v_selected_count = 0 or v_total_quantity <= 0 then
    raise exception 'INVALID_ITEMS';
  end if;

  for v_item in
    select
      oi.*,
      li.quantity_available as listing_quantity_available
      from public.member_trade_price_offer_items oi
      join public.member_trade_listing_items li
        on li.id = oi.listing_item_id
       and li.guild_id = p_guild_id
       and li.listing_id = v_offer.listing_id
     where oi.guild_id = p_guild_id
       and oi.offer_id = p_offer_id
     order by oi.sort_order, oi.id
     for update of li
  loop
    v_matched_count := v_matched_count + 1;
    if v_item.listing_quantity_available < v_item.quantity then
      raise exception 'LISTING_NOT_PURCHASABLE';
    end if;
    if v_item.offered_unit_points > 2147483647 / v_item.quantity then
      raise exception 'INVALID_TOTAL_POINTS';
    end if;
    v_total := v_total + (v_item.offered_unit_points * v_item.quantity)::bigint;
  end loop;

  if v_matched_count <> v_selected_count then
    raise exception 'LISTING_ITEM_NOT_FOUND';
  end if;
  if v_total <= 0 or v_total > 2147483647 then
    raise exception 'INVALID_TOTAL_POINTS';
  end if;
  if v_total::integer <> v_offer.total_points then
    raise exception 'INVALID_TOTAL_POINTS';
  end if;

  select *
    into v_first_item
    from public.member_trade_price_offer_items
   where guild_id = p_guild_id
     and offer_id = p_offer_id
   order by sort_order, id
   limit 1;

  perform pg_advisory_xact_lock(hashtextextended(p_guild_id::text || ':' || v_offer.buyer_discord_id, 0));
  v_balance := public.member_spendable_point_balance(p_guild_id, v_offer.buyer_discord_id);
  if v_balance < v_total then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  update public.member_trade_listing_items li
     set quantity_available = li.quantity_available - oi.quantity,
         updated_at = now()
    from public.member_trade_price_offer_items oi
   where oi.guild_id = p_guild_id
     and oi.offer_id = p_offer_id
     and li.id = oi.listing_item_id
     and li.guild_id = p_guild_id
     and li.listing_id = v_offer.listing_id;

  select
    coalesce(sum(quantity_available), 0)::integer,
    count(*) filter (where quantity_available > 0)::integer
    into v_remaining, v_item_count
    from public.member_trade_listing_items
   where guild_id = p_guild_id
     and listing_id = v_offer.listing_id;

  update public.member_trade_listings
     set quantity_available = v_remaining,
         item_count = v_item_count,
         status = case when v_remaining = 0 then 'sold_out' else status end,
         updated_at = now()
   where id = v_offer.listing_id
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
    v_offer.listing_id,
    v_offer.listing_title,
    v_offer.buyer_discord_id,
    v_offer.buyer_username,
    v_offer.seller_discord_id,
    v_offer.seller_username,
    v_first_item.unique_name,
    v_first_item.enchant,
    v_first_item.quality,
    v_first_item.name_ko,
    v_total_quantity,
    v_first_item.offered_unit_points,
    v_total::integer,
    v_offer.buyer_note
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
    listing_item_id,
    unique_name,
    enchant,
    quality,
    name_ko,
    quantity,
    offered_unit_points,
    offered_total_points,
    sort_order
  from public.member_trade_price_offer_items
  where guild_id = p_guild_id
    and offer_id = p_offer_id
  order by sort_order, id;

  insert into public.point_escrows (
    guild_id,
    discord_id,
    amount,
    source_kind,
    source_id
  ) values (
    p_guild_id,
    v_offer.buyer_discord_id,
    v_total::integer,
    'member_trade_order',
    v_order_id
  )
  returning id into v_escrow_id;

  update public.member_trade_orders
     set escrow_id = v_escrow_id
   where id = v_order_id
     and guild_id = p_guild_id;

  update public.member_trade_price_offers
     set status = 'accepted',
         accepted_order_id = v_order_id,
         updated_at = now(),
         responded_at = now()
   where id = p_offer_id
     and guild_id = p_guild_id;

  insert into public.member_trade_events (guild_id, order_id, actor_discord_id, event_type, note)
  values (p_guild_id, v_order_id, p_seller_discord_id, 'created', 'price_offer_accepted');

  return v_order_id;
end;
$$;

revoke all on function public.accept_member_trade_price_offer(uuid, uuid, text) from public;
revoke all on function public.accept_member_trade_price_offer(uuid, uuid, text) from anon, authenticated;
grant execute on function public.accept_member_trade_price_offer(uuid, uuid, text) to service_role;

create or replace function public.decline_member_trade_price_offer(
  p_offer_id uuid,
  p_guild_id uuid,
  p_seller_discord_id text,
  p_seller_note text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.member_trade_price_offers
     set status = 'declined',
         seller_note = nullif(btrim(coalesce(p_seller_note, '')), ''),
         updated_at = now(),
         responded_at = now()
   where id = p_offer_id
     and guild_id = p_guild_id
     and seller_discord_id = p_seller_discord_id
     and status = 'pending';

  if not found then
    raise exception 'OFFER_NOT_PENDING';
  end if;
end;
$$;

revoke all on function public.decline_member_trade_price_offer(uuid, uuid, text, text) from public;
revoke all on function public.decline_member_trade_price_offer(uuid, uuid, text, text) from anon, authenticated;
grant execute on function public.decline_member_trade_price_offer(uuid, uuid, text, text) to service_role;

create or replace function public.cancel_member_trade_price_offer(
  p_offer_id uuid,
  p_guild_id uuid,
  p_buyer_discord_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.member_trade_price_offers
     set status = 'cancelled',
         updated_at = now(),
         responded_at = now()
   where id = p_offer_id
     and guild_id = p_guild_id
     and buyer_discord_id = p_buyer_discord_id
     and status = 'pending';

  if not found then
    raise exception 'OFFER_NOT_PENDING';
  end if;
end;
$$;

revoke all on function public.cancel_member_trade_price_offer(uuid, uuid, text) from public;
revoke all on function public.cancel_member_trade_price_offer(uuid, uuid, text) from anon, authenticated;
grant execute on function public.cancel_member_trade_price_offer(uuid, uuid, text) to service_role;
