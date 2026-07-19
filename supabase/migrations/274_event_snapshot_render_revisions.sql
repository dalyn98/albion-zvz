-- Replace O(N) JSON aggregation in get_event_state_snapshot with a single
-- monotonic revision read. Child-table mutations bump each affected event at
-- most once per SQL statement by using transition tables.
--
-- Forward rollback: create a new migration restoring migration 273's RPC,
-- drop the triggers/functions below, and only then drop events.state_revision.

alter table public.events
  add column if not exists state_revision bigint not null default 0;

alter table public.events
  add constraint events_state_revision_nonnegative
  check (state_revision >= 0);

comment on column public.events.state_revision is
  'Monotonic invalidation revision for the rendered event detail state.';

-- Direct event edits bump themselves. Updates issued by child triggers already
-- provide a changed revision and therefore do not double-increment here.
create or replace function public.bump_event_row_state_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.state_revision is not distinct from old.state_revision then
    new.state_revision := old.state_revision + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists events_state_revision_update on public.events;
create trigger events_state_revision_update
before update on public.events
for each row execute function public.bump_event_row_state_revision();

-- parties, tentative signups, build demands/assigners/applications, and
-- non-combat regear participants all carry (guild_id, event_id).
create or replace function public.bump_event_revision_from_direct_children()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.events e
       set state_revision = e.state_revision + 1
      from (
        select distinct guild_id, event_id
        from new_rows
      ) changed
     where e.guild_id = changed.guild_id
       and e.id = changed.event_id;
  elsif tg_op = 'DELETE' then
    update public.events e
       set state_revision = e.state_revision + 1
      from (
        select distinct guild_id, event_id
        from old_rows
      ) changed
     where e.guild_id = changed.guild_id
       and e.id = changed.event_id;
  else
    update public.events e
       set state_revision = e.state_revision + 1
      from (
        select guild_id, event_id from new_rows
        union
        select guild_id, event_id from old_rows
      ) changed
     where e.guild_id = changed.guild_id
       and e.id = changed.event_id;
  end if;
  return null;
end;
$$;

-- Keep the three operation-specific transition tables explicit. PostgreSQL
-- does not allow OLD TABLE on INSERT or NEW TABLE on DELETE triggers.
drop trigger if exists parties_event_revision_insert on public.parties;
create trigger parties_event_revision_insert
after insert on public.parties
referencing new table as new_rows
for each statement execute function public.bump_event_revision_from_direct_children();
drop trigger if exists parties_event_revision_update on public.parties;
create trigger parties_event_revision_update
after update on public.parties
referencing old table as old_rows new table as new_rows
for each statement execute function public.bump_event_revision_from_direct_children();
drop trigger if exists parties_event_revision_delete on public.parties;
create trigger parties_event_revision_delete
after delete on public.parties
referencing old table as old_rows
for each statement execute function public.bump_event_revision_from_direct_children();

drop trigger if exists tentative_signups_event_revision_insert on public.event_tentative_signups;
create trigger tentative_signups_event_revision_insert
after insert on public.event_tentative_signups
referencing new table as new_rows
for each statement execute function public.bump_event_revision_from_direct_children();
drop trigger if exists tentative_signups_event_revision_update on public.event_tentative_signups;
create trigger tentative_signups_event_revision_update
after update on public.event_tentative_signups
referencing old table as old_rows new table as new_rows
for each statement execute function public.bump_event_revision_from_direct_children();
drop trigger if exists tentative_signups_event_revision_delete on public.event_tentative_signups;
create trigger tentative_signups_event_revision_delete
after delete on public.event_tentative_signups
referencing old table as old_rows
for each statement execute function public.bump_event_revision_from_direct_children();

drop trigger if exists build_role_demands_event_revision_insert on public.event_build_role_demands;
create trigger build_role_demands_event_revision_insert
after insert on public.event_build_role_demands
referencing new table as new_rows
for each statement execute function public.bump_event_revision_from_direct_children();
drop trigger if exists build_role_demands_event_revision_update on public.event_build_role_demands;
create trigger build_role_demands_event_revision_update
after update on public.event_build_role_demands
referencing old table as old_rows new table as new_rows
for each statement execute function public.bump_event_revision_from_direct_children();
drop trigger if exists build_role_demands_event_revision_delete on public.event_build_role_demands;
create trigger build_role_demands_event_revision_delete
after delete on public.event_build_role_demands
referencing old table as old_rows
for each statement execute function public.bump_event_revision_from_direct_children();

drop trigger if exists build_party_assigners_event_revision_insert on public.event_build_party_assigners;
create trigger build_party_assigners_event_revision_insert
after insert on public.event_build_party_assigners
referencing new table as new_rows
for each statement execute function public.bump_event_revision_from_direct_children();
drop trigger if exists build_party_assigners_event_revision_update on public.event_build_party_assigners;
create trigger build_party_assigners_event_revision_update
after update on public.event_build_party_assigners
referencing old table as old_rows new table as new_rows
for each statement execute function public.bump_event_revision_from_direct_children();
drop trigger if exists build_party_assigners_event_revision_delete on public.event_build_party_assigners;
create trigger build_party_assigners_event_revision_delete
after delete on public.event_build_party_assigners
referencing old table as old_rows
for each statement execute function public.bump_event_revision_from_direct_children();

drop trigger if exists build_applications_event_revision_insert on public.event_build_applications;
create trigger build_applications_event_revision_insert
after insert on public.event_build_applications
referencing new table as new_rows
for each statement execute function public.bump_event_revision_from_direct_children();
drop trigger if exists build_applications_event_revision_update on public.event_build_applications;
create trigger build_applications_event_revision_update
after update on public.event_build_applications
referencing old table as old_rows new table as new_rows
for each statement execute function public.bump_event_revision_from_direct_children();
drop trigger if exists build_applications_event_revision_delete on public.event_build_applications;
create trigger build_applications_event_revision_delete
after delete on public.event_build_applications
referencing old table as old_rows
for each statement execute function public.bump_event_revision_from_direct_children();

drop trigger if exists regear_participants_event_revision_insert on public.event_regear_participants;
create trigger regear_participants_event_revision_insert
after insert on public.event_regear_participants
referencing new table as new_rows
for each statement execute function public.bump_event_revision_from_direct_children();
drop trigger if exists regear_participants_event_revision_update on public.event_regear_participants;
create trigger regear_participants_event_revision_update
after update on public.event_regear_participants
referencing old table as old_rows new table as new_rows
for each statement execute function public.bump_event_revision_from_direct_children();
drop trigger if exists regear_participants_event_revision_delete on public.event_regear_participants;
create trigger regear_participants_event_revision_delete
after delete on public.event_regear_participants
referencing old table as old_rows
for each statement execute function public.bump_event_revision_from_direct_children();

-- slots carry party_id rather than event_id, so resolve the affected event via
-- the tenant-scoped parties join. The direct parties trigger covers cascades
-- where a party disappears before its slots can be resolved.
create or replace function public.bump_event_revision_from_slots()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.events e
       set state_revision = e.state_revision + 1
      from (
        select distinct s.guild_id, p.event_id
        from new_rows s
        join public.parties p
          on p.guild_id = s.guild_id
         and p.id = s.party_id
      ) changed
     where e.guild_id = changed.guild_id
       and e.id = changed.event_id;
  elsif tg_op = 'DELETE' then
    update public.events e
       set state_revision = e.state_revision + 1
      from (
        select distinct s.guild_id, p.event_id
        from old_rows s
        join public.parties p
          on p.guild_id = s.guild_id
         and p.id = s.party_id
      ) changed
     where e.guild_id = changed.guild_id
       and e.id = changed.event_id;
  else
    update public.events e
       set state_revision = e.state_revision + 1
      from (
        select s.guild_id, p.event_id
        from new_rows s
        join public.parties p
          on p.guild_id = s.guild_id
         and p.id = s.party_id
        union
        select s.guild_id, p.event_id
        from old_rows s
        join public.parties p
          on p.guild_id = s.guild_id
         and p.id = s.party_id
      ) changed
     where e.guild_id = changed.guild_id
       and e.id = changed.event_id;
  end if;
  return null;
end;
$$;

drop trigger if exists slots_event_revision_insert on public.slots;
create trigger slots_event_revision_insert
after insert on public.slots
referencing new table as new_rows
for each statement execute function public.bump_event_revision_from_slots();
drop trigger if exists slots_event_revision_update on public.slots;
create trigger slots_event_revision_update
after update on public.slots
referencing old table as old_rows new table as new_rows
for each statement execute function public.bump_event_revision_from_slots();
drop trigger if exists slots_event_revision_delete on public.slots;
create trigger slots_event_revision_delete
after delete on public.slots
referencing old table as old_rows
for each statement execute function public.bump_event_revision_from_slots();

-- Slot templates are guild-wide dependencies for build-sheet/hybrid event
-- pages. They change rarely, so update only events that can still be polling.
create or replace function public.bump_build_catalog_event_revisions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.events e
       set state_revision = e.state_revision + 1
      from (select distinct guild_id from new_rows) changed
     where e.guild_id = changed.guild_id
       and e.status <> 'draft'
       and e.recruitment_mode in ('build_sheet', 'hybrid')
       and (e.battle_started_at is null or e.battle_started_at > now() - interval '1 hour');
  elsif tg_op = 'DELETE' then
    update public.events e
       set state_revision = e.state_revision + 1
      from (select distinct guild_id from old_rows) changed
     where e.guild_id = changed.guild_id
       and e.status <> 'draft'
       and e.recruitment_mode in ('build_sheet', 'hybrid')
       and (e.battle_started_at is null or e.battle_started_at > now() - interval '1 hour');
  else
    update public.events e
       set state_revision = e.state_revision + 1
      from (
        select guild_id from new_rows
        union
        select guild_id from old_rows
      ) changed
     where e.guild_id = changed.guild_id
       and e.status <> 'draft'
       and e.recruitment_mode in ('build_sheet', 'hybrid')
       and (e.battle_started_at is null or e.battle_started_at > now() - interval '1 hour');
  end if;
  return null;
end;
$$;

drop trigger if exists slot_templates_event_revision_insert on public.slot_templates;
create trigger slot_templates_event_revision_insert
after insert on public.slot_templates
referencing new table as new_rows
for each statement execute function public.bump_build_catalog_event_revisions();
drop trigger if exists slot_templates_event_revision_update on public.slot_templates;
create trigger slot_templates_event_revision_update
after update on public.slot_templates
referencing old table as old_rows new table as new_rows
for each statement execute function public.bump_build_catalog_event_revisions();
drop trigger if exists slot_templates_event_revision_delete on public.slot_templates;
create trigger slot_templates_event_revision_delete
after delete on public.slot_templates
referencing old table as old_rows
for each statement execute function public.bump_build_catalog_event_revisions();

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
    'fingerprint', e.state_revision::text,
    'battle_started_at', e.battle_started_at,
    'gather_at', e.gather_at
  )
  from public.events e
  where e.guild_id = p_guild_id
    and e.id = p_event_id
    and e.status <> 'draft';
$$;

revoke all on function public.bump_event_row_state_revision() from public, anon, authenticated;
revoke all on function public.bump_event_revision_from_direct_children() from public, anon, authenticated;
revoke all on function public.bump_event_revision_from_slots() from public, anon, authenticated;
revoke all on function public.bump_build_catalog_event_revisions() from public, anon, authenticated;
revoke all on function public.get_event_state_snapshot(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_event_state_snapshot(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
