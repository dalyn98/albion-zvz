-- Release C: one read-only member work snapshot shared by the member home,
-- status chip, and /me/requests. The function only projects source-domain
-- state; every mutation remains owned by its original module.

create or replace function public.member_work_inbox_snapshot(
  p_guild_id uuid,
  p_discord_id text,
  p_include_history boolean default true,
  p_history_limit integer default 50
) returns table (
  item_key text,
  domain text,
  source_id uuid,
  bucket text,
  stage text,
  status text,
  title text,
  amount bigint,
  unit text,
  created_at timestamptz,
  updated_at timestamptz,
  due_at timestamptz,
  href text,
  next_actor text,
  metadata jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_history_limit integer := greatest(0, least(coalesce(p_history_limit, 50), 200));
begin
  if p_guild_id is null
     or nullif(btrim(coalesce(p_discord_id, '')), '') is null then
    return;
  end if;

  return query
  with feature_access as (
    select
      coalesce(bool_or(
        feature.feature_key = 'supply'
        and feature.state in ('enabled', 'draining')
      ), false) as supply,
      coalesce(bool_or(
        feature.feature_key = 'guild_economy'
        and feature.state in ('enabled', 'draining')
      ), false) as economy,
      coalesce(bool_or(
        feature.feature_key = 'guild_shop'
        and feature.state in ('enabled', 'draining')
      ), false) as shop,
      coalesce(bool_or(
        feature.feature_key = 'member_market'
        and feature.state in ('enabled', 'draining')
      ), false) as market
    from public.guild_feature_states feature
    where feature.guild_id = p_guild_id
  ),
  trusted_identity as (
    select link.albion_player_name
    from public.account_albion_tenant_links link
    where link.guild_id = p_guild_id
      and link.discord_id = p_discord_id
      and link.relation = 'home_guild'
      and link.trust_status in ('roster_matched', 'trusted')
      and link.albion_player_id is not null
      and link.revoked_at is null
    limit 1
  ),
  source_items as (
    select
      'regear:' || request.id::text as item_key,
      'regear'::text as domain,
      request.id as source_id,
      case when request.status = 'pending'
        then 'waiting_on_guild' else 'history' end as bucket,
      case request.status
        when 'pending' then 'regear_review'
        when 'approved' then 'completed'
        when 'rejected' then 'rejected'
        else 'closed'
      end as stage,
      request.status::text as status,
      coalesce(nullif(btrim(request.event_title_snapshot), ''), 'regear') as title,
      coalesce(request.payout_silver, request.claimed_silver, request.silver, 0)::bigint as amount,
      'silver'::text as unit,
      request.created_at,
      coalesce(request.resolved_at, request.created_at) as updated_at,
      null::timestamptz as due_at,
      '/me/regear/' || request.id::text as href,
      case when request.status = 'pending' then 'guild' else 'none' end as next_actor,
      jsonb_build_object('requestType', coalesce(request.request_type, 'death')) as metadata
    from public.regear_requests request
    where request.guild_id = p_guild_id
      and request.discord_id = p_discord_id

    union all

    select
      'exchange:' || request.id::text,
      'exchange'::text,
      request.id,
      case when request.status = 'pending'
        then 'waiting_on_guild' else 'history' end,
      case request.status
        when 'pending' then 'exchange_in_game_payout'
        when 'approved' then 'completed'
        when 'rejected' then 'rejected'
        when 'cancelled' then 'cancelled'
        else 'closed'
      end,
      request.status::text,
      'exchange'::text,
      request.silver::bigint,
      'silver'::text,
      request.created_at,
      coalesce(request.resolved_at, request.created_at),
      null::timestamptz,
      '/me/wallet'::text,
      case when request.status = 'pending' then 'guild' else 'none' end,
      '{}'::jsonb
    from public.exchange_requests request
    cross join feature_access access
    where access.economy
      and request.guild_id = p_guild_id
      and request.discord_id = p_discord_id

    union all

    select
      'donation:' || request.id::text,
      'donation'::text,
      request.id,
      case when request.status = 'pending'
        then 'waiting_on_guild' else 'history' end,
      case request.status
        when 'pending' then 'donation_review'
        when 'approved' then 'completed'
        when 'rejected' then 'rejected'
        else 'closed'
      end,
      request.status::text,
      coalesce(nullif(btrim(request.memo), ''), 'donation') as title,
      request.silver::bigint,
      'silver'::text,
      request.created_at,
      coalesce(request.resolved_at, request.created_at),
      null::timestamptz,
      '/me/wallet'::text,
      case when request.status = 'pending' then 'guild' else 'none' end,
      '{}'::jsonb
    from public.donation_requests request
    cross join feature_access access
    where access.economy
      and request.guild_id = p_guild_id
      and request.discord_id = p_discord_id

    union all

    select
      'shop:' || orders.id::text,
      'shop'::text,
      orders.id,
      case
        when orders.status = 'pending' and review.status = 'awaiting_member'
          then 'action_required'
        when orders.status = 'pending' then 'waiting_on_guild'
        else 'history'
      end,
      case
        when orders.status = 'pending' and review.status = 'awaiting_member'
          then 'shop_price_confirmation'
        when orders.status = 'pending' and review.status = 'member_confirmed'
          then 'shop_preparing'
        when orders.status = 'pending' then 'shop_review'
        when orders.status = 'approved' then 'completed'
        when orders.status = 'rejected' then 'rejected'
        when orders.status = 'cancelled' then 'cancelled'
        else 'closed'
      end,
      orders.status::text,
      coalesce(order_items.first_item_name, 'shop') as title,
      coalesce(review.proposed_total_points, orders.total_points)::bigint,
      'points'::text,
      orders.created_at,
      coalesce(review.updated_at, orders.resolved_at, orders.created_at),
      null::timestamptz,
      '/shop?order=' || orders.id::text || '#shop-order-' || orders.id::text,
      case
        when orders.status = 'pending' and review.status = 'awaiting_member' then 'member'
        when orders.status = 'pending' then 'guild'
        else 'none'
      end,
      jsonb_build_object(
        'itemCount', coalesce(order_items.item_count, 0),
        'priceReviewId', review.id,
        'pickupNote', orders.pickup_note
      )
    from public.shop_orders orders
    cross join feature_access access
    left join lateral (
      select
        price_review.id,
        price_review.status,
        price_review.proposed_total_points,
        price_review.updated_at
      from public.shop_order_price_reviews price_review
      where price_review.guild_id = orders.guild_id
        and price_review.order_id = orders.id
        and price_review.status in ('awaiting_member', 'member_confirmed')
      order by price_review.created_at desc
      limit 1
    ) review on true
    left join lateral (
      select
        min(item.name_ko) as first_item_name,
        count(*)::integer as item_count
      from public.shop_order_items item
      where item.guild_id = orders.guild_id
        and item.order_id = orders.id
    ) order_items on true
    where access.shop
      and orders.guild_id = p_guild_id
      and orders.discord_id = p_discord_id

    union all

    select
      'member_trade:' || orders.id::text,
      'member_trade'::text,
      orders.id,
      case
        when orders.status = 'awaiting_delivery'
          and orders.seller_discord_id = p_discord_id then 'action_required'
        when orders.status = 'delivered'
          and orders.buyer_discord_id = p_discord_id then 'action_required'
        when orders.status in ('awaiting_delivery', 'delivered', 'disputed')
          then 'waiting_on_guild'
        else 'history'
      end,
      case
        when orders.status = 'awaiting_delivery'
          and orders.seller_discord_id = p_discord_id then 'trade_seller_delivery'
        when orders.status = 'awaiting_delivery' then 'trade_waiting_seller'
        when orders.status = 'delivered'
          and orders.buyer_discord_id = p_discord_id then 'trade_buyer_receipt'
        when orders.status = 'delivered' then 'trade_waiting_buyer'
        when orders.status = 'disputed' then 'trade_dispute_review'
        when orders.status = 'completed' then 'completed'
        when orders.status = 'cancelled' then 'cancelled'
        when orders.status = 'refunded' then 'refunded'
        else 'closed'
      end,
      orders.status::text,
      coalesce(nullif(btrim(orders.listing_title), ''), orders.name_ko) as title,
      orders.total_points::bigint,
      'points'::text,
      orders.created_at,
      coalesce(orders.resolved_at, orders.completed_at, orders.delivered_at, orders.created_at),
      case when orders.status = 'awaiting_delivery' then orders.delivery_due_at else null end,
      '/market?tab=orders#member-trade-order-' || orders.id::text,
      case
        when orders.status = 'awaiting_delivery'
          and orders.seller_discord_id = p_discord_id then 'member'
        when orders.status = 'delivered'
          and orders.buyer_discord_id = p_discord_id then 'member'
        when orders.status in ('awaiting_delivery', 'delivered') then 'counterparty'
        when orders.status = 'disputed' then 'operator'
        else 'none'
      end,
      jsonb_build_object(
        'relation', case when orders.buyer_discord_id = p_discord_id then 'buyer' else 'seller' end,
        'counterparty', case when orders.buyer_discord_id = p_discord_id
          then orders.seller_username else orders.buyer_username end
      )
    from public.member_trade_orders orders
    cross join feature_access access
    where access.market
      and orders.guild_id = p_guild_id
      and (
        orders.buyer_discord_id = p_discord_id
        or orders.seller_discord_id = p_discord_id
      )

    union all

    select
      'craft:' || task.id::text,
      'craft'::text,
      task.id,
      case
        when task.status = 'delivered' then 'action_required'
        when task.status in ('queued', 'claimed') then 'waiting_on_guild'
        else 'history'
      end,
      case task.status
        when 'queued' then 'craft_queue'
        when 'claimed' then 'craft_in_progress'
        when 'delivered' then 'craft_pickup'
        when 'collected' then 'completed'
        when 'expired' then 'expired'
        when 'cancelled' then 'cancelled'
        else 'closed'
      end,
      task.status::text,
      coalesce(nullif(btrim(request.event_title_snapshot), ''), 'craft') as title,
      null::bigint,
      'items'::text,
      task.created_at,
      coalesce(task.collected_at, task.expired_at, task.cancelled_at, task.delivered_at, task.claimed_at, task.created_at),
      case when task.status = 'delivered' then task.expires_at else null end,
      '/me?view=details#craft-pickup-' || task.id::text,
      case
        when task.status = 'delivered' then 'member'
        when task.status in ('queued', 'claimed') then 'guild'
        else 'none'
      end,
      jsonb_build_object(
        'boxNumber', task.box_number,
        'craftCity', task.craft_city
      )
    from public.craft_tasks task
    join public.regear_requests request
      on request.guild_id = task.guild_id
     and request.id = task.regear_request_id
    cross join feature_access access
    where access.supply
      and task.guild_id = p_guild_id
      and request.discord_id = p_discord_id

    union all

    select
      'treasury_deposit:' || deposit.id::text,
      'treasury_deposit'::text,
      deposit.id,
      'action_required'::text,
      'treasury_purpose'::text,
      deposit.status::text,
      'treasury_deposit'::text,
      deposit.amount_silver::bigint,
      'silver'::text,
      deposit.deposited_at,
      deposit.imported_at,
      null::timestamptz,
      '/me/wallet#treasury-deposit-' || deposit.id::text,
      'member'::text,
      '{}'::jsonb
    from public.guild_treasury_deposits deposit
    join trusted_identity identity
      on lower(btrim(identity.albion_player_name)) = lower(btrim(deposit.depositor_name))
    cross join feature_access access
    where access.economy
      and deposit.guild_id = p_guild_id
      and deposit.status = 'unallocated'

    union all

    select
      'treasury_deposit:' || deposit.id::text,
      'treasury_deposit'::text,
      deposit.id,
      'history'::text,
      case allocation.status
        when 'auto_credited' then 'completed'
        when 'recorded' then 'completed'
        when 'exception' then 'exception'
        else 'closed'
      end,
      allocation.status::text,
      'treasury_deposit'::text,
      deposit.amount_silver::bigint,
      'silver'::text,
      deposit.deposited_at,
      allocation.allocated_at,
      null::timestamptz,
      '/me/wallet'::text,
      'none'::text,
      jsonb_build_object('purpose', allocation.purpose)
    from public.treasury_deposit_allocations allocation
    join public.guild_treasury_deposits deposit
      on deposit.guild_id = allocation.guild_id
     and deposit.id = allocation.deposit_id
    cross join feature_access access
    where access.economy
      and allocation.guild_id = p_guild_id
      and allocation.discord_id = p_discord_id
  ),
  ranked as (
    select
      source_items.*,
      row_number() over (
        partition by source_items.bucket
        order by
          case when source_items.bucket = 'action_required'
            then source_items.due_at end asc nulls last,
          case when source_items.bucket in ('action_required', 'waiting_on_guild')
            then source_items.created_at end asc,
          source_items.updated_at desc,
          source_items.item_key
      ) as bucket_rank
    from source_items
  )
  select
    ranked.item_key,
    ranked.domain,
    ranked.source_id,
    ranked.bucket,
    ranked.stage,
    ranked.status,
    ranked.title,
    ranked.amount,
    ranked.unit,
    ranked.created_at,
    ranked.updated_at,
    ranked.due_at,
    ranked.href,
    ranked.next_actor,
    ranked.metadata
  from ranked
  where ranked.bucket <> 'history'
     or (p_include_history and ranked.bucket_rank <= v_history_limit)
  order by
    case ranked.bucket
      when 'action_required' then 0
      when 'waiting_on_guild' then 1
      else 2
    end,
    case when ranked.bucket = 'action_required' then ranked.due_at end asc nulls last,
    case when ranked.bucket in ('action_required', 'waiting_on_guild')
      then ranked.created_at end asc,
    ranked.updated_at desc,
    ranked.item_key;
end;
$$;

revoke all on function public.member_work_inbox_snapshot(
  uuid, text, boolean, integer
) from public, anon, authenticated;
grant execute on function public.member_work_inbox_snapshot(
  uuid, text, boolean, integer
) to service_role;

comment on function public.member_work_inbox_snapshot(
  uuid, text, boolean, integer
) is
  'Service-role read model for one member in one active guild. Normalizes source-domain work without owning mutations or copying state.';
