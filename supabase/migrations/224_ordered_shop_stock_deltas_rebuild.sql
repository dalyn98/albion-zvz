-- 224: Make batch shop stock replay order explicit and rebuild drifted safe tenants.
--
-- The importer sends already-sorted per-log deltas. The previous batch RPC used
-- jsonb_to_recordset(p_deltas) directly, which does not make row order an
-- explicit SQL contract. If PostgreSQL returns rows in a different order, a
-- batch that starts with withdrawals and later deposits can lose those later
-- deposits because shop stock clamps at zero.

create or replace function public.apply_shop_stock_deltas(
  p_guild_id uuid,
  p_deltas jsonb
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delta record;
  v_applied int := 0;
begin
  if p_guild_id is null then
    raise exception 'GUILD_REQUIRED' using errcode = '22023';
  end if;

  if p_deltas is null or jsonb_typeof(p_deltas) <> 'array' then
    raise exception 'p_deltas must be a JSON array' using errcode = '22023';
  end if;

  for v_delta in
    select
      delta_row.ordinality,
      delta_payload.unique_name,
      delta_payload.enchant,
      delta_payload.quality,
      delta_payload.delta,
      delta_payload.name_ko,
      delta_payload.category,
      delta_payload.tier
    from jsonb_array_elements(p_deltas) with ordinality as delta_row(payload, ordinality)
    cross join lateral jsonb_to_record(delta_row.payload) as delta_payload(
      unique_name text,
      enchant int,
      quality int,
      delta int,
      name_ko text,
      category text,
      tier int
    )
    order by delta_row.ordinality
  loop
    if v_delta.unique_name is null
       or btrim(v_delta.unique_name) = ''
       or v_delta.enchant is null
       or v_delta.quality is null
       or v_delta.delta is null then
      raise exception 'invalid stock delta payload' using errcode = '22023';
    end if;

    perform public.apply_shop_stock_delta(
      p_guild_id,
      v_delta.unique_name,
      v_delta.enchant,
      v_delta.quality,
      v_delta.delta,
      v_delta.name_ko,
      v_delta.category,
      v_delta.tier
    );
    v_applied := v_applied + 1;
  end loop;

  return v_applied;
end;
$$;

comment on function public.apply_shop_stock_deltas(uuid, jsonb) is
  'Applies tenant-scoped shop inventory deltas in explicit JSON array order. This preserves zero-clamp semantics for withdrawal-first replay batches.';

revoke all on function public.apply_shop_stock_deltas(uuid, jsonb) from public;
revoke all on function public.apply_shop_stock_deltas(uuid, jsonb) from anon, authenticated;
grant execute on function public.apply_shop_stock_deltas(uuid, jsonb) to service_role;

do $$
declare
  v_guild record;
  v_drift jsonb;
begin
  for v_guild in
    select distinct l.guild_id
      from public.shop_chest_logs l
     where not exists (
       select 1
         from public.shop_orders o
         left join public.app_settings cutoff
           on cutoff.guild_id = o.guild_id
          and cutoff.key = 'shop_order_fulfillment_cutoff_at'
        where o.guild_id = l.guild_id
          and o.status in ('pending', 'approved')
          and o.stock_reserved_at is not null
          and case
                when cutoff.value is null then true
                when cutoff.value ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' then
                  o.stock_reserved_at >= cutoff.value::timestamptz
                else true
              end
     )
     order by l.guild_id
  loop
    select public.rebuild_shop_inventory_from_chest_logs(v_guild.guild_id, null)
      into v_drift;

    raise notice 'rebuilt shop inventory after ordered batch fix: guild_id=%, drift=%',
      v_guild.guild_id,
      v_drift;
  end loop;
end $$;
