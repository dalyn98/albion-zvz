-- App-shell aggregate RPCs.
--
-- These keep high-frequency layout reads inside Postgres so every page render
-- does not have to page through ledger rows or fan out many count requests.

create index if not exists siphon_ledger_guild_player_logged_at_idx
  on public.siphon_ledger (guild_id, player, logged_at desc, id desc);

create index if not exists regear_requests_pending_guild_idx
  on public.regear_requests (guild_id)
  where status = 'pending';

create index if not exists exchange_requests_pending_guild_idx
  on public.exchange_requests (guild_id)
  where status = 'pending';

create index if not exists donation_requests_pending_guild_idx
  on public.donation_requests (guild_id)
  where status = 'pending';

create index if not exists shop_orders_pending_guild_idx
  on public.shop_orders (guild_id)
  where status = 'pending';

create index if not exists event_payout_requests_pending_guild_idx
  on public.event_payout_requests (guild_id)
  where status = 'pending';

create index if not exists craft_tasks_guild_order_delivered_idx
  on public.craft_tasks (guild_id)
  where task_kind = 'guild_order' and status = 'delivered';

create or replace function public.get_member_siphon_account(
  p_guild_id uuid,
  p_player text,
  p_operating_start timestamptz default null,
  p_recent_limit integer default 0
)
returns table (
  player text,
  deposited bigint,
  withdrawn bigint,
  net bigint,
  last_activity_at timestamptz,
  rows jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with scoped as (
    select
      sl.logged_at,
      sl.item_name_raw,
      sl.quantity,
      sl.id
    from public.siphon_ledger sl
    where sl.guild_id = p_guild_id
      and sl.player = p_player
      and (p_operating_start is null or sl.logged_at >= p_operating_start)
  ),
  totals as (
    select
      coalesce(sum(s.quantity) filter (where s.quantity > 0), 0)::bigint as deposited,
      coalesce(sum(-s.quantity) filter (where s.quantity < 0), 0)::bigint as withdrawn,
      coalesce(sum(s.quantity), 0)::bigint as net,
      max(s.logged_at) as last_activity_at
    from scoped s
  ),
  recent as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'logged_at', r.logged_at,
          'item_name_raw', r.item_name_raw,
          'quantity', r.quantity
        )
        order by r.logged_at desc, r.id desc
      ),
      '[]'::jsonb
    ) as rows
    from (
      select
        s.logged_at,
        s.item_name_raw,
        s.quantity,
        s.id
      from scoped s
      order by s.logged_at desc, s.id desc
      limit greatest(0, coalesce(p_recent_limit, 0))
    ) r
  )
  select
    p_player as player,
    t.deposited,
    t.withdrawn,
    t.net,
    t.last_activity_at,
    r.rows
  from totals t
  cross join recent r;
$$;

revoke all on function public.get_member_siphon_account(uuid, text, timestamptz, integer) from public;
revoke all on function public.get_member_siphon_account(uuid, text, timestamptz, integer) from anon, authenticated;
grant execute on function public.get_member_siphon_account(uuid, text, timestamptz, integer) to service_role;

create or replace function public.admin_pending_badge_counts(
  p_guild_id uuid
)
returns table (
  regear bigint,
  exchange bigint,
  donation bigint,
  shop bigint,
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
