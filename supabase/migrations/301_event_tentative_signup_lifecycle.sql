-- 301: Treat tentative signups as weak pre-event availability only.
--
-- A tentative signup is mutable only while a published event is recruiting.
-- Operational start freezes the remaining, unassigned rows into an immutable
-- snapshot in the same transaction that writes battle_started_at. The live
-- rows remain for compatibility, but all post-start reads use the snapshot.

alter table public.events
  add column if not exists tentative_snapshot_version_id uuid,
  add column if not exists tentative_snapshotted_at timestamptz;

alter table public.events
  drop constraint if exists events_tentative_snapshot_complete_chk;

alter table public.events
  add constraint events_tentative_snapshot_complete_chk
  check (
    (
      tentative_snapshot_version_id is null
      and tentative_snapshotted_at is null
    )
    or
    (
      tentative_snapshot_version_id is not null
      and tentative_snapshotted_at is not null
    )
  );

comment on column public.events.tentative_snapshot_version_id is
  'Immutable version for the weak availability snapshot captured at the first operational start.';
comment on column public.events.tentative_snapshotted_at is
  'Timestamp when unassigned tentative availability was frozen. This is not a confirmed attendance roster.';

create table if not exists public.event_tentative_signup_snapshots (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  event_id uuid not null,
  snapshot_version_id uuid not null,
  discord_id text not null,
  username text not null,
  possible_roles text[] not null,
  notes text,
  source_created_at timestamptz not null,
  source_updated_at timestamptz not null,
  captured_at timestamptz not null,
  foreign key (guild_id, event_id)
    references public.events(guild_id, id)
    on delete cascade,
  unique (guild_id, id),
  unique (guild_id, event_id, discord_id),
  constraint event_tentative_signup_snapshots_roles_chk check (
    cardinality(possible_roles) > 0
  )
);

create index if not exists event_tentative_signup_snapshots_event_idx
  on public.event_tentative_signup_snapshots
  (guild_id, event_id, captured_at);

alter table public.event_tentative_signup_snapshots enable row level security;

grant select, insert
  on public.event_tentative_signup_snapshots
  to service_role;
revoke update, delete
  on public.event_tentative_signup_snapshots
  from service_role;
revoke all
  on public.event_tentative_signup_snapshots
  from anon, authenticated;

-- Existing events may already be operationally started when this migration is
-- installed. Capture their remaining unassigned rows once at migration time.
-- This is a best-effort compatibility snapshot, not a reconstruction of the
-- historical roster at the original start timestamp. Giving even an empty
-- started event a version also prevents recruitment from reopening if its
-- battle_started_at value is later cleared.
with backfilled_events as (
  update public.events as event
  set
    tentative_snapshot_version_id = gen_random_uuid(),
    tentative_snapshotted_at = statement_timestamp()
  where event.status = 'published'
    and event.battle_started_at is not null
    and event.tentative_snapshot_version_id is null
    and event.tentative_snapshotted_at is null
  returning
    event.guild_id,
    event.id,
    event.tentative_snapshot_version_id,
    event.tentative_snapshotted_at
)
insert into public.event_tentative_signup_snapshots (
  guild_id,
  event_id,
  snapshot_version_id,
  discord_id,
  username,
  possible_roles,
  notes,
  source_created_at,
  source_updated_at,
  captured_at
)
select
  signup.guild_id,
  signup.event_id,
  event.tentative_snapshot_version_id,
  signup.discord_id,
  signup.username,
  signup.possible_roles,
  signup.notes,
  signup.created_at,
  signup.updated_at,
  event.tentative_snapshotted_at
from backfilled_events as event
join public.event_tentative_signups as signup
  on signup.guild_id = event.guild_id
 and signup.event_id = event.id
where not exists (
  select 1
  from public.slots as slot
  join public.parties as party
    on party.guild_id = slot.guild_id
   and party.id = slot.party_id
  where party.guild_id = event.guild_id
    and party.event_id = event.id
    and slot.assigned_discord_id = signup.discord_id
)
on conflict (guild_id, event_id, discord_id) do nothing;

alter table public.events
  drop constraint if exists events_started_tentative_snapshot_required_chk;

alter table public.events
  add constraint events_started_tentative_snapshot_required_chk
  check (
    status <> 'published'
    or battle_started_at is null
    or tentative_snapshot_version_id is not null
  );

create or replace function public.guard_event_tentative_signup_recruitment()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_guild_id uuid;
  v_event_id uuid;
  v_status text;
  v_battle_started_at timestamptz;
  v_snapshot_version_id uuid;
begin
  -- Parent/event cleanup and the tenant-scoped slot-assignment cleanup invoke
  -- this row trigger from another trigger. They are lifecycle maintenance, not
  -- a post-start recruitment command.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;

  if tg_op = 'UPDATE'
     and (
       new.guild_id is distinct from old.guild_id
       or new.event_id is distinct from old.event_id
       or new.discord_id is distinct from old.discord_id
     ) then
    raise exception 'event_tentative_identity_locked';
  end if;

  v_guild_id := case when tg_op = 'DELETE' then old.guild_id else new.guild_id end;
  v_event_id := case when tg_op = 'DELETE' then old.event_id else new.event_id end;

  select
    event.status,
    event.battle_started_at,
    event.tentative_snapshot_version_id
  into
    v_status,
    v_battle_started_at,
    v_snapshot_version_id
  from public.events as event
  where event.guild_id = v_guild_id
    and event.id = v_event_id
  -- SHARE conflicts with the event row's NO KEY UPDATE/UPDATE lock while
  -- remaining compatible with other recruitment writes. This guarantees that
  -- a signup either commits before capture or observes recruitment as closed.
  for share of event;

  if not found then
    raise exception 'event_not_found';
  end if;
  if v_status <> 'published'
     or v_battle_started_at is not null
     or v_snapshot_version_id is not null then
    raise exception 'event_tentative_recruitment_closed';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_event_tentative_signup_recruitment
  on public.event_tentative_signups;
create trigger guard_event_tentative_signup_recruitment
  before insert or update or delete
  on public.event_tentative_signups
  for each row
  execute function public.guard_event_tentative_signup_recruitment();

create or replace function public.prepare_event_tentative_snapshot()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.tentative_snapshot_version_id is not null
       or new.tentative_snapshotted_at is not null then
      raise exception 'event_tentative_snapshot_transition_invalid';
    end if;
    if new.battle_started_at is not null then
      if new.status <> 'published' then
        raise exception 'event_not_published';
      end if;
      new.tentative_snapshot_version_id := gen_random_uuid();
      new.tentative_snapshotted_at := new.battle_started_at;
    end if;
    return new;
  end if;

  if old.tentative_snapshot_version_id is not null
     and (
       new.tentative_snapshot_version_id
         is distinct from old.tentative_snapshot_version_id
       or new.tentative_snapshotted_at
         is distinct from old.tentative_snapshotted_at
     ) then
    raise exception 'event_tentative_snapshot_locked';
  end if;

  if old.battle_started_at is null
     and new.battle_started_at is not null
     and old.tentative_snapshot_version_id is null then
    if new.status <> 'published' then
      raise exception 'event_not_published';
    end if;
    new.tentative_snapshot_version_id := gen_random_uuid();
    new.tentative_snapshotted_at := new.battle_started_at;
  elsif old.tentative_snapshot_version_id is null
        and (
          new.tentative_snapshot_version_id is not null
          or new.tentative_snapshotted_at is not null
        ) then
    raise exception 'event_tentative_snapshot_transition_invalid';
  end if;

  return new;
end;
$$;

drop trigger if exists prepare_event_tentative_snapshot_on_insert
  on public.events;
create trigger prepare_event_tentative_snapshot_on_insert
  before insert
  on public.events
  for each row
  execute function public.prepare_event_tentative_snapshot();

drop trigger if exists prepare_event_tentative_snapshot on public.events;
create trigger prepare_event_tentative_snapshot
  before update of battle_started_at,
    tentative_snapshot_version_id,
    tentative_snapshotted_at
  on public.events
  for each row
  execute function public.prepare_event_tentative_snapshot();

create or replace function public.capture_event_tentative_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.battle_started_at is null
     and new.battle_started_at is not null
     and old.tentative_snapshot_version_id is null then
    insert into public.event_tentative_signup_snapshots (
      guild_id,
      event_id,
      snapshot_version_id,
      discord_id,
      username,
      possible_roles,
      notes,
      source_created_at,
      source_updated_at,
      captured_at
    )
    select
      signup.guild_id,
      signup.event_id,
      new.tentative_snapshot_version_id,
      signup.discord_id,
      signup.username,
      signup.possible_roles,
      signup.notes,
      signup.created_at,
      signup.updated_at,
      new.tentative_snapshotted_at
    from public.event_tentative_signups as signup
    where signup.guild_id = new.guild_id
      and signup.event_id = new.id
      and not exists (
        select 1
        from public.slots as slot
        join public.parties as party
          on party.guild_id = slot.guild_id
         and party.id = slot.party_id
        where party.guild_id = new.guild_id
          and party.event_id = new.id
          and slot.assigned_discord_id = signup.discord_id
      );
  end if;

  return new;
end;
$$;

drop trigger if exists capture_event_tentative_snapshot on public.events;
create trigger capture_event_tentative_snapshot
  after update of battle_started_at
  on public.events
  for each row
  execute function public.capture_event_tentative_snapshot();

create or replace function public.guard_event_tentative_snapshot_insert()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_snapshot_version_id uuid;
  v_snapshotted_at timestamptz;
begin
  select
    event.tentative_snapshot_version_id,
    event.tentative_snapshotted_at
  into
    v_snapshot_version_id,
    v_snapshotted_at
  from public.events as event
  where event.guild_id = new.guild_id
    and event.id = new.event_id
  for key share of event;

  if not found
     or v_snapshot_version_id is null
     or new.snapshot_version_id is distinct from v_snapshot_version_id
     or new.captured_at is distinct from v_snapshotted_at then
    raise exception 'event_tentative_snapshot_version_mismatch';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_event_tentative_snapshot_insert
  on public.event_tentative_signup_snapshots;
create trigger guard_event_tentative_snapshot_insert
  before insert
  on public.event_tentative_signup_snapshots
  for each row
  execute function public.guard_event_tentative_snapshot_insert();

-- A request is still only a request. Remove tentative availability only when
-- a slot becomes a confirmed assignment, and always scope the cleanup by
-- tenant as well as event.
create or replace function public.cleanup_tentative_on_slot_fill()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_guild_id uuid;
  v_battle_started_at timestamptz;
  v_snapshot_version_id uuid;
begin
  if new.assigned_discord_id is not null
     and (
       tg_op = 'INSERT'
       or new.assigned_discord_id is distinct from old.assigned_discord_id
     ) then
    select
      party.guild_id,
      party.event_id,
      event.battle_started_at,
      event.tentative_snapshot_version_id
      into
        v_guild_id,
        v_event_id,
        v_battle_started_at,
        v_snapshot_version_id
    from public.parties as party
    join public.events as event
      on event.guild_id = party.guild_id
     and event.id = party.event_id
    where party.id = new.party_id
      and party.guild_id = new.guild_id;

    if v_event_id is not null
       and v_battle_started_at is null
       and v_snapshot_version_id is null then
      delete from public.event_tentative_signups
      where guild_id = v_guild_id
        and event_id = v_event_id
        and discord_id = new.assigned_discord_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists slot_fill_cleanup_tentative on public.slots;
create trigger slot_fill_cleanup_tentative
  after insert or update of assigned_discord_id
  on public.slots
  for each row
  execute function public.cleanup_tentative_on_slot_fill();
