-- 347: Automatic event participation closeout after an exception-review grace period.
--
-- The assigned slot roster remains the only automatic source of truth. The
-- automation never infers attendance from battle activity, never adds an
-- activity-only member, and never awards participation points by itself.

alter table public.events
  add column if not exists participation_auto_closeout_enabled boolean not null default false,
  add column if not exists participation_auto_closeout_review_started_at timestamptz,
  add column if not exists participation_auto_closeout_paused_at timestamptz,
  add column if not exists participation_auto_closeout_notice_sent_at timestamptz;

-- New events opt in without requiring tenant-specific setup. Existing events
-- stay disabled until the bounded rollout migration explicitly selects them.
alter table public.events
  alter column participation_auto_closeout_enabled set default true;

alter table public.events
  drop constraint if exists events_participation_auto_closeout_state_check;
alter table public.events
  add constraint events_participation_auto_closeout_state_check
  check (
    (
      participation_auto_closeout_enabled
      and (
        participation_auto_closeout_review_started_at is null
        or battle_started_at is not null
      )
    )
    or (
      not participation_auto_closeout_enabled
      and participation_auto_closeout_review_started_at is null
      and participation_auto_closeout_paused_at is null
      and participation_auto_closeout_notice_sent_at is null
    )
  ) not valid;
alter table public.events
  validate constraint events_participation_auto_closeout_state_check;

create or replace function public.prepare_event_participation_auto_closeout()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not new.participation_auto_closeout_enabled then
    new.participation_auto_closeout_review_started_at := null;
    new.participation_auto_closeout_paused_at := null;
    new.participation_auto_closeout_notice_sent_at := null;
    return new;
  end if;

  if new.battle_started_at is not null
     and new.participation_auto_closeout_review_started_at is null then
    new.participation_auto_closeout_review_started_at :=
      new.battle_started_at + interval '1 hour';
  end if;

  return new;
end;
$$;

drop trigger if exists prepare_event_participation_auto_closeout_on_insert
  on public.events;
create trigger prepare_event_participation_auto_closeout_on_insert
  before insert on public.events
  for each row
  execute function public.prepare_event_participation_auto_closeout();

drop trigger if exists prepare_event_participation_auto_closeout_on_update
  on public.events;
create trigger prepare_event_participation_auto_closeout_on_update
  before update of
    battle_started_at,
    participation_auto_closeout_enabled,
    participation_auto_closeout_review_started_at,
    participation_auto_closeout_paused_at,
    participation_auto_closeout_notice_sent_at
  on public.events
  for each row
  execute function public.prepare_event_participation_auto_closeout();

revoke all on function public.prepare_event_participation_auto_closeout()
  from public, anon, authenticated, service_role;

create or replace function public.set_event_participation_auto_closeout_paused(
  p_guild_id uuid,
  p_event_id uuid,
  p_paused boolean,
  p_actor_id text,
  p_actor_username text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_event public.events%rowtype;
  v_paused_at timestamptz;
begin
  if p_guild_id is null
     or p_event_id is null
     or p_paused is null
     or nullif(btrim(p_actor_id), '') is null
     or char_length(p_actor_id) > 128
     or nullif(btrim(p_actor_username), '') is null
     or char_length(p_actor_username) > 128 then
    raise exception 'event_participation_auto_closeout_input_invalid';
  end if;

  select event.*
    into v_event
  from public.events as event
  where event.guild_id = p_guild_id
    and event.id = p_event_id
  for update of event;

  if not found then
    raise exception 'event_not_found';
  end if;
  if not v_event.participation_auto_closeout_enabled
     or v_event.participation_auto_closeout_review_started_at is null then
    raise exception 'event_participation_auto_closeout_not_enabled';
  end if;
  if exists (
    select 1
    from public.event_participation_closeouts as closeout
    where closeout.guild_id = p_guild_id
      and closeout.event_id = p_event_id
  ) then
    raise exception 'event_participation_closeout_already_finalized';
  end if;

  v_paused_at := case when p_paused then clock_timestamp() else null end;
  update public.events
  set participation_auto_closeout_paused_at = v_paused_at
  where guild_id = p_guild_id
    and id = p_event_id;

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
    btrim(p_actor_id),
    case
      when p_paused then 'event.participation.auto_closeout.pause'
      else 'event.participation.auto_closeout.resume'
    end,
    p_event_id::text,
    'event',
    jsonb_build_object(
      'actorUsername', btrim(p_actor_username),
      'reviewStartedAt', v_event.participation_auto_closeout_review_started_at,
      'dueAt', v_event.participation_auto_closeout_review_started_at + interval '6 hours'
    )
  );

  return jsonb_build_object(
    'eventId', p_event_id,
    'paused', p_paused,
    'pausedAt', v_paused_at,
    'dueAt', v_event.participation_auto_closeout_review_started_at + interval '6 hours'
  );
end;
$$;

revoke all on function public.set_event_participation_auto_closeout_paused(
  uuid, uuid, boolean, text, text
) from public, anon, authenticated;
grant execute on function public.set_event_participation_auto_closeout_paused(
  uuid, uuid, boolean, text, text
) to service_role;

create or replace function public.finalize_due_event_participation_closeouts(
  p_limit integer default 25
)
returns table (
  guild_id uuid,
  event_id uuid,
  closeout_id uuid,
  outcome text,
  error_message text
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_event record;
  v_entries jsonb;
  v_result jsonb;
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'event_participation_auto_closeout_limit_invalid';
  end if;

  for v_event in
    select event.guild_id, event.id
    from public.events as event
    where event.status = 'published'
      and event.participation_closeout_required is true
      and event.participation_auto_closeout_enabled is true
      and event.participation_auto_closeout_review_started_at
        <= clock_timestamp() - interval '6 hours'
      and event.participation_auto_closeout_paused_at is null
      and not exists (
        select 1
        from public.event_participation_closeouts as closeout
        where closeout.guild_id = event.guild_id
          and closeout.event_id = event.id
      )
      and not exists (
        select 1
        from public.event_payout_requests as request
        where request.guild_id = event.guild_id
          and request.event_id = event.id
          and request.status in ('pending', 'approved')
      )
    order by event.participation_auto_closeout_review_started_at, event.id
    for update of event skip locked
    limit p_limit
  loop
    begin
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'discordId', candidate.discord_id,
            'username', candidate.username,
            'source', 'slot',
            'included', true,
            'roleNames', '[]'::jsonb,
            'evidenceStatus', 'not_checked',
            'activityBattleCount', 0,
            'note', null
          )
          order by candidate.discord_id
        ),
        '[]'::jsonb
      )
      into v_entries
      from (
        select
          btrim(slot.assigned_discord_id) as discord_id,
          coalesce(
            max(nullif(btrim(slot.assigned_username), '')),
            btrim(slot.assigned_discord_id)
          ) as username
        from public.slots as slot
        join public.parties as party
          on party.guild_id = slot.guild_id
         and party.id = slot.party_id
        where party.guild_id = v_event.guild_id
          and party.event_id = v_event.id
          and nullif(btrim(slot.assigned_discord_id), '') is not null
        group by btrim(slot.assigned_discord_id)
      ) as candidate;

      v_result := public.finalize_event_participation_closeout(
        v_event.guild_id,
        v_event.id,
        v_event.id,
        0,
        'Automatically finalized after the 6-hour exception review period.',
        v_entries,
        'system:auto-closeout',
        'System · Auto closeout'
      );

      return query
      select
        v_event.guild_id,
        v_event.id,
        (v_result ->> 'closeoutId')::uuid,
        'finalized'::text,
        null::text;
    exception when others then
      return query
      select
        v_event.guild_id,
        v_event.id,
        null::uuid,
        'failed'::text,
        left(sqlerrm, 1000);
    end;
  end loop;
end;
$$;

revoke all on function public.finalize_due_event_participation_closeouts(integer)
  from public, anon, authenticated;
grant execute on function public.finalize_due_event_participation_closeouts(integer)
  to service_role;

comment on function public.finalize_due_event_participation_closeouts(integer) is
  'Finalizes due event participation from the exact assigned-slot roster with zero reward; service-role only.';
