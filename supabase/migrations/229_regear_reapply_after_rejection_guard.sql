-- Make rejected regear rows fully non-blocking for fresh attempts.
--
-- Manual event/window/tracked-death submissions already ignore rejected rows in
-- application checks. Keep the same rule in auto-regear idempotency: a rejected
-- auto row is history, not an active duplicate.

drop index if exists public.regear_requests_auto_event_killboard_uniq;

create unique index regear_requests_auto_event_killboard_uniq
  on public.regear_requests (event_id, killboard_event_id)
  where auto_generated = true
    and status <> 'rejected';

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
  'killboard_event 기반 자동 리기어 1건을 status=pending 으로 생성한다. non-rejected 행만 idempotency 대상으로 보며, rejected 행은 새 신청을 막지 않는다.';

revoke all on function public.create_auto_regear_request(uuid, uuid, text, text, text, text, integer, integer, integer, bigint, jsonb, text, text, jsonb, text[]) from public;
revoke all on function public.create_auto_regear_request(uuid, uuid, text, text, text, text, integer, integer, integer, bigint, jsonb, text, text, jsonb, text[]) from anon, authenticated;
grant execute on function public.create_auto_regear_request(uuid, uuid, text, text, text, text, integer, integer, integer, bigint, jsonb, text, text, jsonb, text[]) to service_role;
