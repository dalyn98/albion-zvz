-- 329: Gather-time operational lifecycle and immutable started-event snapshot.
--
-- `battle_started_at` is retained as a compatibility column, but its product
-- meaning is the operational start boundary. Published events enter that
-- boundary at `gather_at`; it does not claim that an Albion fight began then.

alter table public.events
  add column if not exists published_at timestamptz,
  add column if not exists operational_ended_at timestamptz;

-- Preserve old, unstarted historical rows as explicitly exempt from automatic
-- start. Existing started rows and currently actionable published rows receive
-- an eligibility marker.
update public.events
set published_at = coalesce(battle_started_at, created_at, clock_timestamp())
where status = 'published'
  and published_at is null
  and (
    battle_started_at is not null
    or (
      gather_at is not null
      and gather_at >= clock_timestamp() - interval '6 hours'
    )
  );

update public.events
set operational_ended_at = battle_started_at + interval '1 hour'
where battle_started_at is not null
  and operational_ended_at is null;

alter table public.events
  drop constraint if exists events_operational_window_check;
alter table public.events
  add constraint events_operational_window_check
  check (
    (
      battle_started_at is null
      and operational_ended_at is null
    )
    or (
      battle_started_at is not null
      and operational_ended_at = battle_started_at + interval '1 hour'
    )
  ) not valid;
alter table public.events
  validate constraint events_operational_window_check;

create or replace function public.prepare_event_operational_lifecycle()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'published' and new.published_at is null then
      new.published_at := clock_timestamp();
    end if;
    if new.battle_started_at is not null then
      new.operational_ended_at := new.battle_started_at + interval '1 hour';
    elsif new.operational_ended_at is not null then
      raise exception 'event_operational_end_without_start';
    end if;
    return new;
  end if;

  if old.published_at is not null
     and new.published_at is distinct from old.published_at then
    raise exception 'event_publication_boundary_locked';
  end if;
  if old.status = 'published' and new.status is distinct from old.status then
    raise exception 'event_publication_boundary_locked';
  end if;
  if old.status = 'draft'
     and new.status = 'published'
     and new.published_at is null then
    new.published_at := clock_timestamp();
  end if;

  if old.battle_started_at is not null
     and new.battle_started_at is distinct from old.battle_started_at then
    raise exception 'event_operational_start_locked';
  end if;
  if old.operational_ended_at is not null
     and new.operational_ended_at is distinct from old.operational_ended_at then
    raise exception 'event_operational_end_locked';
  end if;
  if old.battle_started_at is null and new.battle_started_at is not null then
    new.operational_ended_at := new.battle_started_at + interval '1 hour';
  elsif new.battle_started_at is null and new.operational_ended_at is not null then
    raise exception 'event_operational_end_without_start';
  end if;

  return new;
end;
$$;

drop trigger if exists prepare_event_operational_lifecycle_on_insert
  on public.events;
create trigger prepare_event_operational_lifecycle_on_insert
  before insert on public.events
  for each row
  execute function public.prepare_event_operational_lifecycle();

drop trigger if exists prepare_event_operational_lifecycle_on_update
  on public.events;
create trigger prepare_event_operational_lifecycle_on_update
  before update of
    status,
    published_at,
    battle_started_at,
    operational_ended_at
  on public.events
  for each row
  execute function public.prepare_event_operational_lifecycle();

create or replace function public.guard_started_event_snapshot()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    -- Tenant/event parent cleanup is allowed to cascade. A direct deletion of
    -- a started event would destroy the immutable operational snapshot.
    if pg_trigger_depth() <= 1 and old.battle_started_at is not null then
      raise exception 'event_operational_snapshot_locked';
    end if;
    return old;
  end if;

  if old.battle_started_at is not null
     and (
       new.title is distinct from old.title
       or new.gather_time is distinct from old.gather_time
       or new.gather_at is distinct from old.gather_at
       or new.gather_location is distinct from old.gather_location
       or new.special_notes is distinct from old.special_notes
       or new.is_active is distinct from old.is_active
       or new.battle_started_at is distinct from old.battle_started_at
       or new.published_at is distinct from old.published_at
       or new.operational_ended_at is distinct from old.operational_ended_at
       or new.notify_role_id is distinct from old.notify_role_id
       or new.notify_channel_id is distinct from old.notify_channel_id
       or new.notify_everyone is distinct from old.notify_everyone
       or new.created_by is distinct from old.created_by
       or new.status is distinct from old.status
       or new.category is distinct from old.category
       or new.recruitment_mode is distinct from old.recruitment_mode
       or new.exclude_from_participation_stats
          is distinct from old.exclude_from_participation_stats
       or new.regear_policy is distinct from old.regear_policy
       or new.regear_silver_cap is distinct from old.regear_silver_cap
       or new.regear_max_deaths_per_member
          is distinct from old.regear_max_deaths_per_member
       or new.regear_video_policy is distinct from old.regear_video_policy
       or new.regear_video_payout_rate_percent
          is distinct from old.regear_video_payout_rate_percent
       or new.regear_video_claim_ceiling_bonus_silver
          is distinct from old.regear_video_claim_ceiling_bonus_silver
       or new.regear_video_rate_applies_without_proof
          is distinct from old.regear_video_rate_applies_without_proof
       or new.regear_auto_policy is distinct from old.regear_auto_policy
       or new.regear_policy_version_id
          is distinct from old.regear_policy_version_id
       or new.regear_policy_config_snapshot
          is distinct from old.regear_policy_config_snapshot
       or new.regear_policy_snapshotted_at
          is distinct from old.regear_policy_snapshotted_at
       or new.tentative_snapshot_version_id
          is distinct from old.tentative_snapshot_version_id
       or new.tentative_snapshotted_at
          is distinct from old.tentative_snapshotted_at
     ) then
    raise exception 'event_operational_snapshot_locked';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_started_event_snapshot on public.events;
create trigger guard_started_event_snapshot
  before update or delete on public.events
  for each row
  execute function public.guard_started_event_snapshot();

create or replace function public.guard_started_event_direct_child()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_old_guild_id uuid;
  v_old_event_id uuid;
  v_new_guild_id uuid;
  v_new_event_id uuid;
  v_locked boolean;
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;

  if tg_op <> 'INSERT' then
    v_old_guild_id := old.guild_id;
    v_old_event_id := old.event_id;
  end if;
  if tg_op <> 'DELETE' then
    v_new_guild_id := new.guild_id;
    v_new_event_id := new.event_id;
  end if;

  select exists (
    select 1
    from public.events as event
    where event.battle_started_at is not null
      and (
        (
          event.guild_id = v_old_guild_id
          and event.id = v_old_event_id
        )
        or (
          event.guild_id = v_new_guild_id
          and event.id = v_new_event_id
        )
      )
  )
  into v_locked;

  if v_locked then
    raise exception 'event_operational_composition_locked';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_started_event_parties on public.parties;
create trigger guard_started_event_parties
  before insert or update or delete on public.parties
  for each row
  execute function public.guard_started_event_direct_child();

drop trigger if exists guard_started_event_build_role_demands
  on public.event_build_role_demands;
create trigger guard_started_event_build_role_demands
  before insert or update or delete on public.event_build_role_demands
  for each row
  execute function public.guard_started_event_direct_child();

drop trigger if exists guard_started_event_build_party_assigners
  on public.event_build_party_assigners;
create trigger guard_started_event_build_party_assigners
  before insert or update or delete on public.event_build_party_assigners
  for each row
  execute function public.guard_started_event_direct_child();

drop trigger if exists guard_started_event_build_applications
  on public.event_build_applications;
create trigger guard_started_event_build_applications
  before insert or update or delete on public.event_build_applications
  for each row
  execute function public.guard_started_event_direct_child();

create or replace function public.guard_started_event_slots()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_old_party_id uuid;
  v_new_party_id uuid;
  v_locked boolean;
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;

  if tg_op <> 'INSERT' then
    v_old_party_id := old.party_id;
  end if;
  if tg_op <> 'DELETE' then
    v_new_party_id := new.party_id;
  end if;

  select exists (
    select 1
    from public.parties as party
    join public.events as event
      on event.guild_id = party.guild_id
     and event.id = party.event_id
    where event.battle_started_at is not null
      and (
        party.id = v_old_party_id
        or party.id = v_new_party_id
      )
  )
  into v_locked;

  if v_locked then
    raise exception 'event_operational_composition_locked';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_started_event_slots on public.slots;
create trigger guard_started_event_slots
  before insert or update or delete on public.slots
  for each row
  execute function public.guard_started_event_slots();

-- Auto-start is a published-event invariant. Keep the legacy setting at true
-- so old activation checks and operational diagnostics remain compatible.
insert into public.app_settings (guild_id, key, value, updated_at)
select tenant.id, 'events_auto_start_enabled', 'true', clock_timestamp()
from public.tenants as tenant
on conflict (guild_id, key) do update
set value = excluded.value,
    updated_at = excluded.updated_at;

create or replace function public.enforce_mandatory_event_auto_start_setting()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.key = 'events_auto_start_enabled' and new.value <> 'true' then
    raise exception 'event_auto_start_is_mandatory';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_mandatory_event_auto_start_setting
  on public.app_settings;
create trigger enforce_mandatory_event_auto_start_setting
  before insert or update of key, value on public.app_settings
  for each row
  execute function public.enforce_mandatory_event_auto_start_setting();

create index if not exists events_operational_start_due_idx
  on public.events (guild_id, gather_at, id)
  where status = 'published'
    and published_at is not null
    and battle_started_at is null
    and gather_at is not null;

revoke all on function public.prepare_event_operational_lifecycle()
  from public, anon, authenticated, service_role;
revoke all on function public.guard_started_event_snapshot()
  from public, anon, authenticated, service_role;
revoke all on function public.guard_started_event_direct_child()
  from public, anon, authenticated, service_role;
revoke all on function public.guard_started_event_slots()
  from public, anon, authenticated, service_role;
revoke all on function public.enforce_mandatory_event_auto_start_setting()
  from public, anon, authenticated, service_role;

comment on column public.events.published_at is
  'First publication boundary. NULL on deliberately exempt legacy published rows.';
comment on column public.events.operational_ended_at is
  'Deterministic operational end, exactly one hour after the gather-based operational start.';
comment on function public.prepare_event_operational_lifecycle() is
  'Sets immutable publication and one-hour operational boundaries without claiming an actual fight time.';
comment on function public.guard_started_event_snapshot() is
  'Prevents direct mutation or deletion of a started event operational snapshot.';
comment on function public.guard_started_event_direct_child() is
  'Freezes party and build-sheet composition once an event has operationally started.';
comment on function public.guard_started_event_slots() is
  'Freezes slot assignments and equipment criteria once an event has operationally started.';
