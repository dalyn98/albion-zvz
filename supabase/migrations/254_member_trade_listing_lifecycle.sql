-- 254: Seller-controlled member trade listing lifecycle.
--
-- Listings already support active / paused / closed states, but sellers had
-- no safe way to use them. Keep all state checks and pending-offer cleanup in
-- one transaction so a seller cannot reopen an expired or sold-out listing.

create or replace function public.update_member_trade_listing_lifecycle(
  p_listing_id uuid,
  p_guild_id uuid,
  p_seller_discord_id text,
  p_action text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing public.member_trade_listings%rowtype;
begin
  if p_action not in ('pause', 'resume', 'close') then
    raise exception 'INVALID_LISTING_LIFECYCLE_ACTION';
  end if;

  select *
    into v_listing
    from public.member_trade_listings
   where id = p_listing_id
     and guild_id = p_guild_id
     and seller_discord_id = p_seller_discord_id
   for update;

  if not found then
    raise exception 'LISTING_NOT_FOUND';
  end if;

  if p_action = 'pause' then
    if v_listing.status <> 'active' then
      raise exception 'LISTING_STATUS_NOT_ACTIVE';
    end if;

    update public.member_trade_listings
       set status = 'paused',
           updated_at = now()
     where id = v_listing.id
       and guild_id = p_guild_id;
  elsif p_action = 'resume' then
    if v_listing.status <> 'paused' then
      raise exception 'LISTING_STATUS_NOT_PAUSED';
    end if;
    if v_listing.quantity_available <= 0
       or (v_listing.expires_at is not null and v_listing.expires_at <= now()) then
      raise exception 'LISTING_CANNOT_RESUME';
    end if;

    update public.member_trade_listings
       set status = 'active',
           updated_at = now()
     where id = v_listing.id
       and guild_id = p_guild_id;
  else
    if v_listing.status not in ('active', 'paused', 'sold_out') then
      raise exception 'LISTING_CANNOT_CLOSE';
    end if;

    update public.member_trade_listings
       set status = 'closed',
           closed_at = now(),
           updated_at = now()
     where id = v_listing.id
       and guild_id = p_guild_id;

    -- Price offers do not reserve points. Closing therefore declines only
    -- unanswered offers, while existing paid orders continue independently.
    update public.member_trade_price_offers
       set status = 'declined',
           responded_at = now()
     where guild_id = p_guild_id
       and listing_id = v_listing.id
       and status = 'pending';
  end if;

  return p_action;
end;
$$;

revoke all on function public.update_member_trade_listing_lifecycle(uuid, uuid, text, text) from public;
revoke all on function public.update_member_trade_listing_lifecycle(uuid, uuid, text, text) from anon, authenticated;
grant execute on function public.update_member_trade_listing_lifecycle(uuid, uuid, text, text) to service_role;
