-- 415: Preserve the immutable operational start while allowing an active,
-- auto-started event to be cancelled explicitly by an authorized manager.

alter table public.events
  add column if not exists operational_cancelled_at timestamptz,
  add column if not exists operational_cancelled_by text;

alter table public.events
  drop constraint if exists events_status_check;
alter table public.events
  add constraint events_status_check
  check (status in ('draft', 'published', 'cancelled')) not valid;
alter table public.events
  validate constraint events_status_check;

alter table public.events
  drop constraint if exists events_operational_cancellation_check;
alter table public.events
  add constraint events_operational_cancellation_check
  check (
    (
      status = 'cancelled'
      and battle_started_at is not null
      and operational_cancelled_at is not null
      and operational_cancelled_by is not null
      and length(btrim(operational_cancelled_by)) > 0
      and char_length(operational_cancelled_by) <= 128
      and operational_cancelled_at >= battle_started_at
    )
    or (
      status <> 'cancelled'
      and operational_cancelled_at is null
      and operational_cancelled_by is null
    )
  ) not valid;
alter table public.events
  validate constraint events_operational_cancellation_check;

comment on column public.events.operational_cancelled_at is
  'Terminal manager cancellation time. The immutable operational start and snapshots remain preserved.';
comment on column public.events.operational_cancelled_by is
  'Discord actor that cancelled active event operations.';

create or replace function public.prepare_event_operational_lifecycle()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_cancel_write boolean :=
    coalesce(
      current_setting('app.event_operational_cancel_write', true) = 'on',
      false
    )
    and current_user in ('postgres', 'service_role');
begin
  if tg_op = 'INSERT' then
    if new.status = 'cancelled' then
      raise exception 'event_operational_cancellation_requires_command';
    end if;
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
    if new.status <> 'cancelled' or not v_cancel_write then
      raise exception 'event_publication_boundary_locked';
    end if;
  elsif old.status = 'cancelled' and new.status is distinct from old.status then
    raise exception 'event_operational_cancellation_locked';
  elsif old.status = 'draft' and new.status not in ('draft', 'published') then
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

  if old.status <> 'cancelled' and new.status = 'cancelled' then
    if not v_cancel_write
       or new.battle_started_at is null
       or new.operational_cancelled_at is null
       or nullif(btrim(coalesce(new.operational_cancelled_by, '')), '') is null then
      raise exception 'event_operational_cancellation_requires_command';
    end if;
  elsif new.operational_cancelled_at is distinct from old.operational_cancelled_at
        or new.operational_cancelled_by is distinct from old.operational_cancelled_by then
    raise exception 'event_operational_cancellation_locked';
  end if;

  return new;
end;
$$;

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

  if exists (
    select 1
      from public.events as event
     where event.status = 'cancelled'
       and (
         (event.guild_id = v_old_guild_id and event.id = v_old_event_id)
         or (event.guild_id = v_new_guild_id and event.id = v_new_event_id)
       )
  ) then
    raise exception 'event_operations_cancelled';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.guard_started_event_slots()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_old_party_id uuid;
  v_new_party_id uuid;
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

  if exists (
    select 1
      from public.parties as party
      join public.events as event
        on event.guild_id = party.guild_id
       and event.id = party.event_id
     where event.status = 'cancelled'
       and (party.id = v_old_party_id or party.id = v_new_party_id)
  ) then
    raise exception 'event_operations_cancelled';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_started_event_direct_child()
  from public, anon, authenticated, service_role;
revoke all on function public.guard_started_event_slots()
  from public, anon, authenticated, service_role;

create or replace function public.cancel_event_operations(
  p_guild_id uuid,
  p_event_id uuid,
  p_actor_discord_id text
) returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_event public.events%rowtype;
  v_cancelled_at timestamptz := clock_timestamp();
begin
  if p_guild_id is null
     or p_event_id is null
     or nullif(btrim(coalesce(p_actor_discord_id, '')), '') is null
     or char_length(p_actor_discord_id) > 128 then
    raise exception 'event_operational_cancellation_invalid';
  end if;

  select event.*
    into v_event
    from public.events as event
   where event.guild_id = p_guild_id
     and event.id = p_event_id
   for update;

  if not found then
    raise exception 'event_not_found';
  end if;
  if v_event.status = 'cancelled' then
    return false;
  end if;
  if v_event.status <> 'published' or v_event.battle_started_at is null then
    raise exception 'event_operations_not_started';
  end if;
  if v_event.operational_ended_at is null
     or v_event.operational_ended_at <= v_cancelled_at then
    raise exception 'event_operations_already_ended';
  end if;
  if exists (
    select 1
      from public.regear_requests as request
     where request.guild_id = p_guild_id
       and request.event_id = p_event_id
       and request.status in ('pending', 'approved')
  ) then
    raise exception 'event_operations_has_regear_requests';
  end if;
  if exists (
    select 1
      from public.event_participation_closeouts as closeout
     where closeout.guild_id = p_guild_id
       and closeout.event_id = p_event_id
  ) then
    raise exception 'event_operations_has_closeout';
  end if;

  perform set_config('app.event_operational_cancel_write', 'on', true);

  update public.events
     set status = 'cancelled',
         operational_cancelled_at = v_cancelled_at,
         operational_cancelled_by = btrim(p_actor_discord_id),
         exclude_from_participation_stats = true,
         auto_regear_processed_at = coalesce(auto_regear_processed_at, v_cancelled_at)
   where guild_id = p_guild_id
     and id = p_event_id;

  return true;
end;
$$;

revoke all on function public.cancel_event_operations(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.cancel_event_operations(uuid, uuid, text)
  to service_role;

comment on function public.cancel_event_operations(uuid, uuid, text) is
  'Tenant-scoped terminal cancellation for an active event. Preserves start snapshots and blocks cancellation after financial or attendance closeout work begins.';

-- A cancelled event must not accept a regear request even if a stale client
-- races the cancellation. Keep the existing provisional-participant behavior.
create or replace function public.guard_event_regear_actual_participant()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_event_status text;
  v_closeout_required boolean;
  v_guest_regear_enabled boolean;
  v_is_guest_application boolean;
  v_closeout_finalized boolean := false;
  v_participant_confirmed boolean := false;
  v_snapshot_matches boolean := false;
begin
  if new.event_id is null then
    new.participant_confirmation_status := 'not_required';
    return new;
  end if;

  select
    event.status,
    event.participation_closeout_required,
    event.guest_regear_enabled
  into
    v_event_status,
    v_closeout_required,
    v_guest_regear_enabled
  from public.events as event
  where event.guild_id = new.guild_id
    and event.id = new.event_id;

  if not found then
    return new;
  end if;
  if v_event_status <> 'published' then
    raise exception 'event_operations_cancelled';
  end if;

  if v_closeout_required then
    select exists (
      select 1
      from public.event_participation_closeouts as closeout
      where closeout.guild_id = new.guild_id
        and closeout.event_id = new.event_id
    ) into v_closeout_finalized;

    select exists (
      select 1
      from public.event_participation_closeout_entries as entry
      where entry.guild_id = new.guild_id
        and entry.event_id = new.event_id
        and entry.discord_id = new.discord_id
        and entry.decision = 'included'
    ) into v_participant_confirmed;

    if v_participant_confirmed then
      new.participant_confirmation_status := 'confirmed';
    elsif v_closeout_finalized then
      raise exception 'event_actual_participant_required';
    elsif new.auto_generated is true then
      raise exception 'event_actual_participant_required';
    else
      select exists (
        select 1
        from public.event_regear_policy_snapshots as snapshot
        where snapshot.guild_id = new.guild_id
          and snapshot.event_id = new.event_id
          and snapshot.discord_id = new.discord_id
          and snapshot.id = new.event_regear_policy_snapshot_id
      ) into v_snapshot_matches;

      if not v_snapshot_matches then
        raise exception 'event_regear_policy_snapshot_required';
      end if;
      new.participant_confirmation_status := 'awaiting_closeout';
    end if;
  else
    new.participant_confirmation_status := 'not_required';
  end if;

  select exists (
    select 1
    from public.event_guest_applications as application
    where application.guild_id = new.guild_id
      and application.event_id = new.event_id
      and application.guest_id = new.discord_id
      and application.status = 'assigned'
  ) into v_is_guest_application;

  if v_is_guest_application then
    if not v_guest_regear_enabled then
      raise exception 'event_guest_regear_disabled';
    end if;
    if new.auto_generated is true then
      raise exception 'event_guest_auto_regear_forbidden';
    end if;
    if new.request_type is distinct from 'death' then
      raise exception 'event_guest_regear_death_only';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_event_regear_actual_participant()
  from public, anon, authenticated, service_role;

create or replace function public.get_event_state_snapshot(
  p_guild_id uuid,
  p_event_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'fingerprint', event.state_revision::text,
    'battle_started_at', event.battle_started_at,
    'gather_at', event.gather_at,
    'status', event.status
  )
  from public.events as event
  where event.guild_id = p_guild_id
    and event.id = p_event_id
    and event.status <> 'draft';
$$;

revoke all on function public.get_event_state_snapshot(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.get_event_state_snapshot(uuid, uuid)
  to service_role;

notify pgrst, 'reload schema';
