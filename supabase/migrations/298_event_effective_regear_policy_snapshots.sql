-- 298: Freeze one effective regear policy per event participant.
--
-- Legacy events and requests intentionally remain nullable. New event starts
-- use start_event_with_regear_policy_snapshots() to persist the source config,
-- participant policies, and battle_started_at in one transaction.

alter table public.events
  add column if not exists regear_policy_version_id uuid,
  add column if not exists regear_policy_config_snapshot jsonb,
  add column if not exists regear_policy_snapshotted_at timestamptz;

alter table public.events
  drop constraint if exists events_regear_policy_snapshot_complete_chk;

alter table public.events
  add constraint events_regear_policy_snapshot_complete_chk
  check (
    (
      regear_policy_version_id is null
      and regear_policy_config_snapshot is null
      and regear_policy_snapshotted_at is null
    )
    or
    (
      regear_policy_version_id is not null
      and regear_policy_config_snapshot is not null
      and jsonb_typeof(regear_policy_config_snapshot) = 'object'
      and octet_length(regear_policy_config_snapshot::text) <= 524288
      and regear_policy_snapshotted_at is not null
    )
  );

comment on column public.events.regear_policy_version_id is
  'Immutable policy version shared by the event config and all participant policy snapshots.';
comment on column public.events.regear_policy_config_snapshot is
  'Policy inputs frozen at operational event start. NULL means the event keeps the legacy request-time resolver.';
comment on column public.events.regear_policy_snapshotted_at is
  'Timestamp when the event effective regear policy inputs were frozen.';

alter table public.regear_windows
  add column if not exists regear_policy_version_id uuid,
  add column if not exists regear_policy_config_snapshot jsonb,
  add column if not exists regear_policy_snapshotted_at timestamptz;

alter table public.regear_windows
  drop constraint if exists regear_windows_policy_snapshot_complete_chk;

alter table public.regear_windows
  add constraint regear_windows_policy_snapshot_complete_chk
  check (
    (
      regear_policy_version_id is null
      and regear_policy_config_snapshot is null
      and regear_policy_snapshotted_at is null
    )
    or
    (
      regear_policy_version_id is not null
      and regear_policy_config_snapshot is not null
      and jsonb_typeof(regear_policy_config_snapshot) = 'object'
      and octet_length(regear_policy_config_snapshot::text) <= 524288
      and regear_policy_snapshotted_at is not null
    )
  );

comment on column public.regear_windows.regear_policy_config_snapshot is
  'Window-local policy inputs frozen when the free regear window is opened.';

create table if not exists public.event_regear_policy_snapshots (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  event_id uuid not null,
  policy_version_id uuid not null,
  discord_id text not null,
  username text not null,
  role_name text not null,
  manual_policy_snapshot jsonb not null,
  auto_policy_snapshot jsonb not null,
  source_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  foreign key (guild_id, event_id)
    references public.events(guild_id, id)
    on delete cascade,
  unique (guild_id, id),
  unique (guild_id, event_id, discord_id),
  constraint event_regear_policy_snapshots_identity_chk check (
    length(btrim(discord_id)) > 0
    and char_length(discord_id) <= 128
    and length(btrim(username)) > 0
    and char_length(username) <= 128
    and length(btrim(role_name)) > 0
    and char_length(role_name) <= 64
  ),
  constraint event_regear_policy_snapshots_json_chk check (
    jsonb_typeof(manual_policy_snapshot) = 'object'
    and jsonb_typeof(auto_policy_snapshot) = 'object'
    and jsonb_typeof(source_snapshot) = 'object'
    and octet_length(manual_policy_snapshot::text) <= 65536
    and octet_length(auto_policy_snapshot::text) <= 65536
    and octet_length(source_snapshot::text) <= 65536
  )
);

create index if not exists event_regear_policy_snapshots_member_idx
  on public.event_regear_policy_snapshots (guild_id, discord_id, event_id);

alter table public.event_regear_policy_snapshots enable row level security;

grant select, insert on public.event_regear_policy_snapshots to service_role;
revoke update, delete on public.event_regear_policy_snapshots from service_role;

alter table public.regear_requests
  add column if not exists event_regear_policy_snapshot_id uuid
    references public.event_regear_policy_snapshots(id) on delete set null,
  add column if not exists regear_origin_type text;

create index if not exists regear_requests_policy_snapshot_idx
  on public.regear_requests (guild_id, event_regear_policy_snapshot_id)
  where event_regear_policy_snapshot_id is not null;

comment on column public.regear_requests.event_regear_policy_snapshot_id is
  'Optional link to the immutable event participant policy used to create this request.';
comment on column public.regear_requests.regear_origin_type is
  'Stable source classification: event, free_window, or auto.';

create or replace function public.guard_regear_request_policy_snapshot_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guild_id uuid;
  v_event_id uuid;
  v_snapshot_id uuid;
  v_discord_id text;
begin
  -- Read the final row state when the deferred trigger runs. Event deletion
  -- can null event_id and the snapshot FK in either referential-action order.
  select
    request.guild_id,
    request.event_id,
    request.event_regear_policy_snapshot_id,
    request.discord_id
  into
    v_guild_id,
    v_event_id,
    v_snapshot_id,
    v_discord_id
  from public.regear_requests as request
  where request.id = new.id;

  if not found or v_snapshot_id is null then
    return null;
  end if;

  if v_event_id is null or not exists (
    select 1
    from public.event_regear_policy_snapshots as snapshot
    where snapshot.id = v_snapshot_id
      and snapshot.guild_id = v_guild_id
      and snapshot.event_id = v_event_id
      and snapshot.discord_id = v_discord_id
  ) then
    raise exception 'regear_policy_snapshot_scope_mismatch';
  end if;

  return null;
end;
$$;

drop trigger if exists guard_regear_request_policy_snapshot_scope
  on public.regear_requests;
create constraint trigger guard_regear_request_policy_snapshot_scope
  after insert or update
  on public.regear_requests
  deferrable initially deferred
  for each row
  when (new.event_regear_policy_snapshot_id is not null)
  execute function public.guard_regear_request_policy_snapshot_scope();

create or replace function public.guard_frozen_event_regear_slot_inputs()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_party_ids uuid[];
  v_locked boolean;
begin
  if tg_op = 'INSERT'
     and nullif(btrim(new.assigned_discord_id), '') is null then
    return new;
  end if;
  if tg_op = 'DELETE'
     and nullif(btrim(old.assigned_discord_id), '') is null then
    return old;
  end if;
  if tg_op = 'UPDATE'
     and nullif(btrim(old.assigned_discord_id), '') is null
     and nullif(btrim(new.assigned_discord_id), '') is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.party_id is not distinct from old.party_id
     and new.assigned_discord_id is not distinct from old.assigned_discord_id
     and new.assigned_username is not distinct from old.assigned_username
     and new.role_name is not distinct from old.role_name
     and new.manual_regear_excluded is not distinct from old.manual_regear_excluded
     and new.auto_regear_excluded is not distinct from old.auto_regear_excluded then
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_party_ids := array[new.party_id];
  elsif tg_op = 'DELETE' then
    v_party_ids := array[old.party_id];
  else
    v_party_ids := array[old.party_id, new.party_id];
  end if;

  -- Serialize participant-affecting slot writes with the event-start RPC.
  perform 1
  from public.events as e
  join public.parties as p
    on p.guild_id = e.guild_id
   and p.event_id = e.id
  where p.id = any(v_party_ids)
  for key share of e;

  select exists (
    select 1
    from public.events as e
    join public.parties as p
      on p.guild_id = e.guild_id
     and p.event_id = e.id
    where p.id = any(v_party_ids)
      and e.regear_policy_version_id is not null
  )
  into v_locked;

  if v_locked then
    raise exception 'event_regear_roster_locked';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_frozen_event_regear_slot_inputs on public.slots;
create trigger guard_frozen_event_regear_slot_inputs
  before insert or update or delete
  on public.slots
  for each row
  execute function public.guard_frozen_event_regear_slot_inputs();

create or replace function public.guard_frozen_event_regear_party_inputs()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_locked boolean;
  v_new_guild_id uuid;
  v_new_event_id uuid;
begin
  if tg_op = 'UPDATE'
     and new.guild_id is not distinct from old.guild_id
     and new.event_id is not distinct from old.event_id then
    return new;
  end if;

  if not exists (
    select 1
    from public.slots as slot
    where slot.party_id = old.id
      and slot.guild_id = old.guild_id
      and nullif(btrim(slot.assigned_discord_id), '') is not null
  ) then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    v_new_guild_id := new.guild_id;
    v_new_event_id := new.event_id;
  end if;

  perform 1
  from public.events as event
  where
    (event.guild_id = old.guild_id and event.id = old.event_id)
    or (
      event.guild_id = v_new_guild_id
      and event.id = v_new_event_id
    )
  for key share of event;

  select exists (
    select 1
    from public.events as event
    where (
      (event.guild_id = old.guild_id and event.id = old.event_id)
      or (
        event.guild_id = v_new_guild_id
        and event.id = v_new_event_id
      )
    )
      and event.regear_policy_version_id is not null
  )
  into v_locked;

  if v_locked then
    raise exception 'event_regear_roster_locked';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_frozen_event_regear_party_inputs
  on public.parties;
create trigger guard_frozen_event_regear_party_inputs
  before update or delete
  on public.parties
  for each row
  execute function public.guard_frozen_event_regear_party_inputs();

create or replace function public.guard_frozen_event_regear_participants()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_guild_id uuid;
  v_event_id uuid;
  v_policy_version_id uuid;
begin
  v_guild_id := case when tg_op = 'DELETE' then old.guild_id else new.guild_id end;
  v_event_id := case when tg_op = 'DELETE' then old.event_id else new.event_id end;

  select e.regear_policy_version_id
    into v_policy_version_id
  from public.events as e
  where e.guild_id = v_guild_id
    and e.id = v_event_id
  for key share of e;

  if v_policy_version_id is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' and exists (
    select 1
    from public.event_regear_policy_snapshots as snapshot
    where snapshot.guild_id = new.guild_id
      and snapshot.event_id = new.event_id
      and snapshot.policy_version_id = v_policy_version_id
      and snapshot.discord_id = new.discord_id
      and snapshot.role_name = new.role_name
  ) then
    return new;
  end if;

  raise exception 'event_regear_participant_locked';
end;
$$;

drop trigger if exists guard_frozen_event_regear_participants
  on public.event_regear_participants;
create trigger guard_frozen_event_regear_participants
  before insert or update or delete
  on public.event_regear_participants
  for each row
  execute function public.guard_frozen_event_regear_participants();

create or replace function public.guard_frozen_event_regear_role_overrides()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_locked boolean;
  v_old_guild_id uuid;
  v_old_event_id uuid;
  v_new_guild_id uuid;
  v_new_event_id uuid;
begin
  if tg_op <> 'INSERT' then
    v_old_guild_id := old.guild_id;
    v_old_event_id := old.event_id;
  end if;
  if tg_op <> 'DELETE' then
    v_new_guild_id := new.guild_id;
    v_new_event_id := new.event_id;
  end if;

  perform 1
  from public.events as event
  where
    (
      event.guild_id = v_old_guild_id
      and event.id = v_old_event_id
    )
    or (
      event.guild_id = v_new_guild_id
      and event.id = v_new_event_id
    )
  for key share of event;

  select exists (
    select 1
    from public.events as event
    where (
      (
        event.guild_id = v_old_guild_id
        and event.id = v_old_event_id
      )
      or (
        event.guild_id = v_new_guild_id
        and event.id = v_new_event_id
      )
    )
      and event.regear_policy_version_id is not null
  )
  into v_locked;

  if v_locked then
    raise exception 'event_regear_policy_locked';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_frozen_event_regear_role_overrides
  on public.event_regear_role_overrides;
create trigger guard_frozen_event_regear_role_overrides
  before insert or update or delete
  on public.event_regear_role_overrides
  for each row
  execute function public.guard_frozen_event_regear_role_overrides();

create or replace function public.guard_frozen_event_regear_config()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.regear_policy_version_id is not null
     and (
       new.category is distinct from old.category
       or new.regear_policy is distinct from old.regear_policy
       or new.regear_silver_cap is distinct from old.regear_silver_cap
       or new.regear_max_deaths_per_member is distinct from old.regear_max_deaths_per_member
       or new.regear_video_policy is distinct from old.regear_video_policy
       or new.regear_video_payout_rate_percent is distinct from old.regear_video_payout_rate_percent
       or new.regear_video_claim_ceiling_bonus_silver is distinct from old.regear_video_claim_ceiling_bonus_silver
       or new.regear_video_rate_applies_without_proof is distinct from old.regear_video_rate_applies_without_proof
       or new.regear_auto_policy is distinct from old.regear_auto_policy
       or new.regear_policy_version_id is distinct from old.regear_policy_version_id
       or new.regear_policy_config_snapshot is distinct from old.regear_policy_config_snapshot
       or new.regear_policy_snapshotted_at is distinct from old.regear_policy_snapshotted_at
     ) then
    raise exception 'event_regear_policy_locked';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_frozen_event_regear_config on public.events;
create trigger guard_frozen_event_regear_config
  before update
  on public.events
  for each row
  execute function public.guard_frozen_event_regear_config();

create or replace function public.guard_frozen_regear_window_policy()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.regear_policy_version_id is not null
     and (
       new.max_deaths_per_member is distinct from old.max_deaths_per_member
       or new.payout_rate_percent is distinct from old.payout_rate_percent
       or new.opens_at is distinct from old.opens_at
       or new.regear_policy_version_id is distinct from old.regear_policy_version_id
       or new.regear_policy_config_snapshot is distinct from old.regear_policy_config_snapshot
       or new.regear_policy_snapshotted_at is distinct from old.regear_policy_snapshotted_at
     ) then
    raise exception 'regear_window_policy_locked';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_frozen_regear_window_policy
  on public.regear_windows;
create trigger guard_frozen_regear_window_policy
  before update
  on public.regear_windows
  for each row
  execute function public.guard_frozen_regear_window_policy();

create or replace function public.guard_event_regear_policy_snapshot_insert()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_policy_version_id uuid;
begin
  select event.regear_policy_version_id
    into v_policy_version_id
  from public.events as event
  where event.guild_id = new.guild_id
    and event.id = new.event_id
  for key share of event;

  if v_policy_version_id is null
     or new.policy_version_id is distinct from v_policy_version_id then
    raise exception 'event_regear_policy_version_mismatch';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_event_regear_policy_snapshot_insert
  on public.event_regear_policy_snapshots;
create trigger guard_event_regear_policy_snapshot_insert
  before insert
  on public.event_regear_policy_snapshots
  for each row
  execute function public.guard_event_regear_policy_snapshot_insert();

create or replace function public.replace_event_regear_role_overrides(
  p_guild_id uuid,
  p_event_id uuid,
  p_rows jsonb,
  p_updated_by text
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_policy_version_id uuid;
  v_row jsonb;
  v_count integer;
begin
  if p_rows is null
     or jsonb_typeof(p_rows) <> 'array'
     or jsonb_array_length(p_rows) > 80
     or octet_length(p_rows::text) > 524288 then
    raise exception 'event_regear_role_overrides_invalid';
  end if;

  select event.regear_policy_version_id
    into v_policy_version_id
  from public.events as event
  where event.guild_id = p_guild_id
    and event.id = p_event_id
  for update of event;

  if not found then
    raise exception 'event_not_found';
  end if;
  if v_policy_version_id is not null then
    raise exception 'event_regear_policy_locked';
  end if;

  if (
    select count(*) <> count(distinct btrim(value ->> 'roleName'))
    from jsonb_array_elements(p_rows)
  ) then
    raise exception 'event_regear_role_overrides_invalid';
  end if;

  for v_row in
    select value from jsonb_array_elements(p_rows)
  loop
    if jsonb_typeof(v_row) <> 'object'
       or nullif(btrim(v_row ->> 'roleName'), '') is null
       or char_length(v_row ->> 'roleName') > 64
       or jsonb_typeof(v_row -> 'enabled') <> 'boolean'
       or (
         v_row -> 'silverCap' <> 'null'::jsonb
         and (
           jsonb_typeof(v_row -> 'silverCap') <> 'number'
           or (v_row ->> 'silverCap')::numeric <> trunc((v_row ->> 'silverCap')::numeric)
           or (v_row ->> 'silverCap')::numeric < 1
           or (v_row ->> 'silverCap')::numeric > 2000000000
         )
       )
       or (
         v_row -> 'payoutRatePercent' <> 'null'::jsonb
         and (
           jsonb_typeof(v_row -> 'payoutRatePercent') <> 'number'
           or (v_row ->> 'payoutRatePercent')::numeric
             <> trunc((v_row ->> 'payoutRatePercent')::numeric)
           or (v_row ->> 'payoutRatePercent')::numeric < 1
           or (v_row ->> 'payoutRatePercent')::numeric > 1000
         )
       )
       or (
         (v_row ->> 'enabled')::boolean = false
         and (
           v_row -> 'silverCap' <> 'null'::jsonb
           or v_row -> 'payoutRatePercent' <> 'null'::jsonb
         )
       ) then
      raise exception 'event_regear_role_overrides_invalid';
    end if;
  end loop;

  delete from public.event_regear_role_overrides
  where guild_id = p_guild_id
    and event_id = p_event_id;

  insert into public.event_regear_role_overrides (
    guild_id,
    event_id,
    role_name,
    enabled,
    silver_cap,
    payout_rate_percent,
    updated_by,
    updated_at
  )
  select
    p_guild_id,
    p_event_id,
    btrim(value ->> 'roleName'),
    (value ->> 'enabled')::boolean,
    nullif(value ->> 'silverCap', '')::integer,
    nullif(value ->> 'payoutRatePercent', '')::integer,
    p_updated_by,
    now()
  from jsonb_array_elements(p_rows);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.replace_event_regear_role_overrides(
  uuid, uuid, jsonb, text
) from public, anon, authenticated;
grant execute on function public.replace_event_regear_role_overrides(
  uuid, uuid, jsonb, text
) to service_role;

create or replace function public.create_auto_regear_request_with_policy_snapshot(
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
  p_fulfillment_mode text,
  p_build_snapshot jsonb,
  p_craft_requested_slots text[],
  p_regear_policy_snapshot jsonb,
  p_event_regear_policy_snapshot_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_policy_version_id uuid;
  v_request_id uuid;
begin
  select event.regear_policy_version_id
    into v_event_policy_version_id
  from public.events as event
  where event.guild_id = p_guild_id
    and event.id = p_event_id
  for key share of event;

  if not found then
    raise exception 'event_not_found';
  end if;
  if (
    v_event_policy_version_id is null
    and p_event_regear_policy_snapshot_id is not null
  ) or (
    v_event_policy_version_id is not null
    and p_event_regear_policy_snapshot_id is null
  ) then
    raise exception 'event_regear_policy_snapshot_required';
  end if;
  if p_event_regear_policy_snapshot_id is not null
     and not exists (
       select 1
       from public.event_regear_policy_snapshots as snapshot
       where snapshot.id = p_event_regear_policy_snapshot_id
         and snapshot.guild_id = p_guild_id
         and snapshot.event_id = p_event_id
         and snapshot.policy_version_id = v_event_policy_version_id
         and snapshot.discord_id = p_discord_id
     ) then
    raise exception 'regear_policy_snapshot_scope_mismatch';
  end if;

  v_request_id := public.create_auto_regear_request(
    p_guild_id,
    p_event_id,
    p_event_title,
    p_discord_id,
    p_username,
    p_role_name,
    p_silver,
    p_claimed_silver,
    p_payout_silver,
    p_killboard_event_id,
    p_gear_breakdown,
    p_price_warning_level,
    p_fulfillment_mode,
    p_build_snapshot,
    p_craft_requested_slots,
    p_regear_policy_snapshot
  );

  if v_request_id is not null
     and p_event_regear_policy_snapshot_id is not null then
    update public.regear_requests
    set event_regear_policy_snapshot_id =
      p_event_regear_policy_snapshot_id
    where id = v_request_id
      and guild_id = p_guild_id
      and event_id = p_event_id
      and discord_id = p_discord_id;
    if not found then
      raise exception 'regear_policy_snapshot_scope_mismatch';
    end if;
  end if;

  return v_request_id;
end;
$$;

revoke all on function public.create_auto_regear_request_with_policy_snapshot(
  uuid, uuid, text, text, text, text, integer, integer, integer, bigint,
  jsonb, text, text, jsonb, text[], jsonb, uuid
) from public, anon, authenticated;
grant execute on function public.create_auto_regear_request_with_policy_snapshot(
  uuid, uuid, text, text, text, text, integer, integer, integer, bigint,
  jsonb, text, text, jsonb, text[], jsonb, uuid
) to service_role;

create or replace function public.start_event_with_regear_policy_snapshots(
  p_guild_id uuid,
  p_event_id uuid,
  p_started_at timestamptz,
  p_policy_version_id uuid,
  p_policy_config_snapshot jsonb,
  p_participant_snapshots jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status text;
  v_category text;
  v_battle_started_at timestamptz;
  v_policy_version_id uuid;
  v_policy_config_snapshot jsonb;
  v_snapshotted_at timestamptz;
  v_participant jsonb;
  v_snapshot_count integer;
  v_roster_mismatch boolean;
  v_current_event_config jsonb;
  v_current_role_overrides jsonb;
begin
  if p_started_at is null then
    raise exception 'event_start_time_required';
  end if;
  if p_participant_snapshots is null
     or jsonb_typeof(p_participant_snapshots) <> 'array'
     or jsonb_array_length(p_participant_snapshots) > 1000
     or octet_length(p_participant_snapshots::text) > 16777216 then
    raise exception 'event_regear_participant_payload_invalid';
  end if;
  if p_policy_version_id is null
     or p_policy_config_snapshot is null
     or jsonb_typeof(p_policy_config_snapshot) <> 'object'
     or octet_length(p_policy_config_snapshot::text) > 524288
     or p_policy_config_snapshot -> 'version' is distinct from '1'::jsonb
     or p_policy_config_snapshot ->> 'policyVersionId'
       is distinct from p_policy_version_id::text
     or p_policy_config_snapshot ->> 'scope' is distinct from 'event'
     or p_policy_config_snapshot ->> 'guildId'
       is distinct from p_guild_id::text
     or p_policy_config_snapshot ->> 'eventId'
       is distinct from p_event_id::text
     or nullif(p_policy_config_snapshot ->> 'capturedAt', '') is null
     or jsonb_typeof(p_policy_config_snapshot -> 'event') <> 'object'
     or jsonb_typeof(p_policy_config_snapshot -> 'roleOverrides') <> 'array' then
    raise exception 'event_regear_policy_config_invalid';
  end if;

  select
    e.status,
    e.category,
    e.battle_started_at,
    e.regear_policy_version_id,
    e.regear_policy_config_snapshot,
    e.regear_policy_snapshotted_at,
    jsonb_build_object(
      'category', e.category,
      'policy', e.regear_policy,
      'silverCap', e.regear_silver_cap,
      'maxDeathsPerMember', e.regear_max_deaths_per_member,
      'videoPolicy', e.regear_video_policy,
      'videoPayoutRatePercent', e.regear_video_payout_rate_percent,
      'videoClaimCeilingBonusSilver', e.regear_video_claim_ceiling_bonus_silver,
      'videoRateAppliesWithoutProof',
        coalesce(e.regear_video_rate_applies_without_proof, false),
      'autoPolicy', e.regear_auto_policy
    )
  into
    v_status,
    v_category,
    v_battle_started_at,
    v_policy_version_id,
    v_policy_config_snapshot,
    v_snapshotted_at,
    v_current_event_config
  from public.events as e
  where e.guild_id = p_guild_id
    and e.id = p_event_id
  for update of e;

  if not found then
    raise exception 'event_not_found';
  end if;
  if v_status <> 'published' then
    raise exception 'event_not_published';
  end if;
  if v_battle_started_at is not null then
    raise exception 'event_already_started';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'roleName', override.role_name,
        'enabled', override.enabled,
        'silverCap', override.silver_cap,
        'payoutRatePercent', override.payout_rate_percent
      )
      order by override.role_name
    ),
    '[]'::jsonb
  )
  into v_current_role_overrides
  from public.event_regear_role_overrides as override
  where override.guild_id = p_guild_id
    and override.event_id = p_event_id;

  if p_policy_config_snapshot -> 'event'
       is distinct from v_current_event_config
     or p_policy_config_snapshot -> 'roleOverrides'
       is distinct from v_current_role_overrides then
    raise exception 'event_regear_policy_config_changed';
  end if;

  if v_policy_version_id is null then
    v_policy_version_id := p_policy_version_id;
    v_policy_config_snapshot := p_policy_config_snapshot;
    v_snapshotted_at := coalesce(
      nullif(p_policy_config_snapshot ->> 'capturedAt', '')::timestamptz,
      p_started_at
    );
  elsif p_policy_version_id is distinct from v_policy_version_id
     or p_policy_config_snapshot is distinct from v_policy_config_snapshot then
    raise exception 'event_regear_policy_version_mismatch';
  end if;

  for v_participant in
    select value from jsonb_array_elements(p_participant_snapshots)
  loop
    if jsonb_typeof(v_participant) <> 'object'
       or nullif(btrim(v_participant ->> 'discordId'), '') is null
       or nullif(btrim(v_participant ->> 'username'), '') is null
       or nullif(btrim(v_participant ->> 'roleName'), '') is null
       or jsonb_typeof(v_participant -> 'manualExcluded') <> 'boolean'
       or jsonb_typeof(v_participant -> 'autoExcluded') <> 'boolean'
       or (v_participant ->> 'policyVersionId')::uuid is distinct from v_policy_version_id
       or jsonb_typeof(v_participant -> 'manualPolicy') <> 'object'
       or jsonb_typeof(v_participant -> 'autoPolicy') <> 'object'
       or jsonb_typeof(v_participant -> 'sources') <> 'object' then
      raise exception 'event_regear_participant_snapshot_invalid';
    end if;
  end loop;

  with expected as (
    select
      s.assigned_discord_id as discord_id,
      btrim(s.role_name) as role_name,
      coalesce(s.manual_regear_excluded, false) as manual_excluded,
      coalesce(s.auto_regear_excluded, false) as auto_excluded
    from public.slots as s
    join public.parties as p
      on p.guild_id = s.guild_id
     and p.id = s.party_id
    where v_category = '전투'
      and p.guild_id = p_guild_id
      and p.event_id = p_event_id
      and nullif(btrim(s.assigned_discord_id), '') is not null
      and nullif(btrim(s.role_name), '') is not null

    union all

    select
      participant.discord_id,
      btrim(participant.role_name),
      false,
      true
    from public.event_regear_participants as participant
    where participant.guild_id = p_guild_id
      and participant.event_id = p_event_id
  ),
  provided as (
    select
      btrim(value ->> 'discordId') as discord_id,
      btrim(value ->> 'roleName') as role_name,
      (value ->> 'manualExcluded')::boolean as manual_excluded,
      (value ->> 'autoExcluded')::boolean as auto_excluded
    from jsonb_array_elements(p_participant_snapshots)
  )
  select exists (
    select 1 where
      (select count(*) from expected)
        <> (select count(*) from provided)
      or (select count(*) from expected)
        <> (select count(distinct discord_id) from expected)
      or (select count(*) from provided)
        <> (select count(distinct discord_id) from provided)
      or exists (
        select 1
        from expected
        full join provided
          on provided.discord_id = expected.discord_id
        where expected.discord_id is null
           or provided.discord_id is null
           or provided.role_name is distinct from expected.role_name
           or provided.manual_excluded is distinct from expected.manual_excluded
           or provided.auto_excluded is distinct from expected.auto_excluded
      )
  )
  into v_roster_mismatch;

  if v_roster_mismatch then
    raise exception 'event_regear_roster_changed';
  end if;

  update public.events
  set
    battle_started_at = p_started_at,
    regear_policy_version_id = v_policy_version_id,
    regear_policy_config_snapshot = v_policy_config_snapshot,
    regear_policy_snapshotted_at = v_snapshotted_at
  where guild_id = p_guild_id
    and id = p_event_id;

  insert into public.event_regear_policy_snapshots (
    guild_id,
    event_id,
    policy_version_id,
    discord_id,
    username,
    role_name,
    manual_policy_snapshot,
    auto_policy_snapshot,
    source_snapshot
  )
  select
    p_guild_id,
    p_event_id,
    v_policy_version_id,
    btrim(participant ->> 'discordId'),
    btrim(participant ->> 'username'),
    btrim(participant ->> 'roleName'),
    participant -> 'manualPolicy',
    participant -> 'autoPolicy',
    participant -> 'sources'
  from jsonb_array_elements(p_participant_snapshots) as participant
  on conflict (guild_id, event_id, discord_id) do nothing;

  select count(*)::integer
    into v_snapshot_count
  from public.event_regear_policy_snapshots
  where guild_id = p_guild_id
    and event_id = p_event_id
    and policy_version_id = v_policy_version_id;

  if v_snapshot_count <> jsonb_array_length(p_participant_snapshots) then
    raise exception 'event_regear_snapshot_count_mismatch';
  end if;

  return jsonb_build_object(
    'started_at', p_started_at,
    'policy_version_id', v_policy_version_id,
    'participant_snapshot_count', v_snapshot_count
  );
end;
$$;

revoke all on function public.start_event_with_regear_policy_snapshots(
  uuid, uuid, timestamptz, uuid, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.start_event_with_regear_policy_snapshots(
  uuid, uuid, timestamptz, uuid, jsonb, jsonb
) to service_role;

create or replace function public.add_event_regear_exception_participant(
  p_guild_id uuid,
  p_event_id uuid,
  p_policy_version_id uuid,
  p_discord_id text,
  p_username text,
  p_role_name text,
  p_added_by text,
  p_added_by_username text,
  p_manual_policy_snapshot jsonb,
  p_auto_policy_snapshot jsonb,
  p_source_snapshot jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_event_policy_version_id uuid;
  v_battle_started_at timestamptz;
  v_snapshot_id uuid;
begin
  select e.regear_policy_version_id, e.battle_started_at
    into v_event_policy_version_id, v_battle_started_at
  from public.events as e
  where e.guild_id = p_guild_id
    and e.id = p_event_id
  for update of e;

  if not found then
    raise exception 'event_not_found';
  end if;
  if v_battle_started_at is null or v_event_policy_version_id is null then
    raise exception 'event_regear_policy_not_frozen';
  end if;
  if p_policy_version_id is distinct from v_event_policy_version_id then
    raise exception 'event_regear_policy_version_mismatch';
  end if;
  if nullif(btrim(p_discord_id), '') is null
     or nullif(btrim(p_username), '') is null
     or nullif(btrim(p_role_name), '') is null
     or jsonb_typeof(p_manual_policy_snapshot) <> 'object'
     or jsonb_typeof(p_auto_policy_snapshot) <> 'object'
     or jsonb_typeof(p_source_snapshot) <> 'object' then
    raise exception 'event_regear_participant_snapshot_invalid';
  end if;
  if exists (
    select 1
    from public.event_regear_participants
    where guild_id = p_guild_id
      and event_id = p_event_id
      and discord_id = p_discord_id
  ) or exists (
    select 1
    from public.event_regear_policy_snapshots
    where guild_id = p_guild_id
      and event_id = p_event_id
      and discord_id = p_discord_id
  ) then
    raise exception 'event_regear_participant_locked';
  end if;

  insert into public.event_regear_policy_snapshots (
    guild_id,
    event_id,
    policy_version_id,
    discord_id,
    username,
    role_name,
    manual_policy_snapshot,
    auto_policy_snapshot,
    source_snapshot
  ) values (
    p_guild_id,
    p_event_id,
    v_event_policy_version_id,
    btrim(p_discord_id),
    btrim(p_username),
    btrim(p_role_name),
    p_manual_policy_snapshot,
    p_auto_policy_snapshot,
    p_source_snapshot
  )
  returning id into v_snapshot_id;

  insert into public.event_regear_participants (
    guild_id,
    event_id,
    discord_id,
    username,
    role_name,
    added_by,
    added_by_username
  ) values (
    p_guild_id,
    p_event_id,
    btrim(p_discord_id),
    btrim(p_username),
    btrim(p_role_name),
    p_added_by,
    p_added_by_username
  );

  return v_snapshot_id;
end;
$$;

revoke all on function public.add_event_regear_exception_participant(
  uuid, uuid, uuid, text, text, text, text, text, jsonb, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.add_event_regear_exception_participant(
  uuid, uuid, uuid, text, text, text, text, text, jsonb, jsonb, jsonb
) to service_role;
