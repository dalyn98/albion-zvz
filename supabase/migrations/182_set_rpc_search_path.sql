-- 182: pin search_path for app-called security-definer RPCs.
--
-- These functions are invoked through Supabase RPC from the app. Keep their
-- SECURITY DEFINER execution independent from the caller's search_path without
-- rewriting function bodies in this migration.

do $$
declare
  rpc_signature text;
begin
  foreach rpc_signature in array array[
    'public.adjust_inventory_gear(uuid, text, integer, text)',
    'public.approve_craft_order_task(uuid, uuid, text)',
    'public.approve_donation_request(uuid, text, text, uuid)',
    'public.approve_event_payout_request(uuid, text, text, uuid)',
    'public.approve_exchange_request(uuid, text, text, uuid)',
    'public.approve_regear_from_stock(uuid, text, text, uuid, integer, text[])',
    'public.approve_regear_request(uuid, text, text, uuid, integer)',
    'public.approve_shop_order(uuid, text, uuid, text, integer)',
    'public.approve_slot_request(uuid)',
    'public.assign_slot(uuid, text, text, jsonb)',
    'public.cancel_craft_order(uuid, uuid, text)',
    'public.cancel_craft_task(uuid, uuid)',
    'public.cancel_slot(uuid, text)',
    'public.claim_craft_order(uuid, uuid, text, text, integer)',
    'public.claim_craft_task(uuid, uuid, text, text, text, integer)',
    'public.collect_craft_task(uuid, uuid, text)',
    'public.convert_craft_task_to_silver(uuid, uuid)',
    'public.create_auto_regear_request(uuid, uuid, text, text, text, text, integer, integer, integer, bigint, jsonb, text, text, jsonb)',
    'public.deliver_craft_order_task(uuid, uuid, text, integer, text, boolean, integer)',
    'public.deliver_craft_task(uuid, uuid, text, integer, text, boolean, integer, integer)',
    'public.direct_assign_slot(uuid, text, text)',
    'public.expire_craft_tasks()',
    'public.post_craft_order(uuid, text, text, text, text, integer, bigint, text)',
    'public.reject_craft_order_task(uuid, uuid, text, text)',
    'public.reject_donation_request(uuid, text, text, text, uuid)',
    'public.reject_event_payout_request(uuid, text, text, text, uuid)',
    'public.reject_exchange_request(uuid, text, text, text, uuid)',
    'public.reject_regear_request(uuid, text, text, text, text, uuid)',
    'public.reject_shop_order(uuid, text, uuid, text)',
    'public.reject_slot_request(uuid)',
    'public.release_craft_order_task(uuid, uuid, text)',
    'public.release_craft_task(uuid, uuid, text)',
    'public.revert_crafted_to_pending(uuid, uuid)',
    'public.set_inventory_gear(uuid, text, integer, text)',
    'public.submit_shop_order(uuid, text, text, integer, text, jsonb)',
    'public.transfer_points(text, uuid, jsonb)'
  ] loop
    if to_regprocedure(rpc_signature) is not null then
      execute format('alter function %s set search_path = public', rpc_signature);
    end if;
  end loop;
end $$;
