-- Generalize multi-option gear to every non-weapon slot. Each non-weapon slot
-- now has an optional `{slot}_options jsonb` array of `{name, id}` entries;
-- when set, the fixed `{slot}_name`/`{slot}_id` columns are cleared at write
-- time and the member's pick lands in `assigned_{slot}_name`/`assigned_{slot}_id`.
-- The assign_slot RPC is rewritten to take a single jsonb payload of picks,
-- keyed by slot kind, so the client no longer needs a positional weapon arg.

alter table public.slots
  add column if not exists head_options    jsonb,
  add column if not exists armor_options   jsonb,
  add column if not exists shoes_options   jsonb,
  add column if not exists offhand_options jsonb,
  add column if not exists potion_options  jsonb,
  add column if not exists food_options    jsonb,
  add column if not exists cape_options    jsonb,
  add column if not exists assigned_head_name    text,
  add column if not exists assigned_head_id      text,
  add column if not exists assigned_armor_name   text,
  add column if not exists assigned_armor_id     text,
  add column if not exists assigned_shoes_name   text,
  add column if not exists assigned_shoes_id     text,
  add column if not exists assigned_offhand_name text,
  add column if not exists assigned_offhand_id   text,
  add column if not exists assigned_potion_name  text,
  add column if not exists assigned_potion_id    text,
  add column if not exists assigned_food_name    text,
  add column if not exists assigned_food_id      text,
  add column if not exists assigned_cape_name    text,
  add column if not exists assigned_cape_id      text;

-- Drop every prior overload — (uuid,text,text,text,text) was installed by
-- migration 009 and we're replacing it with a jsonb-based signature.
drop function if exists public.assign_slot(uuid, text, text, text, text);
drop function if exists public.assign_slot(uuid, text, text);

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
  v_options jsonb;
  v_kinds text[] := array['weapon','head','armor','shoes','offhand','potion','food','cape'];
  v_k text;
  v_opts jsonb;
  v_pick jsonb;
  v_match int;
begin
  select s.party_id,
         p.event_id,
         s.assigned_discord_id,
         jsonb_build_object(
           'weapon',  s.weapon_options,
           'head',    s.head_options,
           'armor',   s.armor_options,
           'shoes',   s.shoes_options,
           'offhand', s.offhand_options,
           'potion',  s.potion_options,
           'food',    s.food_options,
           'cape',    s.cape_options
         )
    into v_party_id, v_event_id, v_existing, v_options
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

  -- For every slot kind whose *_options column is a non-empty array, the
  -- caller must supply a matching pick in p_picks. Keep validation separate
  -- from the write so partial picks don't half-apply.
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
    assigned_cape_id      = case when (v_options->'cape')    is not null and jsonb_typeof(v_options->'cape')    = 'array' and jsonb_array_length(v_options->'cape')    > 0 then p_picks->'cape'->>'id'      else null end
  where s.id = p_slot_id;
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
    assigned_cape_name    = null, assigned_cape_id    = null
  where id = p_slot_id;
end;
$$;
