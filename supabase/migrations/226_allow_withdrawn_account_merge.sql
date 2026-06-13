-- Allow merging into a withdrawn target member account.
--
-- Migration 225 initially blocked target guild_avatars.withdrawn_at rows.
-- Support workflows need to merge historical data into a member row that may
-- have been withdrawn by Discord member sync; merge_member_accounts already
-- reactivates the target row by setting withdrawn_at = null.

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
    v_warnings := v_warnings || jsonb_build_array('target_member_will_be_reactivated');
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


revoke all on function public.preview_member_account_merge(uuid, text, text) from public, anon, authenticated;
grant execute on function public.preview_member_account_merge(uuid, text, text) to service_role;

comment on function public.preview_member_account_merge(uuid, text, text) is
  'Super-admin support RPC: preview tenant-scoped Discord account merge blockers and moved-row counts. Withdrawn target rows are allowed and will be reactivated by merge_member_accounts.';
