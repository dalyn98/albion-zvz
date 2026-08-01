-- Migration 334: allow legacy slot RPCs to change or clear contact identities
-- while keeping stable guild-member ownership derived and tenant-scoped.
--
-- Migration 321 projected assigned/requested Discord identities onto stable
-- guild member UUIDs. On UPDATE, PostgreSQL carries every untouched column
-- into NEW, so clearing assigned_discord_id left the old
-- assigned_guild_member_id visible to the BEFORE trigger. The trigger treated
-- that inherited value as an explicit invalid input and rejected cancellation.
-- The same failure affected requested-member approval and rejection.
--
-- Forward rollback: deploy a new migration that restores the previous
-- project_slot_guild_member_ids() body. No stored data is rewritten here.

create or replace function public.project_slot_guild_member_ids()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assigned uuid;
  v_requested uuid;
  v_validate_assigned boolean := false;
  v_validate_requested boolean := false;
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

  if tg_op = 'INSERT' then
    v_validate_assigned := true;
    v_validate_requested := true;
  else
    -- When a legacy RPC changes only the contact identity, NEW still carries
    -- the previous stable UUID. Treat that unchanged UUID as inherited and
    -- replace it with the newly derived value below. If callers explicitly
    -- change the stable UUID, keep validating it against the contact identity.
    v_validate_assigned :=
      new.assigned_discord_id is not distinct from old.assigned_discord_id
      or new.assigned_guild_member_id is distinct from old.assigned_guild_member_id;
    v_validate_requested :=
      new.requested_discord_id is not distinct from old.requested_discord_id
      or new.requested_guild_member_id is distinct from old.requested_guild_member_id;
  end if;

  if v_validate_assigned
     and new.assigned_guild_member_id is not null
     and v_assigned is null then
    raise exception 'ASSIGNED_GUILD_MEMBER_ACCESS_IDENTITY_NOT_FOUND';
  end if;
  if v_validate_assigned
     and new.assigned_guild_member_id is not null
     and new.assigned_guild_member_id is distinct from v_assigned then
    raise exception 'ASSIGNED_GUILD_MEMBER_IDENTITY_MISMATCH';
  end if;
  if v_validate_requested
     and new.requested_guild_member_id is not null
     and v_requested is null then
    raise exception 'REQUESTED_GUILD_MEMBER_ACCESS_IDENTITY_NOT_FOUND';
  end if;
  if v_validate_requested
     and new.requested_guild_member_id is not null
     and new.requested_guild_member_id is distinct from v_requested then
    raise exception 'REQUESTED_GUILD_MEMBER_IDENTITY_MISMATCH';
  end if;

  new.assigned_guild_member_id := v_assigned;
  new.requested_guild_member_id := v_requested;
  return new;
end;
$$;

comment on function public.project_slot_guild_member_ids() is
  'Derives stable slot ownership from tenant-scoped contact identities while allowing legacy RPC identity transitions.';

revoke all on function public.project_slot_guild_member_ids()
  from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
