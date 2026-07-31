-- Phase 2B (release A): make stable guild-member ownership available to the
-- event and regear read paths without removing any Discord compatibility
-- column.
--
-- This migration is additive:
-- - legacy Discord columns remain the contact/compatibility projection
-- - exact access identities are projected to nullable stable member UUIDs
-- - guests and unresolved identities deliberately remain NULL
-- - existing 315-318 identity history and conflicts are not rewritten

create or replace function public.resolve_guild_member_id(
  p_guild_id uuid,
  p_identity_type text,
  p_subject_id text
) returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(member.merged_into_member_id, member.id)
    from public.guild_member_access_identities access
    join public.guild_member_records member
      on member.guild_id = access.guild_id
     and member.id = access.guild_member_id
   where access.guild_id = p_guild_id
     and access.identity_type = p_identity_type
     and access.subject_id = btrim(p_subject_id)
   limit 1;
$$;

revoke all on function public.resolve_guild_member_id(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.resolve_guild_member_id(uuid, text, text)
  to service_role;

comment on function public.resolve_guild_member_id(uuid, text, text) is
  'Compatibility resolver from an exact tenant-scoped access identity to its canonical stable guild member UUID. Revoked access still resolves historical ownership.';

-- Event participation and regear are the first business owners to cut over.
-- All columns stay nullable because invited guests and unresolved historical
-- identities are valid event participants but are not active guild members.
alter table public.slots
  add column if not exists assigned_guild_member_id uuid,
  add column if not exists requested_guild_member_id uuid;

alter table public.event_tentative_signups
  add column if not exists guild_member_id uuid;

alter table public.event_tentative_signup_snapshots
  add column if not exists guild_member_id uuid;

alter table public.event_participation_closeout_entries
  add column if not exists guild_member_id uuid;

alter table public.event_regear_participants
  add column if not exists guild_member_id uuid;

alter table public.regear_requests
  add column if not exists guild_member_id uuid;

-- Stable ownership is derived compatibility metadata, not a recruitment
-- change. Migration 301 intentionally freezes every tentative-signup update
-- after the event starts, so teach that guard to admit only a column-isolated
-- guild_member_id projection. The projection trigger installed below still
-- validates every future value against the exact tenant access identity.
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

  -- The only mutable value in this branch is the deterministic stable-member
  -- projection added by this migration. All recruitment fields remain frozen.
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - 'guild_member_id')
       is not distinct from (to_jsonb(old) - 'guild_member_id') then
    return new;
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

comment on function public.guard_event_tentative_signup_recruitment() is
  'Freezes tentative recruitment after operational start while allowing an isolated stable-member ownership projection validated by its companion trigger.';

alter table public.slots
  add constraint slots_assigned_guild_member_fkey
  foreign key (guild_id, assigned_guild_member_id)
  references public.guild_member_records(guild_id, id)
  on delete restrict
  not valid;

alter table public.slots
  add constraint slots_requested_guild_member_fkey
  foreign key (guild_id, requested_guild_member_id)
  references public.guild_member_records(guild_id, id)
  on delete restrict
  not valid;

alter table public.event_tentative_signups
  add constraint event_tentative_signups_guild_member_fkey
  foreign key (guild_id, guild_member_id)
  references public.guild_member_records(guild_id, id)
  on delete restrict
  not valid;

alter table public.event_tentative_signup_snapshots
  add constraint event_tentative_signup_snapshots_guild_member_fkey
  foreign key (guild_id, guild_member_id)
  references public.guild_member_records(guild_id, id)
  on delete restrict
  not valid;

alter table public.event_participation_closeout_entries
  add constraint event_participation_closeout_entries_guild_member_fkey
  foreign key (guild_id, guild_member_id)
  references public.guild_member_records(guild_id, id)
  on delete restrict
  not valid;

alter table public.event_regear_participants
  add constraint event_regear_participants_guild_member_fkey
  foreign key (guild_id, guild_member_id)
  references public.guild_member_records(guild_id, id)
  on delete restrict
  not valid;

alter table public.regear_requests
  add constraint regear_requests_guild_member_fkey
  foreign key (guild_id, guild_member_id)
  references public.guild_member_records(guild_id, id)
  on delete restrict
  not valid;

update public.slots slot
   set assigned_guild_member_id = public.resolve_guild_member_id(
         slot.guild_id,
         public.guild_member_access_identity_type(slot.assigned_discord_id),
         slot.assigned_discord_id
       )
 where slot.assigned_discord_id is not null
   and slot.assigned_guild_member_id is null;

update public.slots slot
   set requested_guild_member_id = public.resolve_guild_member_id(
         slot.guild_id,
         public.guild_member_access_identity_type(slot.requested_discord_id),
         slot.requested_discord_id
       )
 where slot.requested_discord_id is not null
   and slot.requested_guild_member_id is null;

update public.event_tentative_signups signup
   set guild_member_id = public.resolve_guild_member_id(
         signup.guild_id,
         public.guild_member_access_identity_type(signup.discord_id),
         signup.discord_id
       )
 where signup.guild_member_id is null;

update public.event_tentative_signup_snapshots snapshot
   set guild_member_id = public.resolve_guild_member_id(
         snapshot.guild_id,
         public.guild_member_access_identity_type(snapshot.discord_id),
         snapshot.discord_id
       )
 where snapshot.guild_member_id is null;

update public.event_participation_closeout_entries entry
   set guild_member_id = public.resolve_guild_member_id(
         entry.guild_id,
         public.guild_member_access_identity_type(entry.discord_id),
         entry.discord_id
       )
 where entry.guild_member_id is null;

update public.event_regear_participants participant
   set guild_member_id = public.resolve_guild_member_id(
         participant.guild_id,
         public.guild_member_access_identity_type(participant.discord_id),
         participant.discord_id
       )
 where participant.guild_member_id is null;

update public.regear_requests request
   set guild_member_id = public.resolve_guild_member_id(
         request.guild_id,
         public.guild_member_access_identity_type(request.discord_id),
         request.discord_id
       )
 where request.guild_member_id is null;

alter table public.slots
  validate constraint slots_assigned_guild_member_fkey;
alter table public.slots
  validate constraint slots_requested_guild_member_fkey;
alter table public.event_tentative_signups
  validate constraint event_tentative_signups_guild_member_fkey;
alter table public.event_tentative_signup_snapshots
  validate constraint event_tentative_signup_snapshots_guild_member_fkey;
alter table public.event_participation_closeout_entries
  validate constraint event_participation_closeout_entries_guild_member_fkey;
alter table public.event_regear_participants
  validate constraint event_regear_participants_guild_member_fkey;
alter table public.regear_requests
  validate constraint regear_requests_guild_member_fkey;

create index if not exists slots_assigned_guild_member_idx
  on public.slots (guild_id, assigned_guild_member_id)
  where assigned_guild_member_id is not null;

create index if not exists slots_requested_guild_member_idx
  on public.slots (guild_id, requested_guild_member_id)
  where requested_guild_member_id is not null;

create index if not exists event_tentative_signups_member_idx
  on public.event_tentative_signups (guild_id, guild_member_id, event_id)
  where guild_member_id is not null;

create index if not exists event_participation_closeout_entries_stable_member_idx
  on public.event_participation_closeout_entries
    (guild_id, guild_member_id, event_id)
  where guild_member_id is not null;

create index if not exists event_regear_participants_stable_member_idx
  on public.event_regear_participants (guild_id, guild_member_id, event_id)
  where guild_member_id is not null;

create index if not exists regear_requests_member_idx
  on public.regear_requests (guild_id, guild_member_id, created_at desc)
  where guild_member_id is not null;

create or replace function public.project_guild_member_id_from_discord()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resolved uuid;
begin
  if new.discord_id is null or btrim(new.discord_id) = '' then
    new.guild_member_id := null;
    return new;
  end if;

  v_resolved := public.resolve_guild_member_id(
    new.guild_id,
    public.guild_member_access_identity_type(new.discord_id),
    new.discord_id
  );

  if new.guild_member_id is not null and v_resolved is null then
    raise exception 'GUILD_MEMBER_ACCESS_IDENTITY_NOT_FOUND';
  end if;
  if new.guild_member_id is not null
     and new.guild_member_id is distinct from v_resolved then
    raise exception 'GUILD_MEMBER_IDENTITY_MISMATCH';
  end if;

  new.guild_member_id := v_resolved;
  return new;
end;
$$;

create or replace function public.project_slot_guild_member_ids()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assigned uuid;
  v_requested uuid;
begin
  if new.assigned_discord_id is not null
     and btrim(new.assigned_discord_id) <> '' then
    v_assigned := public.resolve_guild_member_id(
      new.guild_id,
      public.guild_member_access_identity_type(new.assigned_discord_id),
      new.assigned_discord_id
    );
  end if;

  if new.requested_discord_id is not null
     and btrim(new.requested_discord_id) <> '' then
    v_requested := public.resolve_guild_member_id(
      new.guild_id,
      public.guild_member_access_identity_type(new.requested_discord_id),
      new.requested_discord_id
    );
  end if;

  if new.assigned_guild_member_id is not null and v_assigned is null then
    raise exception 'ASSIGNED_GUILD_MEMBER_ACCESS_IDENTITY_NOT_FOUND';
  end if;
  if new.assigned_guild_member_id is not null
     and new.assigned_guild_member_id is distinct from v_assigned then
    raise exception 'ASSIGNED_GUILD_MEMBER_IDENTITY_MISMATCH';
  end if;
  if new.requested_guild_member_id is not null and v_requested is null then
    raise exception 'REQUESTED_GUILD_MEMBER_ACCESS_IDENTITY_NOT_FOUND';
  end if;
  if new.requested_guild_member_id is not null
     and new.requested_guild_member_id is distinct from v_requested then
    raise exception 'REQUESTED_GUILD_MEMBER_IDENTITY_MISMATCH';
  end if;

  new.assigned_guild_member_id := v_assigned;
  new.requested_guild_member_id := v_requested;
  return new;
end;
$$;

drop trigger if exists project_slots_guild_member_ids on public.slots;
create trigger project_slots_guild_member_ids
before insert or update of
  guild_id,
  assigned_discord_id,
  assigned_guild_member_id,
  requested_discord_id,
  requested_guild_member_id
on public.slots
for each row execute function public.project_slot_guild_member_ids();

drop trigger if exists project_tentative_guild_member_id
  on public.event_tentative_signups;
create trigger project_tentative_guild_member_id
before insert or update of guild_id, discord_id, guild_member_id
on public.event_tentative_signups
for each row execute function public.project_guild_member_id_from_discord();

drop trigger if exists project_tentative_snapshot_guild_member_id
  on public.event_tentative_signup_snapshots;
create trigger project_tentative_snapshot_guild_member_id
before insert or update of guild_id, discord_id, guild_member_id
on public.event_tentative_signup_snapshots
for each row execute function public.project_guild_member_id_from_discord();

drop trigger if exists project_participation_closeout_guild_member_id
  on public.event_participation_closeout_entries;
create trigger project_participation_closeout_guild_member_id
before insert or update of guild_id, discord_id, guild_member_id
on public.event_participation_closeout_entries
for each row execute function public.project_guild_member_id_from_discord();

drop trigger if exists project_event_regear_participant_guild_member_id
  on public.event_regear_participants;
create trigger project_event_regear_participant_guild_member_id
before insert or update of guild_id, discord_id, guild_member_id
on public.event_regear_participants
for each row execute function public.project_guild_member_id_from_discord();

drop trigger if exists project_regear_request_guild_member_id
  on public.regear_requests;
create trigger project_regear_request_guild_member_id
before insert or update of guild_id, discord_id, guild_member_id
on public.regear_requests
for each row execute function public.project_guild_member_id_from_discord();

revoke all on function public.project_guild_member_id_from_discord()
  from public, anon, authenticated, service_role;
revoke all on function public.project_slot_guild_member_ids()
  from public, anon, authenticated, service_role;

-- Stable directory read surface. Raw access IDs remain service-role only;
-- member/public DTOs must still apply their own explicit allowlists.
create or replace view public.guild_member_directory_v1
with (security_invoker = true)
as
select
  member.id as guild_member_id,
  member.guild_id,
  tenant.status as tenant_status,
  member.status,
  coalesce(
    nullif(btrim(member.display_name_override), ''),
    nullif(btrim(character.albion_player_name), ''),
    nullif(btrim(member.display_name_snapshot), ''),
    nullif(btrim(avatar.username), '')
  ) as display_name,
  member.display_name_override,
  member.display_name_snapshot,
  member.joined_at,
  member.last_reactivated_at,
  member.withdrawn_at,
  access.subject_id as discord_id,
  access.revoked_at as discord_access_revoked_at,
  avatar.username as discord_display_name,
  avatar.avatar,
  avatar.is_admin,
  avatar.is_crafter,
  avatar.is_bomb_squad_caller,
  avatar.updated_at as discord_updated_at,
  character.albion_server,
  character.albion_player_id,
  character.albion_player_name,
  character.relation as character_relation,
  character.trust_status as character_trust_status
from public.guild_member_records member
join public.tenants tenant
  on tenant.id = member.guild_id
left join lateral (
  select candidate.subject_id, candidate.revoked_at
    from public.guild_member_access_identities candidate
    left join public.guild_avatars candidate_avatar
      on candidate_avatar.guild_id = candidate.guild_id
     and candidate_avatar.discord_id = candidate.subject_id
   where candidate.guild_id = member.guild_id
     and candidate.guild_member_id = member.id
     and candidate.identity_type = 'discord'
   order by
     (candidate.revoked_at is null) desc,
     (candidate_avatar.withdrawn_at is null) desc nulls last,
     candidate.last_seen_at desc,
     candidate.subject_id
   limit 1
) access on true
left join public.guild_avatars avatar
  on avatar.guild_id = member.guild_id
 and avatar.discord_id = access.subject_id
left join lateral (
  select
    membership.albion_server,
    membership.albion_player_id,
    membership.albion_player_name,
    membership.relation,
    membership.trust_status
  from public.guild_character_memberships membership
  where membership.guild_id = member.guild_id
    and membership.guild_member_id = member.id
    and membership.ended_at is null
  order by membership.started_at desc, membership.id
  limit 1
) character on true
where member.status <> 'merged';

revoke all on public.guild_member_directory_v1
  from public, anon, authenticated;
grant select on public.guild_member_directory_v1 to service_role;

comment on view public.guild_member_directory_v1 is
  'Service-only Phase 2B compatibility view: one stable member row with a deterministic Discord contact projection and active Albion character.';

create or replace function public.set_guild_member_display_name(
  p_guild_id uuid,
  p_guild_member_id uuid,
  p_display_name text,
  p_actor_discord_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := nullif(btrim(coalesce(p_display_name, '')), '');
  v_before text;
  v_status text;
begin
  if p_guild_id is null or p_guild_member_id is null then
    raise exception 'GUILD_MEMBER_REQUIRED';
  end if;
  if v_name is not null and char_length(v_name) > 64 then
    raise exception 'GUILD_MEMBER_DISPLAY_NAME_TOO_LONG';
  end if;
  if nullif(btrim(coalesce(p_actor_discord_id, '')), '') is null then
    raise exception 'GUILD_MEMBER_DISPLAY_NAME_ACTOR_REQUIRED';
  end if;

  select member.display_name_override, member.status
    into v_before, v_status
    from public.guild_member_records member
   where member.guild_id = p_guild_id
     and member.id = p_guild_member_id
   for update;

  if v_status is null then
    raise exception 'GUILD_MEMBER_NOT_FOUND';
  end if;
  if v_status = 'merged' then
    raise exception 'GUILD_MEMBER_MERGED';
  end if;

  update public.guild_member_records
     set display_name_override = v_name,
         updated_at = now()
   where guild_id = p_guild_id
     and id = p_guild_member_id;

  insert into public.admin_audit_log (
    guild_id,
    admin_discord_id,
    action,
    target_id,
    target_kind,
    details
  ) values (
    p_guild_id,
    btrim(p_actor_discord_id),
    'member.display_name.update',
    p_guild_member_id::text,
    'member',
    jsonb_build_object(
      'before', v_before,
      'after', v_name
    )
  );

  return jsonb_build_object(
    'guildMemberId', p_guild_member_id,
    'displayNameOverride', v_name
  );
end;
$$;

revoke all on function public.set_guild_member_display_name(
  uuid,
  uuid,
  text,
  text
) from public, anon, authenticated;
grant execute on function public.set_guild_member_display_name(
  uuid,
  uuid,
  text,
  text
) to service_role;

comment on function public.set_guild_member_display_name(
  uuid,
  uuid,
  text,
  text
) is
  'Atomically updates a guild-scoped display-name override and its operational change record without changing Albion or Discord names.';
