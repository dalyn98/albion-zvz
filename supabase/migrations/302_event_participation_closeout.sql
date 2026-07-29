-- 302: Exception-edited, atomic event participation closeout.
--
-- New participation rewards no longer create an approval request. An event
-- manager confirms one final roster (assigned defaults plus explicit
-- exceptions), and this command atomically persists the roster, one ledger
-- reference per included member, the audit record, and durable DM outbox rows.
-- Existing event_payout_requests remain untouched so pending legacy requests
-- can still be approved or rejected through their original flow.

create table if not exists public.event_participation_closeouts (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  event_id uuid not null,
  idempotency_key uuid not null,
  event_title_snapshot text not null,
  reward_per_member integer not null,
  final_participant_count integer not null,
  excluded_slot_count integer not null,
  manual_participant_count integer not null,
  total_reward bigint not null,
  memo text,
  finalized_by text not null,
  finalized_by_username text not null,
  finalized_at timestamptz not null default now(),
  foreign key (guild_id, event_id)
    references public.events(guild_id, id)
    on delete no action
    deferrable initially deferred,
  unique (guild_id, id),
  unique (guild_id, event_id, id),
  unique (guild_id, event_id),
  unique (guild_id, idempotency_key),
  constraint event_participation_closeouts_title_chk check (
    length(btrim(event_title_snapshot)) > 0
    and char_length(event_title_snapshot) <= 200
  ),
  constraint event_participation_closeouts_reward_chk check (
    reward_per_member between 0 and 2000000000
    and final_participant_count between 0 and 2000
    and excluded_slot_count between 0 and 2000
    and manual_participant_count between 0 and 2000
    and total_reward = reward_per_member::bigint * final_participant_count::bigint
  ),
  constraint event_participation_closeouts_memo_chk check (
    memo is null or char_length(memo) <= 500
  ),
  constraint event_participation_closeouts_actor_chk check (
    length(btrim(finalized_by)) > 0
    and char_length(finalized_by) <= 128
    and length(btrim(finalized_by_username)) > 0
    and char_length(finalized_by_username) <= 128
  )
);

create index if not exists event_participation_closeouts_recent_idx
  on public.event_participation_closeouts (guild_id, finalized_at desc);

create table if not exists public.event_participation_closeout_entries (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  event_id uuid not null,
  closeout_id uuid not null,
  discord_id text not null,
  username text not null,
  source text not null,
  decision text not null,
  role_names text[] not null default '{}',
  activity_evidence_status text not null,
  activity_battle_count integer not null default 0,
  decision_note text,
  reward_amount integer not null default 0,
  created_at timestamptz not null default now(),
  foreign key (guild_id, event_id, closeout_id)
    references public.event_participation_closeouts(guild_id, event_id, id)
    on delete cascade,
  unique (guild_id, id),
  unique (guild_id, closeout_id, discord_id),
  constraint event_participation_closeout_entries_identity_chk check (
    length(btrim(discord_id)) > 0
    and char_length(discord_id) <= 128
    and length(btrim(username)) > 0
    and char_length(username) <= 128
  ),
  constraint event_participation_closeout_entries_source_chk check (
    source in ('slot', 'manual')
  ),
  constraint event_participation_closeout_entries_decision_chk check (
    decision in ('included', 'excluded')
    and (source <> 'manual' or decision = 'included')
  ),
  constraint event_participation_closeout_entries_roles_chk check (
    cardinality(role_names) <= 20
  ),
  constraint event_participation_closeout_entries_activity_chk check (
    activity_evidence_status in (
      'activity_confirmed',
      'activity_not_found',
      'activity_only',
      'not_checked'
    )
    and activity_battle_count between 0 and 10000
  ),
  constraint event_participation_closeout_entries_note_chk check (
    decision_note is null or char_length(decision_note) <= 500
  ),
  constraint event_participation_closeout_entries_reward_chk check (
    reward_amount between 0 and 2000000000
    and (decision = 'included' or reward_amount = 0)
  )
);

create index if not exists event_participation_closeout_entries_member_idx
  on public.event_participation_closeout_entries
  (guild_id, discord_id, created_at desc);

create table if not exists public.event_participation_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  event_id uuid not null,
  closeout_id uuid not null,
  entry_id uuid not null,
  discord_id text not null,
  payload jsonb not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  foreign key (guild_id, event_id, closeout_id)
    references public.event_participation_closeouts(guild_id, event_id, id)
    on delete cascade,
  foreign key (guild_id, entry_id)
    references public.event_participation_closeout_entries(guild_id, id)
    on delete cascade,
  unique (guild_id, closeout_id, discord_id),
  constraint event_participation_notification_outbox_identity_chk check (
    length(btrim(discord_id)) > 0
    and char_length(discord_id) <= 128
  ),
  constraint event_participation_notification_outbox_payload_chk check (
    jsonb_typeof(payload) = 'object'
    and octet_length(payload::text) <= 8192
  ),
  constraint event_participation_notification_outbox_status_chk check (
    status in ('pending', 'processing', 'sent', 'skipped', 'failed')
  ),
  constraint event_participation_notification_outbox_attempts_chk check (
    attempts between 0 and 20
  ),
  constraint event_participation_notification_outbox_error_chk check (
    last_error is null or char_length(last_error) <= 1000
  )
);

create index if not exists event_participation_notification_outbox_claim_idx
  on public.event_participation_notification_outbox
  (status, created_at, id)
  where status in ('pending', 'processing', 'failed');

alter table public.event_participation_closeouts enable row level security;
alter table public.event_participation_closeout_entries enable row level security;
alter table public.event_participation_notification_outbox enable row level security;

grant select, insert
  on public.event_participation_closeouts,
     public.event_participation_closeout_entries
  to service_role;
revoke update, delete
  on public.event_participation_closeouts,
     public.event_participation_closeout_entries
  from service_role;
grant select, insert, update
  on public.event_participation_notification_outbox
  to service_role;
revoke delete
  on public.event_participation_notification_outbox
  from service_role;
revoke all
  on public.event_participation_closeouts,
     public.event_participation_closeout_entries,
     public.event_participation_notification_outbox
  from anon, authenticated;

create or replace function public.finalize_event_participation_closeout(
  p_guild_id uuid,
  p_event_id uuid,
  p_idempotency_key uuid,
  p_reward_per_member integer,
  p_memo text,
  p_entries jsonb,
  p_finalized_by text,
  p_finalized_by_username text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_event_title text;
  v_event_status text;
  v_battle_started_at timestamptz;
  v_existing_id uuid;
  v_existing_event_id uuid;
  v_existing_count integer;
  v_existing_total bigint;
  v_existing_finalized_at timestamptz;
  v_closeout_id uuid := gen_random_uuid();
  v_entry_id uuid;
  v_entry jsonb;
  v_discord_id text;
  v_username text;
  v_source text;
  v_included boolean;
  v_role_names text[];
  v_activity_status text;
  v_activity_battle_count integer;
  v_note text;
  v_reward_amount integer;
  v_final_count integer;
  v_excluded_count integer;
  v_manual_count integer;
  v_total_reward bigint;
  v_expected_slot_count integer;
  v_roster_mismatch boolean;
begin
  if p_guild_id is null
     or p_event_id is null
     or p_idempotency_key is null then
    raise exception 'event_participation_closeout_identity_required';
  end if;
  if p_reward_per_member is null
     or p_reward_per_member < 0
     or p_reward_per_member > 2000000000 then
    raise exception 'event_participation_closeout_reward_invalid';
  end if;
  if p_memo is not null and char_length(p_memo) > 500 then
    raise exception 'event_participation_closeout_memo_invalid';
  end if;
  if nullif(btrim(p_finalized_by), '') is null
     or char_length(p_finalized_by) > 128
     or nullif(btrim(p_finalized_by_username), '') is null
     or char_length(p_finalized_by_username) > 128 then
    raise exception 'event_participation_closeout_actor_invalid';
  end if;
  if p_entries is null
     or jsonb_typeof(p_entries) <> 'array'
     or jsonb_array_length(p_entries) > 2000
     or octet_length(p_entries::text) > 4194304 then
    raise exception 'event_participation_closeout_entries_invalid';
  end if;

  select event.title, event.status, event.battle_started_at
    into v_event_title, v_event_status, v_battle_started_at
  from public.events as event
  where event.guild_id = p_guild_id
    and event.id = p_event_id
  for update of event;

  if not found then
    raise exception 'event_not_found';
  end if;
  v_event_title := left(
    coalesce(nullif(btrim(v_event_title), ''), p_event_id::text),
    200
  );

  select
    closeout.id,
    closeout.event_id,
    closeout.final_participant_count,
    closeout.total_reward,
    closeout.finalized_at
  into
    v_existing_id,
    v_existing_event_id,
    v_existing_count,
    v_existing_total,
    v_existing_finalized_at
  from public.event_participation_closeouts as closeout
  where closeout.guild_id = p_guild_id
    and closeout.idempotency_key = p_idempotency_key;

  if found then
    if v_existing_event_id is distinct from p_event_id then
      raise exception 'event_participation_closeout_idempotency_conflict';
    end if;
    return jsonb_build_object(
      'closeoutId', v_existing_id,
      'eventId', v_existing_event_id,
      'participantCount', v_existing_count,
      'totalReward', v_existing_total,
      'finalizedAt', v_existing_finalized_at,
      'replayed', true
    );
  end if;

  if v_event_status <> 'published' then
    raise exception 'event_not_published';
  end if;
  if v_battle_started_at is null
     or v_battle_started_at > now() - interval '1 hour' then
    raise exception 'event_participation_closeout_event_not_ended';
  end if;

  if exists (
    select 1
    from public.event_payout_requests as request
    where request.guild_id = p_guild_id
      and request.event_id = p_event_id
      and request.status in ('pending', 'approved')
  ) then
    raise exception 'event_participation_closeout_legacy_payout_exists';
  end if;

  if exists (
    select 1
    from public.event_participation_closeouts as closeout
    where closeout.guild_id = p_guild_id
      and closeout.event_id = p_event_id
  ) then
    raise exception 'event_participation_closeout_already_finalized';
  end if;

  for v_entry in
    select value from jsonb_array_elements(p_entries)
  loop
    if jsonb_typeof(v_entry) <> 'object'
       or jsonb_typeof(v_entry -> 'included') <> 'boolean'
       or v_entry ->> 'source' not in ('slot', 'manual')
       or nullif(btrim(v_entry ->> 'discordId'), '') is null
       or v_entry ->> 'discordId' is distinct from btrim(v_entry ->> 'discordId')
       or char_length(v_entry ->> 'discordId') > 128
       or nullif(btrim(v_entry ->> 'username'), '') is null
       or char_length(v_entry ->> 'username') > 128
       or jsonb_typeof(v_entry -> 'roleNames') <> 'array'
       or jsonb_array_length(v_entry -> 'roleNames') > 20
       or v_entry ->> 'evidenceStatus' not in (
         'activity_confirmed',
         'activity_not_found',
         'activity_only',
         'not_checked'
       )
       or jsonb_typeof(v_entry -> 'activityBattleCount') <> 'number'
       or (v_entry ->> 'activityBattleCount')::numeric
         <> trunc((v_entry ->> 'activityBattleCount')::numeric)
       or (v_entry ->> 'activityBattleCount')::numeric < 0
       or (v_entry ->> 'activityBattleCount')::numeric > 10000
       or (
         v_entry ? 'note'
         and jsonb_typeof(v_entry -> 'note') not in ('string', 'null')
       )
       or char_length(coalesce(v_entry ->> 'note', '')) > 500
       or exists (
         select 1
         from jsonb_array_elements(v_entry -> 'roleNames') as role_name
         where jsonb_typeof(role_name) <> 'string'
            or nullif(btrim(role_name #>> '{}'), '') is null
            or char_length(role_name #>> '{}') > 64
       )
       or (
         v_entry ->> 'source' = 'manual'
         and (v_entry ->> 'included')::boolean is not true
       ) then
      raise exception 'event_participation_closeout_entry_invalid';
    end if;
  end loop;

  if (
    select count(*) <> count(distinct btrim(value ->> 'discordId'))
    from jsonb_array_elements(p_entries)
  ) then
    raise exception 'event_participation_closeout_duplicate_member';
  end if;

  with expected_slots as (
    select btrim(slot.assigned_discord_id) as discord_id
    from public.slots as slot
    join public.parties as party
      on party.guild_id = slot.guild_id
     and party.id = slot.party_id
    where party.guild_id = p_guild_id
      and party.event_id = p_event_id
      and nullif(btrim(slot.assigned_discord_id), '') is not null
    group by btrim(slot.assigned_discord_id)
  ),
  provided_slots as (
    select btrim(value ->> 'discordId') as discord_id
    from jsonb_array_elements(p_entries)
    where value ->> 'source' = 'slot'
  )
  select
    (select count(*)::integer from expected_slots),
    exists (
      select 1
      where
        (select count(*) from expected_slots)
          <> (select count(*) from provided_slots)
        or exists (
          select 1
          from expected_slots
          full join provided_slots using (discord_id)
          where expected_slots.discord_id is null
             or provided_slots.discord_id is null
        )
    )
  into v_expected_slot_count, v_roster_mismatch;

  if v_roster_mismatch then
    raise exception 'event_participation_closeout_slot_roster_changed';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_entries) as provided
    where provided ->> 'source' = 'manual'
      and (
        exists (
          select 1
          from public.guild_avatars as avatar
          where avatar.guild_id = p_guild_id
            and avatar.discord_id = provided ->> 'discordId'
            and avatar.withdrawn_at is null
        )
        or exists (
          select 1
          from public.guests as guest
          where guest.guild_id = p_guild_id
            and guest.discord_id = provided ->> 'discordId'
        )
      ) is not true
  ) then
    raise exception 'event_participation_closeout_manual_member_unknown';
  end if;

  select
    count(*) filter (
      where (value ->> 'included')::boolean
    )::integer,
    count(*) filter (
      where value ->> 'source' = 'slot'
        and not (value ->> 'included')::boolean
    )::integer,
    count(*) filter (
      where value ->> 'source' = 'manual'
        and (value ->> 'included')::boolean
    )::integer
  into v_final_count, v_excluded_count, v_manual_count
  from jsonb_array_elements(p_entries);

  v_total_reward := p_reward_per_member::bigint * v_final_count::bigint;

  insert into public.event_participation_closeouts (
    id,
    guild_id,
    event_id,
    idempotency_key,
    event_title_snapshot,
    reward_per_member,
    final_participant_count,
    excluded_slot_count,
    manual_participant_count,
    total_reward,
    memo,
    finalized_by,
    finalized_by_username
  )
  values (
    v_closeout_id,
    p_guild_id,
    p_event_id,
    p_idempotency_key,
    v_event_title,
    p_reward_per_member,
    v_final_count,
    v_excluded_count,
    v_manual_count,
    v_total_reward,
    nullif(btrim(p_memo), ''),
    btrim(p_finalized_by),
    btrim(p_finalized_by_username)
  );

  for v_entry in
    select value from jsonb_array_elements(p_entries)
  loop
    v_entry_id := gen_random_uuid();
    v_discord_id := btrim(v_entry ->> 'discordId');
    v_source := v_entry ->> 'source';
    v_included := (v_entry ->> 'included')::boolean;
    v_activity_status := v_entry ->> 'evidenceStatus';
    v_activity_battle_count := (v_entry ->> 'activityBattleCount')::integer;
    v_note := nullif(btrim(v_entry ->> 'note'), '');

    if v_source = 'slot' then
      select
        coalesce(
          max(nullif(btrim(slot.assigned_username), '')),
          v_discord_id
        ),
        coalesce(
          array_agg(
            distinct btrim(slot.role_name)
            order by btrim(slot.role_name)
          ) filter (
            where nullif(btrim(slot.role_name), '') is not null
          ),
          '{}'::text[]
        )
      into v_username, v_role_names
      from public.slots as slot
      join public.parties as party
        on party.guild_id = slot.guild_id
       and party.id = slot.party_id
      where party.guild_id = p_guild_id
        and party.event_id = p_event_id
        and btrim(slot.assigned_discord_id) = v_discord_id;
    else
      select coalesce(
        (
          select nullif(btrim(avatar.username), '')
          from public.guild_avatars as avatar
          where avatar.guild_id = p_guild_id
            and avatar.discord_id = v_discord_id
            and avatar.withdrawn_at is null
          limit 1
        ),
        (
          select nullif(btrim(guest.username), '')
          from public.guests as guest
          where guest.guild_id = p_guild_id
            and guest.discord_id = v_discord_id
          limit 1
        )
      )
      into v_username;
      if v_username is null then
        raise exception 'event_participation_closeout_manual_member_unknown';
      end if;
      select coalesce(
        array_agg(role_name order by role_name),
        '{}'::text[]
      )
      into v_role_names
      from (
        select distinct btrim(value #>> '{}') as role_name
        from jsonb_array_elements(v_entry -> 'roleNames')
      ) as roles;
    end if;

    v_reward_amount := case
      when v_included then p_reward_per_member
      else 0
    end;

    insert into public.event_participation_closeout_entries (
      id,
      guild_id,
      event_id,
      closeout_id,
      discord_id,
      username,
      source,
      decision,
      role_names,
      activity_evidence_status,
      activity_battle_count,
      decision_note,
      reward_amount
    )
    values (
      v_entry_id,
      p_guild_id,
      p_event_id,
      v_closeout_id,
      v_discord_id,
      v_username,
      v_source,
      case when v_included then 'included' else 'excluded' end,
      v_role_names,
      v_activity_status,
      v_activity_battle_count,
      v_note,
      v_reward_amount
    );

    if v_included and p_reward_per_member > 0 then
      insert into public.point_ledger (
        guild_id,
        discord_id,
        delta,
        reason,
        ref_id,
        memo
      )
      values (
        p_guild_id,
        v_discord_id,
        p_reward_per_member,
        'event_payout_approved',
        v_entry_id,
        nullif(btrim(p_memo), '')
      );
    end if;

    if v_included then
      insert into public.event_participation_notification_outbox (
        guild_id,
        event_id,
        closeout_id,
        entry_id,
        discord_id,
        payload
      )
      values (
        p_guild_id,
        p_event_id,
        v_closeout_id,
        v_entry_id,
        v_discord_id,
        jsonb_build_object(
          'eventTitle', v_event_title,
          'rewardPerMember', p_reward_per_member,
          'participantCount', v_final_count,
          'finalizedAt', now()
        )
      );
    end if;
  end loop;

  insert into public.admin_audit_log (
    guild_id,
    admin_discord_id,
    action,
    target_id,
    target_kind,
    details
  )
  values (
    p_guild_id,
    btrim(p_finalized_by),
    'event.participation.finalize',
    p_event_id::text,
    'event',
    jsonb_build_object(
      'closeoutId', v_closeout_id,
      'eventTitle', v_event_title,
      'assignedCandidateCount', v_expected_slot_count,
      'finalParticipantCount', v_final_count,
      'excludedSlotCount', v_excluded_count,
      'manualParticipantCount', v_manual_count,
      'rewardPerMember', p_reward_per_member,
      'totalReward', v_total_reward
    )
  );

  return jsonb_build_object(
    'closeoutId', v_closeout_id,
    'eventId', p_event_id,
    'participantCount', v_final_count,
    'totalReward', v_total_reward,
    'finalizedAt', now(),
    'replayed', false
  );
end;
$$;

revoke all on function public.finalize_event_participation_closeout(
  uuid, uuid, uuid, integer, text, jsonb, text, text
) from public, anon, authenticated;
grant execute on function public.finalize_event_participation_closeout(
  uuid, uuid, uuid, integer, text, jsonb, text, text
) to service_role;

create or replace function public.claim_event_participation_notification_outbox(
  p_limit integer,
  p_closeout_id uuid,
  p_lease_seconds integer
)
returns table (
  id uuid,
  guild_id uuid,
  event_id uuid,
  closeout_id uuid,
  entry_id uuid,
  discord_id text,
  payload jsonb,
  attempts integer
)
language sql
security invoker
set search_path = public
as $$
  with candidates as (
    select outbox.id
    from public.event_participation_notification_outbox as outbox
    where (
      outbox.status in ('pending', 'failed')
      or (
        outbox.status = 'processing'
        and outbox.locked_at
          < now() - make_interval(secs => least(greatest(p_lease_seconds, 30), 3600))
      )
    )
      and outbox.attempts < 5
      and (p_closeout_id is null or outbox.closeout_id = p_closeout_id)
    order by outbox.created_at, outbox.id
    for update skip locked
    limit least(greatest(p_limit, 1), 100)
  ),
  claimed as (
    update public.event_participation_notification_outbox as outbox
    set
      status = 'processing',
      attempts = outbox.attempts + 1,
      locked_at = now(),
      last_error = null
    from candidates
    where outbox.id = candidates.id
    returning
      outbox.id,
      outbox.guild_id,
      outbox.event_id,
      outbox.closeout_id,
      outbox.entry_id,
      outbox.discord_id,
      outbox.payload,
      outbox.attempts
  )
  select * from claimed;
$$;

revoke all on function public.claim_event_participation_notification_outbox(
  integer, uuid, integer
) from public, anon, authenticated;
grant execute on function public.claim_event_participation_notification_outbox(
  integer, uuid, integer
) to service_role;
