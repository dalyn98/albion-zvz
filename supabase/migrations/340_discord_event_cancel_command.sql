-- 340: Release B routes Discord's event-level cancellation through one atomic
-- domain command. The application remains the source of truth; Discord is an
-- adapter and must not patch slot rows or guest lifecycle state itself.

-- Migration 334 owns the stable slot projection contract. Do not redefine it
-- here: the event-cancel command must compose with its contact-transition fix.

create or replace function public.cancel_member_event_signup(
  p_guild_id uuid,
  p_event_id uuid,
  p_discord_id text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
  v_guest_status text;
  v_slot_id uuid;
  v_changed integer := 0;
  v_deleted integer := 0;
  v_still_owned boolean;
begin
  if p_guild_id is null
     or p_event_id is null
     or nullif(btrim(coalesce(p_discord_id, '')), '') is null
     or char_length(p_discord_id) > 128 then
    raise exception 'EVENT_CANCELLATION_INVALID';
  end if;

  select event.*
    into v_event
    from public.events as event
   where event.guild_id = p_guild_id
     and event.id = p_event_id
   for update;
  if not found or v_event.status <> 'published' then
    raise exception 'EVENT_NOT_FOUND';
  end if;
  if v_event.battle_started_at is not null
     or v_event.regear_policy_version_id is not null then
    raise exception 'event_operational_snapshot_locked';
  end if;
  if v_event.recruitment_mode = 'build_sheet' then
    raise exception 'EVENT_CANCELLATION_REQUIRES_WEB';
  end if;

  -- A Discord-authenticated guest must pass through the guest application
  -- command so the durable application becomes withdrawn instead of leaving
  -- an apparently active history row behind a cleared slot.
  select application.status
    into v_guest_status
    from public.event_guest_applications as application
   where application.guild_id = p_guild_id
     and application.event_id = p_event_id
     and application.guest_id = p_discord_id
   for update;
  if found and v_guest_status in ('pending', 'assigned', 'reselection_required') then
    perform public.cancel_guest_event_application(
      p_guild_id,
      p_event_id,
      p_discord_id
    );
    v_changed := v_changed + 1;
  end if;

  -- Normal member signups use the same owner-checked slot command as the web
  -- surface. The loop also clears any legacy duplicate slot ownership inside
  -- this single transaction.
  for v_slot_id in
    select slot.id
      from public.slots as slot
      join public.parties as party
        on party.guild_id = slot.guild_id
       and party.id = slot.party_id
     where slot.guild_id = p_guild_id
       and party.event_id = p_event_id
       and (
         slot.assigned_discord_id = p_discord_id
         or slot.requested_discord_id = p_discord_id
       )
     order by slot.id
     for update of slot
  loop
    perform public.cancel_slot(v_slot_id, p_discord_id);
    select exists (
      select 1
        from public.slots as slot
       where slot.guild_id = p_guild_id
         and slot.id = v_slot_id
         and (
           slot.assigned_discord_id = p_discord_id
           or slot.requested_discord_id = p_discord_id
         )
    ) into v_still_owned;
    if v_still_owned then
      perform public.cancel_slot(v_slot_id, p_discord_id);
    end if;
    v_changed := v_changed + 1;
  end loop;

  if v_event.tentative_snapshot_version_id is null then
    delete from public.event_tentative_signups
     where guild_id = p_guild_id
       and event_id = p_event_id
       and discord_id = p_discord_id;
    get diagnostics v_deleted = row_count;
    v_changed := v_changed + v_deleted;
  end if;

  return v_changed;
end;
$$;

revoke all on function public.cancel_member_event_signup(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.cancel_member_event_signup(uuid, uuid, text)
  to service_role;

comment on function public.cancel_member_event_signup(uuid, uuid, text) is
  'Atomically cancels one Discord actor across member slots, guest application state, and unfrozen tentative intent.';

notify pgrst, 'reload schema';
