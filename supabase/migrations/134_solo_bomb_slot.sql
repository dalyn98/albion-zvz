-- Solo bomb slot: a bomb-squad slot that operates without a caller. The
-- applicant builds their own gear at signup time (free-form picks) and the
-- pending request is approved by admin or event owner — the party caller is
-- excluded from the approval path for solo bomb slots (enforced in the server
-- action layer; this RPC trusts its caller).
--
-- Constraints:
--   - is_solo_bomb only on slots whose party is_bomb_squad=true
--   - assign_slot for solo bomb skips option-vs-pick validation (member picks
--     anything from the item DB)
--   - approve_slot_request copies picks unconditionally for solo bomb slots
--     (slot options can be empty by design)
--   - caller_assign_slot rejects solo bomb slots (SOLO_BOMB_REQUIRES_REQUEST):
--     direct assign without picks is meaningless for solo bomb because the
--     build IS the member's own pick

-- 1) Column
alter table public.slots
  add column if not exists is_solo_bomb boolean not null default false;

-- 2) Trigger: enforce is_solo_bomb=true requires party.is_bomb_squad=true.
-- Cross-table check can't be expressed as a SQL CHECK, so we use a trigger.
create or replace function public.check_solo_bomb_slot()
returns trigger language plpgsql as $$
declare
  v_is_bomb boolean;
begin
  if new.is_solo_bomb then
    select coalesce(p.is_bomb_squad, false) into v_is_bomb
      from public.parties p where p.id = new.party_id;
    if not v_is_bomb then
      raise exception 'SOLO_BOMB_REQUIRES_BOMB_SQUAD_PARTY';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_solo_bomb_slot on public.slots;
create trigger trg_check_solo_bomb_slot
  before insert or update of is_solo_bomb, party_id on public.slots
  for each row execute function public.check_solo_bomb_slot();

-- 3) Rewrite assign_slot to handle solo bomb (skip option validation, still
-- routed through pending request flow — same as regular bomb).
drop function if exists public.assign_slot(uuid, text, text, jsonb);

create or replace function public.assign_slot(
  p_slot_id uuid,
  p_discord_id text,
  p_username text,
  p_picks jsonb default null
) returns void language plpgsql security definer as $$
declare
  v_party_id uuid;
  v_event_id uuid;
  v_existing text;
  v_existing_req text;
  v_is_bomb boolean;
  v_is_solo boolean;
  v_options jsonb;
  v_kinds text[] := array['weapon','head','armor','shoes','offhand','potion','food','cape','mount'];
  v_k text;
  v_opts jsonb;
  v_pick jsonb;
  v_match int;
begin
  select s.party_id,
         p.event_id,
         s.assigned_discord_id,
         s.requested_discord_id,
         coalesce(p.is_bomb_squad, false),
         coalesce(s.is_solo_bomb, false),
         jsonb_build_object(
           'weapon',  s.weapon_options,
           'head',    s.head_options,
           'armor',   s.armor_options,
           'shoes',   s.shoes_options,
           'offhand', s.offhand_options,
           'potion',  s.potion_options,
           'food',    s.food_options,
           'cape',    s.cape_options,
           'mount',   s.mount_options
         )
    into v_party_id, v_event_id, v_existing, v_existing_req, v_is_bomb, v_is_solo, v_options
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

  if v_existing_req is not null then
    raise exception 'SLOT_PENDING';
  end if;

  -- Solo bomb: free-form picks, skip option validation entirely. The pick
  -- payload is still expected to carry id+name pairs per kind (validated
  -- shape-wise below).
  if v_is_solo then
    if p_picks is null or jsonb_typeof(p_picks) <> 'object' then
      raise exception 'GEAR_PICKS_REQUIRED';
    end if;
    foreach v_k in array v_kinds loop
      v_pick := p_picks -> v_k;
      if v_pick is null then
        continue;
      end if;
      if v_pick->>'name' is null then
        raise exception 'GEAR_CHOICE_REQUIRED:%', v_k;
      end if;
    end loop;
  else
    -- Regular slot: validate picks match pre-set options.
    foreach v_k in array v_kinds loop
      v_opts := v_options -> v_k;
      if v_opts is null or jsonb_typeof(v_opts) <> 'array' or jsonb_array_length(v_opts) = 0 then
        continue;
      end if;
      v_pick := case when p_picks is null then null else p_picks -> v_k end;
      if v_pick is null or v_pick->>'id' is null or v_pick->>'name' is null then
        raise exception 'GEAR_CHOICE_REQUIRED:%', v_k;
      end if;
      select count(*) into v_match
        from jsonb_array_elements(v_opts) as opt
       where opt->>'id' = v_pick->>'id'
         and opt->>'name' = v_pick->>'name';
      if v_match = 0 then
        raise exception 'GEAR_NOT_IN_OPTIONS:%', v_k;
      end if;
    end loop;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_event_id::text || ':' || p_discord_id, 0)
  );

  if exists (
    select 1
      from slots s
      join parties p on p.id = s.party_id
     where p.event_id = v_event_id
       and (s.assigned_discord_id = p_discord_id or s.requested_discord_id = p_discord_id)
  ) then
    raise exception 'ALREADY_IN_EVENT';
  end if;

  if v_is_bomb then
    -- Solo bomb is a sub-case of bomb (constraint enforces is_bomb_squad).
    -- Both go through the pending request flow.
    update slots set
      requested_discord_id = p_discord_id,
      requested_username   = p_username,
      requested_picks      = p_picks,
      requested_at         = now()
    where id = p_slot_id;
  else
    update slots s set
      assigned_discord_id   = p_discord_id,
      assigned_username     = p_username,
      assigned_weapon_name  = case when (v_options->'weapon')  is not null and jsonb_typeof(v_options->'weapon')  = 'array' and jsonb_array_length(v_options->'weapon')  > 0 then p_picks->'weapon'->>'name'  else null end,
      assigned_weapon_id    = case when (v_options->'weapon')  is not null and jsonb_typeof(v_options->'weapon')  = 'array' and jsonb_array_length(v_options->'weapon')  > 0 then p_picks->'weapon'->>'id'    else null end,
      assigned_head_name    = case when (v_options->'head')    is not null and jsonb_typeof(v_options->'head')    = 'array' and jsonb_array_length(v_options->'head')    > 0 then p_picks->'head'->>'name'    else null end,
      assigned_head_id      = case when (v_options->'head')    is not null and jsonb_typeof(v_options->'head')    = 'array' and jsonb_array_length(v_options->'head')    > 0 then p_picks->'head'->>'id'      else null end,
      assigned_armor_name   = case when (v_options->'armor')   is not null and jsonb_typeof(v_options->'armor')   = 'array' and jsonb_array_length(v_options->'armor')   > 0 then p_picks->'armor'->>'name'   else null end,
      assigned_armor_id     = case when (v_options->'armor')   is not null and jsonb_typeof(v_options->'armor')   = 'array' and jsonb_array_length(v_options->'armor')   > 0 then p_picks->'armor'->>'id'     else null end,
      assigned_shoes_name   = case when (v_options->'shoes')   is not null and jsonb_typeof(v_options->'shoes')   = 'array' and jsonb_array_length(v_options->'shoes')   > 0 then p_picks->'shoes'->>'name'   else null end,
      assigned_shoes_id     = case when (v_options->'shoes')   is not null and jsonb_typeof(v_options->'shoes')   = 'array' and jsonb_array_length(v_options->'shoes')   > 0 then p_picks->'shoes'->>'id'     else null end,
      assigned_offhand_name = case when (v_options->'offhand') is not null and jsonb_typeof(v_options->'offhand') = 'array' and jsonb_array_length(v_options->'offhand') > 0 then p_picks->'offhand'->>'name' else null end,
      assigned_offhand_id   = case when (v_options->'offhand') is not null and jsonb_typeof(v_options->'offhand') = 'array' and jsonb_array_length(v_options->'offhand') > 0 then p_picks->'offhand'->>'id'   else null end,
      assigned_potion_name  = case when (v_options->'potion')  is not null and jsonb_typeof(v_options->'potion')  = 'array' and jsonb_array_length(v_options->'potion')  > 0 then p_picks->'potion'->>'name'  else null end,
      assigned_potion_id    = case when (v_options->'potion')  is not null and jsonb_typeof(v_options->'potion')  = 'array' and jsonb_array_length(v_options->'potion')  > 0 then p_picks->'potion'->>'id'    else null end,
      assigned_food_name    = case when (v_options->'food')    is not null and jsonb_typeof(v_options->'food')    = 'array' and jsonb_array_length(v_options->'food')    > 0 then p_picks->'food'->>'name'    else null end,
      assigned_food_id      = case when (v_options->'food')    is not null and jsonb_typeof(v_options->'food')    = 'array' and jsonb_array_length(v_options->'food')    > 0 then p_picks->'food'->>'id'      else null end,
      assigned_cape_name    = case when (v_options->'cape')    is not null and jsonb_typeof(v_options->'cape')    = 'array' and jsonb_array_length(v_options->'cape')    > 0 then p_picks->'cape'->>'name'    else null end,
      assigned_cape_id      = case when (v_options->'cape')    is not null and jsonb_typeof(v_options->'cape')    = 'array' and jsonb_array_length(v_options->'cape')    > 0 then p_picks->'cape'->>'id'      else null end,
      assigned_mount_name   = case when (v_options->'mount')   is not null and jsonb_typeof(v_options->'mount')   = 'array' and jsonb_array_length(v_options->'mount')   > 0 then p_picks->'mount'->>'name'   else null end,
      assigned_mount_id     = case when (v_options->'mount')   is not null and jsonb_typeof(v_options->'mount')   = 'array' and jsonb_array_length(v_options->'mount')   > 0 then p_picks->'mount'->>'id'     else null end
    where s.id = p_slot_id;
  end if;
end;
$$;

-- 4) Rewrite approve_slot_request to copy picks unconditionally for solo bomb
-- (slot options can legitimately be empty for solo bomb).
drop function if exists public.approve_slot_request(uuid);

create or replace function public.approve_slot_request(
  p_slot_id uuid
) returns void language plpgsql security definer as $$
declare
  v_req_id text;
  v_req_name text;
  v_req_picks jsonb;
  v_existing text;
  v_is_solo boolean;
  v_options jsonb;
begin
  select s.requested_discord_id, s.requested_username, s.requested_picks,
         s.assigned_discord_id,
         coalesce(s.is_solo_bomb, false),
         jsonb_build_object(
           'weapon',  s.weapon_options,
           'head',    s.head_options,
           'armor',   s.armor_options,
           'shoes',   s.shoes_options,
           'offhand', s.offhand_options,
           'potion',  s.potion_options,
           'food',    s.food_options,
           'cape',    s.cape_options,
           'mount',   s.mount_options
         )
    into v_req_id, v_req_name, v_req_picks, v_existing, v_is_solo, v_options
    from slots s
   where s.id = p_slot_id
     for update of s;

  if v_req_id is null then
    raise exception 'NO_PENDING_REQUEST';
  end if;

  if v_existing is not null then
    raise exception 'SLOT_TAKEN';
  end if;

  -- Helper inline: copy pick if (solo bomb) OR (options array non-empty).
  -- Solo bomb's authoritative source is the member's submitted pick.
  update slots s set
    assigned_discord_id   = v_req_id,
    assigned_username     = v_req_name,
    assigned_weapon_name  = case when v_is_solo or ((v_options->'weapon')  is not null and jsonb_typeof(v_options->'weapon')  = 'array' and jsonb_array_length(v_options->'weapon')  > 0) then v_req_picks->'weapon'->>'name'  else null end,
    assigned_weapon_id    = case when v_is_solo or ((v_options->'weapon')  is not null and jsonb_typeof(v_options->'weapon')  = 'array' and jsonb_array_length(v_options->'weapon')  > 0) then v_req_picks->'weapon'->>'id'    else null end,
    assigned_head_name    = case when v_is_solo or ((v_options->'head')    is not null and jsonb_typeof(v_options->'head')    = 'array' and jsonb_array_length(v_options->'head')    > 0) then v_req_picks->'head'->>'name'    else null end,
    assigned_head_id      = case when v_is_solo or ((v_options->'head')    is not null and jsonb_typeof(v_options->'head')    = 'array' and jsonb_array_length(v_options->'head')    > 0) then v_req_picks->'head'->>'id'      else null end,
    assigned_armor_name   = case when v_is_solo or ((v_options->'armor')   is not null and jsonb_typeof(v_options->'armor')   = 'array' and jsonb_array_length(v_options->'armor')   > 0) then v_req_picks->'armor'->>'name'   else null end,
    assigned_armor_id     = case when v_is_solo or ((v_options->'armor')   is not null and jsonb_typeof(v_options->'armor')   = 'array' and jsonb_array_length(v_options->'armor')   > 0) then v_req_picks->'armor'->>'id'     else null end,
    assigned_shoes_name   = case when v_is_solo or ((v_options->'shoes')   is not null and jsonb_typeof(v_options->'shoes')   = 'array' and jsonb_array_length(v_options->'shoes')   > 0) then v_req_picks->'shoes'->>'name'   else null end,
    assigned_shoes_id     = case when v_is_solo or ((v_options->'shoes')   is not null and jsonb_typeof(v_options->'shoes')   = 'array' and jsonb_array_length(v_options->'shoes')   > 0) then v_req_picks->'shoes'->>'id'     else null end,
    assigned_offhand_name = case when v_is_solo or ((v_options->'offhand') is not null and jsonb_typeof(v_options->'offhand') = 'array' and jsonb_array_length(v_options->'offhand') > 0) then v_req_picks->'offhand'->>'name' else null end,
    assigned_offhand_id   = case when v_is_solo or ((v_options->'offhand') is not null and jsonb_typeof(v_options->'offhand') = 'array' and jsonb_array_length(v_options->'offhand') > 0) then v_req_picks->'offhand'->>'id'   else null end,
    assigned_potion_name  = case when v_is_solo or ((v_options->'potion')  is not null and jsonb_typeof(v_options->'potion')  = 'array' and jsonb_array_length(v_options->'potion')  > 0) then v_req_picks->'potion'->>'name'  else null end,
    assigned_potion_id    = case when v_is_solo or ((v_options->'potion')  is not null and jsonb_typeof(v_options->'potion')  = 'array' and jsonb_array_length(v_options->'potion')  > 0) then v_req_picks->'potion'->>'id'    else null end,
    assigned_food_name    = case when v_is_solo or ((v_options->'food')    is not null and jsonb_typeof(v_options->'food')    = 'array' and jsonb_array_length(v_options->'food')    > 0) then v_req_picks->'food'->>'name'    else null end,
    assigned_food_id      = case when v_is_solo or ((v_options->'food')    is not null and jsonb_typeof(v_options->'food')    = 'array' and jsonb_array_length(v_options->'food')    > 0) then v_req_picks->'food'->>'id'      else null end,
    assigned_cape_name    = case when v_is_solo or ((v_options->'cape')    is not null and jsonb_typeof(v_options->'cape')    = 'array' and jsonb_array_length(v_options->'cape')    > 0) then v_req_picks->'cape'->>'name'    else null end,
    assigned_cape_id      = case when v_is_solo or ((v_options->'cape')    is not null and jsonb_typeof(v_options->'cape')    = 'array' and jsonb_array_length(v_options->'cape')    > 0) then v_req_picks->'cape'->>'id'      else null end,
    assigned_mount_name   = case when v_is_solo or ((v_options->'mount')   is not null and jsonb_typeof(v_options->'mount')   = 'array' and jsonb_array_length(v_options->'mount')   > 0) then v_req_picks->'mount'->>'name'   else null end,
    assigned_mount_id     = case when v_is_solo or ((v_options->'mount')   is not null and jsonb_typeof(v_options->'mount')   = 'array' and jsonb_array_length(v_options->'mount')   > 0) then v_req_picks->'mount'->>'id'     else null end,
    requested_discord_id  = null,
    requested_username    = null,
    requested_picks       = null,
    requested_at          = null
  where s.id = p_slot_id;
end;
$$;

-- 5) caller_assign_slot: solo bomb slots cannot be filled by direct caller
-- assignment because the build IS the member's free-form pick. Member must
-- self-signup. Block at RPC layer for defence-in-depth (action layer also
-- excludes caller from solo bomb authorization).
drop function if exists public.caller_assign_slot(uuid, text, text);

create or replace function public.caller_assign_slot(
  p_slot_id uuid,
  p_discord_id text,
  p_username text
) returns void language plpgsql security definer as $$
declare
  v_event_id uuid;
  v_existing text;
  v_existing_req text;
  v_is_bomb boolean;
  v_is_solo boolean;
begin
  select p.event_id, s.assigned_discord_id, s.requested_discord_id,
         coalesce(p.is_bomb_squad, false),
         coalesce(s.is_solo_bomb, false)
    into v_event_id, v_existing, v_existing_req, v_is_bomb, v_is_solo
    from slots s
    join parties p on p.id = s.party_id
   where s.id = p_slot_id
     for update of s;

  if v_event_id is null then
    raise exception 'SLOT_NOT_FOUND';
  end if;

  if not v_is_bomb then
    raise exception 'NOT_BOMB_SQUAD';
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
    select 1 from slots s
    join parties p on p.id = s.party_id
    where p.event_id = v_event_id
      and (s.assigned_discord_id = p_discord_id or s.requested_discord_id = p_discord_id)
  ) then
    raise exception 'ALREADY_IN_EVENT';
  end if;

  update slots set
    assigned_discord_id = p_discord_id,
    assigned_username   = p_username
  where id = p_slot_id;
end;
$$;
