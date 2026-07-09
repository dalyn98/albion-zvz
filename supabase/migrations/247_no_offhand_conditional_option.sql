-- 247: Allow conditional offhand candidates to explicitly mean "no offhand".
-- Two-handed weapons cannot equip an offhand, but slots can still define a
-- base offhand option list for one-handed weapons. The sentinel is valid only
-- inside conditional_options.offhand.<weapon_id>; assigned offhand columns stay
-- NULL when it is selected or when the offhand pick is omitted.

create or replace function public.assign_slot(
  p_slot_id uuid,
  p_discord_id text,
  p_username text,
  p_picks jsonb default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_party_id uuid;
  v_event_id uuid;
  v_existing text;
  v_existing_req text;
  v_is_bomb boolean;
  v_is_solo boolean;
  v_options jsonb;
  v_cond jsonb;
  v_weapon_id text;
  v_kinds text[] := array['weapon','head','armor','shoes','offhand','potion','food','cape','mount'];
  v_k text;
  v_opts jsonb;
  v_pick jsonb;
  v_match int;
  v_cond_opts jsonb;
  v_allows_no_offhand boolean;
  v_no_offhand_selected boolean := false;
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
         ),
         s.conditional_options
    into v_party_id, v_event_id, v_existing, v_existing_req, v_is_bomb, v_is_solo, v_options, v_cond
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

  -- Solo bomb: free-form picks, skip option validation entirely.
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
    -- Regular slot: validate picks against options.
    -- 1) 무기 픽 ID 를 먼저 추출해 conditional 룩업에 쓴다.
    v_weapon_id := case when p_picks is null then null else p_picks->'weapon'->>'id' end;

    foreach v_k in array v_kinds loop
      v_opts := v_options -> v_k;
      if v_opts is null or jsonb_typeof(v_opts) <> 'array' or jsonb_array_length(v_opts) = 0 then
        continue;
      end if;

      -- conditional_options 가 해당 종류 + 무기 id 매핑을 가지면 좁힌 후보로 검증.
      -- weapon 자기 자신은 conditional 미적용 (의존성 시작점이므로).
      v_cond_opts := null;
      if v_k <> 'weapon' and v_cond is not null and v_weapon_id is not null then
        v_cond_opts := v_cond -> v_k -> v_weapon_id;
      end if;

      v_allows_no_offhand := false;
      if v_k = 'offhand' and v_cond_opts is not null and jsonb_typeof(v_cond_opts) = 'array' then
        select exists (
          select 1
            from jsonb_array_elements(v_cond_opts) as opt
           where opt->>'id' = '__NO_OFFHAND__'
        ) into v_allows_no_offhand;
      end if;

      v_pick := case when p_picks is null then null else p_picks -> v_k end;
      if v_pick is null or v_pick->>'id' is null or v_pick->>'name' is null then
        if not v_allows_no_offhand then
          raise exception 'GEAR_CHOICE_REQUIRED:%', v_k;
        end if;
        continue;
      end if;

      if v_cond_opts is not null and jsonb_typeof(v_cond_opts) = 'array' then
        select count(*) into v_match
          from jsonb_array_elements(v_cond_opts) as opt
         where opt->>'id' = v_pick->>'id'
           and opt->>'name' = v_pick->>'name';
      else
        select count(*) into v_match
          from jsonb_array_elements(v_opts) as opt
         where opt->>'id' = v_pick->>'id'
           and opt->>'name' = v_pick->>'name';
      end if;

      if v_match = 0 then
        raise exception 'GEAR_NOT_IN_OPTIONS:%', v_k;
      end if;
    end loop;
  end if;

  if v_cond is not null and v_weapon_id is not null then
    v_cond_opts := v_cond -> 'offhand' -> v_weapon_id;
    if v_cond_opts is not null and jsonb_typeof(v_cond_opts) = 'array' then
      select exists (
        select 1
          from jsonb_array_elements(v_cond_opts) as opt
         where opt->>'id' = '__NO_OFFHAND__'
           and (
             p_picks is null
             or p_picks->'offhand' is null
             or p_picks->'offhand'->>'id' = '__NO_OFFHAND__'
           )
      ) into v_no_offhand_selected;
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
       and (s.assigned_discord_id = p_discord_id or s.requested_discord_id = p_discord_id)
  ) then
    raise exception 'ALREADY_IN_EVENT';
  end if;

  if v_is_bomb then
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
      assigned_offhand_name = case when (v_options->'offhand') is not null and jsonb_typeof(v_options->'offhand') = 'array' and jsonb_array_length(v_options->'offhand') > 0 and not v_no_offhand_selected then p_picks->'offhand'->>'name' else null end,
      assigned_offhand_id   = case when (v_options->'offhand') is not null and jsonb_typeof(v_options->'offhand') = 'array' and jsonb_array_length(v_options->'offhand') > 0 and not v_no_offhand_selected then p_picks->'offhand'->>'id'   else null end,
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
