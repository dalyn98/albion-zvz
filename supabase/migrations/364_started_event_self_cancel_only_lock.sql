-- Started events remain operationally editable. The only participant-facing
-- roster lock is that a non-manager cannot remove their own assigned slot.
-- Historical start/closeout and regear snapshot fields stay immutable.

create or replace function public.guard_started_event_snapshot()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if pg_trigger_depth() <= 1 and old.battle_started_at is not null then
      raise exception 'event_operational_snapshot_locked';
    end if;
    return old;
  end if;

  if old.battle_started_at is not null
     and (
       new.battle_started_at is distinct from old.battle_started_at
       or new.published_at is distinct from old.published_at
       or new.operational_ended_at is distinct from old.operational_ended_at
       or new.created_by is distinct from old.created_by
       or new.regear_policy is distinct from old.regear_policy
       or new.regear_silver_cap is distinct from old.regear_silver_cap
       or new.regear_max_deaths_per_member
          is distinct from old.regear_max_deaths_per_member
       or new.regear_video_policy is distinct from old.regear_video_policy
       or new.regear_video_payout_rate_percent
          is distinct from old.regear_video_payout_rate_percent
       or new.regear_video_claim_ceiling_bonus_silver
          is distinct from old.regear_video_claim_ceiling_bonus_silver
       or new.regear_video_rate_applies_without_proof
          is distinct from old.regear_video_rate_applies_without_proof
       or new.regear_auto_policy is distinct from old.regear_auto_policy
       or new.regear_policy_version_id
          is distinct from old.regear_policy_version_id
       or new.regear_policy_config_snapshot
          is distinct from old.regear_policy_config_snapshot
       or new.regear_policy_snapshotted_at
          is distinct from old.regear_policy_snapshotted_at
       or new.tentative_snapshot_version_id
          is distinct from old.tentative_snapshot_version_id
       or new.tentative_snapshotted_at
          is distinct from old.tentative_snapshotted_at
     ) then
    raise exception 'event_operational_snapshot_locked';
  end if;
  return new;
end;
$$;

create or replace function public.guard_started_event_direct_child()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.guard_started_event_slots()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Regear uses copied policy/participant snapshots. Editing the live roster
-- after start must not rewrite those historical settlement inputs.
create or replace function public.guard_frozen_event_regear_slot_inputs()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.guard_frozen_event_regear_party_inputs()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Tentative availability remains editable while the event is published.
-- Stable identity ownership is still immutable and validated by its companion
-- projection trigger.
create or replace function public.guard_event_tentative_signup_recruitment()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_guild_id uuid;
  v_event_id uuid;
  v_status text;
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;

  if tg_op = 'UPDATE'
     and (
       new.guild_id is distinct from old.guild_id
       or new.event_id is distinct from old.event_id
       or new.discord_id is distinct from old.discord_id
     ) then
    raise exception 'event_tentative_identity_locked';
  end if;

  v_guild_id := case when tg_op = 'DELETE' then old.guild_id else new.guild_id end;
  v_event_id := case when tg_op = 'DELETE' then old.event_id else new.event_id end;

  select event.status
    into v_status
    from public.events as event
   where event.guild_id = v_guild_id
     and event.id = v_event_id
   for share of event;

  if not found then
    raise exception 'event_not_found';
  end if;
  if v_status <> 'published' then
    raise exception 'event_tentative_recruitment_closed';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.cleanup_tentative_on_slot_fill()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_guild_id uuid;
begin
  if new.assigned_discord_id is not null
     and (
       tg_op = 'INSERT'
       or new.assigned_discord_id is distinct from old.assigned_discord_id
     ) then
    select party.guild_id, party.event_id
      into v_guild_id, v_event_id
      from public.parties as party
     where party.id = new.party_id
       and party.guild_id = new.guild_id;

    if v_event_id is not null then
      delete from public.event_tentative_signups
       where guild_id = v_guild_id
         and event_id = v_event_id
         and discord_id = new.assigned_discord_id;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.cancel_slot(
  p_slot_id uuid,
  p_discord_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assigned text;
  v_requested text;
  v_battle_started_at timestamptz;
  v_manager_write boolean :=
    coalesce(
      current_setting('app.started_event_admin_roster_write', true) = 'on',
      false
    )
    and current_user in ('postgres', 'service_role');
begin
  select
    slot.assigned_discord_id,
    slot.requested_discord_id,
    event.battle_started_at
  into
    v_assigned,
    v_requested,
    v_battle_started_at
  from public.slots as slot
  join public.parties as party
    on party.guild_id = slot.guild_id
   and party.id = slot.party_id
  join public.events as event
    on event.guild_id = party.guild_id
   and event.id = party.event_id
  where slot.id = p_slot_id
  for update of slot, event;

  if not found or (v_assigned is null and v_requested is null) then
    raise exception 'SLOT_EMPTY';
  end if;

  if v_assigned = p_discord_id then
    if v_battle_started_at is not null and not v_manager_write then
      raise exception 'EVENT_PARTICIPANT_SELF_CANCEL_LOCKED';
    end if;

    update public.slots set
      assigned_discord_id   = null,
      assigned_username     = null,
      assigned_weapon_name  = null, assigned_weapon_id  = null,
      assigned_head_name    = null, assigned_head_id    = null,
      assigned_armor_name   = null, assigned_armor_id   = null,
      assigned_shoes_name   = null, assigned_shoes_id   = null,
      assigned_offhand_name = null, assigned_offhand_id = null,
      assigned_potion_name  = null, assigned_potion_id  = null,
      assigned_food_name    = null, assigned_food_id    = null,
      assigned_cape_name    = null, assigned_cape_id    = null,
      assigned_mount_name   = null, assigned_mount_id   = null
    where id = p_slot_id;
  elsif v_requested = p_discord_id then
    update public.slots set
      requested_discord_id = null,
      requested_username   = null,
      requested_picks      = null,
      requested_at         = null
    where id = p_slot_id;
  else
    raise exception 'NOT_OWNER';
  end if;
end;
$$;

revoke all on function public.cancel_slot(uuid, text)
  from public, anon, authenticated;
grant execute on function public.cancel_slot(uuid, text)
  to service_role;
revoke all on function public.cleanup_tentative_on_slot_fill()
  from public, anon, authenticated, service_role;

comment on function public.guard_started_event_snapshot() is
  'Keeps operational and settlement history immutable while allowing ordinary event fields to be edited after start.';
comment on function public.guard_started_event_direct_child() is
  'Allows authorized server actions to edit started-event parties and build-sheet composition.';
comment on function public.guard_started_event_slots() is
  'Allows authorized server actions to edit started-event slots; participant self-removal is enforced by cancel_slot.';
comment on function public.guard_frozen_event_regear_slot_inputs() is
  'Allows live roster corrections after a copied regear snapshot has been captured.';
comment on function public.guard_frozen_event_regear_party_inputs() is
  'Allows live party corrections after a copied regear snapshot has been captured.';
comment on function public.guard_event_tentative_signup_recruitment() is
  'Allows tentative availability edits throughout a published event while preserving tenant/event/member identity.';
comment on function public.cleanup_tentative_on_slot_fill() is
  'Removes live tentative availability whenever a confirmed slot assignment is made, including after operational start.';
comment on function public.cancel_slot(uuid, text) is
  'Cancels a pending request at any time, but blocks non-manager self-removal from an assigned slot after event start.';

notify pgrst, 'reload schema';
