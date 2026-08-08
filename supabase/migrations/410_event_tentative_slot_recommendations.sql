-- 410: Let event managers recommend an existing compatible slot to a
-- tentative participant without assigning or reserving that slot.
--
-- Recommendations are recruitment guidance only. The atomic RPC validates
-- tenant/event ownership, an empty visible slot, and an exact role match.
-- Snapshot columns preserve what the participant saw when operational start
-- froze tentative availability.

alter table public.event_tentative_signups
  add column if not exists recommended_slot_id uuid,
  add column if not exists recommended_by_discord_id text,
  add column if not exists recommended_at timestamptz;

alter table public.event_tentative_signup_snapshots
  add column if not exists recommended_slot_id uuid,
  add column if not exists recommended_by_discord_id text,
  add column if not exists recommended_at timestamptz;

alter table public.event_tentative_signups
  drop constraint if exists event_tentative_recommendation_complete_chk;
alter table public.event_tentative_signups
  add constraint event_tentative_recommendation_complete_chk
  check (
    (
      recommended_slot_id is null
      and recommended_by_discord_id is null
      and recommended_at is null
    )
    or (
      recommended_slot_id is not null
      and nullif(btrim(recommended_by_discord_id), '') is not null
      and recommended_at is not null
    )
  );

alter table public.event_tentative_signup_snapshots
  drop constraint if exists event_tentative_snapshot_recommendation_complete_chk;
alter table public.event_tentative_signup_snapshots
  add constraint event_tentative_snapshot_recommendation_complete_chk
  check (
    (
      recommended_slot_id is null
      and recommended_by_discord_id is null
      and recommended_at is null
    )
    or (
      recommended_slot_id is not null
      and nullif(btrim(recommended_by_discord_id), '') is not null
      and recommended_at is not null
    )
  );

comment on column public.event_tentative_signups.recommended_slot_id is
  'Non-reserving manager recommendation for a compatible event slot.';
comment on column public.event_tentative_signups.recommended_by_discord_id is
  'Tenant-scoped manager identity that last changed the recommendation.';
comment on column public.event_tentative_signups.recommended_at is
  'Timestamp of the current slot recommendation.';

-- If a participant edits their possible roles, retain the recommendation only
-- while the referenced slot is still visible, empty, in the same event, and
-- exactly matches one of those roles. This also protects internal direct writes.
create or replace function public.normalize_event_tentative_slot_recommendation()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_role_name text;
begin
  if new.recommended_slot_id is null then
    new.recommended_by_discord_id := null;
    new.recommended_at := null;
    return new;
  end if;

  select slot.role_name
    into v_role_name
    from public.slots as slot
    join public.parties as party
      on party.guild_id = slot.guild_id
     and party.id = slot.party_id
   where slot.guild_id = new.guild_id
     and slot.id = new.recommended_slot_id
     and party.event_id = new.event_id
     and slot.is_hidden = false
     and slot.assigned_discord_id is null
     and slot.requested_discord_id is null;

  if not found
     or v_role_name is null
     or not (v_role_name = any(new.possible_roles)) then
    new.recommended_slot_id := null;
    new.recommended_by_discord_id := null;
    new.recommended_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists normalize_event_tentative_slot_recommendation
  on public.event_tentative_signups;
create trigger normalize_event_tentative_slot_recommendation
  before insert or update of possible_roles,
    recommended_slot_id,
    recommended_by_discord_id,
    recommended_at
  on public.event_tentative_signups
  for each row
  execute function public.normalize_event_tentative_slot_recommendation();

-- A recommendation never reserves the slot. Clear the live hint if another
-- workflow fills, requests, hides, re-roles, or deletes that slot.
create or replace function public.clear_event_tentative_slot_recommendations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE'
     or new.is_hidden = true
     or new.assigned_discord_id is not null
     or new.requested_discord_id is not null
     or new.role_name is distinct from old.role_name then
    update public.event_tentative_signups as signup
       set recommended_slot_id = null,
           recommended_by_discord_id = null,
           recommended_at = null
      from public.events as event
     where signup.guild_id = old.guild_id
       and signup.recommended_slot_id = old.id
       and event.guild_id = signup.guild_id
       and event.id = signup.event_id
       and event.status = 'published';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists clear_event_tentative_slot_recommendations
  on public.slots;
create trigger clear_event_tentative_slot_recommendations
  before delete or update of is_hidden,
    assigned_discord_id,
    requested_discord_id,
    role_name
  on public.slots
  for each row
  execute function public.clear_event_tentative_slot_recommendations();

create or replace function public.set_event_tentative_slot_recommendation(
  p_guild_id uuid,
  p_event_id uuid,
  p_discord_id text,
  p_slot_id uuid,
  p_actor_discord_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_battle_started_at timestamptz;
  v_snapshot_version_id uuid;
  v_possible_roles text[];
  v_slot_role text;
  v_previous_slot_id uuid;
begin
  if nullif(btrim(p_discord_id), '') is null
     or nullif(btrim(p_actor_discord_id), '') is null then
    raise exception 'TENTATIVE_RECOMMENDATION_IDENTITY_REQUIRED';
  end if;

  -- Follow the roster mutation lock order (slot -> signup -> event) so a
  -- concurrent slot fill cannot deadlock this recommendation write.
  if p_slot_id is not null then
    select slot.role_name
      into v_slot_role
      from public.slots as slot
      join public.parties as party
        on party.guild_id = slot.guild_id
       and party.id = slot.party_id
     where slot.guild_id = p_guild_id
       and slot.id = p_slot_id
       and party.event_id = p_event_id
       and slot.is_hidden = false
       and slot.assigned_discord_id is null
       and slot.requested_discord_id is null
     for update of slot;

    if not found then
      raise exception 'TENTATIVE_RECOMMENDATION_SLOT_UNAVAILABLE';
    end if;
  end if;

  select signup.possible_roles, signup.recommended_slot_id
    into v_possible_roles, v_previous_slot_id
    from public.event_tentative_signups as signup
   where signup.guild_id = p_guild_id
     and signup.event_id = p_event_id
     and signup.discord_id = btrim(p_discord_id)
   for update of signup;

  if not found then
    raise exception 'TENTATIVE_SIGNUP_NOT_FOUND';
  end if;

  select event.status, event.battle_started_at, event.tentative_snapshot_version_id
    into v_status, v_battle_started_at, v_snapshot_version_id
    from public.events as event
   where event.guild_id = p_guild_id
     and event.id = p_event_id
   for update of event;

  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;
  if v_status <> 'published'
     or v_battle_started_at is not null
     or v_snapshot_version_id is not null then
    raise exception 'TENTATIVE_RECOMMENDATION_CLOSED';
  end if;

  if p_slot_id is not null
     and (v_slot_role is null or not (v_slot_role = any(v_possible_roles))) then
    raise exception 'TENTATIVE_RECOMMENDATION_ROLE_MISMATCH';
  end if;

  update public.event_tentative_signups
     set recommended_slot_id = p_slot_id,
         recommended_by_discord_id = case
           when p_slot_id is null then null
           else btrim(p_actor_discord_id)
         end,
         recommended_at = case
           when p_slot_id is null then null
           else statement_timestamp()
         end
   where guild_id = p_guild_id
     and event_id = p_event_id
     and discord_id = btrim(p_discord_id);

  insert into public.admin_audit_log (
    guild_id,
    admin_discord_id,
    action,
    target_id,
    target_kind,
    target_discord_id,
    details
  ) values (
    p_guild_id,
    btrim(p_actor_discord_id),
    case
      when p_slot_id is null then 'event.tentative_slot_recommendation.clear'
      else 'event.tentative_slot_recommendation.set'
    end,
    p_event_id::text,
    'event',
    btrim(p_discord_id),
    jsonb_build_object(
      'previousSlotId', v_previous_slot_id,
      'recommendedSlotId', p_slot_id
    )
  );
end;
$$;

revoke all on function public.set_event_tentative_slot_recommendation(
  uuid, uuid, text, uuid, text
) from public, anon, authenticated;
grant execute on function public.set_event_tentative_slot_recommendation(
  uuid, uuid, text, uuid, text
) to service_role;

revoke all on function public.normalize_event_tentative_slot_recommendation()
  from public, anon, authenticated, service_role;
revoke all on function public.clear_event_tentative_slot_recommendations()
  from public, anon, authenticated, service_role;

-- Preserve the current recommendation in the immutable weak-availability
-- snapshot captured at operational start.
create or replace function public.capture_event_tentative_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.battle_started_at is null
     and new.battle_started_at is not null
     and old.tentative_snapshot_version_id is null then
    insert into public.event_tentative_signup_snapshots (
      guild_id,
      event_id,
      snapshot_version_id,
      discord_id,
      username,
      possible_roles,
      notes,
      recommended_slot_id,
      recommended_by_discord_id,
      recommended_at,
      source_created_at,
      source_updated_at,
      captured_at
    )
    select
      signup.guild_id,
      signup.event_id,
      new.tentative_snapshot_version_id,
      signup.discord_id,
      signup.username,
      signup.possible_roles,
      signup.notes,
      signup.recommended_slot_id,
      signup.recommended_by_discord_id,
      signup.recommended_at,
      signup.created_at,
      signup.updated_at,
      new.tentative_snapshotted_at
    from public.event_tentative_signups as signup
    where signup.guild_id = new.guild_id
      and signup.event_id = new.id
      and not exists (
        select 1
        from public.slots as slot
        join public.parties as party
          on party.guild_id = slot.guild_id
         and party.id = slot.party_id
        where party.guild_id = new.guild_id
          and party.event_id = new.id
          and slot.assigned_discord_id = signup.discord_id
      );
  end if;

  return new;
end;
$$;

comment on function public.set_event_tentative_slot_recommendation(
  uuid, uuid, text, uuid, text
) is 'Atomically sets or clears a non-reserving compatible slot recommendation before event start.';
comment on function public.clear_event_tentative_slot_recommendations() is
  'Clears live tentative recommendations when a slot stops being recommendable.';

notify pgrst, 'reload schema';
