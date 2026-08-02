-- Release C: one read-only source for the operator work queue.
--
-- The snapshot deliberately contains only actionable domain work. Dashboard
-- health, sync status, statistics, and history remain separate concerns. The
-- web dashboard, approval tabs, sidebar badges, and Discord digest all consume
-- this same result through the server adapter.

create or replace function public.admin_work_queue_snapshot(
  p_guild_id uuid
) returns table (
  queue_key text,
  pending_count bigint,
  oldest_created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with visible_features as (
    select feature.feature_key
      from public.guild_feature_states feature
     where feature.guild_id = p_guild_id
       and feature.state in ('enabled', 'draining')
  )
  select
    'regear'::text,
    count(request.id)::bigint,
    min(request.created_at)
  from public.regear_requests request
  where request.guild_id = p_guild_id
    and request.status = 'pending'
    and exists (
      select 1 from visible_features feature
       where feature.feature_key = 'supply'
    )

  union all

  select
    'exchange'::text,
    count(request.id)::bigint,
    min(request.created_at)
  from public.exchange_requests request
  where request.guild_id = p_guild_id
    and request.status = 'pending'
    and exists (
      select 1 from visible_features feature
       where feature.feature_key = 'guild_economy'
    )

  union all

  select
    'donation'::text,
    count(request.id)::bigint,
    min(request.created_at)
  from public.donation_requests request
  where request.guild_id = p_guild_id
    and request.status = 'pending'
    and exists (
      select 1 from visible_features feature
       where feature.feature_key = 'guild_economy'
    )

  union all

  select
    'shop'::text,
    count(request.id)::bigint,
    min(request.created_at)
  from public.shop_orders request
  where request.guild_id = p_guild_id
    and request.status = 'pending'
    and exists (
      select 1 from visible_features feature
       where feature.feature_key = 'guild_shop'
    )

  union all

  select
    'memberTrade'::text,
    count(request.id)::bigint,
    min(request.created_at)
  from public.member_trade_orders request
  where request.guild_id = p_guild_id
    and request.status = 'disputed'
    and exists (
      select 1 from visible_features feature
       where feature.feature_key = 'member_market'
    )

  union all

  select
    'eventPayout'::text,
    count(request.id)::bigint,
    min(request.created_at)
  from public.event_payout_requests request
  where request.guild_id = p_guild_id
    and request.status = 'pending'
    and exists (
      select 1 from visible_features feature
       where feature.feature_key = 'guild_economy'
    )

  union all

  select
    'craft'::text,
    count(request.id)::bigint,
    min(request.created_at)
  from public.craft_tasks request
  where request.guild_id = p_guild_id
    and request.task_kind = 'guild_order'
    and request.status = 'delivered'
    and exists (
      select 1 from visible_features feature
       where feature.feature_key = 'supply'
    );
$$;

revoke all on function public.admin_work_queue_snapshot(uuid)
  from public, anon, authenticated;
grant execute on function public.admin_work_queue_snapshot(uuid)
  to service_role;

comment on function public.admin_work_queue_snapshot(uuid) is
  'Read-only, feature-aware operator work queue shared by web badges, queue surfaces, and Discord digest.';
