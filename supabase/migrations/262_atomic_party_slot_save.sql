-- Migration 262: atomic, retry-safe replacement of one party's editable slot layout.
--
-- The previous application flow issued separate DELETE, temporary renumber,
-- final renumber, and INSERT statements. A stale or overlapping save could
-- therefore leave an existing row at a final slot number and fail with
-- slots_party_id_slot_number_key. This RPC serializes one party, validates an
-- optimistic version, and commits the whole replacement in one transaction.
--
-- Rollback: deploy a forward migration that drops save_party_slots_atomic,
-- both version-bump triggers and bump_party_slots_version, restores the
-- original non-deferrable unique constraint, and removes parties.slots_version
-- after the application no longer references it.

alter table public.parties
  add column if not exists slots_version bigint not null default 0;

alter table public.slots
  drop constraint if exists slots_party_id_slot_number_key;
alter table public.slots
  drop constraint if exists slots_guild_party_slot_number_key;
alter table public.slots
  add constraint slots_guild_party_slot_number_key
  unique (guild_id, party_id, slot_number)
  deferrable initially immediate;

create or replace function public.bump_party_slots_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The atomic RPC performs one explicit compare-and-swap version bump after
  -- replacing the whole layout. Its row triggers must not bump once per slot.
  if current_setting('app.atomic_party_slot_save', true) = '1' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    update public.parties
       set slots_version = slots_version + 1
     where guild_id = old.guild_id
       and id = old.party_id;
    return old;
  end if;

  update public.parties
     set slots_version = slots_version + 1
   where guild_id = new.guild_id
     and id = new.party_id;

  if tg_op = 'UPDATE' and (old.guild_id, old.party_id) is distinct from (new.guild_id, new.party_id) then
    update public.parties
       set slots_version = slots_version + 1
     where guild_id = old.guild_id
       and id = old.party_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bump_party_slots_version_insert_delete on public.slots;
create trigger trg_bump_party_slots_version_insert_delete
  after insert or delete on public.slots
  for each row execute function public.bump_party_slots_version();

drop trigger if exists trg_bump_party_slots_version_update on public.slots;
create trigger trg_bump_party_slots_version_update
  after update of
    guild_id,
    party_id,
    slot_number,
    is_hidden,
    role_name,
    notes,
    spells,
    gear_specs,
    auto_regear_excluded,
    manual_regear_excluded,
    is_solo_bomb,
    conditional_options,
    weapon_name,
    weapon_id,
    weapon_options,
    head_name,
    head_id,
    head_options,
    armor_name,
    armor_id,
    armor_options,
    shoes_name,
    shoes_id,
    shoes_options,
    offhand_name,
    offhand_id,
    offhand_options,
    potion_name,
    potion_id,
    potion_options,
    food_name,
    food_id,
    food_options,
    cape_name,
    cape_id,
    cape_options,
    mount_name,
    mount_id,
    mount_options
  on public.slots
  for each row execute function public.bump_party_slots_version();

create or replace function public.save_party_slots_atomic(
  p_guild_id uuid,
  p_event_id uuid,
  p_party_number integer,
  p_party_id uuid,
  p_expected_version bigint,
  p_party_meta jsonb,
  p_slots jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_party_id uuid;
  v_current_version bigint;
  v_new_version bigint;
  v_slot_count integer;
  v_distinct_id_count integer;
  v_current_ids uuid[];
  v_desired_ids uuid[];
  v_desired_ids_sorted uuid[];
  v_affected_discord_ids text[];
  v_is_idempotent_retry boolean;
begin
  if p_expected_version is null or p_expected_version < 0 then
    raise exception 'INVALID_PARTY_SLOTS_VERSION';
  end if;

  if p_slots is null or jsonb_typeof(p_slots) <> 'array' then
    raise exception 'INVALID_PARTY_SLOTS_PAYLOAD';
  end if;

  v_slot_count := jsonb_array_length(p_slots);
  if v_slot_count > 20 then
    raise exception 'TOO_MANY_PARTY_SLOTS';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_slots) with ordinality as desired(payload, ordinal)
     where jsonb_typeof(desired.payload) <> 'object'
        or not (desired.payload ? 'id')
        or not (desired.payload ? 'slot_number')
        or (desired.payload->>'slot_number')::integer <> desired.ordinal
  ) then
    raise exception 'INVALID_PARTY_SLOT_ORDER';
  end if;

  select
    coalesce(array_agg((desired.payload->>'id')::uuid order by desired.ordinal), array[]::uuid[]),
    count(distinct desired.payload->>'id')
    into v_desired_ids, v_distinct_id_count
    from jsonb_array_elements(p_slots) with ordinality as desired(payload, ordinal);

  if v_distinct_id_count <> v_slot_count then
    raise exception 'DUPLICATE_PARTY_SLOT_ID';
  end if;

  select coalesce(array_agg(desired_id.id order by desired_id.id), array[]::uuid[])
    into v_desired_ids_sorted
    from unnest(v_desired_ids) as desired_id(id);

  if not exists (
    select 1
      from public.events
     where guild_id = p_guild_id
       and id = p_event_id
  ) then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_event_id::text || ':' || p_party_number::text, 0)
  );

  if p_party_id is not null then
    select id
      into v_party_id
      from public.parties
     where guild_id = p_guild_id
       and event_id = p_event_id
       and party_number = p_party_number
       and id = p_party_id;

    if v_party_id is null then
      raise exception 'PARTY_NOT_FOUND';
    end if;
  else
    select id
      into v_party_id
      from public.parties
     where guild_id = p_guild_id
       and event_id = p_event_id
       and party_number = p_party_number;

    if v_party_id is null then
      if p_party_meta is null or jsonb_typeof(p_party_meta) <> 'object' then
        raise exception 'PARTY_META_REQUIRED';
      end if;

      insert into public.parties (
        guild_id,
        event_id,
        party_number,
        name,
        is_bomb_squad,
        bomb_squad_kind,
        caller_discord_id
      ) values (
        p_guild_id,
        p_event_id,
        p_party_number,
        p_party_meta->>'name',
        coalesce((p_party_meta->>'is_bomb_squad')::boolean, false),
        p_party_meta->>'bomb_squad_kind',
        p_party_meta->>'caller_discord_id'
      )
      returning id, slots_version into v_party_id, v_current_version;
    end if;
  end if;

  if v_current_version is null then
    -- Direct slot edits lock a slot row before the version-bump trigger touches
    -- its party. Lock every current slot first and only then read the party
    -- version, so a full-layout save cannot deadlock with another config writer.
    perform 1
      from public.slots
     where guild_id = p_guild_id
       and party_id = v_party_id
     order by id
     for update;

    select slots_version
      into v_current_version
      from public.parties
     where guild_id = p_guild_id
       and event_id = p_event_id
       and party_number = p_party_number
       and id = v_party_id;

    if not found then
      raise exception 'PARTY_NOT_FOUND';
    end if;
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_slots) as desired(payload)
      join public.slots existing on existing.id = (desired.payload->>'id')::uuid
     where existing.guild_id <> p_guild_id
        or existing.party_id <> v_party_id
  ) then
    raise exception 'PARTY_SLOT_SCOPE_MISMATCH';
  end if;

  select coalesce(array_agg(id order by id), array[]::uuid[])
    into v_current_ids
    from public.slots
   where guild_id = p_guild_id
     and party_id = v_party_id;

  if v_current_version <> p_expected_version then
    select
      v_current_ids = v_desired_ids_sorted
      and (
        p_party_meta is null
        or exists (
          select 1
            from public.parties current_party
           where current_party.id = v_party_id
             and current_party.guild_id = p_guild_id
             and to_jsonb(current_party) @> p_party_meta
        )
      )
      and not exists (
        select 1
          from jsonb_array_elements(p_slots) as desired(payload)
          left join public.slots current_slot
            on current_slot.id = (desired.payload->>'id')::uuid
           and current_slot.guild_id = p_guild_id
           and current_slot.party_id = v_party_id
         where current_slot.id is null
            or not (to_jsonb(current_slot) @> (desired.payload - 'id'))
      )
      into v_is_idempotent_retry;

    if not coalesce(v_is_idempotent_retry, false) then
      raise exception 'PARTY_SLOTS_STALE';
    end if;

    return jsonb_build_object(
      'party_id', v_party_id,
      'slots_version', v_current_version,
      'slot_ids', to_jsonb(v_desired_ids),
      'affected_discord_ids', '[]'::jsonb
    );
  end if;

  select coalesce(array_agg(distinct discord_id), array[]::text[])
    into v_affected_discord_ids
    from (
      select assigned_discord_id as discord_id
        from public.slots
       where guild_id = p_guild_id
         and party_id = v_party_id
      union
      select requested_discord_id as discord_id
        from public.slots
       where guild_id = p_guild_id
         and party_id = v_party_id
    ) affected
   where discord_id is not null
     and discord_id <> '';

  if p_party_meta is not null then
    if jsonb_typeof(p_party_meta) <> 'object' then
      raise exception 'INVALID_PARTY_META';
    end if;

    update public.parties
       set name = p_party_meta->>'name',
           is_bomb_squad = coalesce((p_party_meta->>'is_bomb_squad')::boolean, false),
           bomb_squad_kind = p_party_meta->>'bomb_squad_kind',
           caller_discord_id = p_party_meta->>'caller_discord_id'
     where guild_id = p_guild_id
       and id = v_party_id;
  end if;

  set constraints slots_guild_party_slot_number_key deferred;

  perform set_config('app.atomic_party_slot_save', '1', true);

  delete from public.slots
   where guild_id = p_guild_id
     and party_id = v_party_id
     and not (id = any(v_desired_ids));

  insert into public.slots (
    id,
    guild_id,
    party_id,
    slot_number,
    is_hidden,
    role_name,
    notes,
    spells,
    gear_specs,
    auto_regear_excluded,
    manual_regear_excluded,
    is_solo_bomb,
    conditional_options,
    weapon_name,
    weapon_id,
    weapon_options,
    head_name,
    head_id,
    head_options,
    armor_name,
    armor_id,
    armor_options,
    shoes_name,
    shoes_id,
    shoes_options,
    offhand_name,
    offhand_id,
    offhand_options,
    potion_name,
    potion_id,
    potion_options,
    food_name,
    food_id,
    food_options,
    cape_name,
    cape_id,
    cape_options,
    mount_name,
    mount_id,
    mount_options
  )
  select
    desired.id,
    p_guild_id,
    v_party_id,
    desired.slot_number,
    coalesce(desired.is_hidden, false),
    desired.role_name,
    desired.notes,
    desired.spells,
    desired.gear_specs,
    coalesce(desired.auto_regear_excluded, false),
    coalesce(desired.manual_regear_excluded, false),
    coalesce(desired.is_solo_bomb, false),
    desired.conditional_options,
    desired.weapon_name,
    desired.weapon_id,
    desired.weapon_options,
    desired.head_name,
    desired.head_id,
    desired.head_options,
    desired.armor_name,
    desired.armor_id,
    desired.armor_options,
    desired.shoes_name,
    desired.shoes_id,
    desired.shoes_options,
    desired.offhand_name,
    desired.offhand_id,
    desired.offhand_options,
    desired.potion_name,
    desired.potion_id,
    desired.potion_options,
    desired.food_name,
    desired.food_id,
    desired.food_options,
    desired.cape_name,
    desired.cape_id,
    desired.cape_options,
    desired.mount_name,
    desired.mount_id,
    desired.mount_options
  from jsonb_to_recordset(p_slots) as desired(
    id uuid,
    slot_number integer,
    is_hidden boolean,
    role_name text,
    notes text,
    spells jsonb,
    gear_specs jsonb,
    auto_regear_excluded boolean,
    manual_regear_excluded boolean,
    is_solo_bomb boolean,
    conditional_options jsonb,
    weapon_name text,
    weapon_id text,
    weapon_options jsonb,
    head_name text,
    head_id text,
    head_options jsonb,
    armor_name text,
    armor_id text,
    armor_options jsonb,
    shoes_name text,
    shoes_id text,
    shoes_options jsonb,
    offhand_name text,
    offhand_id text,
    offhand_options jsonb,
    potion_name text,
    potion_id text,
    potion_options jsonb,
    food_name text,
    food_id text,
    food_options jsonb,
    cape_name text,
    cape_id text,
    cape_options jsonb,
    mount_name text,
    mount_id text,
    mount_options jsonb
  )
  on conflict (id) do update set
    slot_number = excluded.slot_number,
    is_hidden = excluded.is_hidden,
    role_name = excluded.role_name,
    notes = excluded.notes,
    spells = excluded.spells,
    gear_specs = excluded.gear_specs,
    auto_regear_excluded = excluded.auto_regear_excluded,
    manual_regear_excluded = excluded.manual_regear_excluded,
    is_solo_bomb = excluded.is_solo_bomb,
    conditional_options = excluded.conditional_options,
    weapon_name = excluded.weapon_name,
    weapon_id = excluded.weapon_id,
    weapon_options = excluded.weapon_options,
    head_name = excluded.head_name,
    head_id = excluded.head_id,
    head_options = excluded.head_options,
    armor_name = excluded.armor_name,
    armor_id = excluded.armor_id,
    armor_options = excluded.armor_options,
    shoes_name = excluded.shoes_name,
    shoes_id = excluded.shoes_id,
    shoes_options = excluded.shoes_options,
    offhand_name = excluded.offhand_name,
    offhand_id = excluded.offhand_id,
    offhand_options = excluded.offhand_options,
    potion_name = excluded.potion_name,
    potion_id = excluded.potion_id,
    potion_options = excluded.potion_options,
    food_name = excluded.food_name,
    food_id = excluded.food_id,
    food_options = excluded.food_options,
    cape_name = excluded.cape_name,
    cape_id = excluded.cape_id,
    cape_options = excluded.cape_options,
    mount_name = excluded.mount_name,
    mount_id = excluded.mount_id,
    mount_options = excluded.mount_options;

  perform set_config('app.atomic_party_slot_save', '0', true);

  update public.parties
     set slots_version = slots_version + 1
   where guild_id = p_guild_id
     and id = v_party_id
     and slots_version = v_current_version
  returning slots_version into v_new_version;

  if not found then
    raise exception 'PARTY_SLOTS_STALE';
  end if;

  return jsonb_build_object(
    'party_id', v_party_id,
    'slots_version', v_new_version,
    'slot_ids', to_jsonb(v_desired_ids),
    'affected_discord_ids', to_jsonb(v_affected_discord_ids)
  );
end;
$$;

comment on function public.save_party_slots_atomic(uuid, uuid, integer, uuid, bigint, jsonb, jsonb) is
  'Atomically replaces one tenant party slot layout with optimistic concurrency and retry-safe UUID identities.';

revoke all on function public.bump_party_slots_version() from public;
revoke all on function public.bump_party_slots_version() from anon, authenticated;
grant execute on function public.bump_party_slots_version() to service_role;

revoke all on function public.save_party_slots_atomic(uuid, uuid, integer, uuid, bigint, jsonb, jsonb) from public;
revoke all on function public.save_party_slots_atomic(uuid, uuid, integer, uuid, bigint, jsonb, jsonb) from anon, authenticated;
grant execute on function public.save_party_slots_atomic(uuid, uuid, integer, uuid, bigint, jsonb, jsonb) to service_role;

notify pgrst, 'reload schema';
