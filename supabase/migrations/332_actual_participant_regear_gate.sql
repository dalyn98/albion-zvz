-- 332: Make the administrator-finalized participant roster the eligibility
-- boundary for new event regear flows.
--
-- Existing events remain on their legacy contract so an additive rollout
-- cannot retroactively strand open claims. Events created after this
-- migration require one immutable closeout entry with decision = included.

alter table public.events
  add column if not exists participation_closeout_required boolean
  not null default false;

alter table public.events
  alter column participation_closeout_required set default true;

comment on column public.events.participation_closeout_required is
  'True for events created after migration 332. Event regear is accepted only for a finalized included participant.';

create or replace function public.guard_started_event_participation_requirement()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.battle_started_at is not null
     and new.participation_closeout_required
       is distinct from old.participation_closeout_required then
    raise exception 'event_operational_snapshot_locked';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_started_event_participation_requirement
  on public.events;
create trigger guard_started_event_participation_requirement
  before update of participation_closeout_required on public.events
  for each row
  execute function public.guard_started_event_participation_requirement();

create or replace function public.guard_event_regear_actual_participant()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_closeout_required boolean;
  v_guest_regear_enabled boolean;
  v_is_guest_application boolean;
begin
  if new.event_id is null then
    return new;
  end if;

  select
    event.participation_closeout_required,
    event.guest_regear_enabled
  into
    v_closeout_required,
    v_guest_regear_enabled
  from public.events as event
  where event.guild_id = new.guild_id
    and event.id = new.event_id;

  if not found then
    return new;
  end if;

  if v_closeout_required
     and not exists (
       select 1
       from public.event_participation_closeout_entries as entry
       where entry.guild_id = new.guild_id
         and entry.event_id = new.event_id
         and entry.discord_id = new.discord_id
         and entry.decision = 'included'
     ) then
    raise exception 'event_actual_participant_required';
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

drop trigger if exists guard_event_regear_actual_participant
  on public.regear_requests;
create trigger guard_event_regear_actual_participant
  before insert on public.regear_requests
  for each row
  execute function public.guard_event_regear_actual_participant();
