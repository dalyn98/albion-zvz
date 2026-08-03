-- Allow trusted event managers to correct the assigned slot roster after the
-- operational start without reopening member self-service recruitment or
-- making the rest of the event composition mutable.

create or replace function public.guard_started_event_slots()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_old_party_id uuid;
  v_new_party_id uuid;
  v_locked boolean;
  v_admin_roster_write boolean :=
    current_setting('app.started_event_admin_roster_write', true) = 'on'
    and current_user in ('postgres', 'service_role');
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;

  if v_admin_roster_write then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op <> 'INSERT' then
    v_old_party_id := old.party_id;
  end if;
  if tg_op <> 'DELETE' then
    v_new_party_id := new.party_id;
  end if;

  select exists (
    select 1
    from public.parties as party
    join public.events as event
      on event.guild_id = party.guild_id
     and event.id = party.event_id
    where event.battle_started_at is not null
      and (
        party.id = v_old_party_id
        or party.id = v_new_party_id
      )
  )
  into v_locked;

  if v_locked then
    raise exception 'event_operational_composition_locked';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.guard_frozen_event_regear_slot_inputs()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_party_ids uuid[];
  v_locked boolean;
  v_admin_roster_write boolean :=
    current_setting('app.started_event_admin_roster_write', true) = 'on'
    and current_user in ('postgres', 'service_role');
begin
  if v_admin_roster_write then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

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

create or replace function public.admin_direct_assign_event_slot(
  p_guild_id uuid,
  p_slot_id uuid,
  p_discord_id text,
  p_username text
) returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform 1
  from public.slots as slot
  join public.parties as party
    on party.guild_id = slot.guild_id
   and party.id = slot.party_id
  where slot.guild_id = p_guild_id
    and slot.id = p_slot_id
  for update of slot;
  if not found then
    raise exception 'SLOT_NOT_FOUND';
  end if;

  perform set_config('app.started_event_admin_roster_write', 'on', true);
  perform public.direct_assign_slot(p_slot_id, p_discord_id, p_username);
end;
$$;

create or replace function public.admin_cancel_event_slot(
  p_guild_id uuid,
  p_slot_id uuid,
  p_discord_id text
) returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform 1
  from public.slots as slot
  where slot.guild_id = p_guild_id
    and slot.id = p_slot_id
  for update;
  if not found then
    raise exception 'SLOT_NOT_FOUND';
  end if;

  perform set_config('app.started_event_admin_roster_write', 'on', true);
  perform public.cancel_slot(p_slot_id, p_discord_id);
end;
$$;

create or replace function public.admin_approve_event_slot_request(
  p_guild_id uuid,
  p_slot_id uuid
) returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform 1
  from public.slots as slot
  where slot.guild_id = p_guild_id
    and slot.id = p_slot_id
  for update;
  if not found then
    raise exception 'SLOT_NOT_FOUND';
  end if;

  perform set_config('app.started_event_admin_roster_write', 'on', true);
  perform public.approve_slot_request(p_slot_id);
end;
$$;

create or replace function public.admin_reject_event_slot_request(
  p_guild_id uuid,
  p_slot_id uuid
) returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform 1
  from public.slots as slot
  where slot.guild_id = p_guild_id
    and slot.id = p_slot_id
  for update;
  if not found then
    raise exception 'SLOT_NOT_FOUND';
  end if;

  perform set_config('app.started_event_admin_roster_write', 'on', true);
  perform public.reject_slot_request(p_slot_id);
end;
$$;

revoke all on function public.admin_direct_assign_event_slot(uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.admin_cancel_event_slot(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.admin_approve_event_slot_request(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.admin_reject_event_slot_request(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.admin_direct_assign_event_slot(uuid, uuid, text, text)
  to service_role;
grant execute on function public.admin_cancel_event_slot(uuid, uuid, text)
  to service_role;
grant execute on function public.admin_approve_event_slot_request(uuid, uuid)
  to service_role;
grant execute on function public.admin_reject_event_slot_request(uuid, uuid)
  to service_role;

comment on function public.admin_direct_assign_event_slot(uuid, uuid, text, text) is
  'Service-only slot assignment primitive used after the event start; caller authorization remains in the server action.';
comment on function public.admin_cancel_event_slot(uuid, uuid, text) is
  'Service-only slot removal primitive used after the event start; caller authorization remains in the server action.';
comment on function public.admin_approve_event_slot_request(uuid, uuid) is
  'Service-only pending-request approval primitive used after the event start; caller authorization remains in the server action.';
comment on function public.admin_reject_event_slot_request(uuid, uuid) is
  'Service-only pending-request rejection primitive used after the event start; caller authorization remains in the server action.';

notify pgrst, 'reload schema';
