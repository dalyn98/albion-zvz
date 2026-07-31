-- Complete the normal Albion character transfer lifecycle.
--
-- Migration 315 deliberately rejected a second active character projection and
-- diagnosed it. A newly verified home-guild link is stronger evidence than the
-- stale active period: transfer that period atomically while leaving every
-- business record in its original guild/member record.

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
) rename to sync_guild_character_membership_before_verified_transfer;

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
  v_source text := left(
    coalesce(nullif(btrim(p_source), ''), 'dual_write'),
    64
  );
  v_relation text := coalesce(
    nullif(btrim(p_relation), ''),
    'unknown'
  );
  v_trust_status text := coalesce(
    nullif(btrim(p_trust_status), ''),
    'claimed'
  );
  v_fingerprint text;
  v_target_discord_id text;
  v_target_profile_id uuid;
  v_previous public.guild_character_memberships%rowtype;
  v_previous_discord_id text;
  v_transferred boolean := false;
  v_result uuid;
begin
  -- Preserve migration 318's fail-closed ambiguity guard before considering a
  -- transfer. Ambiguous legacy claimants must never become active by refresh.
  if coalesce(p_active, false)
     and v_relation in ('home_guild', 'alliance', 'external', 'unknown')
     and v_trust_status in ('claimed', 'roster_matched', 'trusted')
     and p_albion_server in ('west', 'east', 'europe')
     and char_length(v_player_id) between 1 and 80 then
    v_fingerprint := public.guild_member_identity_fingerprint(
      'ambiguous-legacy-active-character',
      array[p_albion_server, v_player_id]
    );

    if exists (
      select 1
        from public.guild_member_identity_conflicts conflict
       where conflict.guild_id = p_guild_id
         and conflict.guild_member_id = p_guild_member_id
         and conflict.conflict_type = 'ambiguous_legacy_active_character'
         and conflict.identity_fingerprint = v_fingerprint
         and conflict.status = 'unresolved'
    ) then
      return null;
    end if;
  end if;

  -- Auto-transfer is intentionally narrow. Only the authoritative account-link
  -- trigger may request it, and the target row must independently prove the
  -- same official player as a trusted home-guild relation with active access.
  if coalesce(p_active, false)
     and v_relation = 'home_guild'
     and v_trust_status = 'trusted'
     and v_source = 'dual_write_account_albion_link'
     and p_albion_server in ('west', 'east', 'europe')
     and nullif(v_player_id, '') is not null then
    select
      link.discord_id,
      link.profile_id
      into v_target_discord_id, v_target_profile_id
      from public.account_albion_tenant_links link
      join public.guild_member_access_identities access
        on access.guild_id = link.guild_id
       and access.guild_member_id = p_guild_member_id
       and access.identity_type =
         public.guild_member_access_identity_type(link.discord_id)
       and access.subject_id = link.discord_id
       and access.revoked_at is null
      join public.guild_member_records member
        on member.guild_id = link.guild_id
       and member.id = access.guild_member_id
       and member.status = 'active'
     where link.guild_id = p_guild_id
       and link.albion_server = p_albion_server
       and link.albion_player_id = v_player_id
       and link.relation = 'home_guild'
       and link.trust_status = 'trusted'
       and link.revoked_at is null
     limit 1;

    if v_target_discord_id is not null then
      perform pg_advisory_xact_lock(
        hashtextextended(
          'guild-character-membership:' ||
          p_albion_server || ':' || v_player_id,
          0
        )
      );

      select membership.*
        into v_previous
        from public.guild_character_memberships membership
       where membership.albion_server = p_albion_server
         and membership.albion_player_id = v_player_id
         and membership.ended_at is null
       for update;

      if v_previous.id is not null
         and (
           v_previous.guild_id <> p_guild_id
           or v_previous.guild_member_id <> p_guild_member_id
         ) then
        select access.subject_id
          into v_previous_discord_id
          from public.guild_member_access_identities access
         where access.guild_id = v_previous.guild_id
           and access.guild_member_id = v_previous.guild_member_id
           and access.identity_type = 'discord'
         order by
           (access.revoked_at is null) desc,
           access.linked_at desc,
           access.id
         limit 1;

        update public.guild_character_memberships
           set ended_at = greatest(started_at, p_observed_at),
               ended_reason = 'character_transferred',
               updated_at = greatest(updated_at, p_observed_at)
         where id = v_previous.id
           and ended_at is null;

        update public.guild_member_records
           set status = 'withdrawn',
               withdrawn_at = coalesce(withdrawn_at, p_observed_at),
               updated_at = greatest(updated_at, p_observed_at)
         where guild_id = v_previous.guild_id
           and id = v_previous.guild_member_id
           and status <> 'merged';

        update public.guild_member_access_identities
           set revoked_at = coalesce(revoked_at, p_observed_at),
               updated_at = greatest(updated_at, p_observed_at)
         where guild_id = v_previous.guild_id
           and guild_member_id = v_previous.guild_member_id
           and revoked_at is null;

        update public.guild_avatars avatar
           set withdrawn_at = coalesce(avatar.withdrawn_at, p_observed_at),
               updated_at = greatest(avatar.updated_at, p_observed_at)
         where avatar.guild_id = v_previous.guild_id
           and avatar.albion_server = p_albion_server
           and avatar.albion_player_id = v_player_id
           and avatar.withdrawn_at is null;

        update public.guild_local_accounts account
           set trust_status = 'revoked',
               revoked_at = coalesce(account.revoked_at, p_observed_at),
               updated_at = greatest(account.updated_at, p_observed_at)
         where account.guild_id = v_previous.guild_id
           and account.albion_server = p_albion_server
           and account.albion_player_id = v_player_id
           and account.revoked_at is null;

        update public.account_albion_tenant_links link
           set relation = 'external',
               trust_status = 'revoked',
               status_reason = 'character_transferred',
               verified_at = null,
               trusted_at = null,
               revoked_at = coalesce(link.revoked_at, p_observed_at),
               updated_at = greatest(link.updated_at, p_observed_at)
         where link.guild_id = v_previous.guild_id
           and link.albion_server = p_albion_server
           and link.albion_player_id = v_player_id
           and link.revoked_at is null;

        v_fingerprint := public.guild_member_identity_fingerprint(
          'character-transfer',
          array[p_albion_server, v_player_id]
        );

        insert into public.admin_audit_log (
          guild_id,
          admin_discord_id,
          action,
          target_id,
          target_kind,
          target_discord_id,
          details,
          created_at
        ) values (
          v_previous.guild_id,
          v_target_discord_id,
          'member.character.transfer_out',
          v_previous.guild_member_id::text,
          'guild_member',
          v_previous_discord_id,
          jsonb_build_object(
            'identityFingerprint', v_fingerprint,
            'source', v_source
          ),
          p_observed_at
        );

        insert into public.admin_audit_log (
          guild_id,
          admin_discord_id,
          action,
          target_id,
          target_kind,
          target_discord_id,
          details,
          created_at
        ) values (
          p_guild_id,
          v_target_discord_id,
          'member.character.transfer_in',
          p_guild_member_id::text,
          'guild_member',
          v_target_discord_id,
          jsonb_build_object(
            'identityFingerprint', v_fingerprint,
            'source', v_source
          ),
          p_observed_at
        );

        insert into public.account_albion_identity_audit (
          guild_id,
          discord_id,
          profile_id,
          actor_discord_id,
          action,
          trust_status,
          relation,
          reason,
          created_at
        ) values
          (
            v_previous.guild_id,
            coalesce(v_previous_discord_id, v_target_discord_id),
            null,
            v_target_discord_id,
            'character_transfer_out',
            'revoked',
            'external',
            'verified_home_guild_transfer',
            p_observed_at
          ),
          (
            p_guild_id,
            v_target_discord_id,
            v_target_profile_id,
            v_target_discord_id,
            'character_transfer_in',
            'trusted',
            'home_guild',
            'verified_home_guild_transfer',
            p_observed_at
          );

        v_transferred := true;
      end if;
    end if;
  end if;

  v_result := public.sync_guild_character_membership_before_verified_transfer(
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

  if v_transferred and v_result is not null then
    v_fingerprint := public.guild_member_identity_fingerprint(
      'active-character-membership-conflict',
      array[p_albion_server, v_player_id]
    );

    update public.guild_member_identity_conflicts conflict
       set status = 'resolved',
           resolved_at = p_observed_at,
           diagnostic = conflict.diagnostic || jsonb_build_object(
             'resolution', 'verified_home_guild_transfer'
           ),
           updated_at = greatest(conflict.updated_at, p_observed_at)
     where conflict.guild_id = p_guild_id
       and conflict.guild_member_id = p_guild_member_id
       and conflict.conflict_type = 'character_active_elsewhere'
       and conflict.identity_fingerprint = v_fingerprint
       and conflict.status = 'unresolved';
  end if;

  return v_result;
end;
$$;

revoke all on function public.sync_guild_character_membership_before_verified_transfer(
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
) from public, anon, authenticated, service_role;

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
  'Projects stable character periods, preserves unresolved ambiguity, and atomically transfers a character only from an authoritative trusted home-guild account-link trigger.';

comment on function public.sync_guild_character_membership_before_verified_transfer(
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
  'Internal migration-318 character projection wrapper. Not executable by application roles.';
