-- 243: Event-local regear policy overrides.
--
-- Keep guild settings as defaults, but let a single event override video
-- benefits, automatic regear handling, and role-specific caps/rates. Fresh
-- requests snapshot the resolved policy so later settings edits do not mutate
-- pending review math.

alter table public.events
  add column if not exists regear_video_policy text not null default 'inherit',
  add column if not exists regear_video_payout_rate_percent integer,
  add column if not exists regear_video_claim_ceiling_bonus_silver integer,
  add column if not exists regear_auto_policy text not null default 'inherit';

alter table public.events
  drop constraint if exists events_regear_video_policy_chk;

alter table public.events
  add constraint events_regear_video_policy_chk
  check (regear_video_policy in ('inherit', 'disabled', 'custom'));

alter table public.events
  drop constraint if exists events_regear_video_payout_rate_chk;

alter table public.events
  add constraint events_regear_video_payout_rate_chk
  check (
    regear_video_payout_rate_percent is null
    or (regear_video_payout_rate_percent >= 1 and regear_video_payout_rate_percent <= 100)
  );

alter table public.events
  drop constraint if exists events_regear_video_claim_ceiling_bonus_chk;

alter table public.events
  add constraint events_regear_video_claim_ceiling_bonus_chk
  check (
    regear_video_claim_ceiling_bonus_silver is null
    or (
      regear_video_claim_ceiling_bonus_silver >= 0
      and regear_video_claim_ceiling_bonus_silver <= 2147483647
    )
  );

alter table public.events
  drop constraint if exists events_regear_video_custom_complete_chk;

alter table public.events
  add constraint events_regear_video_custom_complete_chk
  check (
    regear_video_policy <> 'custom'
    or (
      regear_video_payout_rate_percent is not null
      and regear_video_claim_ceiling_bonus_silver is not null
    )
  );

alter table public.events
  drop constraint if exists events_regear_auto_policy_chk;

alter table public.events
  add constraint events_regear_auto_policy_chk
  check (regear_auto_policy in ('inherit', 'disabled'));

comment on column public.events.regear_video_policy is
  'Event-local video proof benefit policy: inherit=use guild default, disabled=no video benefit, custom=use event columns.';
comment on column public.events.regear_video_payout_rate_percent is
  'Event-local video proof payout rate used when regear_video_policy=custom.';
comment on column public.events.regear_video_claim_ceiling_bonus_silver is
  'Event-local extra claim ceiling used when regear_video_policy=custom.';
comment on column public.events.regear_auto_policy is
  'Event-local automatic regear policy: inherit=use guild default, disabled=skip auto regear for this event.';

create table if not exists public.event_regear_role_overrides (
  guild_id uuid not null references public.tenants(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  role_name text not null,
  enabled boolean not null default true,
  silver_cap integer,
  payout_rate_percent integer,
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (guild_id, event_id, role_name),
  constraint event_regear_role_overrides_role_name_chk
    check (length(btrim(role_name)) > 0 and length(role_name) <= 64),
  constraint event_regear_role_overrides_silver_cap_chk
    check (silver_cap is null or (silver_cap >= 1 and silver_cap <= 2000000000)),
  constraint event_regear_role_overrides_payout_rate_chk
    check (payout_rate_percent is null or (payout_rate_percent >= 1 and payout_rate_percent <= 100)),
  constraint event_regear_role_overrides_disabled_empty_chk
    check (enabled or (silver_cap is null and payout_rate_percent is null))
);

create index if not exists event_regear_role_overrides_event_idx
  on public.event_regear_role_overrides (guild_id, event_id);

alter table public.event_regear_role_overrides enable row level security;

grant select, insert, update, delete on public.event_regear_role_overrides to service_role;

comment on table public.event_regear_role_overrides is
  'Per-event role cap/rate overrides. Missing row means inherit role_rewards for that role.';
comment on column public.event_regear_role_overrides.enabled is
  'false blocks this role from regear for the event.';
comment on column public.event_regear_role_overrides.silver_cap is
  'Event-local role claim ceiling. NULL inherits role_rewards.silver.';
comment on column public.event_regear_role_overrides.payout_rate_percent is
  'Event-local normal payout rate. NULL inherits role_rewards.payout_rate_percent then guild default.';

alter table public.regear_requests
  add column if not exists regear_policy_snapshot jsonb;

comment on column public.regear_requests.regear_policy_snapshot is
  'Resolved regear policy snapshot at request creation/update time. Approval uses this before current guild/event settings.';

drop function if exists public.create_auto_regear_request(
  uuid, uuid, text, text, text, text, integer, integer, integer, bigint, jsonb, text, text, jsonb, text[]
);
drop function if exists public.create_auto_regear_request(
  uuid, uuid, text, text, text, text, integer, integer, integer, bigint, jsonb, text, text, jsonb, text[], jsonb
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

  v_credit := coalesce(p_payout_silver, 0);
  if v_credit < 0 then v_credit := 0; end if;
  if v_credit > p_claimed_silver then v_credit := p_claimed_silver; end if;
  if v_credit > p_silver then v_credit := p_silver; end if;

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
  'killboard_event 기반 자동 리기어 1건을 status=pending 으로 생성하고, 이벤트 정책 snapshot 을 생성 시점에 고정한다.';

revoke all on function public.create_auto_regear_request(uuid, uuid, text, text, text, text, integer, integer, integer, bigint, jsonb, text, text, jsonb, text[], jsonb) from public;
revoke all on function public.create_auto_regear_request(uuid, uuid, text, text, text, text, integer, integer, integer, bigint, jsonb, text, text, jsonb, text[], jsonb) from anon, authenticated;
grant execute on function public.create_auto_regear_request(uuid, uuid, text, text, text, text, integer, integer, integer, bigint, jsonb, text, text, jsonb, text[], jsonb) to service_role;
