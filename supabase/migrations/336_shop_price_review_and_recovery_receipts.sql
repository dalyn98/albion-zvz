-- 336: Make uncertain shop price increases member-confirmed and move destructive
-- inventory repair operations behind idempotent, auditable recovery wrappers.

alter table public.shop_orders
  add column if not exists original_total_points integer,
  add column if not exists price_frozen_at timestamptz;

update public.shop_orders
   set original_total_points = total_points
 where original_total_points is null;

update public.shop_orders
   set price_frozen_at = coalesce(resolved_at, created_at)
 where status = 'approved'
   and price_frozen_at is null;

alter table public.shop_orders
  alter column original_total_points set not null;

alter table public.shop_orders
  drop constraint if exists shop_orders_original_total_points_check;

alter table public.shop_orders
  add constraint shop_orders_original_total_points_check
  check (original_total_points > 0);

create unique index if not exists shop_orders_guild_id_id_key
  on public.shop_orders (guild_id, id);

create or replace function public.guard_shop_order_price_snapshot()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.original_total_points := coalesce(new.original_total_points, new.total_points);
    if new.status = 'approved' then
      new.price_frozen_at := coalesce(new.price_frozen_at, now());
    end if;
    return new;
  end if;

  if new.original_total_points is distinct from old.original_total_points then
    raise exception 'ORIGINAL_PRICE_IMMUTABLE';
  end if;

  if old.status <> 'pending'
     and new.total_points is distinct from old.total_points then
    raise exception 'APPROVED_PRICE_FROZEN';
  end if;

  if old.status = 'pending' and new.status = 'approved' then
    new.price_frozen_at := coalesce(new.price_frozen_at, now());
  elsif old.status <> 'approved' and new.status <> 'approved' then
    new.price_frozen_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_shop_order_price_snapshot on public.shop_orders;
create trigger trg_guard_shop_order_price_snapshot
before insert or update on public.shop_orders
for each row execute function public.guard_shop_order_price_snapshot();

revoke all on function public.guard_shop_order_price_snapshot() from public, anon, authenticated;

create table if not exists public.shop_order_price_reviews (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  order_id uuid not null,
  requested_total_points integer not null check (requested_total_points > 0),
  proposed_total_points integer not null check (proposed_total_points > requested_total_points),
  status text not null default 'awaiting_member'
    check (status in ('awaiting_member', 'member_confirmed', 'applied', 'superseded')),
  proposal_note text,
  proposed_by text not null,
  idempotency_key uuid not null,
  confirmation_idempotency_key uuid,
  member_confirmed_at timestamptz,
  applied_at timestamptz,
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shop_order_price_reviews_order_tenant_fkey
    foreign key (guild_id, order_id)
    references public.shop_orders(guild_id, id)
    on delete cascade,
  constraint shop_order_price_reviews_idempotency_key
    unique (guild_id, idempotency_key)
);

create unique index if not exists shop_order_price_reviews_active_order_key
  on public.shop_order_price_reviews (guild_id, order_id)
  where status in ('awaiting_member', 'member_confirmed');

create unique index if not exists shop_order_price_reviews_confirmation_key
  on public.shop_order_price_reviews (guild_id, confirmation_idempotency_key)
  where confirmation_idempotency_key is not null;

create index if not exists shop_order_price_reviews_member_queue_idx
  on public.shop_order_price_reviews (guild_id, order_id, status, created_at desc);

alter table public.shop_order_price_reviews enable row level security;
revoke all on table public.shop_order_price_reviews from public, anon, authenticated;
grant select, insert, update on table public.shop_order_price_reviews to service_role;

create or replace function public.propose_shop_order_price_review(
  p_guild_id uuid,
  p_order_id uuid,
  p_admin_id text,
  p_proposed_total_points integer,
  p_proposal_note text,
  p_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.shop_orders%rowtype;
  v_existing public.shop_order_price_reviews%rowtype;
  v_review_id uuid;
  v_note text := nullif(btrim(coalesce(p_proposal_note, '')), '');
begin
  if p_guild_id is null or p_order_id is null or p_idempotency_key is null then
    raise exception 'INVALID_ARGUMENT' using errcode = '22023';
  end if;
  if p_admin_id is null or btrim(p_admin_id) = '' then
    raise exception 'ADMIN_REQUIRED' using errcode = '22023';
  end if;
  if p_proposed_total_points is null or p_proposed_total_points <= 0 then
    raise exception 'INVALID_TOTAL_POINTS' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_guild_id::text || ':' || p_order_id::text, 0));

  select * into v_existing
    from public.shop_order_price_reviews
   where guild_id = p_guild_id
     and idempotency_key = p_idempotency_key;

  if found then
    if v_existing.order_id <> p_order_id
       or v_existing.proposed_by <> p_admin_id
       or v_existing.proposed_total_points <> p_proposed_total_points
       or v_existing.proposal_note is distinct from v_note then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = '23505';
    end if;
    return jsonb_build_object('review_id', v_existing.id, 'replayed', true);
  end if;

  select * into v_order
    from public.shop_orders
   where guild_id = p_guild_id
     and id = p_order_id
     and status = 'pending'
   for update;

  if not found then
    raise exception 'ORDER_NOT_PENDING';
  end if;
  if p_proposed_total_points <= v_order.total_points then
    raise exception 'PRICE_RECONFIRMATION_NOT_REQUIRED';
  end if;

  update public.shop_order_price_reviews
     set status = 'superseded',
         superseded_at = now(),
         updated_at = now()
   where guild_id = p_guild_id
     and order_id = p_order_id
     and status in ('awaiting_member', 'member_confirmed');

  insert into public.shop_order_price_reviews (
    guild_id,
    order_id,
    requested_total_points,
    proposed_total_points,
    proposal_note,
    proposed_by,
    idempotency_key
  ) values (
    p_guild_id,
    p_order_id,
    v_order.total_points,
    p_proposed_total_points,
    v_note,
    p_admin_id,
    p_idempotency_key
  )
  returning id into v_review_id;

  return jsonb_build_object('review_id', v_review_id, 'replayed', false);
end;
$$;

create or replace function public.confirm_shop_order_price_review(
  p_guild_id uuid,
  p_review_id uuid,
  p_discord_id text,
  p_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_review public.shop_order_price_reviews%rowtype;
  v_order public.shop_orders%rowtype;
  v_spendable bigint;
begin
  if p_guild_id is null or p_review_id is null or p_idempotency_key is null then
    raise exception 'INVALID_ARGUMENT' using errcode = '22023';
  end if;
  if p_discord_id is null or btrim(p_discord_id) = '' then
    raise exception 'MEMBER_REQUIRED' using errcode = '22023';
  end if;

  select order_id into v_order_id
    from public.shop_order_price_reviews
   where guild_id = p_guild_id
     and id = p_review_id;
  if v_order_id is null then
    raise exception 'PRICE_REVIEW_NOT_FOUND';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_guild_id::text || ':' || v_order_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(p_guild_id::text || ':' || p_discord_id, 0));

  select * into v_review
    from public.shop_order_price_reviews
   where guild_id = p_guild_id
     and id = p_review_id
   for update;

  if v_review.status = 'member_confirmed'
     and v_review.confirmation_idempotency_key = p_idempotency_key then
    return jsonb_build_object('review_id', v_review.id, 'replayed', true);
  end if;
  if v_review.status <> 'awaiting_member' then
    raise exception 'PRICE_REVIEW_NOT_CONFIRMABLE';
  end if;

  select * into v_order
    from public.shop_orders
   where guild_id = p_guild_id
     and id = v_review.order_id
     and status = 'pending'
   for update;

  if not found or v_order.discord_id <> p_discord_id then
    raise exception 'PRICE_REVIEW_NOT_OWNED';
  end if;
  if v_review.requested_total_points <> v_order.total_points
     or v_review.proposed_total_points <= v_order.total_points then
    raise exception 'PRICE_REVIEW_STALE';
  end if;

  v_spendable := public.member_spendable_point_balance(p_guild_id, p_discord_id);
  if v_spendable < v_review.proposed_total_points then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  update public.shop_order_price_reviews
     set status = 'member_confirmed',
         confirmation_idempotency_key = p_idempotency_key,
         member_confirmed_at = now(),
         updated_at = now()
   where id = v_review.id;

  return jsonb_build_object('review_id', v_review.id, 'replayed', false);
end;
$$;

create or replace function public.supersede_shop_order_price_review_on_close()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'pending' and new.status <> 'pending' then
    update public.shop_order_price_reviews
       set status = 'superseded',
           superseded_at = now(),
           updated_at = now()
     where guild_id = new.guild_id
       and order_id = new.id
       and status in ('awaiting_member', 'member_confirmed');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_supersede_shop_order_price_review_on_close on public.shop_orders;
create trigger trg_supersede_shop_order_price_review_on_close
after update of status on public.shop_orders
for each row execute function public.supersede_shop_order_price_review_on_close();

revoke all on function public.supersede_shop_order_price_review_on_close() from public, anon, authenticated;

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
  v_balance bigint;
  v_guild uuid;
  v_stock_reserved_at timestamptz;
  v_review_id uuid;
  v_now timestamptz := now();
  v_line record;
  v_log record;
  v_remaining integer;
  v_match_qty integer;
begin
  select discord_id into v_discord
    from public.shop_orders
   where id = p_id
     and guild_id = p_guild_id
     and status = 'pending';

  if v_discord is null then
    raise exception 'ORDER_NOT_PENDING';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_guild_id::text || ':' || p_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(p_guild_id::text || ':' || v_discord, 0));

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

  if v_charge_total > v_requested_total then
    select id into v_review_id
      from public.shop_order_price_reviews
     where guild_id = v_guild
       and order_id = p_id
       and status = 'member_confirmed'
       and requested_total_points = v_requested_total
       and proposed_total_points = v_charge_total
     for update;
    if v_review_id is null then
      raise exception 'PRICE_RECONFIRMATION_REQUIRED';
    end if;
  end if;

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

  if v_review_id is not null then
    update public.shop_order_price_reviews
       set status = 'applied',
           applied_at = v_now,
           updated_at = v_now
     where id = v_review_id;
  end if;

  update public.shop_orders
     set status = 'approved',
         total_points = v_charge_total,
         price_frozen_at = v_now,
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

revoke all on function public.propose_shop_order_price_review(uuid, uuid, text, integer, text, uuid) from public, anon, authenticated;
grant execute on function public.propose_shop_order_price_review(uuid, uuid, text, integer, text, uuid) to service_role;
revoke all on function public.confirm_shop_order_price_review(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.confirm_shop_order_price_review(uuid, uuid, text, uuid) to service_role;
revoke all on function public.approve_shop_order(uuid, text, uuid, text, integer, text) from public, anon, authenticated;
grant execute on function public.approve_shop_order(uuid, text, uuid, text, integer, text) to service_role;

create table if not exists public.shop_recovery_receipts (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  operation text not null check (operation in ('baseline', 'inventory_reset')),
  actor_discord_id text not null,
  idempotency_key uuid not null,
  request_payload jsonb not null,
  result_payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (guild_id, idempotency_key)
);

create index if not exists shop_recovery_receipts_recent_idx
  on public.shop_recovery_receipts (guild_id, created_at desc);

alter table public.shop_recovery_receipts enable row level security;
revoke all on table public.shop_recovery_receipts from public, anon, authenticated;
grant select, insert on table public.shop_recovery_receipts to service_role;

create or replace function public.execute_shop_baseline_recovery(
  p_guild_id uuid,
  p_baseline_at timestamptz,
  p_baseline_start timestamptz,
  p_snapshot jsonb,
  p_total_items integer,
  p_total_events integer,
  p_depositor text,
  p_admin_id text,
  p_notes text,
  p_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.shop_recovery_receipts%rowtype;
  v_request jsonb;
  v_baseline_id uuid;
  v_receipt_id uuid;
  v_result jsonb;
begin
  if p_guild_id is null or p_idempotency_key is null then
    raise exception 'INVALID_ARGUMENT' using errcode = '22023';
  end if;
  v_request := jsonb_build_object(
    'baseline_at', p_baseline_at,
    'baseline_start', p_baseline_start,
    'snapshot', p_snapshot,
    'total_items', p_total_items,
    'total_events', p_total_events,
    'depositor', p_depositor,
    'notes', nullif(btrim(coalesce(p_notes, '')), '')
  );
  perform pg_advisory_xact_lock(hashtextextended(p_guild_id::text || ':' || p_idempotency_key::text, 0));

  select * into v_existing
    from public.shop_recovery_receipts
   where guild_id = p_guild_id
     and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.operation <> 'baseline'
       or v_existing.actor_discord_id <> p_admin_id
       or v_existing.request_payload <> v_request then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = '23505';
    end if;
    return v_existing.result_payload || jsonb_build_object(
      'receipt_id', v_existing.id,
      'replayed', true
    );
  end if;

  v_baseline_id := public.apply_shop_baseline(
    p_guild_id,
    p_baseline_at,
    p_baseline_start,
    p_snapshot,
    p_total_items,
    p_total_events,
    p_depositor,
    p_admin_id,
    p_notes
  );
  v_result := jsonb_build_object('baseline_id', v_baseline_id);

  insert into public.shop_recovery_receipts (
    guild_id, operation, actor_discord_id, idempotency_key, request_payload, result_payload
  ) values (
    p_guild_id, 'baseline', p_admin_id, p_idempotency_key, v_request, v_result
  ) returning id into v_receipt_id;

  return v_result || jsonb_build_object('receipt_id', v_receipt_id, 'replayed', false);
end;
$$;

create or replace function public.execute_shop_inventory_reset_recovery(
  p_guild_id uuid,
  p_admin_id text,
  p_cancel_note text,
  p_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.shop_recovery_receipts%rowtype;
  v_request jsonb;
  v_receipt_id uuid;
  v_result jsonb;
begin
  if p_guild_id is null or p_idempotency_key is null then
    raise exception 'INVALID_ARGUMENT' using errcode = '22023';
  end if;
  v_request := jsonb_build_object(
    'cancel_note', nullif(btrim(coalesce(p_cancel_note, '')), '')
  );
  perform pg_advisory_xact_lock(hashtextextended(p_guild_id::text || ':' || p_idempotency_key::text, 0));

  select * into v_existing
    from public.shop_recovery_receipts
   where guild_id = p_guild_id
     and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.operation <> 'inventory_reset'
       or v_existing.actor_discord_id <> p_admin_id
       or v_existing.request_payload <> v_request then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = '23505';
    end if;
    return v_existing.result_payload || jsonb_build_object(
      'receipt_id', v_existing.id,
      'replayed', true
    );
  end if;

  v_result := public.reset_shop_inventory_all(p_guild_id, p_admin_id, p_cancel_note);
  insert into public.shop_recovery_receipts (
    guild_id, operation, actor_discord_id, idempotency_key, request_payload, result_payload
  ) values (
    p_guild_id, 'inventory_reset', p_admin_id, p_idempotency_key, v_request, v_result
  ) returning id into v_receipt_id;

  return v_result || jsonb_build_object('receipt_id', v_receipt_id, 'replayed', false);
end;
$$;

revoke all on function public.execute_shop_baseline_recovery(uuid, timestamptz, timestamptz, jsonb, integer, integer, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.execute_shop_baseline_recovery(uuid, timestamptz, timestamptz, jsonb, integer, integer, text, text, text, uuid) to service_role;
revoke all on function public.execute_shop_inventory_reset_recovery(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.execute_shop_inventory_reset_recovery(uuid, text, text, uuid) to service_role;

comment on table public.shop_order_price_reviews is
  'Member confirmation records for proposed increases to pending guild-shop order totals.';
comment on table public.shop_recovery_receipts is
  'Idempotent receipts for exceptional shop baseline and full inventory recovery operations.';
comment on function public.execute_shop_baseline_recovery(uuid, timestamptz, timestamptz, jsonb, integer, integer, text, text, text, uuid) is
  'Runs baseline recovery once per tenant-scoped key and records the exact request and result.';
comment on function public.execute_shop_inventory_reset_recovery(uuid, text, text, uuid) is
  'Runs destructive shop inventory reset once per tenant-scoped key and records the exact request and result.';
