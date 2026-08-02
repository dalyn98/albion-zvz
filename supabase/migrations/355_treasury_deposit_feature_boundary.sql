-- Unallocated treasury deposits are member obligations in the economy module.
-- Keep them visible while draining, block new imports after intake closes, and
-- finalize the feature only after the last deposit receives a purpose.

create or replace function public.guild_feature_has_open_work(
  p_guild_id uuid,
  p_feature_key text
) returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_feature_key = 'supply' then
    return exists (
      select 1 from public.regear_requests row
       where row.guild_id = p_guild_id and row.status = 'pending'
    ) or exists (
      select 1 from public.craft_tasks row
       where row.guild_id = p_guild_id
         and row.status in ('queued', 'claimed', 'delivered')
    ) or exists (
      select 1 from public.craft_orders row
       where row.guild_id = p_guild_id and row.status = 'open'
    ) or exists (
      select 1 from public.supply_fulfillments row
       where row.guild_id = p_guild_id
         and row.status in (
           'awaiting_decision', 'queued', 'in_progress',
           'ready_for_pickup', 'receipt_overdue'
         )
    ) or exists (
      select 1 from public.supply_settlement_items row
       where row.guild_id = p_guild_id and row.status = 'payable'
    );
  elsif p_feature_key = 'guild_economy' then
    return exists (
      select 1 from public.exchange_requests row
       where row.guild_id = p_guild_id and row.status = 'pending'
    ) or exists (
      select 1 from public.donation_requests row
       where row.guild_id = p_guild_id and row.status = 'pending'
    ) or exists (
      select 1 from public.event_payout_requests row
       where row.guild_id = p_guild_id and row.status = 'pending'
    ) or exists (
      select 1 from public.guild_treasury_deposits row
       where row.guild_id = p_guild_id and row.status = 'unallocated'
    );
  elsif p_feature_key = 'guild_shop' then
    return exists (
      select 1 from public.shop_orders row
       where row.guild_id = p_guild_id and row.status = 'pending'
    ) or exists (
      select 1 from public.shop_order_price_reviews row
       where row.guild_id = p_guild_id
         and row.status in ('awaiting_member', 'member_confirmed')
    );
  elsif p_feature_key = 'member_market' then
    return exists (
      select 1 from public.member_trade_orders row
       where row.guild_id = p_guild_id
         and row.status in ('awaiting_delivery', 'delivered', 'disputed')
    ) or exists (
      select 1 from public.member_trade_price_offers row
       where row.guild_id = p_guild_id and row.status = 'pending'
    ) or exists (
      select 1 from public.point_escrows row
       where row.guild_id = p_guild_id
         and row.source_kind = 'member_trade_order'
         and row.status = 'held'
    );
  end if;
  return false;
end;
$$;

drop trigger if exists guard_guild_treasury_deposits_feature_intake
  on public.guild_treasury_deposits;
create trigger guard_guild_treasury_deposits_feature_intake
before insert on public.guild_treasury_deposits
for each row execute function public.guard_guild_feature_intake('guild_economy');

drop trigger if exists finalize_guild_treasury_deposits_feature_draining
  on public.guild_treasury_deposits;
create trigger finalize_guild_treasury_deposits_feature_draining
after insert or update or delete on public.guild_treasury_deposits
for each row execute function public.finalize_guild_feature_from_row('guild_economy');

revoke all on function public.guild_feature_has_open_work(uuid, text)
  from public, anon, authenticated, service_role;

comment on function public.guild_feature_has_open_work(uuid, text) is
  'Internal feature draining predicate. Economy remains open while a treasury deposit still needs member purpose allocation.';
