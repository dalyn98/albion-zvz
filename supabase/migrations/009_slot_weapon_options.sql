-- Allow admins to specify a list of permissible weapons per slot. Members
-- pick one of the listed weapons when applying. Stored as jsonb array of
-- {name, id}. When weapon_options is NULL, the existing single-weapon
-- / free-choice behavior is preserved.

alter table public.slots
  add column if not exists weapon_options jsonb,
  add column if not exists assigned_weapon_name text,
  add column if not exists assigned_weapon_id text;

-- Drop old signature — Postgres treats (uuid, text, text) and (uuid, text, text, text, text)
-- as distinct overloads, so we must drop the 3-arg form explicitly before recreating.
drop function if exists public.assign_slot(uuid, text, text);

create or replace function public.assign_slot(
  p_slot_id uuid,
  p_discord_id text,
  p_username text,
  p_chosen_weapon_name text default null,
  p_chosen_weapon_id text default null
) returns void language plpgsql security definer as $$
declare
  v_party_id uuid;
  v_event_id uuid;
  v_existing text;
  v_weapon_options jsonb;
  v_has_options boolean;
  v_match_count int;
begin
  select s.party_id, p.event_id, s.assigned_discord_id, s.weapon_options
    into v_party_id, v_event_id, v_existing, v_weapon_options
    from slots s
    join parties p on p.id = s.party_id
   where s.id = p_slot_id
     for update of s;

  if v_party_id is null then
    raise exception 'SLOT_NOT_FOUND';
  end if;

  if v_existing is not null then
    raise exception 'SLOT_TAKEN';
  end if;

  v_has_options := v_weapon_options is not null and jsonb_array_length(v_weapon_options) > 0;

  if v_has_options then
    if p_chosen_weapon_id is null or p_chosen_weapon_name is null then
      raise exception 'WEAPON_CHOICE_REQUIRED';
    end if;
    select count(*) into v_match_count
      from jsonb_array_elements(v_weapon_options) as opt
     where opt->>'id' = p_chosen_weapon_id
       and opt->>'name' = p_chosen_weapon_name;
    if v_match_count = 0 then
      raise exception 'WEAPON_NOT_IN_OPTIONS';
    end if;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_event_id::text || ':' || p_discord_id, 0)
  );

  if exists (
    select 1
      from slots s
      join parties p on p.id = s.party_id
     where p.event_id = v_event_id
       and s.assigned_discord_id = p_discord_id
  ) then
    raise exception 'ALREADY_IN_EVENT';
  end if;

  update slots
     set assigned_discord_id   = p_discord_id,
         assigned_username     = p_username,
         assigned_weapon_name  = case when v_has_options then p_chosen_weapon_name else null end,
         assigned_weapon_id    = case when v_has_options then p_chosen_weapon_id   else null end
   where id = p_slot_id;
end;
$$;

create or replace function public.cancel_slot(
  p_slot_id uuid,
  p_discord_id text
) returns void language plpgsql security definer as $$
declare
  v_owner text;
begin
  select assigned_discord_id into v_owner
    from slots where id = p_slot_id for update;

  if v_owner is null then
    raise exception 'SLOT_EMPTY';
  end if;

  if v_owner <> p_discord_id then
    raise exception 'NOT_OWNER';
  end if;

  update slots
     set assigned_discord_id  = null,
         assigned_username    = null,
         assigned_weapon_name = null,
         assigned_weapon_id   = null
   where id = p_slot_id;
end;
$$;
