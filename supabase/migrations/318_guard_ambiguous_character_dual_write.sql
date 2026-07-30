-- Phase 2A forward fix: unresolved ambiguous legacy character evidence must
-- remain diagnostic-only. An unrelated legacy avatar update must not pick the
-- first claimant as the active guild membership.

alter function public.sync_guild_character_membership(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  boolean,
  text,
  timestamptz
) rename to sync_guild_character_membership_before_ambiguous_guard;

create or replace function public.sync_guild_character_membership(
  p_guild_id uuid,
  p_guild_member_id uuid,
  p_albion_server text,
  p_albion_player_id text,
  p_albion_player_name text,
  p_relation text,
  p_trust_status text,
  p_active boolean,
  p_source text default 'dual_write',
  p_observed_at timestamptz default now()
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player_id text := btrim(coalesce(p_albion_player_id, ''));
  v_relation text :=
    coalesce(nullif(btrim(p_relation), ''), 'unknown');
  v_trust_status text :=
    coalesce(nullif(btrim(p_trust_status), ''), 'claimed');
  v_ambiguous_fingerprint text;
begin
  -- Inactive, revoked, disputed, and invalid inputs still flow through the
  -- original implementation so it can close periods or raise its canonical
  -- validation errors.
  if coalesce(p_active, false)
     and v_relation in ('home_guild', 'alliance', 'external', 'unknown')
     and v_trust_status in ('claimed', 'roster_matched', 'trusted')
     and p_albion_server in ('west', 'east', 'europe')
     and char_length(v_player_id) between 1 and 80 then
    v_ambiguous_fingerprint :=
      public.guild_member_identity_fingerprint(
        'ambiguous-legacy-active-character',
        array[p_albion_server, v_player_id]
      );

    if exists (
      select 1
        from public.guild_member_identity_conflicts conflict
       where conflict.guild_id = p_guild_id
         and conflict.guild_member_id = p_guild_member_id
         and conflict.conflict_type = 'ambiguous_legacy_active_character'
         and conflict.identity_fingerprint = v_ambiguous_fingerprint
         and conflict.status = 'unresolved'
    ) then
      return null;
    end if;
  end if;

  return public.sync_guild_character_membership_before_ambiguous_guard(
    p_guild_id,
    p_guild_member_id,
    p_albion_server,
    p_albion_player_id,
    p_albion_player_name,
    p_relation,
    p_trust_status,
    p_active,
    p_source,
    p_observed_at
  );
end;
$$;

-- Migration 316 deliberately left these claims without an active period. End
-- only periods subsequently opened by Phase 2A dual-write while the matching
-- ambiguity is still unresolved. Historical and manually sourced periods are
-- not touched.
create or replace function
  public.close_unresolved_ambiguous_character_memberships(
    p_observed_at timestamptz default now()
  ) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_observed_at timestamptz := coalesce(p_observed_at, now());
  v_count bigint;
begin
  update public.guild_character_memberships membership
     set ended_at = greatest(v_observed_at, membership.started_at),
         ended_reason = 'unresolved_identity_conflict',
         updated_at = greatest(v_observed_at, membership.updated_at)
   where membership.ended_at is null
     and membership.source like 'dual_write_%'
     and exists (
       select 1
         from public.guild_member_identity_conflicts conflict
        where conflict.guild_id = membership.guild_id
          and conflict.guild_member_id = membership.guild_member_id
          and conflict.conflict_type = 'ambiguous_legacy_active_character'
          and conflict.identity_fingerprint =
            public.guild_member_identity_fingerprint(
              'ambiguous-legacy-active-character',
              array[
                membership.albion_server,
                membership.albion_player_id
              ]
            )
          and conflict.status = 'unresolved'
     );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

select public.close_unresolved_ambiguous_character_memberships(now());

revoke all on function
  public.sync_guild_character_membership_before_ambiguous_guard(
    uuid,
    uuid,
    text,
    text,
    text,
    text,
    text,
    boolean,
    text,
    timestamptz
  )
  from public, anon, authenticated, service_role;

revoke all on function public.sync_guild_character_membership(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  boolean,
  text,
  timestamptz
) from public, anon, authenticated;

revoke all on function
  public.close_unresolved_ambiguous_character_memberships(timestamptz)
  from public, anon, authenticated;

grant execute on function public.sync_guild_character_membership(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  boolean,
  text,
  timestamptz
) to service_role;

grant execute on function
  public.close_unresolved_ambiguous_character_memberships(timestamptz)
  to service_role;

comment on function public.sync_guild_character_membership(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  boolean,
  text,
  timestamptz
) is
  'Projects character evidence unless the exact legacy ambiguity remains unresolved.';

comment on function
  public.close_unresolved_ambiguous_character_memberships(timestamptz) is
  'Idempotently closes only Phase 2A dual-write periods that still have exact unresolved legacy ambiguity.';
