-- 419: Keep the database roster validator aligned with the application-side
-- guest regear policy. Guest slots are never eligible for automatic regear,
-- and manual regear is allowed only when the event explicitly enables it.

create or replace function public.start_event_with_regear_policy_snapshots(
  p_guild_id uuid,
  p_event_id uuid,
  p_started_at timestamptz,
  p_policy_version_id uuid,
  p_policy_config_snapshot jsonb,
  p_participant_snapshots jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status text;
  v_category text;
  v_guest_regear_enabled boolean;
  v_battle_started_at timestamptz;
  v_policy_version_id uuid;
  v_policy_config_snapshot jsonb;
  v_snapshotted_at timestamptz;
  v_participant jsonb;
  v_snapshot_count integer;
  v_roster_mismatch boolean;
  v_current_event_config jsonb;
  v_current_role_overrides jsonb;
begin
  if p_started_at is null then
    raise exception 'event_start_time_required';
  end if;
  if p_participant_snapshots is null
     or jsonb_typeof(p_participant_snapshots) <> 'array'
     or jsonb_array_length(p_participant_snapshots) > 1000
     or octet_length(p_participant_snapshots::text) > 16777216 then
    raise exception 'event_regear_participant_payload_invalid';
  end if;
  if p_policy_version_id is null
     or p_policy_config_snapshot is null
     or jsonb_typeof(p_policy_config_snapshot) <> 'object'
     or octet_length(p_policy_config_snapshot::text) > 524288
     or p_policy_config_snapshot -> 'version' is distinct from '1'::jsonb
     or p_policy_config_snapshot ->> 'policyVersionId'
       is distinct from p_policy_version_id::text
     or p_policy_config_snapshot ->> 'scope' is distinct from 'event'
     or p_policy_config_snapshot ->> 'guildId'
       is distinct from p_guild_id::text
     or p_policy_config_snapshot ->> 'eventId'
       is distinct from p_event_id::text
     or nullif(p_policy_config_snapshot ->> 'capturedAt', '') is null
     or jsonb_typeof(p_policy_config_snapshot -> 'event') <> 'object'
     or jsonb_typeof(p_policy_config_snapshot -> 'roleOverrides') <> 'array' then
    raise exception 'event_regear_policy_config_invalid';
  end if;

  select
    event.status,
    event.category,
    event.guest_regear_enabled,
    event.battle_started_at,
    event.regear_policy_version_id,
    event.regear_policy_config_snapshot,
    event.regear_policy_snapshotted_at,
    jsonb_build_object(
      'category', event.category,
      'policy', event.regear_policy,
      'silverCap', event.regear_silver_cap,
      'maxDeathsPerMember', event.regear_max_deaths_per_member,
      'videoPolicy', event.regear_video_policy,
      'videoPayoutRatePercent', event.regear_video_payout_rate_percent,
      'videoClaimCeilingBonusSilver', event.regear_video_claim_ceiling_bonus_silver,
      'videoRateAppliesWithoutProof',
        coalesce(event.regear_video_rate_applies_without_proof, false),
      'autoPolicy', event.regear_auto_policy
    )
  into
    v_status,
    v_category,
    v_guest_regear_enabled,
    v_battle_started_at,
    v_policy_version_id,
    v_policy_config_snapshot,
    v_snapshotted_at,
    v_current_event_config
  from public.events as event
  where event.guild_id = p_guild_id
    and event.id = p_event_id
  for update of event;

  if not found then
    raise exception 'event_not_found';
  end if;
  if v_status <> 'published' then
    raise exception 'event_not_published';
  end if;
  if v_battle_started_at is not null then
    raise exception 'event_already_started';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'roleName', override.role_name,
        'enabled', override.enabled,
        'silverCap', override.silver_cap,
        'payoutRatePercent', override.payout_rate_percent
      )
      order by override.role_name
    ),
    '[]'::jsonb
  )
  into v_current_role_overrides
  from public.event_regear_role_overrides as override
  where override.guild_id = p_guild_id
    and override.event_id = p_event_id;

  if p_policy_config_snapshot -> 'event'
       is distinct from v_current_event_config
     or p_policy_config_snapshot -> 'roleOverrides'
       is distinct from v_current_role_overrides then
    raise exception 'event_regear_policy_config_changed';
  end if;

  if v_policy_version_id is null then
    v_policy_version_id := p_policy_version_id;
    v_policy_config_snapshot := p_policy_config_snapshot;
    v_snapshotted_at := coalesce(
      nullif(p_policy_config_snapshot ->> 'capturedAt', '')::timestamptz,
      p_started_at
    );
  elsif p_policy_version_id is distinct from v_policy_version_id
     or p_policy_config_snapshot is distinct from v_policy_config_snapshot then
    raise exception 'event_regear_policy_version_mismatch';
  end if;

  for v_participant in
    select value from jsonb_array_elements(p_participant_snapshots)
  loop
    if jsonb_typeof(v_participant) <> 'object'
       or nullif(btrim(v_participant ->> 'discordId'), '') is null
       or nullif(btrim(v_participant ->> 'username'), '') is null
       or nullif(btrim(v_participant ->> 'roleName'), '') is null
       or jsonb_typeof(v_participant -> 'manualExcluded') <> 'boolean'
       or jsonb_typeof(v_participant -> 'autoExcluded') <> 'boolean'
       or (v_participant ->> 'policyVersionId')::uuid is distinct from v_policy_version_id
       or jsonb_typeof(v_participant -> 'manualPolicy') <> 'object'
       or jsonb_typeof(v_participant -> 'autoPolicy') <> 'object'
       or jsonb_typeof(v_participant -> 'sources') <> 'object' then
      raise exception 'event_regear_participant_snapshot_invalid';
    end if;
  end loop;

  with expected as (
    select
      slot.assigned_discord_id as discord_id,
      btrim(slot.role_name) as role_name,
      coalesce(slot.manual_regear_excluded, false)
        or (
          guest.discord_id is not null
          and not coalesce(v_guest_regear_enabled, false)
        ) as manual_excluded,
      coalesce(slot.auto_regear_excluded, false)
        or guest.discord_id is not null as auto_excluded
    from public.slots as slot
    join public.parties as party
      on party.guild_id = slot.guild_id
     and party.id = slot.party_id
    left join public.event_guest_profiles as guest
      on guest.guild_id = slot.guild_id
     and guest.event_id = party.event_id
     and guest.discord_id = slot.assigned_discord_id
    where v_category = '전투'
      and party.guild_id = p_guild_id
      and party.event_id = p_event_id
      and nullif(btrim(slot.assigned_discord_id), '') is not null
      and nullif(btrim(slot.role_name), '') is not null

    union all

    select
      participant.discord_id,
      btrim(participant.role_name),
      false,
      true
    from public.event_regear_participants as participant
    where participant.guild_id = p_guild_id
      and participant.event_id = p_event_id
  ),
  provided as (
    select
      btrim(value ->> 'discordId') as discord_id,
      btrim(value ->> 'roleName') as role_name,
      (value ->> 'manualExcluded')::boolean as manual_excluded,
      (value ->> 'autoExcluded')::boolean as auto_excluded
    from jsonb_array_elements(p_participant_snapshots)
  )
  select exists (
    select 1 where
      (select count(*) from expected)
        <> (select count(*) from provided)
      or (select count(*) from expected)
        <> (select count(distinct discord_id) from expected)
      or (select count(*) from provided)
        <> (select count(distinct discord_id) from provided)
      or exists (
        select 1
        from expected
        full join provided
          on provided.discord_id = expected.discord_id
        where expected.discord_id is null
           or provided.discord_id is null
           or provided.role_name is distinct from expected.role_name
           or provided.manual_excluded is distinct from expected.manual_excluded
           or provided.auto_excluded is distinct from expected.auto_excluded
      )
  )
  into v_roster_mismatch;

  if v_roster_mismatch then
    raise exception 'event_regear_roster_changed';
  end if;

  update public.events
  set
    battle_started_at = p_started_at,
    regear_policy_version_id = v_policy_version_id,
    regear_policy_config_snapshot = v_policy_config_snapshot,
    regear_policy_snapshotted_at = v_snapshotted_at
  where guild_id = p_guild_id
    and id = p_event_id;

  insert into public.event_regear_policy_snapshots (
    guild_id,
    event_id,
    policy_version_id,
    discord_id,
    username,
    role_name,
    manual_policy_snapshot,
    auto_policy_snapshot,
    source_snapshot
  )
  select
    p_guild_id,
    p_event_id,
    v_policy_version_id,
    btrim(participant ->> 'discordId'),
    btrim(participant ->> 'username'),
    btrim(participant ->> 'roleName'),
    participant -> 'manualPolicy',
    participant -> 'autoPolicy',
    participant -> 'sources'
  from jsonb_array_elements(p_participant_snapshots) as participant
  on conflict (guild_id, event_id, discord_id) do nothing;

  select count(*)::integer
    into v_snapshot_count
  from public.event_regear_policy_snapshots
  where guild_id = p_guild_id
    and event_id = p_event_id
    and policy_version_id = v_policy_version_id;

  if v_snapshot_count <> jsonb_array_length(p_participant_snapshots) then
    raise exception 'event_regear_snapshot_count_mismatch';
  end if;

  return jsonb_build_object(
    'started_at', p_started_at,
    'policy_version_id', v_policy_version_id,
    'participant_snapshot_count', v_snapshot_count
  );
end;
$$;

revoke all on function public.start_event_with_regear_policy_snapshots(
  uuid, uuid, timestamptz, uuid, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.start_event_with_regear_policy_snapshots(
  uuid, uuid, timestamptz, uuid, jsonb, jsonb
) to service_role;

comment on function public.start_event_with_regear_policy_snapshots(
  uuid, uuid, timestamptz, uuid, jsonb, jsonb
) is 'Atomically starts an event and snapshots effective participant regear policy with guest-aware roster validation.';
