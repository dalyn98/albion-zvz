-- 184: batch update shop inventory AODP price metadata.
--
-- Price sync fetches market data in TypeScript, then applies many distinct
-- prices. Updating one row per DB round trip does not scale with large shops,
-- so this RPC applies a JSON batch inside one tenant-scoped statement.

create or replace function public.apply_shop_inventory_price_updates(
  p_guild_id uuid,
  p_updates jsonb
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated int := 0;
begin
  if p_updates is null or jsonb_typeof(p_updates) <> 'array' then
    raise exception 'p_updates must be a JSON array' using errcode = '22023';
  end if;

  if exists (
    select 1
      from jsonb_to_recordset(p_updates) as u(
        unique_name text,
        enchant int,
        quality int,
        auto_price_silver int,
        price_source text,
        price_warning_level text,
        price_updated_at timestamptz,
        updated_at timestamptz
      )
     where u.unique_name is null
        or btrim(u.unique_name) = ''
        or u.enchant is null
        or u.enchant < 0
        or u.enchant > 4
        or u.quality is null
        or u.quality < 1
        or u.quality > 5
        or u.auto_price_silver is null
        or u.auto_price_silver < 0
        or u.price_source is null
        or btrim(u.price_source) = ''
        or (
          u.price_warning_level is not null
          and u.price_warning_level not in ('quality', 'window', 'bluezone', 'redzone')
        )
        or u.price_updated_at is null
        or u.updated_at is null
  ) then
    raise exception 'invalid shop price update payload' using errcode = '22023';
  end if;

  update public.shop_inventory i
     set auto_price_silver = u.auto_price_silver,
         price_source = u.price_source,
         price_warning_level = u.price_warning_level,
         price_updated_at = u.price_updated_at,
         updated_at = u.updated_at
    from jsonb_to_recordset(p_updates) as u(
      unique_name text,
      enchant int,
      quality int,
      auto_price_silver int,
      price_source text,
      price_warning_level text,
      price_updated_at timestamptz,
      updated_at timestamptz
    )
   where i.guild_id = p_guild_id
     and i.unique_name = u.unique_name
     and i.enchant = u.enchant
     and i.quality = u.quality;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

comment on function public.apply_shop_inventory_price_updates(uuid, jsonb) is
  'Applies tenant-scoped AODP price metadata updates for shop_inventory in one batch.';

revoke all on function public.apply_shop_inventory_price_updates(uuid, jsonb) from public;
revoke all on function public.apply_shop_inventory_price_updates(uuid, jsonb) from anon, authenticated;
grant execute on function public.apply_shop_inventory_price_updates(uuid, jsonb) to service_role;
