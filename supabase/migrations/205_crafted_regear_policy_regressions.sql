-- Crafted regear policy follow-ups.
-- - Persist requested craft slots at request creation time.
-- - Persist final craft slots selected at approval time.
-- - Delivery records reimbursement as pending instead of crediting immediately.
-- - Expiry only touches regear craft tasks, not guild-order craft tasks.
-- - Add a service-role reimbursement approval RPC.

alter table public.regear_requests
  add column if not exists craft_requested_slots jsonb,
  add column if not exists craft_included_slots jsonb;

alter table public.craft_tasks
  add column if not exists reimbursement_status text not null default 'not_required',
  add column if not exists reimbursement_approved_at timestamptz,
  add column if not exists reimbursement_approved_by text,
  add column if not exists reimbursement_approved_by_username text;

alter table public.craft_tasks
  drop constraint if exists craft_tasks_reimbursement_status_chk;

alter table public.craft_tasks
  add constraint craft_tasks_reimbursement_status_chk
  check (reimbursement_status in ('not_required', 'pending', 'approved'));

drop function if exists public.create_auto_regear_request(
  uuid, uuid, text, text, text, text, integer, integer, integer, bigint, jsonb, text, text, jsonb
);
drop function if exists public.create_auto_regear_request(
  uuid, uuid, text, text, text, text, integer, integer, integer, bigint, jsonb, text, text, jsonb, text[]
);

create or replace function public.create_auto_regear_request(
  p_guild_id uuid,
  p_event_id uuid,
  p_event_title text,
  p_discord_id text,
  p_username text,
  p_role_name text,
  p_silver integer,
  p_claimed_silver integer,
  p_payout_silver integer,
  p_killboard_event_id bigint,
  p_gear_breakdown jsonb,
  p_price_warning_level text,
  p_fulfillment_mode text default 'silver',
  p_build_snapshot jsonb default null,
  p_craft_requested_slots text[] default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing uuid;
  v_manual_count integer;
  v_new_id uuid;
  v_credit integer;
  v_role_cap integer;
  v_mode text;
begin
  if p_fulfillment_mode not in ('silver', 'crafted') then
    raise exception 'INVALID_FULFILLMENT_MODE';
  end if;
  v_mode := p_fulfillment_mode;

  select id into v_existing
    from regear_requests
   where guild_id = p_guild_id
     and event_id = p_event_id
     and killboard_event_id = p_killboard_event_id
     and auto_generated = true;
  if v_existing is not null then
    return v_existing;
  end if;

  select count(*) into v_manual_count
    from regear_requests
   where guild_id = p_guild_id
     and event_id = p_event_id
     and discord_id = p_discord_id
     and auto_generated = false
     and status <> 'rejected';
  if v_manual_count > 0 then
    return null;
  end if;

  select silver into v_role_cap
    from role_rewards
   where guild_id = p_guild_id
     and role_name = p_role_name;
  if v_role_cap is null or v_role_cap <= 0 then
    return null;
  end if;

  v_credit := p_payout_silver;
  if v_credit < 0 then v_credit := 0; end if;
  if v_credit > p_claimed_silver then v_credit := p_claimed_silver; end if;
  if v_credit > v_role_cap then v_credit := v_role_cap; end if;

  insert into regear_requests (
    guild_id,
    event_id, event_title_snapshot, discord_id, username, role_name,
    silver, claimed_silver, payout_silver,
    screenshot_path, killboard_verified, killboard_event_id,
    status, resolved_at, handled_by_username,
    auto_generated, gear_breakdown, request_type, price_warning_level,
    fulfillment_mode, build_snapshot, craft_requested_slots
  ) values (
    p_guild_id,
    p_event_id, p_event_title, p_discord_id, p_username, p_role_name,
    p_silver, p_claimed_silver, v_credit,
    null, true, p_killboard_event_id,
    'pending', null, null,
    true, p_gear_breakdown, 'death', p_price_warning_level,
    v_mode, p_build_snapshot, to_jsonb(p_craft_requested_slots)
  ) returning id into v_new_id;

  return v_new_id;
end;
$$;

comment on function public.create_auto_regear_request(uuid, uuid, text, text, text, text, integer, integer, integer, bigint, jsonb, text, text, jsonb, text[]) is
  'killboard_event 기반 자동 리기어 1건을 status=pending 으로 생성하고, crafted 모드 요청 슬롯(craft_requested_slots) 을 생성 시점에 고정한다.';

revoke all on function public.create_auto_regear_request(uuid, uuid, text, text, text, text, integer, integer, integer, bigint, jsonb, text, text, jsonb, text[]) from public;
revoke all on function public.create_auto_regear_request(uuid, uuid, text, text, text, text, integer, integer, integer, bigint, jsonb, text, text, jsonb, text[]) from anon, authenticated;
grant execute on function public.create_auto_regear_request(uuid, uuid, text, text, text, text, integer, integer, integer, bigint, jsonb, text, text, jsonb, text[]) to service_role;

drop function if exists public.approve_regear_as_crafted(uuid, text, text, uuid, integer);
drop function if exists public.approve_regear_as_crafted(uuid, text, text, uuid, integer, text[]);

create or replace function public.approve_regear_as_crafted(
  p_id uuid,
  p_admin_id text,
  p_admin_username text,
  p_guild_id uuid,
  p_payout_silver integer default null,
  p_included_slots text[] default array['weapon','head','armor','shoes','offhand']::text[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_discord text;
  v_claimed integer;
  v_credit  integer;
  v_mode    text;
  v_snapshot jsonb;
  v_existing_task uuid;
  v_included_slots text[];
begin
  select coalesce(
           array_agg(allowed.slot order by allowed.ord),
           array['weapon','head','armor','shoes','offhand']::text[]
         )
    into v_included_slots
    from unnest(array['weapon','head','armor','shoes','offhand','cape']::text[])
         with ordinality as allowed(slot, ord)
   where allowed.slot = any(coalesce(p_included_slots, array['weapon','head','armor','shoes','offhand']::text[]));
  if array_length(v_included_slots, 1) is null then
    v_included_slots := array['weapon','head','armor','shoes','offhand']::text[];
  end if;

  select discord_id, claimed_silver, fulfillment_mode, build_snapshot
    into v_discord, v_claimed, v_mode, v_snapshot
    from regear_requests
   where id = p_id
     and guild_id = p_guild_id
     and status = 'pending'
   for update;

  if v_discord is null then
    raise exception 'REGEAR_NOT_PENDING';
  end if;
  if v_mode <> 'crafted' then
    raise exception 'REGEAR_NOT_CRAFTED_MODE';
  end if;
  if v_snapshot is null then
    raise exception 'REGEAR_NO_BUILD_SNAPSHOT';
  end if;

  v_credit := coalesce(p_payout_silver, v_claimed);
  if v_credit < 0 then v_credit := 0; end if;
  if v_credit > v_claimed then v_credit := v_claimed; end if;

  update regear_requests
     set status = 'approved',
         resolved_at = now(),
         payout_silver = v_credit,
         craft_included_slots = to_jsonb(v_included_slots),
         handled_by = p_admin_id,
         handled_by_username = p_admin_username
   where id = p_id
     and guild_id = p_guild_id;

  select id into v_existing_task
    from craft_tasks
   where regear_request_id = p_id
     and guild_id = p_guild_id
     and status in ('queued', 'claimed', 'delivered');

  if v_existing_task is null then
    insert into craft_tasks (guild_id, task_kind, regear_request_id, status)
         values (p_guild_id, 'regear', p_id, 'queued');
  end if;
end;
$$;

comment on function public.approve_regear_as_crafted(uuid, text, text, uuid, integer, text[]) is
  'crafted 모드 리기어를 제작 큐에 enqueue 하고 approval 시점의 craft_included_slots 를 보존한다.';

revoke all on function public.approve_regear_as_crafted(uuid, text, text, uuid, integer, text[]) from public;
revoke all on function public.approve_regear_as_crafted(uuid, text, text, uuid, integer, text[]) from anon, authenticated;
grant execute on function public.approve_regear_as_crafted(uuid, text, text, uuid, integer, text[]) to service_role;

drop function if exists public.approve_regear_from_stock(uuid, text, text, uuid, integer, text[]);
drop function if exists public.approve_regear_from_stock(uuid, text, text, uuid, integer, text[], text[]);

create or replace function public.approve_regear_from_stock(
  p_id uuid,
  p_admin_id text,
  p_admin_username text,
  p_guild_id uuid,
  p_payout_silver integer default null,
  p_item_ids text[] default '{}',
  p_included_slots text[] default array['weapon','head','armor','shoes','offhand']::text[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_discord text;
  v_claimed integer;
  v_credit  integer;
  v_mode    text;
  v_item_id text;
  v_current_qty integer;
  v_included_slots text[];
begin
  select coalesce(
           array_agg(allowed.slot order by allowed.ord),
           array['weapon','head','armor','shoes','offhand']::text[]
         )
    into v_included_slots
    from unnest(array['weapon','head','armor','shoes','offhand','cape']::text[])
         with ordinality as allowed(slot, ord)
   where allowed.slot = any(coalesce(p_included_slots, array['weapon','head','armor','shoes','offhand']::text[]));
  if array_length(v_included_slots, 1) is null then
    v_included_slots := array['weapon','head','armor','shoes','offhand']::text[];
  end if;

  select discord_id, claimed_silver, fulfillment_mode
    into v_discord, v_claimed, v_mode
    from regear_requests
   where id = p_id
     and guild_id = p_guild_id
     and status = 'pending'
   for update;

  if v_discord is null then
    raise exception 'REGEAR_NOT_PENDING';
  end if;
  if v_mode <> 'crafted' then
    raise exception 'REGEAR_NOT_CRAFTED_MODE';
  end if;
  if p_item_ids is null or array_length(p_item_ids, 1) is null then
    raise exception 'STOCK_NO_ITEMS';
  end if;

  v_credit := coalesce(p_payout_silver, v_claimed);
  if v_credit < 0 then v_credit := 0; end if;
  if v_credit > v_claimed then v_credit := v_claimed; end if;

  foreach v_item_id in array p_item_ids loop
    if v_item_id is null or length(trim(v_item_id)) = 0 then
      raise exception 'STOCK_ITEM_ID_EMPTY';
    end if;

    select quantity into v_current_qty
      from guild_inventory_gear
     where guild_id = p_guild_id
       and item_id = v_item_id
     for update;

    if v_current_qty is null or v_current_qty < 1 then
      raise exception 'INSUFFICIENT_STOCK: %', v_item_id;
    end if;
  end loop;

  foreach v_item_id in array p_item_ids loop
    update guild_inventory_gear
       set quantity = quantity - 1,
           updated_at = now(),
           updated_by_discord_id = p_admin_id
     where guild_id = p_guild_id
       and item_id = v_item_id;
  end loop;

  update regear_requests
     set status = 'approved',
         resolved_at = now(),
         payout_silver = v_credit,
         fulfillment_mode = 'stocked',
         craft_included_slots = to_jsonb(v_included_slots),
         handled_by = p_admin_id,
         handled_by_username = p_admin_username
   where id = p_id
     and guild_id = p_guild_id;
end;
$$;

comment on function public.approve_regear_from_stock(uuid, text, text, uuid, integer, text[], text[]) is
  '재고 직접 출고로 crafted 리기어를 승인하고 approval 시점의 craft_included_slots 를 보존한다.';

revoke all on function public.approve_regear_from_stock(uuid, text, text, uuid, integer, text[], text[]) from public;
revoke all on function public.approve_regear_from_stock(uuid, text, text, uuid, integer, text[], text[]) from anon, authenticated;
grant execute on function public.approve_regear_from_stock(uuid, text, text, uuid, integer, text[], text[]) to service_role;

create or replace function public.deliver_craft_task(
  p_task_id uuid,
  p_guild_id uuid,
  p_crafter_discord_id text,
  p_box_number integer,
  p_craft_city text,
  p_craft_focus_used boolean,
  p_material_silver_cost integer,
  p_expiry_days integer
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_compensation text;
  v_premium_pct integer;
  v_premium_silver integer;
  v_reimbursement integer;
  v_box_min integer;
  v_box_max integer;
begin
  select coalesce((select value::integer from public.app_settings
                    where key = 'craft_box_range_min' and guild_id = p_guild_id), 1),
         coalesce((select value::integer from public.app_settings
                    where key = 'craft_box_range_max' and guild_id = p_guild_id), 30)
    into v_box_min, v_box_max;

  if p_box_number < v_box_min or p_box_number > v_box_max then
    raise exception 'BOX_OUT_OF_RANGE';
  end if;
  if p_material_silver_cost < 0 then
    raise exception 'MATERIAL_COST_NEGATIVE';
  end if;
  if p_expiry_days < 1 or p_expiry_days > 30 then
    raise exception 'EXPIRY_OUT_OF_RANGE';
  end if;

  select compensation_mode, premium_silver
    into v_compensation, v_premium_pct
    from craft_tasks
   where id = p_task_id
     and guild_id = p_guild_id
     and status = 'claimed'
     and task_kind = 'regear'
     and crafter_discord_id = p_crafter_discord_id
   for update;

  if v_compensation is null then
    raise exception 'CRAFT_TASK_NOT_CLAIMED_BY_YOU';
  end if;

  if v_compensation = 'volunteer' then
    v_premium_silver := 0;
    v_reimbursement := 0;
  else
    v_premium_silver := floor(p_material_silver_cost * v_premium_pct / 100.0)::integer;
    v_reimbursement := p_material_silver_cost + v_premium_silver;
  end if;

  update craft_tasks
     set status = 'delivered',
         box_number = p_box_number,
         craft_city = p_craft_city,
         craft_focus_used = p_craft_focus_used,
         material_silver_cost = p_material_silver_cost,
         premium_silver = v_premium_silver,
         reimbursement_silver = v_reimbursement,
         reimbursement_status = case
           when v_compensation = 'paid' and v_reimbursement > 0 then 'pending'
           else 'not_required'
         end,
         reimbursement_approved_at = null,
         reimbursement_approved_by = null,
         reimbursement_approved_by_username = null,
         delivered_at = now(),
         expires_at = now() + make_interval(days => p_expiry_days)
   where id = p_task_id
     and guild_id = p_guild_id
     and status = 'claimed'
     and task_kind = 'regear';

  if not found then
    raise exception 'CRAFT_TASK_DELIVER_FAILED';
  end if;
end;
$$;

revoke all on function public.deliver_craft_task(uuid, uuid, text, integer, text, boolean, integer, integer) from public;
revoke all on function public.deliver_craft_task(uuid, uuid, text, integer, text, boolean, integer, integer) from anon, authenticated;
grant execute on function public.deliver_craft_task(uuid, uuid, text, integer, text, boolean, integer, integer) to service_role;

create or replace function public.expire_craft_tasks()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update craft_tasks
     set status = 'expired',
         expired_at = now()
   where status = 'delivered'
     and task_kind = 'regear'
     and expires_at is not null
     and expires_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.expire_craft_tasks() from public;
revoke all on function public.expire_craft_tasks() from anon, authenticated;
grant execute on function public.expire_craft_tasks() to service_role;

create or replace function public.approve_craft_reimbursement(
  p_task_id uuid,
  p_guild_id uuid,
  p_admin_id text,
  p_admin_username text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_crafter_discord_id text;
  v_reimbursement integer;
begin
  select crafter_discord_id, reimbursement_silver
    into v_crafter_discord_id, v_reimbursement
    from craft_tasks
   where id = p_task_id
     and guild_id = p_guild_id
     and task_kind = 'regear'
     and status = 'delivered'
     and reimbursement_status = 'pending'
   for update;

  if v_crafter_discord_id is null then
    raise exception 'CRAFT_REIMBURSEMENT_NOT_PENDING';
  end if;
  if coalesce(v_reimbursement, 0) <= 0 then
    raise exception 'CRAFT_REIMBURSEMENT_EMPTY';
  end if;

  insert into point_ledger (guild_id, discord_id, delta, reason, ref_id)
       values (p_guild_id, v_crafter_discord_id, v_reimbursement,
               'craft_reimbursement', p_task_id);

  update craft_tasks
     set reimbursement_status = 'approved',
         reimbursement_approved_at = now(),
         reimbursement_approved_by = p_admin_id,
         reimbursement_approved_by_username = p_admin_username
   where id = p_task_id
     and guild_id = p_guild_id
     and reimbursement_status = 'pending';

  if not found then
    raise exception 'CRAFT_REIMBURSEMENT_NOT_PENDING';
  end if;

  return v_reimbursement;
end;
$$;

revoke all on function public.approve_craft_reimbursement(uuid, uuid, text, text) from public;
revoke all on function public.approve_craft_reimbursement(uuid, uuid, text, text) from anon, authenticated;
grant execute on function public.approve_craft_reimbursement(uuid, uuid, text, text) to service_role;

comment on column public.regear_requests.craft_requested_slots is
  'Craft fulfillment slots requested at regear creation time.';
comment on column public.regear_requests.craft_included_slots is
  'Final craft fulfillment slots chosen at approval time.';
comment on column public.craft_tasks.reimbursement_status is
  'Crafter reimbursement workflow status for delivered regear craft tasks.';
