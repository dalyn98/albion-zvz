-- 331: Passwordless event guest applications and recoverable management links.
--
-- A reusable group invite proves access to recruitment information. It does
-- not become the long-lived credential for one participant. Successful slot
-- assignment and a per-application management grant are therefore committed
-- in the same transaction. Only a SHA-256 digest of that grant is stored.

alter table public.events
  add column if not exists guest_regear_enabled boolean not null default false;

comment on column public.events.guest_regear_enabled is
  'Explicit event-level opt-in for manual guest regear. Guests are never automatic regear targets.';

alter table public.event_guest_profiles
  add column if not exists albion_server text,
  add column if not exists albion_player_id text,
  add column if not exists albion_character_name text,
  add column if not exists albion_guild_name text,
  add column if not exists character_verified boolean not null default false;

alter table public.event_guest_profiles
  drop constraint if exists event_guest_profiles_character_chk;
alter table public.event_guest_profiles
  add constraint event_guest_profiles_character_chk
  check (
    (
      albion_server is null
      and albion_player_id is null
      and albion_character_name is null
      and albion_guild_name is null
      and character_verified = false
    )
    or (
      albion_server in ('west', 'east', 'europe')
      and nullif(btrim(albion_character_name), '') is not null
      and char_length(albion_character_name) <= 64
      and (
        (
          character_verified = true
          and nullif(btrim(albion_player_id), '') is not null
          and char_length(albion_player_id) <= 128
        )
        or (
          character_verified = false
          and albion_player_id is null
        )
      )
      and (
        albion_guild_name is null
        or char_length(albion_guild_name) <= 128
      )
    )
  ) not valid;
alter table public.event_guest_profiles
  validate constraint event_guest_profiles_character_chk;

alter table public.event_guest_profiles
  drop constraint if exists event_guest_profiles_guild_event_fk;
alter table public.event_guest_profiles
  add constraint event_guest_profiles_guild_event_fk
  foreign key (guild_id, event_id)
  references public.events(guild_id, id)
  on delete cascade;

comment on column public.event_guest_profiles.albion_player_id is
  'Public Albion player ID when an exact Gameinfo match was found. This is existence evidence, not ownership proof.';
comment on column public.event_guest_profiles.character_verified is
  'True only when the public Gameinfo API returned an exact server/player match. It does not mean the applicant owns the character.';

create unique index if not exists slots_guild_id_id_unique
  on public.slots (guild_id, id);

create table if not exists public.event_guest_applications (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  event_id uuid not null,
  guest_id text not null,
  slot_id uuid not null,
  status text not null,
  idempotency_key uuid not null,
  albion_server text not null,
  albion_player_id text,
  albion_character_name text not null,
  character_verified boolean not null default false,
  original_slot_id uuid not null,
  cancellation_reason text,
  assigned_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (guild_id, event_id, guest_id)
    references public.event_guest_profiles(guild_id, event_id, discord_id)
    on delete cascade,
  foreign key (guild_id, event_id)
    references public.events(guild_id, id)
    on delete cascade,
  foreign key (guild_id, slot_id)
    references public.slots(guild_id, id)
    on delete no action
    deferrable initially deferred,
  foreign key (guild_id, original_slot_id)
    references public.slots(guild_id, id)
    on delete no action
    deferrable initially deferred,
  unique (guild_id, id),
  unique (guild_id, event_id, id),
  unique (guild_id, event_id, guest_id),
  unique (guild_id, event_id, idempotency_key),
  constraint event_guest_applications_guest_id_chk check (
    nullif(btrim(guest_id), '') is not null
    and char_length(guest_id) <= 128
  ),
  constraint event_guest_applications_status_chk check (
    status in (
      'pending',
      'assigned',
      'withdrawn',
      'admin_removed',
      'reselection_required',
      'reselection_expired'
    )
  ),
  constraint event_guest_applications_character_chk check (
    albion_server in ('west', 'east', 'europe')
    and nullif(btrim(albion_character_name), '') is not null
    and char_length(albion_character_name) <= 64
    and (
      (
        character_verified = true
        and nullif(btrim(albion_player_id), '') is not null
        and char_length(albion_player_id) <= 128
      )
      or (
        character_verified = false
        and albion_player_id is null
      )
    )
  ),
  constraint event_guest_applications_cancel_chk check (
    (
      status in ('pending', 'assigned', 'reselection_required')
      and cancelled_at is null
    )
    or (
      status in ('withdrawn', 'admin_removed', 'reselection_expired')
      and cancelled_at is not null
    )
  ),
  constraint event_guest_applications_reason_chk check (
    cancellation_reason is null
    or char_length(cancellation_reason) <= 500
  )
);

create unique index if not exists event_guest_applications_verified_character_active_idx
  on public.event_guest_applications (
    guild_id,
    event_id,
    albion_server,
    albion_player_id
  )
  where albion_player_id is not null
    and status in ('pending', 'assigned', 'reselection_required');

create unique index if not exists event_guest_applications_manual_character_active_idx
  on public.event_guest_applications (
    guild_id,
    event_id,
    albion_server,
    lower(btrim(albion_character_name))
  )
  where albion_player_id is null
    and status in ('pending', 'assigned', 'reselection_required');

create index if not exists event_guest_applications_slot_idx
  on public.event_guest_applications (guild_id, event_id, slot_id);

alter table public.event_guest_applications enable row level security;
revoke all on public.event_guest_applications from public, anon, authenticated;
grant select, insert, update on public.event_guest_applications to service_role;
revoke delete on public.event_guest_applications from service_role;

create table if not exists public.event_guest_management_grants (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null,
  event_id uuid not null,
  application_id uuid not null,
  secret_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  foreign key (guild_id, event_id, application_id)
    references public.event_guest_applications(guild_id, event_id, id)
    on delete cascade,
  constraint event_guest_management_grants_hash_chk check (
    secret_hash ~ '^[0-9a-f]{64}$'
  )
);

create unique index if not exists event_guest_management_grants_active_application_idx
  on public.event_guest_management_grants (guild_id, application_id)
  where revoked_at is null;

create index if not exists event_guest_management_grants_lookup_idx
  on public.event_guest_management_grants (secret_hash)
  where revoked_at is null;

alter table public.event_guest_management_grants enable row level security;
revoke all on public.event_guest_management_grants from public, anon, authenticated;
grant select, insert, update on public.event_guest_management_grants to service_role;
revoke delete on public.event_guest_management_grants from service_role;

comment on table public.event_guest_management_grants is
  'Per-application passwordless recovery grants. Raw link secrets are never stored.';

create table if not exists public.event_guest_request_buckets (
  guild_id uuid not null references public.tenants(id) on delete cascade,
  event_id uuid not null,
  action text not null,
  scope_hash text not null,
  bucket_started_at timestamptz not null,
  request_count integer not null default 1,
  expires_at timestamptz not null,
  primary key (guild_id, event_id, action, scope_hash, bucket_started_at),
  foreign key (guild_id, event_id)
    references public.events(guild_id, id)
    on delete cascade,
  constraint event_guest_request_buckets_action_chk check (
    action in ('access', 'profile', 'slot', 'manage', 'regear')
  ),
  constraint event_guest_request_buckets_scope_chk check (
    scope_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint event_guest_request_buckets_count_chk check (
    request_count between 1 and 10000
  )
);

create index if not exists event_guest_request_buckets_expiry_idx
  on public.event_guest_request_buckets (expires_at);

alter table public.event_guest_request_buckets enable row level security;
revoke all on public.event_guest_request_buckets from public, anon, authenticated;
grant select, insert, update, delete on public.event_guest_request_buckets to service_role;

comment on table public.event_guest_request_buckets is
  'Short-lived abuse counters keyed by an HMAC-derived connection scope. Raw IP addresses and permanent device fingerprints are not stored.';

create or replace function public.consume_event_guest_request_budget(
  p_guild_id uuid,
  p_event_id uuid,
  p_action text,
  p_scope_hash text,
  p_bucket_seconds integer,
  p_limit integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bucket_started_at timestamptz;
  v_count integer;
begin
  if p_guild_id is null
     or p_event_id is null
     or p_action not in ('access', 'profile', 'slot', 'manage', 'regear')
     or p_scope_hash !~ '^[0-9a-f]{64}$'
     or p_bucket_seconds not between 10 and 3600
     or p_limit not between 1 and 1000 then
    raise exception 'event_guest_request_budget_invalid';
  end if;

  v_bucket_started_at :=
    to_timestamp(
      floor(extract(epoch from clock_timestamp()) / p_bucket_seconds)
      * p_bucket_seconds
    );

  delete from public.event_guest_request_buckets
   where expires_at < clock_timestamp()
     and guild_id = p_guild_id;

  insert into public.event_guest_request_buckets (
    guild_id,
    event_id,
    action,
    scope_hash,
    bucket_started_at,
    request_count,
    expires_at
  ) values (
    p_guild_id,
    p_event_id,
    p_action,
    p_scope_hash,
    v_bucket_started_at,
    1,
    v_bucket_started_at + make_interval(secs => p_bucket_seconds * 2)
  )
  on conflict (guild_id, event_id, action, scope_hash, bucket_started_at)
  do update set request_count =
    public.event_guest_request_buckets.request_count + 1
  returning request_count into v_count;

  return v_count <= p_limit;
end;
$$;

revoke all on function public.consume_event_guest_request_budget(
  uuid, uuid, text, text, integer, integer
) from public, anon, authenticated;
grant execute on function public.consume_event_guest_request_budget(
  uuid, uuid, text, text, integer, integer
) to service_role;

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
  if v_event.battle_started_at is not null then
    raise exception 'event_regear_roster_locked';
  end if;
  if v_event.gather_at is not null and clock_timestamp() >= v_event.gather_at then
    raise exception 'GUEST_RECRUITMENT_CLOSED';
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

create or replace function public.cancel_guest_event_application(
  p_guild_id uuid,
  p_event_id uuid,
  p_guest_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_application public.event_guest_applications%rowtype;
  v_started_at timestamptz;
begin
  select battle_started_at
    into v_started_at
    from public.events
   where guild_id = p_guild_id
     and id = p_event_id
   for update;
  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;
  if v_started_at is not null then
    raise exception 'event_regear_roster_locked';
  end if;

  select *
    into v_application
    from public.event_guest_applications
   where guild_id = p_guild_id
     and event_id = p_event_id
     and guest_id = p_guest_id
   for update;
  if not found then
    raise exception 'NO_GUEST_APPLICATION';
  end if;
  if v_application.status not in ('pending', 'assigned', 'reselection_required') then
    return;
  end if;

  perform public.cancel_slot(v_application.slot_id, p_guest_id);
  update public.event_guest_applications
     set status = 'withdrawn',
         cancellation_reason = 'guest_withdrawal',
         cancelled_at = clock_timestamp(),
         updated_at = clock_timestamp()
   where id = v_application.id;
end;
$$;

revoke all on function public.cancel_guest_event_application(
  uuid, uuid, text
) from public, anon, authenticated;
grant execute on function public.cancel_guest_event_application(
  uuid, uuid, text
) to service_role;

create or replace function public.sync_event_guest_application_from_slot()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_guest_id text;
begin
  if new.assigned_discord_id is not null then
    update public.event_guest_applications
       set status = 'assigned',
           slot_id = new.id,
           assigned_at = coalesce(assigned_at, clock_timestamp()),
           cancelled_at = null,
           cancellation_reason = null,
           updated_at = clock_timestamp()
     where guild_id = new.guild_id
       and guest_id = new.assigned_discord_id
       and slot_id = new.id
       and status in ('pending', 'reselection_required');
  end if;

  if new.requested_discord_id is not null then
    update public.event_guest_applications
       set status = 'pending',
           slot_id = new.id,
           updated_at = clock_timestamp()
     where guild_id = new.guild_id
       and guest_id = new.requested_discord_id
       and slot_id = new.id
       and status in ('reselection_required');
  end if;

  foreach v_guest_id in array array[
    old.assigned_discord_id,
    old.requested_discord_id
  ] loop
    if v_guest_id is not null
       and v_guest_id is distinct from new.assigned_discord_id
       and v_guest_id is distinct from new.requested_discord_id then
      update public.event_guest_applications
         set status = 'admin_removed',
             cancellation_reason = coalesce(
               cancellation_reason,
               'assignment_removed'
             ),
             cancelled_at = coalesce(cancelled_at, clock_timestamp()),
             updated_at = clock_timestamp()
       where guild_id = old.guild_id
         and guest_id = v_guest_id
         and slot_id = old.id
         and status in ('pending', 'assigned', 'reselection_required');
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists sync_event_guest_application_from_slot
  on public.slots;
create trigger sync_event_guest_application_from_slot
  after update of
    assigned_discord_id,
    requested_discord_id
  on public.slots
  for each row
  execute function public.sync_event_guest_application_from_slot();

create or replace function public.guard_started_event_guest_profile()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1
      from public.events as event
     where event.guild_id = old.guild_id
       and event.id = old.event_id
       and event.battle_started_at is not null
  )
  and (
    new.display_name is distinct from old.display_name
    or new.albion_server is distinct from old.albion_server
    or new.albion_player_id is distinct from old.albion_player_id
    or new.albion_character_name is distinct from old.albion_character_name
    or new.albion_guild_name is distinct from old.albion_guild_name
    or new.character_verified is distinct from old.character_verified
  ) then
    raise exception 'event_guest_participation_locked';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_started_event_guest_profile
  on public.event_guest_profiles;
create trigger guard_started_event_guest_profile
  before update on public.event_guest_profiles
  for each row
  execute function public.guard_started_event_guest_profile();

create or replace function public.guard_started_event_guest_regear_setting()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.battle_started_at is not null
     and new.guest_regear_enabled is distinct from old.guest_regear_enabled then
    raise exception 'event_operational_snapshot_locked';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_started_event_guest_regear_setting
  on public.events;
create trigger guard_started_event_guest_regear_setting
  before update of guest_regear_enabled on public.events
  for each row
  execute function public.guard_started_event_guest_regear_setting();

-- The browser never talks to these legacy security-definer slot RPCs
-- directly. Tighten their default function privileges while this new wrapper
-- is introduced.
revoke all on function public.assign_slot(uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.assign_slot(uuid, text, text, jsonb)
  to service_role;
revoke all on function public.cancel_slot(uuid, text)
  from public, anon, authenticated;
grant execute on function public.cancel_slot(uuid, text)
  to service_role;
