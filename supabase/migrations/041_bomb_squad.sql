-- Bomb squad support: parties can be flagged as a bomb squad with a dedicated
-- sub-caller who approves sign-ups to that specific party. Regular parties
-- keep the instant-assignment flow; bomb squad parties go through a pending
-- request state.
--
-- Design notes:
-- - Custom party names are restricted to bomb squad parties (user request —
--   keeps the default "N파티" numbering stable for main-force parties).
-- - Approval authority is checked in the server action layer (mirroring the
--   regear-admin pattern), not in the RPC; RPCs just do the state move.

-- 1) parties: new columns
alter table public.parties
  add column if not exists name               text,
  add column if not exists is_bomb_squad      boolean not null default false,
  add column if not exists bomb_squad_kind    text,
  add column if not exists caller_discord_id  text;

-- 2) Constraint: bomb_squad_kind only set (and required) when is_bomb_squad
alter table public.parties
  drop constraint if exists parties_bomb_kind_chk;
alter table public.parties
  add constraint parties_bomb_kind_chk
    check (
      (is_bomb_squad = false and bomb_squad_kind is null)
      or (is_bomb_squad = true and bomb_squad_kind in ('melee', 'ranged'))
    );

-- 3) Constraint: custom name only allowed on bomb squad parties
alter table public.parties
  drop constraint if exists parties_name_chk;
alter table public.parties
  add constraint parties_name_chk
    check (name is null or is_bomb_squad = true);

-- 4) slots: pending request fields (bomb squad flow only)
alter table public.slots
  add column if not exists requested_discord_id text,
  add column if not exists requested_username   text,
  add column if not exists requested_picks      jsonb,
  add column if not exists requested_at         timestamptz;

-- Index for caller dashboards ("slots awaiting my approval" queries).
create index if not exists idx_slots_requested
  on public.slots (requested_discord_id)
  where requested_discord_id is not null;

-- 5) Rewrite assign_slot to branch on party.is_bomb_squad:
--    - main party: instant assignment (existing behavior preserved)
--    - bomb squad: stash pending request, wait for caller/admin to approve
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
    into v_party_id, v_event_id, v_existing, v_existing_req, v_is_bomb, v_options
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

  -- Validate picks match slot options (same as pre-migration logic)
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

  -- Serialize concurrent sign-ups for the same (event, user) pair so the
  -- duplicate check below is race-free.
  perform pg_advisory_xact_lock(
    hashtextextended(v_event_id::text || ':' || p_discord_id, 0)
  );

  -- Duplicate-in-event guard covers BOTH assigned and pending — a user cannot
  -- hold two slots (or one slot plus a pending bomb squad request) in the
  -- same event.
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
    -- Bomb squad: stash picks as a pending request. Picks are copied over to
    -- assigned_* fields at approval time by approve_slot_request.
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

-- 6) approve_slot_request — moves a pending request into the assigned state.
-- Authorization is enforced in the server action (mirrors regear-admin
-- pattern); this RPC trusts its caller.
drop function if exists public.approve_slot_request(uuid);

create or replace function public.approve_slot_request(
  p_slot_id uuid
) returns void language plpgsql security definer as $$
declare
  v_req_id text;
  v_req_name text;
  v_req_picks jsonb;
  v_existing text;
  v_options jsonb;
begin
  select s.requested_discord_id, s.requested_username, s.requested_picks,
         s.assigned_discord_id,
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
    into v_req_id, v_req_name, v_req_picks, v_existing, v_options
    from slots s
   where s.id = p_slot_id
     for update of s;

  if v_req_id is null then
    raise exception 'NO_PENDING_REQUEST';
  end if;

  if v_existing is not null then
    raise exception 'SLOT_TAKEN';
  end if;

  update slots s set
    assigned_discord_id   = v_req_id,
    assigned_username     = v_req_name,
    assigned_weapon_name  = case when (v_options->'weapon')  is not null and jsonb_typeof(v_options->'weapon')  = 'array' and jsonb_array_length(v_options->'weapon')  > 0 then v_req_picks->'weapon'->>'name'  else null end,
    assigned_weapon_id    = case when (v_options->'weapon')  is not null and jsonb_typeof(v_options->'weapon')  = 'array' and jsonb_array_length(v_options->'weapon')  > 0 then v_req_picks->'weapon'->>'id'    else null end,
    assigned_head_name    = case when (v_options->'head')    is not null and jsonb_typeof(v_options->'head')    = 'array' and jsonb_array_length(v_options->'head')    > 0 then v_req_picks->'head'->>'name'    else null end,
    assigned_head_id      = case when (v_options->'head')    is not null and jsonb_typeof(v_options->'head')    = 'array' and jsonb_array_length(v_options->'head')    > 0 then v_req_picks->'head'->>'id'      else null end,
    assigned_armor_name   = case when (v_options->'armor')   is not null and jsonb_typeof(v_options->'armor')   = 'array' and jsonb_array_length(v_options->'armor')   > 0 then v_req_picks->'armor'->>'name'   else null end,
    assigned_armor_id     = case when (v_options->'armor')   is not null and jsonb_typeof(v_options->'armor')   = 'array' and jsonb_array_length(v_options->'armor')   > 0 then v_req_picks->'armor'->>'id'     else null end,
    assigned_shoes_name   = case when (v_options->'shoes')   is not null and jsonb_typeof(v_options->'shoes')   = 'array' and jsonb_array_length(v_options->'shoes')   > 0 then v_req_picks->'shoes'->>'name'   else null end,
    assigned_shoes_id     = case when (v_options->'shoes')   is not null and jsonb_typeof(v_options->'shoes')   = 'array' and jsonb_array_length(v_options->'shoes')   > 0 then v_req_picks->'shoes'->>'id'     else null end,
    assigned_offhand_name = case when (v_options->'offhand') is not null and jsonb_typeof(v_options->'offhand') = 'array' and jsonb_array_length(v_options->'offhand') > 0 then v_req_picks->'offhand'->>'name' else null end,
    assigned_offhand_id   = case when (v_options->'offhand') is not null and jsonb_typeof(v_options->'offhand') = 'array' and jsonb_array_length(v_options->'offhand') > 0 then v_req_picks->'offhand'->>'id'   else null end,
    assigned_potion_name  = case when (v_options->'potion')  is not null and jsonb_typeof(v_options->'potion')  = 'array' and jsonb_array_length(v_options->'potion')  > 0 then v_req_picks->'potion'->>'name'  else null end,
    assigned_potion_id    = case when (v_options->'potion')  is not null and jsonb_typeof(v_options->'potion')  = 'array' and jsonb_array_length(v_options->'potion')  > 0 then v_req_picks->'potion'->>'id'    else null end,
    assigned_food_name    = case when (v_options->'food')    is not null and jsonb_typeof(v_options->'food')    = 'array' and jsonb_array_length(v_options->'food')    > 0 then v_req_picks->'food'->>'name'    else null end,
    assigned_food_id      = case when (v_options->'food')    is not null and jsonb_typeof(v_options->'food')    = 'array' and jsonb_array_length(v_options->'food')    > 0 then v_req_picks->'food'->>'id'      else null end,
    assigned_cape_name    = case when (v_options->'cape')    is not null and jsonb_typeof(v_options->'cape')    = 'array' and jsonb_array_length(v_options->'cape')    > 0 then v_req_picks->'cape'->>'name'    else null end,
    assigned_cape_id      = case when (v_options->'cape')    is not null and jsonb_typeof(v_options->'cape')    = 'array' and jsonb_array_length(v_options->'cape')    > 0 then v_req_picks->'cape'->>'id'      else null end,
    assigned_mount_name   = case when (v_options->'mount')   is not null and jsonb_typeof(v_options->'mount')   = 'array' and jsonb_array_length(v_options->'mount')   > 0 then v_req_picks->'mount'->>'name'   else null end,
    assigned_mount_id     = case when (v_options->'mount')   is not null and jsonb_typeof(v_options->'mount')   = 'array' and jsonb_array_length(v_options->'mount')   > 0 then v_req_picks->'mount'->>'id'     else null end,
    requested_discord_id  = null,
    requested_username    = null,
    requested_picks       = null,
    requested_at          = null
  where s.id = p_slot_id;
end;
$$;

-- 7) reject_slot_request — clears the pending request, slot returns to empty.
drop function if exists public.reject_slot_request(uuid);

create or replace function public.reject_slot_request(
  p_slot_id uuid
) returns void language plpgsql security definer as $$
begin
  update slots set
    requested_discord_id = null,
    requested_username   = null,
    requested_picks      = null,
    requested_at         = null
  where id = p_slot_id
    and requested_discord_id is not null;
end;
$$;

-- 8) Extend cancel_slot to also handle pending requests — members can cancel
-- their own pending bomb squad application before a caller acts on it.
drop function if exists public.cancel_slot(uuid, text);

create or replace function public.cancel_slot(
  p_slot_id uuid,
  p_discord_id text
) returns void language plpgsql security definer as $$
declare
  v_assigned text;
  v_requested text;
begin
  select assigned_discord_id, requested_discord_id
    into v_assigned, v_requested
    from slots where id = p_slot_id for update;

  if v_assigned is null and v_requested is null then
    raise exception 'SLOT_EMPTY';
  end if;

  if v_assigned = p_discord_id then
    update slots set
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
    update slots set
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
