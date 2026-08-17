-- 414: Operational start freezes participant self-cancellation, not recruitment.
-- Late slot signups remain available and receive an immutable regear policy
-- snapshot in the same transaction as their slot request/assignment.

create or replace function public.assign_event_slot_with_regear_snapshot(
  p_guild_id uuid,
  p_event_id uuid,
  p_slot_id uuid,
  p_picks jsonb,
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
  if not exists (
    select 1
    from public.slots as slot
    join public.parties as party
      on party.guild_id = slot.guild_id
     and party.id = slot.party_id
    where slot.guild_id = p_guild_id
      and slot.id = p_slot_id
      and party.event_id = p_event_id
  ) then
    raise exception 'SLOT_NOT_FOUND';
  end if;

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

  perform public.assign_slot(
    p_slot_id,
    p_discord_id,
    p_username,
    p_picks
  );
end;
$$;

revoke all on function public.assign_event_slot_with_regear_snapshot(
  uuid, uuid, uuid, jsonb, uuid, text, text, text, boolean, boolean, jsonb, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.assign_event_slot_with_regear_snapshot(
  uuid, uuid, uuid, jsonb, uuid, text, text, text, boolean, boolean, jsonb, jsonb, jsonb
) to service_role;

-- Keep the established guest application/grant transaction, but remove the
-- start/gather-time recruitment gate. Started-event calls use the snapshot
-- wrapper below; cancellation remains locked by cancel_guest_event_application.
create or replace function public.assign_guest_event_slot(
  p_guild_id uuid,
  p_event_id uuid,
  p_guest_id text,
  p_slot_id uuid,
  p_username text,
  p_picks jsonb,
  p_idempotency_key uuid,
  p_management_secret_hash text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
  v_profile public.event_guest_profiles%rowtype;
  v_application public.event_guest_applications%rowtype;
  v_is_bomb boolean;
  v_application_id uuid;
  v_status text;
begin
  if p_guild_id is null
     or p_event_id is null
     or p_slot_id is null
     or p_idempotency_key is null
     or nullif(btrim(p_guest_id), '') is null
     or char_length(p_guest_id) > 128
     or nullif(btrim(p_username), '') is null
     or char_length(p_username) > 128
     or p_management_secret_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'GUEST_APPLICATION_INVALID';
  end if;

  select *
    into v_event
    from public.events
   where guild_id = p_guild_id
     and id = p_event_id
   for update;
  if not found or v_event.status <> 'published' then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  select *
    into v_profile
    from public.event_guest_profiles
   where guild_id = p_guild_id
     and event_id = p_event_id
     and discord_id = p_guest_id
   for update;
  if not found
     or v_profile.albion_server is null
     or nullif(btrim(v_profile.albion_character_name), '') is null then
    raise exception 'GUEST_PROFILE_REQUIRED';
  end if;

  select coalesce(party.is_bomb_squad, false)
    into v_is_bomb
    from public.slots as slot
    join public.parties as party
      on party.guild_id = slot.guild_id
     and party.id = slot.party_id
   where slot.guild_id = p_guild_id
     and slot.id = p_slot_id
     and party.event_id = p_event_id
     and coalesce(slot.is_hidden, false) = false
   for update of slot;
  if not found then
    raise exception 'SLOT_NOT_FOUND';
  end if;

  select *
    into v_application
    from public.event_guest_applications
   where guild_id = p_guild_id
     and event_id = p_event_id
     and guest_id = p_guest_id
   for update;

  if found then
    if v_application.idempotency_key = p_idempotency_key
       and v_application.slot_id = p_slot_id
       and v_application.status in ('pending', 'assigned') then
      update public.event_guest_management_grants
         set revoked_at = coalesce(revoked_at, clock_timestamp())
       where guild_id = p_guild_id
         and application_id = v_application.id
         and revoked_at is null;
      insert into public.event_guest_management_grants (
        guild_id,
        event_id,
        application_id,
        secret_hash
      ) values (
        p_guild_id,
        p_event_id,
        v_application.id,
        p_management_secret_hash
      );
      return jsonb_build_object(
        'application_id', v_application.id,
        'status', v_application.status,
        'replayed', true
      );
    end if;
    raise exception 'ALREADY_IN_EVENT';
  end if;

  perform public.assign_slot(
    p_slot_id,
    p_guest_id,
    p_username,
    p_picks
  );

  v_application_id := gen_random_uuid();
  v_status := case when v_is_bomb then 'pending' else 'assigned' end;
  insert into public.event_guest_applications (
    id,
    guild_id,
    event_id,
    guest_id,
    slot_id,
    status,
    idempotency_key,
    albion_server,
    albion_player_id,
    albion_character_name,
    character_verified,
    original_slot_id,
    assigned_at
  ) values (
    v_application_id,
    p_guild_id,
    p_event_id,
    p_guest_id,
    p_slot_id,
    v_status,
    p_idempotency_key,
    v_profile.albion_server,
    v_profile.albion_player_id,
    v_profile.albion_character_name,
    v_profile.character_verified,
    p_slot_id,
    case when v_is_bomb then null else clock_timestamp() end
  );

  insert into public.event_guest_management_grants (
    guild_id,
    event_id,
    application_id,
    secret_hash
  ) values (
    p_guild_id,
    p_event_id,
    v_application_id,
    p_management_secret_hash
  );

  return jsonb_build_object(
    'application_id', v_application_id,
    'status', v_status,
    'replayed', false
  );
exception
  when unique_violation then
    if sqlerrm like '%verified_character_active_idx%'
       or sqlerrm like '%manual_character_active_idx%' then
      raise exception 'GUEST_CHARACTER_ALREADY_APPLIED';
    end if;
    raise;
end;
$$;

revoke all on function public.assign_guest_event_slot(
  uuid, uuid, text, uuid, text, jsonb, uuid, text
) from public, anon, authenticated;
grant execute on function public.assign_guest_event_slot(
  uuid, uuid, text, uuid, text, jsonb, uuid, text
) to service_role;

create or replace function public.assign_guest_event_slot_with_regear_snapshot(
  p_guild_id uuid,
  p_event_id uuid,
  p_guest_id text,
  p_slot_id uuid,
  p_username text,
  p_picks jsonb,
  p_idempotency_key uuid,
  p_management_secret_hash text,
  p_policy_version_id uuid,
  p_discord_id text,
  p_role_name text,
  p_manual_excluded boolean,
  p_auto_excluded boolean,
  p_manual_policy_snapshot jsonb,
  p_auto_policy_snapshot jsonb,
  p_source_snapshot jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
begin
  if btrim(p_guest_id) is distinct from btrim(p_discord_id) then
    raise exception 'GUEST_APPLICATION_INVALID';
  end if;

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

  return public.assign_guest_event_slot(
    p_guild_id,
    p_event_id,
    p_guest_id,
    p_slot_id,
    p_username,
    p_picks,
    p_idempotency_key,
    p_management_secret_hash
  );
end;
$$;

revoke all on function public.assign_guest_event_slot_with_regear_snapshot(
  uuid, uuid, text, uuid, text, jsonb, uuid, text, uuid, text, text, boolean, boolean, jsonb, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.assign_guest_event_slot_with_regear_snapshot(
  uuid, uuid, text, uuid, text, jsonb, uuid, text, uuid, text, text, boolean, boolean, jsonb, jsonb, jsonb
) to service_role;

comment on function public.assign_event_slot_with_regear_snapshot(
  uuid, uuid, uuid, jsonb, uuid, text, text, text, boolean, boolean, jsonb, jsonb, jsonb
) is 'Atomically records the frozen late-participant policy and applies a started-event slot signup.';
comment on function public.assign_guest_event_slot_with_regear_snapshot(
  uuid, uuid, text, uuid, text, jsonb, uuid, text, uuid, text, text, boolean, boolean, jsonb, jsonb, jsonb
) is 'Atomically records the frozen late-guest policy and applies a started-event guest signup.';

notify pgrst, 'reload schema';
