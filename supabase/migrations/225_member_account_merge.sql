-- Super-admin only Discord account merge.
--
-- The application enforces requireSuperAdmin() before calling these RPCs.
-- The database side keeps the operation tenant-scoped, serializes the merge,
-- blocks natural-key collisions, and leaves actor/audit history untouched.

create or replace function public.preview_member_account_merge(
  p_guild_id uuid,
  p_from_discord_id text,
  p_to_discord_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source record;
  v_target record;
  v_counts jsonb := '{}'::jsonb;
  v_blockers jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_target_has_data boolean := false;
begin
  if p_guild_id is null then
    raise exception 'GUILD_ID_REQUIRED';
  end if;
  if p_from_discord_id is null or p_from_discord_id !~ '^[0-9]{15,25}$' then
    raise exception 'INVALID_SOURCE_DISCORD_ID';
  end if;
  if p_to_discord_id is null or p_to_discord_id !~ '^[0-9]{15,25}$' then
    raise exception 'INVALID_TARGET_DISCORD_ID';
  end if;
  if p_from_discord_id = p_to_discord_id then
    raise exception 'ACCOUNT_MERGE_SAME_ACCOUNT';
  end if;

  select
    discord_id,
    username,
    withdrawn_at,
    albion_server,
    albion_player_id,
    albion_nickname
  into v_source
  from public.guild_avatars
  where guild_id = p_guild_id
    and discord_id = p_from_discord_id;

  select
    discord_id,
    username,
    withdrawn_at,
    albion_server,
    albion_player_id,
    albion_nickname
  into v_target
  from public.guild_avatars
  where guild_id = p_guild_id
    and discord_id = p_to_discord_id;

  select coalesce(jsonb_object_agg(label, total), '{}'::jsonb)
  into v_counts
  from (
    select 'point_ledger' as label, count(*)::int as total
    from public.point_ledger
    where guild_id = p_guild_id and discord_id = p_from_discord_id
    union all
    select 'exchange_requests', count(*)::int
    from public.exchange_requests
    where guild_id = p_guild_id and discord_id = p_from_discord_id
    union all
    select 'donation_requests', count(*)::int
    from public.donation_requests
    where guild_id = p_guild_id and discord_id = p_from_discord_id
    union all
    select 'shop_orders', count(*)::int
    from public.shop_orders
    where guild_id = p_guild_id and discord_id = p_from_discord_id
    union all
    select 'regear_requests', count(*)::int
    from public.regear_requests
    where guild_id = p_guild_id and discord_id = p_from_discord_id
    union all
    select 'killboard_events', count(*)::int
    from public.killboard_events
    where guild_id = p_guild_id and discord_id = p_from_discord_id
    union all
    select 'slots', count(*)::int
    from public.slots
    where guild_id = p_guild_id
      and (assigned_discord_id = p_from_discord_id or requested_discord_id = p_from_discord_id)
    union all
    select 'event_tentative_signups', count(*)::int
    from public.event_tentative_signups
    where guild_id = p_guild_id and discord_id = p_from_discord_id
    union all
    select 'event_regear_participants', count(*)::int
    from public.event_regear_participants
    where guild_id = p_guild_id and discord_id = p_from_discord_id
    union all
    select 'event_build_applications', count(*)::int
    from public.event_build_applications
    where guild_id = p_guild_id and applicant_discord_id = p_from_discord_id
    union all
    select 'event_build_party_assigners', count(*)::int
    from public.event_build_party_assigners
    where guild_id = p_guild_id and caller_discord_id = p_from_discord_id
    union all
    select 'event_payout_requests', count(*)::int
    from public.event_payout_requests epr
    where guild_id = p_guild_id
      and status = 'pending'
      and exists (
        select 1
        from jsonb_array_elements(epr.participants) as member(value)
        where member.value->>'discord_id' = p_from_discord_id
      )
    union all
    select 'craft_tasks', count(*)::int
    from public.craft_tasks
    where guild_id = p_guild_id and crafter_discord_id = p_from_discord_id
    union all
    select 'settlement_lines', count(*)::int
    from public.settlement_lines
    where guild_id = p_guild_id and discord_id = p_from_discord_id
    union all
    select 'permission_user_overrides', count(*)::int
    from public.permission_user_overrides
    where guild_id = p_guild_id and discord_id = p_from_discord_id
    union all
    select 'guild_local_accounts', count(*)::int
    from public.guild_local_accounts
    where guild_id = p_guild_id and linked_discord_id = p_from_discord_id
  ) counts;

  if v_source.discord_id is null then
    v_blockers := v_blockers || jsonb_build_array('source_member_missing');
  end if;
  if v_target.discord_id is null then
    v_blockers := v_blockers || jsonb_build_array('target_member_missing');
  elsif v_target.withdrawn_at is not null then
    v_blockers := v_blockers || jsonb_build_array('target_member_withdrawn');
  end if;

  if v_source.discord_id is not null and v_source.withdrawn_at is null then
    v_warnings := v_warnings || jsonb_build_array('source_member_will_be_withdrawn');
  end if;

  select exists (
    select 1
    from public.point_ledger
    where guild_id = p_guild_id and discord_id = p_to_discord_id
    union all
    select 1
    from public.regear_requests
    where guild_id = p_guild_id and discord_id = p_to_discord_id
    union all
    select 1
    from public.shop_orders
    where guild_id = p_guild_id and discord_id = p_to_discord_id
  )
  into v_target_has_data;

  if v_target_has_data then
    v_warnings := v_warnings || jsonb_build_array('target_has_existing_data');
  end if;

  if exists (
    select 1
    from public.exchange_requests source
    where source.guild_id = p_guild_id
      and source.discord_id = p_from_discord_id
      and source.status = 'pending'
      and exists (
        select 1
        from public.exchange_requests target
        where target.discord_id = p_to_discord_id
          and target.status = 'pending'
      )
  ) then
    v_blockers := v_blockers || jsonb_build_array('exchange_pending_conflict');
  end if;

  if exists (
    with source_events as (
      select distinct p.event_id
      from public.slots s
      join public.parties p on p.id = s.party_id
      where s.guild_id = p_guild_id
        and (s.assigned_discord_id = p_from_discord_id or s.requested_discord_id = p_from_discord_id)
    ),
    target_events as (
      select distinct p.event_id
      from public.slots s
      join public.parties p on p.id = s.party_id
      where s.guild_id = p_guild_id
        and (s.assigned_discord_id = p_to_discord_id or s.requested_discord_id = p_to_discord_id)
    )
    select 1
    from source_events se
    join target_events te on te.event_id = se.event_id
  ) then
    v_blockers := v_blockers || jsonb_build_array('slot_event_conflict');
  end if;

  if exists (
    select 1
    from public.regear_requests source
    join public.regear_requests target
      on target.guild_id = source.guild_id
     and target.event_id = source.event_id
     and target.discord_id = p_to_discord_id
     and target.status <> 'rejected'
    where source.guild_id = p_guild_id
      and source.discord_id = p_from_discord_id
      and source.status <> 'rejected'
      and source.event_id is not null
  ) then
    v_blockers := v_blockers || jsonb_build_array('regear_event_conflict');
  end if;

  if exists (
    select 1
    from public.event_payout_requests epr
    where epr.guild_id = p_guild_id
      and epr.status = 'pending'
      and exists (
        select 1
        from jsonb_array_elements(epr.participants) as source_member(value)
        where source_member.value->>'discord_id' = p_from_discord_id
      )
      and exists (
        select 1
        from jsonb_array_elements(epr.participants) as target_member(value)
        where target_member.value->>'discord_id' = p_to_discord_id
      )
  ) then
    v_blockers := v_blockers || jsonb_build_array('event_payout_participant_conflict');
  end if;

  if exists (
    select 1
    from public.event_tentative_signups source
    join public.event_tentative_signups target
      on target.guild_id = source.guild_id
     and target.event_id = source.event_id
     and target.discord_id = p_to_discord_id
    where source.guild_id = p_guild_id
      and source.discord_id = p_from_discord_id
  ) then
    v_blockers := v_blockers || jsonb_build_array('event_tentative_conflict');
  end if;

  if exists (
    select 1
    from public.event_regear_participants source
    join public.event_regear_participants target
      on target.guild_id = source.guild_id
     and target.event_id = source.event_id
     and target.discord_id = p_to_discord_id
    where source.guild_id = p_guild_id
      and source.discord_id = p_from_discord_id
  ) then
    v_blockers := v_blockers || jsonb_build_array('event_regear_participant_conflict');
  end if;

  if exists (
    select 1
    from public.event_build_applications source
    join public.event_build_applications target
      on target.guild_id = source.guild_id
     and target.event_id = source.event_id
     and target.applicant_discord_id = p_to_discord_id
    where source.guild_id = p_guild_id
      and source.applicant_discord_id = p_from_discord_id
  ) then
    v_blockers := v_blockers || jsonb_build_array('event_build_application_conflict');
  end if;

  if exists (
    select 1
    from public.settlement_lines source
    join public.settlement_lines target
      on target.period_id = source.period_id
     and target.discord_id = p_to_discord_id
    where source.guild_id = p_guild_id
      and source.discord_id = p_from_discord_id
  ) then
    v_blockers := v_blockers || jsonb_build_array('settlement_line_conflict');
  end if;

  if exists (
    select 1
    from public.guild_avatars source
    join public.guild_avatars target
      on target.guild_id = source.guild_id
     and target.discord_id = p_to_discord_id
    where source.guild_id = p_guild_id
      and source.discord_id = p_from_discord_id
      and source.albion_player_id is not null
      and target.albion_player_id is not null
      and (
        source.albion_server is distinct from target.albion_server
        or source.albion_player_id is distinct from target.albion_player_id
      )
  ) or exists (
    select 1
    from public.account_albion_tenant_links source
    join public.account_albion_tenant_links target
      on target.guild_id = source.guild_id
     and target.discord_id = p_to_discord_id
     and target.revoked_at is null
    where source.guild_id = p_guild_id
      and source.discord_id = p_from_discord_id
      and source.revoked_at is null
      and source.albion_player_id is not null
      and target.albion_player_id is not null
      and (
        source.albion_server is distinct from target.albion_server
        or source.albion_player_id is distinct from target.albion_player_id
      )
  ) then
    v_blockers := v_blockers || jsonb_build_array('albion_identity_conflict');
  end if;

  v_warnings := v_warnings || jsonb_build_array('actor_history_will_not_be_rewritten');

  return jsonb_build_object(
    'canMerge', jsonb_array_length(v_blockers) = 0,
    'blockers', v_blockers,
    'warnings', v_warnings,
    'counts', v_counts,
    'source', case
      when v_source.discord_id is null then null
      else jsonb_build_object(
        'discordId', v_source.discord_id,
        'username', v_source.username,
        'withdrawnAt', v_source.withdrawn_at,
        'albionServer', v_source.albion_server,
        'albionPlayerId', v_source.albion_player_id,
        'albionPlayerName', v_source.albion_nickname
      )
    end,
    'target', case
      when v_target.discord_id is null then null
      else jsonb_build_object(
        'discordId', v_target.discord_id,
        'username', v_target.username,
        'withdrawnAt', v_target.withdrawn_at,
        'albionServer', v_target.albion_server,
        'albionPlayerId', v_target.albion_player_id,
        'albionPlayerName', v_target.albion_nickname
      )
    end
  );
end;
$$;

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
  v_preview jsonb;
  v_source_avatar public.guild_avatars%rowtype;
  v_target_avatar public.guild_avatars%rowtype;
  v_source_link public.account_albion_tenant_links%rowtype;
  v_target_link public.account_albion_tenant_links%rowtype;
  v_target_username text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_count integer := 0;
  v_link_count integer := 0;
  v_moved jsonb := '{}'::jsonb;
begin
  if p_actor_discord_id is null or p_actor_discord_id !~ '^[0-9]{15,25}$' then
    raise exception 'INVALID_ACTOR_DISCORD_ID';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_guild_id::text || ':member-account-merge:' ||
      least(p_from_discord_id, p_to_discord_id) || ':' ||
      greatest(p_from_discord_id, p_to_discord_id),
      0
    )
  );

  v_preview := public.preview_member_account_merge(p_guild_id, p_from_discord_id, p_to_discord_id);
  if not coalesce((v_preview->>'canMerge')::boolean, false) then
    raise exception 'ACCOUNT_MERGE_BLOCKED:%', v_preview->'blockers';
  end if;

  select * into v_source_avatar
  from public.guild_avatars
  where guild_id = p_guild_id
    and discord_id = p_from_discord_id
  for update;

  select * into v_target_avatar
  from public.guild_avatars
  where guild_id = p_guild_id
    and discord_id = p_to_discord_id
  for update;

  v_target_username := coalesce(nullif(v_target_avatar.username, ''), p_to_discord_id);

  update public.guild_avatars
  set
    albion_server = null,
    albion_player_id = null,
    albion_nickname = null,
    albion_guild_id = null,
    albion_verified_at = null,
    is_crafter = false,
    withdrawn_at = coalesce(withdrawn_at, now()),
    updated_at = now()
  where guild_id = p_guild_id
    and discord_id = p_from_discord_id;
  get diagnostics v_count = row_count;
  v_moved := v_moved || jsonb_build_object('guild_avatars_source', v_count);

  update public.guild_avatars
  set
    albion_server = coalesce(v_source_avatar.albion_server, albion_server),
    albion_player_id = coalesce(v_source_avatar.albion_player_id, albion_player_id),
    albion_nickname = coalesce(v_source_avatar.albion_nickname, albion_nickname),
    albion_guild_id = coalesce(v_source_avatar.albion_guild_id, albion_guild_id),
    albion_verified_at = coalesce(v_source_avatar.albion_verified_at, albion_verified_at),
    preferred_language = coalesce(v_source_avatar.preferred_language, preferred_language),
    discord_dm_enabled = v_source_avatar.discord_dm_enabled,
    notify_combat = v_source_avatar.notify_combat,
    notify_other = v_source_avatar.notify_other,
    dm_lead_minutes = coalesce(v_source_avatar.dm_lead_minutes, dm_lead_minutes),
    timezone = coalesce(v_source_avatar.timezone, timezone),
    is_crafter = is_crafter or v_source_avatar.is_crafter,
    craft_compensation_mode = case
      when v_source_avatar.is_crafter then v_source_avatar.craft_compensation_mode
      else craft_compensation_mode
    end,
    craft_premium_pct = case
      when v_source_avatar.is_crafter then v_source_avatar.craft_premium_pct
      else craft_premium_pct
    end,
    craft_box_range_start = case
      when v_source_avatar.is_crafter then v_source_avatar.craft_box_range_start
      else craft_box_range_start
    end,
    craft_box_range_end = case
      when v_source_avatar.is_crafter then v_source_avatar.craft_box_range_end
      else craft_box_range_end
    end,
    public_discord_handle = coalesce(v_source_avatar.public_discord_handle, public_discord_handle),
    withdrawn_at = null,
    updated_at = now()
  where guild_id = p_guild_id
    and discord_id = p_to_discord_id;
  get diagnostics v_count = row_count;
  v_moved := v_moved || jsonb_build_object('guild_avatars_target', v_count);

  update public.point_ledger
  set discord_id = p_to_discord_id
  where guild_id = p_guild_id
    and discord_id = p_from_discord_id;
  get diagnostics v_count = row_count;
  v_moved := v_moved || jsonb_build_object('point_ledger', v_count);

  update public.exchange_requests
  set discord_id = p_to_discord_id,
      username = v_target_username
  where guild_id = p_guild_id
    and discord_id = p_from_discord_id;
  get diagnostics v_count = row_count;
  v_moved := v_moved || jsonb_build_object('exchange_requests', v_count);

  update public.donation_requests
  set discord_id = p_to_discord_id,
      username = v_target_username
  where guild_id = p_guild_id
    and discord_id = p_from_discord_id;
  get diagnostics v_count = row_count;
  v_moved := v_moved || jsonb_build_object('donation_requests', v_count);

  update public.shop_orders
  set discord_id = p_to_discord_id,
      username = v_target_username
  where guild_id = p_guild_id
    and discord_id = p_from_discord_id;
  get diagnostics v_count = row_count;
  v_moved := v_moved || jsonb_build_object('shop_orders', v_count);

  update public.regear_requests
  set discord_id = p_to_discord_id,
      username = v_target_username
  where guild_id = p_guild_id
    and discord_id = p_from_discord_id;
  get diagnostics v_count = row_count;
  v_moved := v_moved || jsonb_build_object('regear_requests', v_count);

  update public.killboard_events
  set discord_id = p_to_discord_id
  where guild_id = p_guild_id
    and discord_id = p_from_discord_id;
  get diagnostics v_count = row_count;
  v_moved := v_moved || jsonb_build_object('killboard_events', v_count);

  update public.slots
  set assigned_discord_id = p_to_discord_id,
      assigned_username = v_target_username
  where guild_id = p_guild_id
    and assigned_discord_id = p_from_discord_id;
  get diagnostics v_count = row_count;
  v_moved := v_moved || jsonb_build_object('slots_assigned', v_count);

  update public.slots
  set requested_discord_id = p_to_discord_id,
      requested_username = v_target_username
  where guild_id = p_guild_id
    and requested_discord_id = p_from_discord_id;
  get diagnostics v_count = row_count;
  v_moved := v_moved || jsonb_build_object('slots_requested', v_count);

  update public.event_tentative_signups
  set discord_id = p_to_discord_id,
      username = v_target_username
  where guild_id = p_guild_id
    and discord_id = p_from_discord_id;
  get diagnostics v_count = row_count;
  v_moved := v_moved || jsonb_build_object('event_tentative_signups', v_count);

  update public.event_regear_participants
  set discord_id = p_to_discord_id,
      username = v_target_username
  where guild_id = p_guild_id
    and discord_id = p_from_discord_id;
  get diagnostics v_count = row_count;
  v_moved := v_moved || jsonb_build_object('event_regear_participants', v_count);

  update public.event_build_applications
  set applicant_discord_id = p_to_discord_id,
      applicant_username = v_target_username
  where guild_id = p_guild_id
    and applicant_discord_id = p_from_discord_id;
  get diagnostics v_count = row_count;
  v_moved := v_moved || jsonb_build_object('event_build_applications', v_count);

  update public.event_build_party_assigners
  set caller_discord_id = p_to_discord_id
  where guild_id = p_guild_id
    and caller_discord_id = p_from_discord_id;
  get diagnostics v_count = row_count;
  v_moved := v_moved || jsonb_build_object('event_build_party_assigners', v_count);

  update public.event_payout_requests epr
  set participants = (
    select coalesce(
      jsonb_agg(
        case
          when member.value->>'discord_id' = p_from_discord_id then
            jsonb_set(
              jsonb_set(member.value, '{discord_id}', to_jsonb(p_to_discord_id)),
              '{username}',
              to_jsonb(v_target_username)
            )
          else member.value
        end
      ),
      '[]'::jsonb
    )
    from jsonb_array_elements(epr.participants) as member(value)
  )
  where epr.guild_id = p_guild_id
    and epr.status = 'pending'
    and exists (
      select 1
      from jsonb_array_elements(epr.participants) as member(value)
      where member.value->>'discord_id' = p_from_discord_id
    );
  get diagnostics v_count = row_count;
  v_moved := v_moved || jsonb_build_object('event_payout_requests', v_count);

  update public.craft_tasks
  set crafter_discord_id = p_to_discord_id,
      crafter_username = v_target_username
  where guild_id = p_guild_id
    and crafter_discord_id = p_from_discord_id;
  get diagnostics v_count = row_count;
  v_moved := v_moved || jsonb_build_object('craft_tasks', v_count);

  update public.settlement_lines
  set discord_id = p_to_discord_id,
      username = coalesce(username, v_target_username)
  where guild_id = p_guild_id
    and discord_id = p_from_discord_id;
  get diagnostics v_count = row_count;
  v_moved := v_moved || jsonb_build_object('settlement_lines', v_count);

  insert into public.permission_user_overrides (
    guild_id,
    discord_id,
    capabilities_granted,
    capabilities_revoked,
    granted_by_discord_id,
    granted_at,
    updated_at,
    notes
  )
  select
    guild_id,
    p_to_discord_id,
    capabilities_granted,
    capabilities_revoked,
    granted_by_discord_id,
    granted_at,
    now(),
    notes
  from public.permission_user_overrides
  where guild_id = p_guild_id
    and discord_id = p_from_discord_id
  on conflict (guild_id, discord_id) do update
  set
    capabilities_granted = public.permission_user_overrides.capabilities_granted | excluded.capabilities_granted,
    capabilities_revoked = public.permission_user_overrides.capabilities_revoked | excluded.capabilities_revoked,
    updated_at = now(),
    notes = concat_ws(E'\n', nullif(public.permission_user_overrides.notes, ''), nullif(excluded.notes, ''));

  delete from public.permission_user_overrides
  where guild_id = p_guild_id
    and discord_id = p_from_discord_id;
  get diagnostics v_count = row_count;
  v_moved := v_moved || jsonb_build_object('permission_user_overrides', v_count);

  update public.guild_local_accounts
  set linked_discord_id = p_to_discord_id,
      updated_at = now()
  where guild_id = p_guild_id
    and linked_discord_id = p_from_discord_id;
  get diagnostics v_count = row_count;
  v_moved := v_moved || jsonb_build_object('guild_local_accounts', v_count);

  insert into public.tenant_admin_overrides (
    tenant_id,
    discord_id,
    granted_by_discord_id,
    granted_at,
    reason
  )
  select
    tenant_id,
    p_to_discord_id,
    granted_by_discord_id,
    granted_at,
    coalesce(reason, 'account merged from ' || p_from_discord_id)
  from public.tenant_admin_overrides
  where tenant_id = p_guild_id
    and discord_id = p_from_discord_id
  on conflict (tenant_id, discord_id) do nothing;

  delete from public.tenant_admin_overrides
  where tenant_id = p_guild_id
    and discord_id = p_from_discord_id;
  get diagnostics v_count = row_count;
  v_moved := v_moved || jsonb_build_object('tenant_admin_overrides', v_count);

  insert into public.site_user_nickname_overrides (
    discord_id,
    nickname,
    updated_by_discord_id,
    reason,
    updated_at
  )
  select
    p_to_discord_id,
    nickname,
    p_actor_discord_id,
    coalesce(v_reason, 'account merged from ' || p_from_discord_id),
    now()
  from public.site_user_nickname_overrides
  where discord_id = p_from_discord_id
  on conflict (discord_id) do nothing;

  delete from public.site_user_nickname_overrides
  where discord_id = p_from_discord_id;
  get diagnostics v_count = row_count;
  v_moved := v_moved || jsonb_build_object('site_user_nickname_overrides', v_count);

  update public.account_albion_profiles profile
  set discord_id = p_to_discord_id,
      updated_at = now()
  where profile.discord_id = p_from_discord_id
    and not exists (
      select 1
      from public.account_albion_profiles existing
      where existing.discord_id = p_to_discord_id
        and existing.revoked_at is null
        and existing.albion_server = profile.albion_server
        and (
          existing.albion_player_id is not distinct from profile.albion_player_id
          or lower(existing.albion_player_name) = lower(profile.albion_player_name)
        )
    );
  get diagnostics v_count = row_count;
  v_moved := v_moved || jsonb_build_object('account_albion_profiles_moved', v_count);

  update public.account_albion_profiles
  set claim_status = 'revoked',
      is_primary = false,
      revoked_at = coalesce(revoked_at, now()),
      updated_at = now()
  where discord_id = p_from_discord_id
    and revoked_at is null;
  get diagnostics v_count = row_count;
  v_moved := v_moved || jsonb_build_object('account_albion_profiles_revoked', v_count);

  select * into v_source_link
  from public.account_albion_tenant_links
  where guild_id = p_guild_id
    and discord_id = p_from_discord_id
  for update;

  select * into v_target_link
  from public.account_albion_tenant_links
  where guild_id = p_guild_id
    and discord_id = p_to_discord_id
  for update;

  if v_source_link.id is not null then
    if v_target_link.id is null then
      update public.account_albion_tenant_links
      set discord_id = p_to_discord_id,
          updated_at = now()
      where id = v_source_link.id;
      get diagnostics v_count = row_count;
      v_link_count := v_link_count + v_count;
    else
      update public.account_albion_tenant_links
      set
        profile_id = case
          when profile_id is not null then profile_id
          when v_source_link.profile_id is not null
            and exists (
              select 1
              from public.account_albion_profiles profile
              where profile.id = v_source_link.profile_id
                and profile.discord_id = p_to_discord_id
                and profile.revoked_at is null
            )
          then v_source_link.profile_id
          else profile_id
        end,
        albion_server = coalesce(v_source_link.albion_server, albion_server),
        albion_player_id = coalesce(v_source_link.albion_player_id, albion_player_id),
        albion_player_name = coalesce(v_source_link.albion_player_name, albion_player_name),
        current_guild_id = coalesce(v_source_link.current_guild_id, current_guild_id),
        current_guild_name = coalesce(v_source_link.current_guild_name, current_guild_name),
        current_alliance_id = coalesce(v_source_link.current_alliance_id, current_alliance_id),
        current_alliance_name = coalesce(v_source_link.current_alliance_name, current_alliance_name),
        relation = case
          when v_source_link.trust_status in ('trusted', 'roster_matched') then v_source_link.relation
          else relation
        end,
        trust_status = case
          when v_source_link.trust_status in ('trusted', 'roster_matched') then v_source_link.trust_status
          else trust_status
        end,
        status_reason = coalesce(v_source_link.status_reason, status_reason, 'account_merged'),
        verified_at = coalesce(v_source_link.verified_at, verified_at),
        trusted_at = coalesce(v_source_link.trusted_at, trusted_at),
        disputed_at = null,
        revoked_at = null,
        last_synced_at = coalesce(v_source_link.last_synced_at, last_synced_at),
        last_manual_sync_at = coalesce(v_source_link.last_manual_sync_at, last_manual_sync_at),
        public_activity_enabled = case
          when public_activity_enabled then public_activity_enabled
          else v_source_link.public_activity_enabled
        end,
        public_activity_enabled_at = coalesce(public_activity_enabled_at, v_source_link.public_activity_enabled_at),
        updated_at = now()
      where id = v_target_link.id;
      get diagnostics v_count = row_count;
      v_link_count := v_link_count + v_count;

      update public.account_albion_tenant_links
      set trust_status = 'revoked',
          status_reason = 'account_merged',
          verified_at = null,
          trusted_at = null,
          disputed_at = null,
          revoked_at = coalesce(revoked_at, now()),
          updated_at = now()
      where id = v_source_link.id;
      get diagnostics v_count = row_count;
      v_link_count := v_link_count + v_count;
    end if;
  end if;

  v_moved := v_moved || jsonb_build_object('account_albion_tenant_links', v_link_count);

  insert into public.account_albion_identity_audit (
    guild_id,
    discord_id,
    profile_id,
    actor_discord_id,
    action,
    trust_status,
    relation,
    reason
  )
  select
    p_guild_id,
    p_to_discord_id,
    profile_id,
    p_actor_discord_id,
    'account_merge',
    trust_status,
    relation,
    coalesce(v_reason, 'merged from ' || p_from_discord_id)
  from public.account_albion_tenant_links
  where guild_id = p_guild_id
    and discord_id = p_to_discord_id
  limit 1;

  delete from public.member_point_balances
  where guild_id = p_guild_id
    and discord_id in (p_from_discord_id, p_to_discord_id);

  insert into public.member_point_balances (
    guild_id,
    discord_id,
    balance,
    lifetime_earned,
    lifetime_spent,
    entries_count,
    updated_at
  )
  select
    guild_id,
    discord_id,
    coalesce(sum(delta), 0)::bigint,
    coalesce(sum(greatest(delta, 0)), 0)::bigint,
    coalesce(sum(greatest(-delta, 0)), 0)::bigint,
    count(*)::integer,
    coalesce(max(created_at), now())
  from public.point_ledger
  where guild_id = p_guild_id
    and discord_id = p_to_discord_id
  group by guild_id, discord_id;

  v_preview := public.preview_member_account_merge(p_guild_id, p_from_discord_id, p_to_discord_id);
  return v_preview || jsonb_build_object('moved', v_moved);
end;
$$;

revoke all on function public.preview_member_account_merge(uuid, text, text) from public, anon, authenticated;
revoke all on function public.merge_member_accounts(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.preview_member_account_merge(uuid, text, text) to service_role;
grant execute on function public.merge_member_accounts(uuid, text, text, text, text) to service_role;

comment on function public.preview_member_account_merge(uuid, text, text) is
  'Super-admin support RPC: preview tenant-scoped Discord account merge blockers and moved-row counts.';

comment on function public.merge_member_accounts(uuid, text, text, text, text) is
  'Super-admin support RPC: merge member-owned data from one Discord ID into another. Actor fields such as handled_by/resolved_by/created_by and audit target_discord_id history are intentionally preserved.';
