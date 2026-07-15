-- 266: Allow bounded role-specific regear bonuses above the claim ceiling.
--
-- Guild default and video rates remain 1..100. Only role_rewards, Discord-role
-- policies, and event role overrides may use 1..1000. Approval RPCs cap the
-- resulting integer at both 10x the request basis and PostgreSQL integer max.

alter table public.role_rewards
  drop constraint if exists role_rewards_payout_rate_percent_check;

alter table public.role_rewards
  add constraint role_rewards_payout_rate_percent_check
  check (payout_rate_percent >= 1 and payout_rate_percent <= 1000);

alter table public.regear_discord_role_policies
  drop constraint if exists regear_discord_role_policies_payout_rate_percent_chk;

alter table public.regear_discord_role_policies
  add constraint regear_discord_role_policies_payout_rate_percent_chk
  check (
    payout_rate_percent is null
    or (payout_rate_percent >= 1 and payout_rate_percent <= 1000)
  );

alter table public.event_regear_role_overrides
  drop constraint if exists event_regear_role_overrides_payout_rate_chk;

alter table public.event_regear_role_overrides
  add constraint event_regear_role_overrides_payout_rate_chk
  check (
    payout_rate_percent is null
    or (payout_rate_percent >= 1 and payout_rate_percent <= 1000)
  );

comment on column public.role_rewards.payout_rate_percent is
  'Required per-role regear payout rate (1..1000). Values above 100 pay a role bonus.';
comment on column public.regear_discord_role_policies.payout_rate_percent is
  'Per-Discord-role payout rate override (1..1000). Values above 100 pay a role bonus; NULL keeps legacy fallback.';
comment on column public.event_regear_role_overrides.payout_rate_percent is
  'Event-local role payout rate (1..1000). Values above 100 pay a role bonus; NULL inherits the role policy.';

create or replace function public.approve_regear_request(
  p_id uuid,
  p_admin_id text,
  p_admin_username text,
  p_guild_id uuid,
  p_payout_silver integer default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_discord text;
  v_claimed integer;
  v_silver integer;
  v_base_silver integer;
  v_basis integer;
  v_max_credit integer;
  v_credit integer;
begin
  select discord_id, claimed_silver, silver, base_silver
    into v_discord, v_claimed, v_silver, v_base_silver
    from regear_requests
   where id = p_id
     and guild_id = p_guild_id
     and status = 'pending'
   for update;

  if v_discord is null then
    raise exception 'REGEAR_NOT_PENDING';
  end if;

  v_basis := greatest(coalesce(v_claimed, 0), coalesce(v_silver, 0), coalesce(v_base_silver, 0));
  v_max_credit := least(2147483647::numeric, v_basis::numeric * 10)::integer;
  v_credit := coalesce(p_payout_silver, v_claimed, 0);
  if v_credit < 0 then v_credit := 0; end if;
  if v_credit > v_max_credit then v_credit := v_max_credit; end if;

  update regear_requests
     set status = 'approved',
         resolved_at = now(),
         payout_silver = v_credit,
         fulfillment_mode = 'silver',
         handled_by = p_admin_id,
         handled_by_username = p_admin_username
   where id = p_id
     and guild_id = p_guild_id;

  insert into point_ledger (guild_id, discord_id, delta, reason, ref_id)
       values (p_guild_id, v_discord, v_credit, 'regear_approved', p_id);

  update craft_tasks
     set status = 'cancelled',
         cancelled_at = now()
   where regear_request_id = p_id
     and guild_id = p_guild_id
     and status in ('queued', 'claimed');
end;
$$;

comment on function public.approve_regear_request(uuid, text, text, uuid, integer) is
  '리기어 실버 승인. 역할별 1..1000% 보너스를 허용하되 요청 기준액의 10배와 PostgreSQL integer 최대값으로 방어한다.';

revoke all on function public.approve_regear_request(uuid, text, text, uuid, integer) from public;
revoke all on function public.approve_regear_request(uuid, text, text, uuid, integer) from anon, authenticated;
grant execute on function public.approve_regear_request(uuid, text, text, uuid, integer) to service_role;

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
  p_craft_requested_slots text[] default null,
  p_regear_policy_snapshot jsonb default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing uuid;
  v_manual_count integer;
  v_new_id uuid;
  v_basis integer;
  v_max_credit integer;
  v_credit integer;
  v_mode text;
begin
  if p_fulfillment_mode not in ('silver', 'crafted') then
    raise exception 'INVALID_FULFILLMENT_MODE';
  end if;
  v_mode := p_fulfillment_mode;

  if p_silver is null or p_silver <= 0 then
    return null;
  end if;

  select id into v_existing
    from regear_requests
   where guild_id = p_guild_id
     and event_id = p_event_id
     and killboard_event_id = p_killboard_event_id
     and auto_generated = true
     and status <> 'rejected';
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

  v_basis := greatest(coalesce(p_claimed_silver, 0), coalesce(p_silver, 0));
  v_max_credit := least(2147483647::numeric, v_basis::numeric * 10)::integer;
  v_credit := coalesce(p_payout_silver, 0);
  if v_credit < 0 then v_credit := 0; end if;
  if v_credit > v_max_credit then v_credit := v_max_credit; end if;

  insert into regear_requests (
    guild_id,
    event_id, event_title_snapshot, discord_id, username, role_name,
    base_silver, silver, claimed_silver, payout_silver,
    screenshot_path, killboard_verified, killboard_event_id,
    status, resolved_at, handled_by_username,
    auto_generated, gear_breakdown, request_type, price_warning_level,
    fulfillment_mode, build_snapshot, craft_requested_slots,
    regear_policy_snapshot
  ) values (
    p_guild_id,
    p_event_id, p_event_title, p_discord_id, p_username, p_role_name,
    p_silver, p_silver, p_claimed_silver, v_credit,
    null, true, p_killboard_event_id,
    'pending', null, null,
    true, p_gear_breakdown, 'death', p_price_warning_level,
    v_mode, p_build_snapshot, to_jsonb(p_craft_requested_slots),
    p_regear_policy_snapshot
  ) returning id into v_new_id;

  return v_new_id;
end;
$$;

comment on function public.create_auto_regear_request(uuid, uuid, text, text, text, text, integer, integer, integer, bigint, jsonb, text, text, jsonb, text[], jsonb) is
  '자동 리기어 pending 생성. 역할별 보너스 지급액을 요청 기준액의 10배와 PostgreSQL integer 최대값 안에서 보존한다.';

revoke all on function public.create_auto_regear_request(uuid, uuid, text, text, text, text, integer, integer, integer, bigint, jsonb, text, text, jsonb, text[], jsonb) from public;
revoke all on function public.create_auto_regear_request(uuid, uuid, text, text, text, text, integer, integer, integer, bigint, jsonb, text, text, jsonb, text[], jsonb) from anon, authenticated;
grant execute on function public.create_auto_regear_request(uuid, uuid, text, text, text, text, integer, integer, integer, bigint, jsonb, text, text, jsonb, text[], jsonb) to service_role;

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
  v_silver integer;
  v_base_silver integer;
  v_basis integer;
  v_max_credit integer;
  v_credit integer;
  v_mode text;
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

  select discord_id, claimed_silver, silver, base_silver, fulfillment_mode, build_snapshot
    into v_discord, v_claimed, v_silver, v_base_silver, v_mode, v_snapshot
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

  v_basis := greatest(coalesce(v_claimed, 0), coalesce(v_silver, 0), coalesce(v_base_silver, 0));
  v_max_credit := least(2147483647::numeric, v_basis::numeric * 10)::integer;
  v_credit := coalesce(p_payout_silver, v_claimed, 0);
  if v_credit < 0 then v_credit := 0; end if;
  if v_credit > v_max_credit then v_credit := v_max_credit; end if;

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
  'crafted 승인 시 역할별 보너스가 반영된 payout snapshot 과 최종 제작 슬롯을 보존한다.';

revoke all on function public.approve_regear_as_crafted(uuid, text, text, uuid, integer, text[]) from public;
revoke all on function public.approve_regear_as_crafted(uuid, text, text, uuid, integer, text[]) from anon, authenticated;
grant execute on function public.approve_regear_as_crafted(uuid, text, text, uuid, integer, text[]) to service_role;

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
  v_silver integer;
  v_base_silver integer;
  v_basis integer;
  v_max_credit integer;
  v_credit integer;
  v_mode text;
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

  select discord_id, claimed_silver, silver, base_silver, fulfillment_mode
    into v_discord, v_claimed, v_silver, v_base_silver, v_mode
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

  v_basis := greatest(coalesce(v_claimed, 0), coalesce(v_silver, 0), coalesce(v_base_silver, 0));
  v_max_credit := least(2147483647::numeric, v_basis::numeric * 10)::integer;
  v_credit := coalesce(p_payout_silver, v_claimed, 0);
  if v_credit < 0 then v_credit := 0; end if;
  if v_credit > v_max_credit then v_credit := v_max_credit; end if;

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
  '재고 출고 승인 시 역할별 보너스가 반영된 payout snapshot 과 최종 지급 슬롯을 보존한다.';

revoke all on function public.approve_regear_from_stock(uuid, text, text, uuid, integer, text[], text[]) from public;
revoke all on function public.approve_regear_from_stock(uuid, text, text, uuid, integer, text[], text[]) from anon, authenticated;
grant execute on function public.approve_regear_from_stock(uuid, text, text, uuid, integer, text[], text[]) to service_role;
