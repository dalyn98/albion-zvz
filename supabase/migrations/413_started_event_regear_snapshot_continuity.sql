-- Keep the immutable event-start regear policy continuous when managers
-- correct a combat roster after operational start. A newly assigned member
-- receives a policy resolved from the already-frozen event config in the same
-- transaction as the slot write. Existing participant snapshots stay immutable.

create or replace function public.insert_event_regear_slot_participant_snapshot(
  p_guild_id uuid,
  p_slot_id uuid,
  p_policy_version_id uuid,
  p_discord_id text,
  p_username text,
  p_role_name text,
  p_manual_excluded boolean,
  p_auto_excluded boolean,
  p_manual_policy_snapshot jsonb,
  p_auto_policy_snapshot jsonb,
  p_source_snapshot jsonb,
  p_expected_slot_state text
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_event_id uuid;
  v_event_policy_version_id uuid;
  v_battle_started_at timestamptz;
  v_guest_regear_enabled boolean;
  v_slot_role_name text;
  v_slot_manual_excluded boolean;
  v_slot_auto_excluded boolean;
  v_assigned_discord_id text;
  v_requested_discord_id text;
  v_requested_username text;
  v_is_guest boolean;
  v_expected_manual_excluded boolean;
  v_expected_auto_excluded boolean;
  v_guild_member_id uuid;
  v_snapshot_id uuid;
begin
  if p_expected_slot_state not in ('assigned', 'requested', 'target')
     or nullif(btrim(p_discord_id), '') is null
     or char_length(p_discord_id) > 128
     or nullif(btrim(p_username), '') is null
     or char_length(p_username) > 128
     or nullif(btrim(p_role_name), '') is null
     or char_length(p_role_name) > 64
     or jsonb_typeof(p_manual_policy_snapshot) <> 'object'
     or jsonb_typeof(p_auto_policy_snapshot) <> 'object'
     or jsonb_typeof(p_source_snapshot) <> 'object' then
    raise exception 'event_regear_participant_snapshot_invalid';
  end if;

  select
    event.id,
    event.regear_policy_version_id,
    event.battle_started_at,
    event.guest_regear_enabled,
    slot.role_name,
    coalesce(slot.manual_regear_excluded, false),
    coalesce(slot.auto_regear_excluded, false),
    slot.assigned_discord_id,
    slot.requested_discord_id,
    slot.requested_username
  into
    v_event_id,
    v_event_policy_version_id,
    v_battle_started_at,
    v_guest_regear_enabled,
    v_slot_role_name,
    v_slot_manual_excluded,
    v_slot_auto_excluded,
    v_assigned_discord_id,
    v_requested_discord_id,
    v_requested_username
  from public.slots as slot
  join public.parties as party
    on party.guild_id = slot.guild_id
   and party.id = slot.party_id
  join public.events as event
    on event.guild_id = party.guild_id
   and event.id = party.event_id
  where slot.guild_id = p_guild_id
    and slot.id = p_slot_id
  for update of slot, event;

  if not found then
    raise exception 'SLOT_NOT_FOUND';
  end if;
  if v_battle_started_at is null or v_event_policy_version_id is null then
    raise exception 'event_regear_policy_not_frozen';
  end if;
  if p_policy_version_id is distinct from v_event_policy_version_id then
    raise exception 'event_regear_policy_version_mismatch';
  end if;
  if nullif(btrim(v_slot_role_name), '') is null
     or btrim(p_role_name) is distinct from btrim(v_slot_role_name) then
    raise exception 'event_regear_slot_role_mismatch';
  end if;
  if p_expected_slot_state = 'assigned'
     and btrim(coalesce(v_assigned_discord_id, ''))
       is distinct from btrim(p_discord_id) then
    raise exception 'event_regear_slot_participant_mismatch';
  end if;
  if p_expected_slot_state = 'requested'
     and (
       btrim(coalesce(v_requested_discord_id, ''))
         is distinct from btrim(p_discord_id)
       or btrim(coalesce(v_requested_username, ''))
         is distinct from btrim(p_username)
     ) then
    raise exception 'event_regear_slot_participant_mismatch';
  end if;

  select exists (
    select 1
    from public.event_guest_profiles as guest
    where guest.guild_id = p_guild_id
      and guest.event_id = v_event_id
      and guest.discord_id = btrim(p_discord_id)
  ) into v_is_guest;

  v_expected_manual_excluded :=
    v_slot_manual_excluded or (v_is_guest and not v_guest_regear_enabled);
  v_expected_auto_excluded := v_slot_auto_excluded or v_is_guest;
  if p_manual_excluded is distinct from v_expected_manual_excluded
     or p_auto_excluded is distinct from v_expected_auto_excluded then
    raise exception 'event_regear_slot_exclusion_mismatch';
  end if;

  v_guild_member_id := public.resolve_guild_member_id(
    p_guild_id,
    public.guild_member_access_identity_type(btrim(p_discord_id)),
    btrim(p_discord_id)
  );
  perform pg_advisory_xact_lock(
    hashtextextended(
      v_event_id::text || ':regear-snapshot:' ||
        coalesce(v_guild_member_id::text, btrim(p_discord_id)),
      0
    )
  );

  select snapshot.id
    into v_snapshot_id
  from public.event_regear_policy_snapshots as snapshot
  where snapshot.guild_id = p_guild_id
    and snapshot.event_id = v_event_id
    and snapshot.policy_version_id = v_event_policy_version_id
    and (
      snapshot.discord_id = btrim(p_discord_id)
      or (
        v_guild_member_id is not null
        and snapshot.guild_member_id = v_guild_member_id
      )
    )
  order by snapshot.created_at
  limit 1;
  if found then
    return v_snapshot_id;
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
    v_event_id,
    v_event_policy_version_id,
    btrim(p_discord_id),
    btrim(p_username),
    btrim(p_role_name),
    p_manual_policy_snapshot,
    p_auto_policy_snapshot,
    p_source_snapshot
  )
  on conflict (guild_id, event_id, discord_id) do nothing
  returning id into v_snapshot_id;

  if v_snapshot_id is null then
    select snapshot.id
      into v_snapshot_id
    from public.event_regear_policy_snapshots as snapshot
    where snapshot.guild_id = p_guild_id
      and snapshot.event_id = v_event_id
      and snapshot.policy_version_id = v_event_policy_version_id
      and snapshot.discord_id = btrim(p_discord_id);
  end if;
  if v_snapshot_id is null then
    raise exception 'event_regear_snapshot_insert_failed';
  end if;
  return v_snapshot_id;
end;
$$;

revoke all on function public.insert_event_regear_slot_participant_snapshot(
  uuid, uuid, uuid, text, text, text, boolean, boolean, jsonb, jsonb, jsonb, text
) from public, anon, authenticated;
grant execute on function public.insert_event_regear_slot_participant_snapshot(
  uuid, uuid, uuid, text, text, text, boolean, boolean, jsonb, jsonb, jsonb, text
) to service_role;

create or replace function public.add_event_regear_slot_participant_snapshot(
  p_guild_id uuid,
  p_slot_id uuid,
  p_policy_version_id uuid,
  p_discord_id text,
  p_username text,
  p_role_name text,
  p_manual_excluded boolean,
  p_auto_excluded boolean,
  p_manual_policy_snapshot jsonb,
  p_auto_policy_snapshot jsonb,
  p_source_snapshot jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
begin
  return public.insert_event_regear_slot_participant_snapshot(
    p_guild_id,
    p_slot_id,
    p_policy_version_id,
    p_discord_id,
    p_username,
    p_role_name,
    p_manual_excluded,
    p_auto_excluded,
    p_manual_policy_snapshot,
    p_auto_policy_snapshot,
    p_source_snapshot,
    'assigned'
  );
end;
$$;

create or replace function public.admin_direct_assign_event_slot_with_regear_snapshot(
  p_guild_id uuid,
  p_slot_id uuid,
  p_policy_version_id uuid,
  p_discord_id text,
  p_username text,
  p_role_name text,
  p_manual_excluded boolean,
  p_auto_excluded boolean,
  p_manual_policy_snapshot jsonb,
  p_auto_policy_snapshot jsonb,
  p_source_snapshot jsonb
) returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform public.insert_event_regear_slot_participant_snapshot(
    p_guild_id,
    p_slot_id,
    p_policy_version_id,
    p_discord_id,
    p_username,
    p_role_name,
    p_manual_excluded,
    p_auto_excluded,
    p_manual_policy_snapshot,
    p_auto_policy_snapshot,
    p_source_snapshot,
    'target'
  );
  perform set_config('app.started_event_admin_roster_write', 'on', true);
  perform public.direct_assign_slot(p_slot_id, p_discord_id, p_username);
end;
$$;

create or replace function public.admin_approve_event_slot_request_with_regear_snapshot(
  p_guild_id uuid,
  p_slot_id uuid,
  p_policy_version_id uuid,
  p_discord_id text,
  p_username text,
  p_role_name text,
  p_manual_excluded boolean,
  p_auto_excluded boolean,
  p_manual_policy_snapshot jsonb,
  p_auto_policy_snapshot jsonb,
  p_source_snapshot jsonb
) returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform public.insert_event_regear_slot_participant_snapshot(
    p_guild_id,
    p_slot_id,
    p_policy_version_id,
    p_discord_id,
    p_username,
    p_role_name,
    p_manual_excluded,
    p_auto_excluded,
    p_manual_policy_snapshot,
    p_auto_policy_snapshot,
    p_source_snapshot,
    'requested'
  );
  perform set_config('app.started_event_admin_roster_write', 'on', true);
  perform public.approve_slot_request(p_slot_id);
end;
$$;

revoke all on function public.add_event_regear_slot_participant_snapshot(
  uuid, uuid, uuid, text, text, text, boolean, boolean, jsonb, jsonb, jsonb
) from public, anon, authenticated;
revoke all on function public.admin_direct_assign_event_slot_with_regear_snapshot(
  uuid, uuid, uuid, text, text, text, boolean, boolean, jsonb, jsonb, jsonb
) from public, anon, authenticated;
revoke all on function public.admin_approve_event_slot_request_with_regear_snapshot(
  uuid, uuid, uuid, text, text, text, boolean, boolean, jsonb, jsonb, jsonb
) from public, anon, authenticated;

grant execute on function public.add_event_regear_slot_participant_snapshot(
  uuid, uuid, uuid, text, text, text, boolean, boolean, jsonb, jsonb, jsonb
) to service_role;
grant execute on function public.admin_direct_assign_event_slot_with_regear_snapshot(
  uuid, uuid, uuid, text, text, text, boolean, boolean, jsonb, jsonb, jsonb
) to service_role;
grant execute on function public.admin_approve_event_slot_request_with_regear_snapshot(
  uuid, uuid, uuid, text, text, text, boolean, boolean, jsonb, jsonb, jsonb
) to service_role;

create or replace function public.guard_started_event_regear_snapshot_continuity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_event_id uuid;
  v_policy_version_id uuid;
  v_guild_member_id uuid;
begin
  if nullif(btrim(new.assigned_discord_id), '') is null
     or (
       tg_op = 'UPDATE'
       and new.assigned_discord_id is not distinct from old.assigned_discord_id
     ) then
    return new;
  end if;

  select event.id, event.regear_policy_version_id
    into v_event_id, v_policy_version_id
  from public.parties as party
  join public.events as event
    on event.guild_id = party.guild_id
   and event.id = party.event_id
  where party.guild_id = new.guild_id
    and party.id = new.party_id
  for key share of event;

  if v_policy_version_id is null then
    return new;
  end if;

  v_guild_member_id := public.resolve_guild_member_id(
    new.guild_id,
    public.guild_member_access_identity_type(btrim(new.assigned_discord_id)),
    btrim(new.assigned_discord_id)
  );
  if not exists (
    select 1
    from public.event_regear_policy_snapshots as snapshot
    where snapshot.guild_id = new.guild_id
      and snapshot.event_id = v_event_id
      and snapshot.policy_version_id = v_policy_version_id
      and (
        snapshot.discord_id = btrim(new.assigned_discord_id)
        or (
          v_guild_member_id is not null
          and snapshot.guild_member_id = v_guild_member_id
        )
      )
  ) then
    raise exception 'event_regear_policy_snapshot_required';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_started_event_regear_snapshot_continuity
  on public.slots;
create trigger guard_started_event_regear_snapshot_continuity
  before insert or update of assigned_discord_id
  on public.slots
  for each row
  execute function public.guard_started_event_regear_snapshot_continuity();

revoke all on function public.guard_started_event_regear_snapshot_continuity()
  from public, anon, authenticated, service_role;

comment on function public.add_event_regear_slot_participant_snapshot(
  uuid, uuid, uuid, text, text, text, boolean, boolean, jsonb, jsonb, jsonb
) is 'Idempotently repairs a missing frozen policy snapshot for the currently assigned combat participant.';
comment on function public.admin_direct_assign_event_slot_with_regear_snapshot(
  uuid, uuid, uuid, text, text, text, boolean, boolean, jsonb, jsonb, jsonb
) is 'Atomically freezes the late participant policy and directly assigns a started-event slot.';
comment on function public.admin_approve_event_slot_request_with_regear_snapshot(
  uuid, uuid, uuid, text, text, text, boolean, boolean, jsonb, jsonb, jsonb
) is 'Atomically freezes the late participant policy and approves a started-event slot request.';

notify pgrst, 'reload schema';
