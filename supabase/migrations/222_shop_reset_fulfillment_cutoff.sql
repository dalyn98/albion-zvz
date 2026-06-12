-- 222: Record a shop-order fulfillment cutoff whenever inventory is reset.
--
-- A full shop reset starts a new inventory epoch but intentionally preserves
-- approved order history. Without an explicit cutoff, re-importing historical
-- chest logs after the reset can match old approved orders again and ignore
-- real withdrawals in the new epoch.

create or replace function public.reset_shop_inventory_all(
  p_guild_id uuid,
  p_admin_id text,
  p_cancel_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inventory_rows_deleted int := 0;
  v_logs_deleted int := 0;
  v_adjustments_deleted int := 0;
  v_orders_cancelled int := 0;
  v_baselines_superseded int := 0;
  v_cancel_note text := nullif(btrim(coalesce(p_cancel_note, '')), '');
  v_reset_at timestamptz := now();
begin
  if p_guild_id is null then
    raise exception 'GUILD_REQUIRED' using errcode = '22023';
  end if;

  if p_admin_id is null or btrim(p_admin_id) = '' then
    raise exception 'ADMIN_REQUIRED' using errcode = '22023';
  end if;

  update public.shop_baselines
     set status = 'superseded'
   where guild_id = p_guild_id
     and status = 'confirmed';
  get diagnostics v_baselines_superseded = row_count;

  delete from public.shop_inventory
   where guild_id = p_guild_id;
  get diagnostics v_inventory_rows_deleted = row_count;

  delete from public.shop_chest_logs
   where guild_id = p_guild_id;
  get diagnostics v_logs_deleted = row_count;

  delete from public.shop_inventory_adjustments
   where guild_id = p_guild_id;
  get diagnostics v_adjustments_deleted = row_count;

  update public.shop_orders
     set status = 'cancelled',
         resolved_at = v_reset_at,
         resolved_by = p_admin_id,
         admin_note = case
           when v_cancel_note is null then admin_note
           when admin_note is null or btrim(admin_note) = '' then v_cancel_note
           else admin_note || E'\n' || v_cancel_note
         end
   where guild_id = p_guild_id
     and status = 'pending';
  get diagnostics v_orders_cancelled = row_count;

  insert into public.app_settings (
    guild_id,
    key,
    value,
    updated_at
  ) values (
    p_guild_id,
    'shop_order_fulfillment_cutoff_at',
    to_char(v_reset_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    v_reset_at
  )
  on conflict (guild_id, key) do update
     set value = excluded.value,
         updated_at = excluded.updated_at;

  return jsonb_build_object(
    'inventory_rows_deleted', v_inventory_rows_deleted,
    'logs_deleted', v_logs_deleted,
    'adjustments_deleted', v_adjustments_deleted,
    'orders_cancelled', v_orders_cancelled,
    'baselines_superseded', v_baselines_superseded
  );
end;
$$;

comment on function public.reset_shop_inventory_all(uuid, text, text) is
  'Supersedes the active shop baseline, deletes all shop_inventory rows, shop_chest_logs, and manual stock adjustments for one guild, records a fulfillment cutoff, and cancels only pending shop_orders in the same transaction. Approved/rejected/cancelled order history, blacklist, and name overrides are preserved.';

revoke all on function public.reset_shop_inventory_all(uuid, text, text) from public;
revoke all on function public.reset_shop_inventory_all(uuid, text, text) from anon, authenticated;
grant execute on function public.reset_shop_inventory_all(uuid, text, text) to service_role;
