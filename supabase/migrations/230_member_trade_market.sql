-- 230: Member-to-member item trading with point escrow.
--
-- Guild shop remains guild-owned inventory. Member trade listings are
-- member-owned promises, so points are held in point_escrows and only written
-- to point_ledger when the buyer confirms receipt or an admin releases a
-- disputed order.

create table if not exists public.point_escrows (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  discord_id text not null,
  amount integer not null check (amount > 0),
  status text not null default 'held'
    check (status in ('held', 'released', 'refunded', 'expired')),
  source_kind text not null
    check (source_kind in ('member_trade_order')),
  source_id uuid not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text
);

create index if not exists point_escrows_member_active_idx
  on public.point_escrows (guild_id, discord_id, created_at desc)
  where status = 'held';

create unique index if not exists point_escrows_source_held_idx
  on public.point_escrows (guild_id, source_kind, source_id)
  where status = 'held';

create table if not exists public.member_trade_listings (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  seller_discord_id text not null,
  seller_username text not null,
  unique_name text not null,
  enchant integer not null check (enchant between 0 and 4),
  quality integer check (quality between 1 and 5),
  name_ko text not null,
  category text,
  tier integer,
  quantity_total integer not null check (quantity_total > 0),
  quantity_available integer not null check (quantity_available >= 0),
  unit_points integer not null check (unit_points > 0),
  status text not null default 'active'
    check (status in ('active', 'paused', 'sold_out', 'closed', 'expired')),
  city text,
  delivery_note text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);

create index if not exists member_trade_listings_active_idx
  on public.member_trade_listings (guild_id, status, created_at desc)
  where status = 'active';

create index if not exists member_trade_listings_item_idx
  on public.member_trade_listings (guild_id, unique_name, enchant, status);

create index if not exists member_trade_listings_seller_idx
  on public.member_trade_listings (guild_id, seller_discord_id, created_at desc);

create table if not exists public.member_trade_orders (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  listing_id uuid not null references public.member_trade_listings(id) on delete restrict,
  escrow_id uuid references public.point_escrows(id) on delete restrict,
  buyer_discord_id text not null,
  buyer_username text not null,
  seller_discord_id text not null,
  seller_username text not null,
  unique_name text not null,
  enchant integer not null check (enchant between 0 and 4),
  quality integer check (quality between 1 and 5),
  name_ko text not null,
  quantity integer not null check (quantity > 0),
  unit_points integer not null check (unit_points > 0),
  total_points integer not null check (total_points > 0),
  status text not null default 'awaiting_delivery'
    check (status in ('awaiting_delivery', 'delivered', 'completed', 'cancelled', 'disputed', 'refunded')),
  buyer_note text,
  seller_delivery_note text,
  dispute_reason text,
  admin_note text,
  delivery_due_at timestamptz not null default (now() + interval '48 hours'),
  delivered_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  disputed_at timestamptz,
  resolved_at timestamptz,
  resolved_by text,
  created_at timestamptz not null default now()
);

create index if not exists member_trade_orders_buyer_idx
  on public.member_trade_orders (guild_id, buyer_discord_id, created_at desc);

create index if not exists member_trade_orders_seller_idx
  on public.member_trade_orders (guild_id, seller_discord_id, created_at desc);

create index if not exists member_trade_orders_status_idx
  on public.member_trade_orders (guild_id, status, created_at desc);

create table if not exists public.member_trade_events (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  order_id uuid not null references public.member_trade_orders(id) on delete cascade,
  actor_discord_id text,
  event_type text not null
    check (event_type in (
      'created',
      'delivered',
      'completed',
      'cancelled',
      'disputed',
      'admin_released',
      'admin_refunded',
      'expired'
    )),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists member_trade_events_order_idx
  on public.member_trade_events (guild_id, order_id, created_at asc);

alter table public.point_escrows enable row level security;
alter table public.member_trade_listings enable row level security;
alter table public.member_trade_orders enable row level security;
alter table public.member_trade_events enable row level security;

alter table public.point_ledger
  drop constraint if exists point_ledger_reason_check;

alter table public.point_ledger
  add constraint point_ledger_reason_check
  check (reason in (
    'regear_approved',
    'exchange_paid',
    'admin_adjust',
    'transfer_in',
    'transfer_out',
    'donation_approved',
    'event_payout_approved',
    'craft_reimbursement',
    'craft_order_payout',
    'shop_purchase',
    'member_trade_purchase',
    'member_trade_sale'
  ));

create or replace function public.member_spendable_point_balance(
  p_guild_id uuid,
  p_discord_id text
) returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    0,
    least(
      2147483647::bigint,
      coalesce((
        select sum(delta)::bigint
          from public.point_ledger
         where guild_id = p_guild_id
           and discord_id = p_discord_id
      ), 0)
      - coalesce((
        select sum(amount)::bigint
          from public.point_escrows
         where guild_id = p_guild_id
           and discord_id = p_discord_id
           and status = 'held'
      ), 0)
    )
  )::integer;
$$;

revoke all on function public.member_spendable_point_balance(uuid, text) from public;
revoke all on function public.member_spendable_point_balance(uuid, text) from anon, authenticated;
grant execute on function public.member_spendable_point_balance(uuid, text) to service_role;

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
  v_listing public.member_trade_listings%rowtype;
  v_order_id uuid;
  v_escrow_id uuid;
  v_total integer;
  v_balance integer;
  v_buyer_exists integer;
begin
  if p_quantity is null or p_quantity <= 0 then
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
     or v_listing.quantity_available < p_quantity
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

  if v_listing.unit_points > 2147483647 / p_quantity then
    raise exception 'INVALID_TOTAL_POINTS';
  end if;
  v_total := v_listing.unit_points * p_quantity;

  perform pg_advisory_xact_lock(hashtextextended(p_guild_id::text || ':' || p_buyer_discord_id, 0));
  v_balance := public.member_spendable_point_balance(p_guild_id, p_buyer_discord_id);
  if v_balance < v_total then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  update public.member_trade_listings
     set quantity_available = quantity_available - p_quantity,
         status = case when quantity_available - p_quantity = 0 then 'sold_out' else status end,
         updated_at = now()
   where id = p_listing_id
     and guild_id = p_guild_id;

  insert into public.member_trade_orders (
    guild_id,
    listing_id,
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
    p_buyer_discord_id,
    p_buyer_username,
    v_listing.seller_discord_id,
    v_listing.seller_username,
    v_listing.unique_name,
    v_listing.enchant,
    v_listing.quality,
    v_listing.name_ko,
    p_quantity,
    v_listing.unit_points,
    v_total,
    nullif(btrim(coalesce(p_buyer_note, '')), '')
  )
  returning id into v_order_id;

  insert into public.point_escrows (
    guild_id,
    discord_id,
    amount,
    source_kind,
    source_id
  ) values (
    p_guild_id,
    p_buyer_discord_id,
    v_total,
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

revoke all on function public.buy_member_trade_listing(uuid, uuid, text, text, integer, text) from public;
revoke all on function public.buy_member_trade_listing(uuid, uuid, text, text, integer, text) from anon, authenticated;
grant execute on function public.buy_member_trade_listing(uuid, uuid, text, text, integer, text) to service_role;

create or replace function public.mark_member_trade_delivered(
  p_order_id uuid,
  p_guild_id uuid,
  p_seller_discord_id text,
  p_delivery_note text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.member_trade_orders
     set status = 'delivered',
         delivered_at = now(),
         seller_delivery_note = nullif(btrim(coalesce(p_delivery_note, '')), '')
   where id = p_order_id
     and guild_id = p_guild_id
     and seller_discord_id = p_seller_discord_id
     and status = 'awaiting_delivery';

  if not found then
    raise exception 'ORDER_NOT_AWAITING_DELIVERY';
  end if;

  insert into public.member_trade_events (guild_id, order_id, actor_discord_id, event_type, note)
  values (p_guild_id, p_order_id, p_seller_discord_id, 'delivered', nullif(btrim(coalesce(p_delivery_note, '')), ''));
end;
$$;

revoke all on function public.mark_member_trade_delivered(uuid, uuid, text, text) from public;
revoke all on function public.mark_member_trade_delivered(uuid, uuid, text, text) from anon, authenticated;
grant execute on function public.mark_member_trade_delivered(uuid, uuid, text, text) to service_role;

create or replace function public.complete_member_trade_order(
  p_order_id uuid,
  p_guild_id uuid,
  p_buyer_discord_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.member_trade_orders%rowtype;
  v_escrow public.point_escrows%rowtype;
begin
  select *
    into v_order
    from public.member_trade_orders
   where id = p_order_id
     and guild_id = p_guild_id
     and buyer_discord_id = p_buyer_discord_id
     and status = 'delivered'
   for update;

  if not found then
    raise exception 'ORDER_NOT_DELIVERED';
  end if;

  select *
    into v_escrow
    from public.point_escrows
   where id = v_order.escrow_id
     and guild_id = p_guild_id
     and status = 'held'
   for update;

  if not found then
    raise exception 'ESCROW_NOT_HELD';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_guild_id::text || ':' || v_order.buyer_discord_id, 0));
  perform pg_advisory_xact_lock(hashtextextended(p_guild_id::text || ':' || v_order.seller_discord_id, 0));

  insert into public.point_ledger (guild_id, discord_id, delta, reason, ref_id)
  values
    (p_guild_id, v_order.buyer_discord_id, -v_order.total_points, 'member_trade_purchase', p_order_id),
    (p_guild_id, v_order.seller_discord_id, v_order.total_points, 'member_trade_sale', p_order_id);

  update public.point_escrows
     set status = 'released',
         resolved_at = now(),
         resolved_by = p_buyer_discord_id
   where id = v_escrow.id
     and guild_id = p_guild_id;

  update public.member_trade_orders
     set status = 'completed',
         completed_at = now(),
         resolved_at = now(),
         resolved_by = p_buyer_discord_id
   where id = p_order_id
     and guild_id = p_guild_id;

  insert into public.member_trade_events (guild_id, order_id, actor_discord_id, event_type, note)
  values (p_guild_id, p_order_id, p_buyer_discord_id, 'completed', null);
end;
$$;

revoke all on function public.complete_member_trade_order(uuid, uuid, text) from public;
revoke all on function public.complete_member_trade_order(uuid, uuid, text) from anon, authenticated;
grant execute on function public.complete_member_trade_order(uuid, uuid, text) to service_role;

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

  update public.member_trade_listings
     set quantity_available = quantity_available + v_order.quantity,
         status = case when status = 'sold_out' then 'active' else status end,
         updated_at = now()
   where id = v_order.listing_id
     and guild_id = p_guild_id;

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

create or replace function public.open_member_trade_dispute(
  p_order_id uuid,
  p_guild_id uuid,
  p_buyer_discord_id text,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.member_trade_orders
     set status = 'disputed',
         disputed_at = now(),
         dispute_reason = nullif(btrim(coalesce(p_reason, '')), '')
   where id = p_order_id
     and guild_id = p_guild_id
     and buyer_discord_id = p_buyer_discord_id
     and status = 'delivered';

  if not found then
    raise exception 'ORDER_NOT_DISPUTABLE';
  end if;

  insert into public.member_trade_events (guild_id, order_id, actor_discord_id, event_type, note)
  values (p_guild_id, p_order_id, p_buyer_discord_id, 'disputed', nullif(btrim(coalesce(p_reason, '')), ''));
end;
$$;

revoke all on function public.open_member_trade_dispute(uuid, uuid, text, text) from public;
revoke all on function public.open_member_trade_dispute(uuid, uuid, text, text) from anon, authenticated;
grant execute on function public.open_member_trade_dispute(uuid, uuid, text, text) to service_role;

create or replace function public.resolve_member_trade_dispute(
  p_order_id uuid,
  p_guild_id uuid,
  p_admin_id text,
  p_resolution text,
  p_admin_note text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.member_trade_orders%rowtype;
begin
  if p_resolution not in ('release', 'refund') then
    raise exception 'INVALID_RESOLUTION';
  end if;

  select *
    into v_order
    from public.member_trade_orders
   where id = p_order_id
     and guild_id = p_guild_id
     and status = 'disputed'
   for update;

  if not found then
    raise exception 'ORDER_NOT_DISPUTED';
  end if;

  if p_resolution = 'release' then
    update public.point_escrows
       set status = 'released',
           resolved_at = now(),
           resolved_by = p_admin_id
     where id = v_order.escrow_id
       and guild_id = p_guild_id
       and status = 'held';
    if not found then
      raise exception 'ESCROW_NOT_HELD';
    end if;

    insert into public.point_ledger (guild_id, discord_id, delta, reason, ref_id)
    values
      (p_guild_id, v_order.buyer_discord_id, -v_order.total_points, 'member_trade_purchase', p_order_id),
      (p_guild_id, v_order.seller_discord_id, v_order.total_points, 'member_trade_sale', p_order_id);

    update public.member_trade_orders
       set status = 'completed',
           completed_at = now(),
           resolved_at = now(),
           resolved_by = p_admin_id,
           admin_note = nullif(btrim(coalesce(p_admin_note, '')), '')
     where id = p_order_id
       and guild_id = p_guild_id;

    insert into public.member_trade_events (guild_id, order_id, actor_discord_id, event_type, note)
    values (p_guild_id, p_order_id, p_admin_id, 'admin_released', nullif(btrim(coalesce(p_admin_note, '')), ''));
  else
    update public.point_escrows
       set status = 'refunded',
           resolved_at = now(),
           resolved_by = p_admin_id
     where id = v_order.escrow_id
       and guild_id = p_guild_id
       and status = 'held';
    if not found then
      raise exception 'ESCROW_NOT_HELD';
    end if;

    update public.member_trade_orders
       set status = 'refunded',
           resolved_at = now(),
           resolved_by = p_admin_id,
           admin_note = nullif(btrim(coalesce(p_admin_note, '')), '')
     where id = p_order_id
       and guild_id = p_guild_id;

    insert into public.member_trade_events (guild_id, order_id, actor_discord_id, event_type, note)
    values (p_guild_id, p_order_id, p_admin_id, 'admin_refunded', nullif(btrim(coalesce(p_admin_note, '')), ''));
  end if;
end;
$$;

revoke all on function public.resolve_member_trade_dispute(uuid, uuid, text, text, text) from public;
revoke all on function public.resolve_member_trade_dispute(uuid, uuid, text, text, text) from anon, authenticated;
grant execute on function public.resolve_member_trade_dispute(uuid, uuid, text, text, text) to service_role;

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

    update public.member_trade_listings
       set quantity_available = quantity_available + v_order.quantity,
           status = case when status = 'sold_out' then 'active' else status end,
           updated_at = p_now
     where id = v_order.listing_id
       and guild_id = v_order.guild_id;

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

-- Existing point-spending RPCs must respect active escrows.

create or replace function public.approve_exchange_request(
  p_id uuid,
  p_admin_id text,
  p_admin_username text,
  p_guild_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_discord text;
  v_silver integer;
  v_balance integer;
begin
  select discord_id, silver
    into v_discord, v_silver
    from public.exchange_requests
   where id = p_id
     and guild_id = p_guild_id
     and status = 'pending'
   for update;

  if v_discord is null then
    raise exception 'EXCHANGE_NOT_PENDING';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_guild_id::text || ':' || v_discord, 0));
  v_balance := public.member_spendable_point_balance(p_guild_id, v_discord);
  if v_balance < v_silver then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  update public.exchange_requests
     set status = 'approved',
         resolved_at = now(),
         handled_by = p_admin_id,
         handled_by_username = p_admin_username
   where id = p_id
     and guild_id = p_guild_id;

  insert into public.point_ledger (guild_id, discord_id, delta, reason, ref_id)
       values (p_guild_id, v_discord, -v_silver, 'exchange_paid', p_id);
end;
$$;

create or replace function public.transfer_points(
  p_from text,
  p_guild_id uuid,
  p_transfers jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref uuid := gen_random_uuid();
  v_total integer := 0;
  v_balance integer;
  v_recipient record;
  v_valid_ids integer;
  v_distinct integer;
  v_exists integer;
begin
  if p_from is null or p_from = '' then
    raise exception 'INVALID_SENDER';
  end if;
  if p_guild_id is null then
    raise exception 'INVALID_GUILD';
  end if;
  if jsonb_typeof(p_transfers) <> 'array' or jsonb_array_length(p_transfers) = 0 then
    raise exception 'NO_RECIPIENTS';
  end if;

  select count(*) into v_exists
    from public.guild_avatars
   where guild_id = p_guild_id
     and discord_id = p_from;
  if v_exists = 0 then
    raise exception 'SENDER_NOT_MEMBER';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_guild_id::text || ':' || p_from, 0));

  for v_recipient in
    select
      (elem->>'discord_id') as discord_id,
      coalesce(elem->>'username', '') as username,
      ((elem->>'amount')::numeric)::integer as amount,
      coalesce(elem->>'memo', null) as memo
    from jsonb_array_elements(p_transfers) as elem
  loop
    if v_recipient.discord_id is null or v_recipient.discord_id = '' then
      raise exception 'MEMBER_NOT_FOUND';
    end if;
    if v_recipient.discord_id = p_from then
      raise exception 'SELF_TRANSFER';
    end if;
    if v_recipient.amount is null or v_recipient.amount <= 0 then
      raise exception 'INVALID_AMOUNT';
    end if;
    v_total := v_total + v_recipient.amount;
  end loop;

  select count(*)
    into v_valid_ids
    from public.guild_avatars
   where guild_id = p_guild_id
     and discord_id in (
       select elem->>'discord_id'
         from jsonb_array_elements(p_transfers) as elem
     );
  select count(distinct elem->>'discord_id')
    into v_distinct
    from jsonb_array_elements(p_transfers) as elem;
  if v_valid_ids <> v_distinct then
    raise exception 'MEMBER_NOT_FOUND';
  end if;

  v_balance := public.member_spendable_point_balance(p_guild_id, p_from);
  if v_balance < v_total then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  for v_recipient in
    select
      (elem->>'discord_id') as discord_id,
      coalesce(elem->>'username', '') as username,
      ((elem->>'amount')::numeric)::integer as amount,
      coalesce(elem->>'memo', null) as memo
    from jsonb_array_elements(p_transfers) as elem
  loop
    insert into public.point_ledger (guild_id, discord_id, delta, reason, ref_id, memo)
    values (p_guild_id, p_from, -v_recipient.amount, 'transfer_out', v_ref,
            coalesce(v_recipient.memo, v_recipient.username));
    insert into public.point_ledger (guild_id, discord_id, delta, reason, ref_id, memo)
    values (p_guild_id, v_recipient.discord_id, v_recipient.amount, 'transfer_in', v_ref,
            coalesce(v_recipient.memo, v_recipient.username));
  end loop;

  return v_ref;
end;
$$;

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

  perform pg_advisory_xact_lock(hashtextextended(v_guild::text || ':' || v_discord, 0));
  v_balance := public.member_spendable_point_balance(v_guild, v_discord);
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
        raise exception 'INSUFFICIENT_STOCK: % @%', v_line.unique_name, v_line.enchant;
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

drop function if exists public.admin_pending_badge_counts(uuid);

create function public.admin_pending_badge_counts(
  p_guild_id uuid
)
returns table (
  regear bigint,
  exchange bigint,
  donation bigint,
  shop bigint,
  member_trade bigint,
  event_payout bigint,
  craft bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (
      select count(*)::bigint
      from public.regear_requests rr
      where rr.guild_id = p_guild_id
        and rr.status = 'pending'
    ) as regear,
    (
      select count(*)::bigint
      from public.exchange_requests er
      where er.guild_id = p_guild_id
        and er.status = 'pending'
    ) as exchange,
    (
      select count(*)::bigint
      from public.donation_requests dr
      where dr.guild_id = p_guild_id
        and dr.status = 'pending'
    ) as donation,
    (
      select count(*)::bigint
      from public.shop_orders so
      where so.guild_id = p_guild_id
        and so.status = 'pending'
    ) as shop,
    (
      select count(*)::bigint
      from public.member_trade_orders mto
      where mto.guild_id = p_guild_id
        and mto.status = 'disputed'
    ) as member_trade,
    (
      select count(*)::bigint
      from public.event_payout_requests epr
      where epr.guild_id = p_guild_id
        and epr.status = 'pending'
    ) as event_payout,
    (
      select count(*)::bigint
      from public.craft_tasks ct
      where ct.guild_id = p_guild_id
        and ct.task_kind = 'guild_order'
        and ct.status = 'delivered'
    ) as craft;
$$;

revoke all on function public.admin_pending_badge_counts(uuid) from public;
revoke all on function public.admin_pending_badge_counts(uuid) from anon, authenticated;
grant execute on function public.admin_pending_badge_counts(uuid) to service_role;
