-- Phase 2A dual-write.
--
-- Existing write paths remain authoritative for this release. AFTER triggers
-- project guild_avatars, guild_local_accounts, and account Albion links into
-- the stable member model. No existing read path is cut over here.

create or replace function public.dual_write_guild_avatar_member_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
  v_member_status text;
  v_observed_at timestamptz := coalesce(new.updated_at, now());
  v_link record;
  v_relation text;
  v_trust_status text;
  v_fingerprint text;
begin
  v_member_id := public.ensure_guild_member_access_identity(
    new.guild_id,
    public.guild_member_access_identity_type(new.discord_id),
    new.discord_id,
    new.withdrawn_at is null,
    new.username,
    'dual_write_guild_avatar',
    v_observed_at
  );

  select member.status
    into v_member_status
    from public.guild_member_records member
   where member.guild_id = new.guild_id
     and member.id = v_member_id;

  select
    link.albion_server,
    link.albion_player_id,
    link.albion_player_name,
    link.relation,
    link.trust_status,
    link.revoked_at
    into v_link
    from public.account_albion_tenant_links link
   where link.guild_id = new.guild_id
     and link.discord_id = new.discord_id;

  if tg_op = 'UPDATE'
     and old.albion_server in ('west', 'east', 'europe')
     and nullif(btrim(old.albion_player_id), '') is not null
     and (
       old.albion_server is distinct from new.albion_server
       or old.albion_player_id is distinct from new.albion_player_id
       or v_member_status = 'withdrawn'
     )
     and (
       v_link.albion_player_id is null
       or v_link.revoked_at is not null
       or v_link.trust_status in ('revoked', 'disputed')
     ) then
    perform public.end_guild_character_membership(
      new.guild_id,
      v_member_id,
      old.albion_server,
      old.albion_player_id,
      case
        when v_member_status = 'withdrawn' then 'member_withdrawn'
        else 'legacy_character_changed'
      end,
      v_observed_at
    );
  end if;

  -- A current, non-disputed account link has higher precedence than the
  -- compatibility avatar columns. This also prevents a temporarily stale
  -- avatar update from replacing a newer official player ID.
  if v_link.albion_server in ('west', 'east', 'europe')
     and nullif(btrim(v_link.albion_player_id), '') is not null
     and v_link.revoked_at is null
     and v_link.trust_status not in ('revoked', 'disputed') then
    if new.albion_server in ('west', 'east', 'europe')
       and nullif(btrim(new.albion_player_id), '') is not null
       and (
         new.albion_server is distinct from v_link.albion_server
         or new.albion_player_id is distinct from v_link.albion_player_id
       ) then
      v_fingerprint := public.guild_member_identity_fingerprint(
        'legacy-character-source-mismatch',
        array[
          least(
            new.albion_server || ':' || new.albion_player_id,
            v_link.albion_server || ':' || v_link.albion_player_id
          ),
          greatest(
            new.albion_server || ':' || new.albion_player_id,
            v_link.albion_server || ':' || v_link.albion_player_id
          )
        ]
      );
      perform public.record_guild_member_identity_conflict(
        new.guild_id,
        v_member_id,
        'legacy_character_source_mismatch',
        v_fingerprint,
        null,
        null,
        jsonb_build_object(
          'linkTrustStatus', v_link.trust_status,
          'memberWithdrawn', v_member_status = 'withdrawn',
          'source', 'dual_write_guild_avatar'
        ),
        v_observed_at
      );
    end if;

    perform public.sync_guild_character_membership(
      new.guild_id,
      v_member_id,
      v_link.albion_server,
      v_link.albion_player_id,
      v_link.albion_player_name,
      v_link.relation,
      v_link.trust_status,
      v_member_status = 'active',
      'dual_write_account_albion_link',
      v_observed_at
    );
    return new;
  end if;

  if new.albion_server in ('west', 'east', 'europe')
     and nullif(btrim(new.albion_player_id), '') is not null then
    v_relation := case
      when new.albion_verified_at is not null then 'home_guild'
      else 'unknown'
    end;
    v_trust_status := case
      when new.albion_verified_at is not null then 'trusted'
      else 'claimed'
    end;
    perform public.sync_guild_character_membership(
      new.guild_id,
      v_member_id,
      new.albion_server,
      new.albion_player_id,
      coalesce(nullif(btrim(new.albion_nickname), ''), new.username),
      v_relation,
      v_trust_status,
      new.withdrawn_at is null and v_member_status = 'active',
      'dual_write_guild_avatar',
      v_observed_at
    );
  end if;

  return new;
end;
$$;

create or replace function public.dual_write_local_guild_account_member_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
  v_member_status text;
  v_observed_at timestamptz := coalesce(new.updated_at, now());
  v_is_active boolean :=
    new.revoked_at is null and new.trust_status <> 'revoked';
begin
  v_member_id := public.ensure_guild_member_access_identity(
    new.guild_id,
    'local',
    new.subject,
    v_is_active,
    new.albion_player_name,
    'dual_write_local_account',
    v_observed_at
  );

  select member.status
    into v_member_status
    from public.guild_member_records member
   where member.guild_id = new.guild_id
     and member.id = v_member_id;

  if tg_op = 'UPDATE'
     and old.albion_server in ('west', 'east', 'europe')
     and nullif(btrim(old.albion_player_id), '') is not null
     and (
       old.albion_server is distinct from new.albion_server
       or old.albion_player_id is distinct from new.albion_player_id
       or v_member_status = 'withdrawn'
     ) then
    perform public.end_guild_character_membership(
      new.guild_id,
      v_member_id,
      old.albion_server,
      old.albion_player_id,
      case
        when v_member_status = 'withdrawn' then 'member_withdrawn'
        else 'legacy_character_changed'
      end,
      v_observed_at
    );
  end if;

  if new.albion_server in ('west', 'east', 'europe')
     and nullif(btrim(new.albion_player_id), '') is not null then
    perform public.sync_guild_character_membership(
      new.guild_id,
      v_member_id,
      new.albion_server,
      new.albion_player_id,
      new.albion_player_name,
      new.relation,
      new.trust_status,
      v_is_active and v_member_status = 'active',
      'dual_write_local_account',
      v_observed_at
    );
  end if;

  if v_is_active
     and nullif(btrim(new.linked_discord_id), '') is not null then
    perform public.attach_guild_member_access_identity(
      new.guild_id,
      v_member_id,
      'discord',
      new.linked_discord_id,
      'dual_write_local_discord_link',
      v_observed_at
    );
  end if;

  return new;
end;
$$;

create or replace function public.dual_write_account_albion_tenant_link_member_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
  v_member_status text;
  v_observed_at timestamptz := coalesce(new.updated_at, now());
  v_has_active_access boolean;
  v_avatar record;
  v_fingerprint text;
begin
  select (
    exists (
      select 1
      from public.guild_avatars avatar
      where avatar.guild_id = new.guild_id
        and avatar.discord_id = new.discord_id
        and avatar.withdrawn_at is null
    )
    or exists (
      select 1
      from public.guild_local_accounts account
      where account.guild_id = new.guild_id
        and account.subject = new.discord_id
        and account.revoked_at is null
        and account.trust_status <> 'revoked'
    )
  ) into v_has_active_access;

  v_member_id := public.ensure_guild_member_access_identity(
    new.guild_id,
    public.guild_member_access_identity_type(new.discord_id),
    new.discord_id,
    v_has_active_access,
    new.albion_player_name,
    'dual_write_account_albion_link',
    v_observed_at
  );

  select member.status
    into v_member_status
    from public.guild_member_records member
   where member.guild_id = new.guild_id
     and member.id = v_member_id;

  if tg_op = 'UPDATE'
     and old.albion_server in ('west', 'east', 'europe')
     and nullif(btrim(old.albion_player_id), '') is not null
     and (
       old.albion_server is distinct from new.albion_server
       or old.albion_player_id is distinct from new.albion_player_id
       or new.revoked_at is not null
       or new.trust_status in ('revoked', 'disputed')
       or v_member_status = 'withdrawn'
     ) then
    perform public.end_guild_character_membership(
      new.guild_id,
      v_member_id,
      old.albion_server,
      old.albion_player_id,
      case
        when new.trust_status = 'disputed' then 'identity_disputed'
        when new.revoked_at is not null or new.trust_status = 'revoked' then 'identity_revoked'
        when v_member_status = 'withdrawn' then 'member_withdrawn'
        else 'legacy_character_changed'
      end,
      v_observed_at
    );
  end if;

  select
    avatar.albion_server,
    avatar.albion_player_id,
    avatar.withdrawn_at
    into v_avatar
    from public.guild_avatars avatar
   where avatar.guild_id = new.guild_id
     and avatar.discord_id = new.discord_id;

  if new.albion_server in ('west', 'east', 'europe')
     and nullif(btrim(new.albion_player_id), '') is not null
     and v_avatar.albion_server in ('west', 'east', 'europe')
     and nullif(btrim(v_avatar.albion_player_id), '') is not null
     and (
       new.albion_server is distinct from v_avatar.albion_server
       or new.albion_player_id is distinct from v_avatar.albion_player_id
     ) then
    v_fingerprint := public.guild_member_identity_fingerprint(
      'legacy-character-source-mismatch',
      array[
        least(
          new.albion_server || ':' || new.albion_player_id,
          v_avatar.albion_server || ':' || v_avatar.albion_player_id
        ),
        greatest(
          new.albion_server || ':' || new.albion_player_id,
          v_avatar.albion_server || ':' || v_avatar.albion_player_id
        )
      ]
    );
    perform public.record_guild_member_identity_conflict(
      new.guild_id,
      v_member_id,
      'legacy_character_source_mismatch',
      v_fingerprint,
      null,
      null,
      jsonb_build_object(
        'linkTrustStatus', new.trust_status,
        'linkRevoked', new.revoked_at is not null,
        'memberWithdrawn', v_member_status = 'withdrawn',
        'source', 'dual_write_account_albion_link'
      ),
      v_observed_at
    );
  end if;

  if new.albion_server in ('west', 'east', 'europe')
     and nullif(btrim(new.albion_player_id), '') is not null then
    perform public.sync_guild_character_membership(
      new.guild_id,
      v_member_id,
      new.albion_server,
      new.albion_player_id,
      new.albion_player_name,
      new.relation,
      new.trust_status,
      v_has_active_access
        and v_member_status = 'active'
        and new.revoked_at is null
        and new.trust_status not in ('revoked', 'disputed'),
      'dual_write_account_albion_link',
      v_observed_at
    );
  end if;

  return new;
end;
$$;

drop trigger if exists guild_avatars_member_record_dual_write
  on public.guild_avatars;
create trigger guild_avatars_member_record_dual_write
after insert or update on public.guild_avatars
for each row execute function public.dual_write_guild_avatar_member_record();

drop trigger if exists guild_local_accounts_member_record_dual_write
  on public.guild_local_accounts;
create trigger guild_local_accounts_member_record_dual_write
after insert or update on public.guild_local_accounts
for each row execute function public.dual_write_local_guild_account_member_record();

drop trigger if exists account_albion_tenant_links_member_record_dual_write
  on public.account_albion_tenant_links;
create trigger account_albion_tenant_links_member_record_dual_write
after insert or update on public.account_albion_tenant_links
for each row execute function public.dual_write_account_albion_tenant_link_member_record();

revoke all on function public.dual_write_guild_avatar_member_record()
  from public, anon, authenticated;
revoke all on function public.dual_write_local_guild_account_member_record()
  from public, anon, authenticated;
revoke all on function public.dual_write_account_albion_tenant_link_member_record()
  from public, anon, authenticated;

-- Existing support account merges continue moving Discord-keyed business
-- rows. The wrapper additionally converges both access identities and all
-- new-model character history onto the target stable member UUID.
alter function public.merge_member_accounts(uuid, text, text, text, text)
  rename to merge_member_accounts_before_guild_member_records;

create or replace function public.merge_member_accounts(
  p_guild_id uuid,
  p_from_discord_id text,
  p_to_discord_id text,
  p_actor_discord_id text,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_member_id uuid;
  v_target_member_id uuid;
  v_base_result jsonb;
  v_moved jsonb;
  v_merged boolean := false;
begin
  select access.guild_member_id
    into v_source_member_id
    from public.guild_member_access_identities access
   where access.guild_id = p_guild_id
     and access.identity_type = 'discord'
     and access.subject_id = p_from_discord_id;

  select access.guild_member_id
    into v_target_member_id
    from public.guild_member_access_identities access
   where access.guild_id = p_guild_id
     and access.identity_type = 'discord'
     and access.subject_id = p_to_discord_id;

  v_base_result := public.merge_member_accounts_before_guild_member_records(
    p_guild_id,
    p_from_discord_id,
    p_to_discord_id,
    p_actor_discord_id,
    p_reason
  );

  -- The compatibility merge updates both guild_avatars rows, so triggers
  -- guarantee these lookups even if Phase 2A had not backfilled a rare row.
  if v_source_member_id is null then
    select access.guild_member_id
      into v_source_member_id
      from public.guild_member_access_identities access
     where access.guild_id = p_guild_id
       and access.identity_type = 'discord'
       and access.subject_id = p_from_discord_id;
  end if;
  if v_target_member_id is null then
    select access.guild_member_id
      into v_target_member_id
      from public.guild_member_access_identities access
     where access.guild_id = p_guild_id
       and access.identity_type = 'discord'
       and access.subject_id = p_to_discord_id;
  end if;

  if v_source_member_id is not null
     and v_target_member_id is not null
     and v_source_member_id <> v_target_member_id then
    v_merged := public.merge_guild_member_records(
      p_guild_id,
      v_source_member_id,
      v_target_member_id,
      now()
    );
  end if;

  v_moved := coalesce(v_base_result->'moved', '{}'::jsonb)
    || jsonb_build_object(
      'guild_member_records',
      case when v_merged then 1 else 0 end
    );

  return v_base_result || jsonb_build_object('moved', v_moved);
end;
$$;

revoke all on function public.merge_member_accounts(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.merge_member_accounts(uuid, text, text, text, text)
  to service_role;
revoke all on function public.merge_member_accounts_before_guild_member_records(uuid, text, text, text, text)
  from public, anon, authenticated;

comment on function public.merge_member_accounts(uuid, text, text, text, text) is
  'Compatibility account merge plus Phase 2A stable member-record convergence. Existing Discord-keyed ownership remains unchanged until a later read cutover.';

-- Close the small deployment window between the data backfill and trigger
-- installation. Structural rows and diagnostics are idempotent.
select public.backfill_guild_member_records();
