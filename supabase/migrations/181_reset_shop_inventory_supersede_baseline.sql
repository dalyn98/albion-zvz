-- 181: Reset shop inventory also disables the active baseline.
--
-- reset_shop_inventory_all returns the guild to an empty shop state. If the
-- latest confirmed baseline remains active, a later rebuild can seed inventory
-- from that stale snapshot even though inventory rows and raw logs were reset.
-- Superseding the confirmed baseline keeps reset and rebuild semantics aligned.

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
  v_orders_cancelled int := 0;
  v_baselines_superseded int := 0;
  v_cancel_note text := nullif(btrim(coalesce(p_cancel_note, '')), '');
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

  update public.shop_orders
     set status = 'cancelled',
         resolved_at = now(),
         resolved_by = p_admin_id,
         admin_note = case
           when v_cancel_note is null then admin_note
           when admin_note is null or btrim(admin_note) = '' then v_cancel_note
           else admin_note || E'\n' || v_cancel_note
         end
   where guild_id = p_guild_id
     and status = 'pending';
  get diagnostics v_orders_cancelled = row_count;

  return jsonb_build_object(
    'inventory_rows_deleted', v_inventory_rows_deleted,
    'logs_deleted', v_logs_deleted,
    'orders_cancelled', v_orders_cancelled,
    'baselines_superseded', v_baselines_superseded
  );
end;
$$;

comment on function public.reset_shop_inventory_all(uuid, text, text) is
  'Supersedes the active shop baseline, deletes all shop_inventory rows and shop_chest_logs for one guild, and cancels only pending shop_orders in the same transaction. Approved/rejected/cancelled order history, blacklist, and name overrides are preserved.';

revoke all on function public.reset_shop_inventory_all(uuid, text, text) from public;
revoke all on function public.reset_shop_inventory_all(uuid, text, text) from anon, authenticated;
grant execute on function public.reset_shop_inventory_all(uuid, text, text) to service_role;
