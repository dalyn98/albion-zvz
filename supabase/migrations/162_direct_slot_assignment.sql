-- General direct slot assignment.
--
-- Used by admins/event owners for regular event slots and by bomb-squad
-- callers for their own party. Authorization stays in the server action; this
-- RPC keeps the slot update atomic and preserves the event-level one-slot-per-
-- member invariant under concurrent self-signup / direct-assignment races.

drop function if exists public.direct_assign_slot(uuid, text, text);

create or replace function public.direct_assign_slot(
  p_slot_id uuid,
  p_discord_id text,
  p_username text
) returns void language plpgsql security definer as $$
declare
  v_event_id uuid;
  v_existing text;
  v_existing_req text;
  v_is_solo boolean;
begin
  select p.event_id,
         s.assigned_discord_id,
         s.requested_discord_id,
         coalesce(s.is_solo_bomb, false)
    into v_event_id, v_existing, v_existing_req, v_is_solo
    from public.slots s
    join public.parties p on p.id = s.party_id
   where s.id = p_slot_id
     for update of s;

  if v_event_id is null then
    raise exception 'SLOT_NOT_FOUND';
  end if;

  if v_is_solo then
    raise exception 'SOLO_BOMB_REQUIRES_REQUEST';
  end if;

  if v_existing is not null then
    raise exception 'SLOT_TAKEN';
  end if;

  if v_existing_req is not null then
    raise exception 'SLOT_PENDING';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_event_id::text || ':' || p_discord_id, 0)
  );

  if exists (
    select 1
      from public.slots s
      join public.parties p on p.id = s.party_id
     where p.event_id = v_event_id
       and (
         s.assigned_discord_id = p_discord_id
         or s.requested_discord_id = p_discord_id
       )
  ) then
    raise exception 'ALREADY_IN_EVENT';
  end if;

update public.slots
     set assigned_discord_id = p_discord_id,
         assigned_username = p_username
   where id = p_slot_id;
end;
$$;

revoke all on function public.direct_assign_slot(uuid, text, text) from public;
revoke all on function public.direct_assign_slot(uuid, text, text) from anon, authenticated;
grant execute on function public.direct_assign_slot(uuid, text, text) to service_role;
