-- 345: Accept event regear claims before participation closeout, but keep every
-- payout/fulfillment path blocked until the requester is confirmed.
--
-- Participation closeout is a financial command: it freezes the roster, pays
-- attendance points, writes audit rows, and queues DMs. Requiring that command
-- before a member can even file regear made the intake disappear after an
-- event. This migration separates the two state machines:
--   regear_requests.status                  = review/fulfillment lifecycle
--   participant_confirmation_status        = actual-participant lifecycle

alter table public.regear_requests
  add column if not exists participant_confirmation_status text
  not null default 'not_required';

alter table public.regear_requests
  drop constraint if exists regear_requests_participant_confirmation_status_chk;

alter table public.regear_requests
  add constraint regear_requests_participant_confirmation_status_chk
  check (
    participant_confirmation_status in (
      'not_required',
      'awaiting_closeout',
      'confirmed',
      'excluded'
    )
  ) not valid;

alter table public.regear_requests
  validate constraint regear_requests_participant_confirmation_status_chk;

alter table public.regear_requests
  drop constraint if exists regear_requests_approval_participant_confirmation_chk;

alter table public.regear_requests
  add constraint regear_requests_approval_participant_confirmation_chk
  check (
    status <> 'approved'
    or participant_confirmation_status in ('not_required', 'confirmed')
  ) not valid;

alter table public.regear_requests
  validate constraint regear_requests_approval_participant_confirmation_chk;

comment on column public.regear_requests.participant_confirmation_status is
  'Orthogonal actual-participant gate. awaiting_closeout claims may be reviewed but cannot be approved or fulfilled until closeout confirms the requester.';

comment on column public.events.participation_closeout_required is
  'True for events using immutable participant closeout. Snapshotted members may file provisional regear before closeout, but approval requires an included closeout entry.';

-- Add a structured reason for closeout-driven rejection. Keep the historical
-- generated constraint name and the newer explicit name both safe to rerun.
alter table public.regear_requests
  drop constraint if exists regear_requests_reject_reason_code_check;
alter table public.regear_requests
  drop constraint if exists regear_requests_reject_reason_code_chk;

alter table public.regear_requests
  add constraint regear_requests_reject_reason_code_chk
  check (
    reject_reason_code is null
    or reject_reason_code in (
      'killboard_mismatch',
      'out_of_window',
      'screenshot_invalid',
      'price_inflated',
      'duplicate_request',
      'not_eligible_event',
      'not_actual_participant',
      'insufficient_evidence',
      'other'
    )
  ) not valid;

alter table public.regear_requests
  validate constraint regear_requests_reject_reason_code_chk;

create or replace function public.guard_event_regear_actual_participant()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_closeout_required boolean;
  v_guest_regear_enabled boolean;
  v_is_guest_application boolean;
  v_closeout_finalized boolean := false;
  v_participant_confirmed boolean := false;
  v_snapshot_matches boolean := false;
begin
  if new.event_id is null then
    new.participant_confirmation_status := 'not_required';
    return new;
  end if;

  select
    event.participation_closeout_required,
    event.guest_regear_enabled
  into
    v_closeout_required,
    v_guest_regear_enabled
  from public.events as event
  where event.guild_id = new.guild_id
    and event.id = new.event_id;

  if not found then
    return new;
  end if;

  if v_closeout_required then
    select exists (
      select 1
      from public.event_participation_closeouts as closeout
      where closeout.guild_id = new.guild_id
        and closeout.event_id = new.event_id
    ) into v_closeout_finalized;

    select exists (
      select 1
      from public.event_participation_closeout_entries as entry
      where entry.guild_id = new.guild_id
        and entry.event_id = new.event_id
        and entry.discord_id = new.discord_id
        and entry.decision = 'included'
    ) into v_participant_confirmed;

    if v_participant_confirmed then
      new.participant_confirmation_status := 'confirmed';
    elsif v_closeout_finalized then
      raise exception 'event_actual_participant_required';
    elsif new.auto_generated is true then
      -- Automatic regear remains deferred until the immutable participant
      -- roster is finalized. Only member-authored intake becomes provisional.
      raise exception 'event_actual_participant_required';
    else
      select exists (
        select 1
        from public.event_regear_policy_snapshots as snapshot
        where snapshot.guild_id = new.guild_id
          and snapshot.event_id = new.event_id
          and snapshot.discord_id = new.discord_id
          and snapshot.id = new.event_regear_policy_snapshot_id
      ) into v_snapshot_matches;

      if not v_snapshot_matches then
        raise exception 'event_regear_policy_snapshot_required';
      end if;
      new.participant_confirmation_status := 'awaiting_closeout';
    end if;
  else
    new.participant_confirmation_status := 'not_required';
  end if;

  select exists (
    select 1
    from public.event_guest_applications as application
    where application.guild_id = new.guild_id
      and application.event_id = new.event_id
      and application.guest_id = new.discord_id
      and application.status = 'assigned'
  ) into v_is_guest_application;

  if v_is_guest_application then
    if not v_guest_regear_enabled then
      raise exception 'event_guest_regear_disabled';
    end if;
    if new.auto_generated is true then
      raise exception 'event_guest_auto_regear_forbidden';
    end if;
    if new.request_type is distinct from 'death' then
      raise exception 'event_guest_regear_death_only';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.guard_event_regear_actual_participant() is
  'Trigger-only event regear gate. Member-authored snapshotted claims may wait for closeout; finalized exclusions and guest policy violations remain blocked.';

-- Trigger functions are implementation details. CREATE OR REPLACE preserves
-- the previous ACL, and this explicit revoke keeps fresh installations safe.
revoke all on function public.guard_event_regear_actual_participant()
  from public, anon, authenticated, service_role;

create or replace function public.guard_regear_participant_confirmation_on_approval()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'approved'
     and new.status is distinct from old.status
     and new.participant_confirmation_status not in ('not_required', 'confirmed') then
    raise exception 'REGEAR_PARTICIPANT_CONFIRMATION_PENDING';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_regear_participant_confirmation_on_approval
  on public.regear_requests;
create trigger guard_regear_participant_confirmation_on_approval
  before update of status
  on public.regear_requests
  for each row
  execute function public.guard_regear_participant_confirmation_on_approval();

revoke all on function public.guard_regear_participant_confirmation_on_approval()
  from public, anon, authenticated, service_role;

comment on function public.guard_regear_participant_confirmation_on_approval() is
  'Trigger-only final payout/fulfillment guard shared by silver, crafted, stocked, and future approval paths.';

-- The closeout RPC inserts one immutable entry per candidate. Reconcile any
-- provisional regear in the same transaction without redefining the large
-- financial RPC or weakening its idempotency and tenant checks.
create or replace function public.reconcile_event_regear_from_closeout_entry()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_finalized_by text;
  v_finalized_by_username text;
begin
  if new.decision = 'included' then
    update public.regear_requests as request
       set participant_confirmation_status = 'confirmed'
     where request.guild_id = new.guild_id
       and request.event_id = new.event_id
       and request.discord_id = new.discord_id
       and request.participant_confirmation_status = 'awaiting_closeout';
    return new;
  end if;

  select closeout.finalized_by, closeout.finalized_by_username
    into v_finalized_by, v_finalized_by_username
  from public.event_participation_closeouts as closeout
  where closeout.guild_id = new.guild_id
    and closeout.id = new.closeout_id;

  update public.regear_requests as request
     set participant_confirmation_status = 'excluded',
         status = case when request.status = 'pending' then 'rejected' else request.status end,
         resolved_at = case when request.status = 'pending' then now() else request.resolved_at end,
         reject_reason_code = case
           when request.status = 'pending' then 'not_actual_participant'
           else request.reject_reason_code
         end,
         handled_by = case
           when request.status = 'pending' then v_finalized_by
           else request.handled_by
         end,
         handled_by_username = case
           when request.status = 'pending' then v_finalized_by_username
           else request.handled_by_username
         end
   where request.guild_id = new.guild_id
     and request.event_id = new.event_id
     and request.discord_id = new.discord_id
     and request.participant_confirmation_status = 'awaiting_closeout';

  return new;
end;
$$;

drop trigger if exists reconcile_event_regear_from_closeout_entry
  on public.event_participation_closeout_entries;
create trigger reconcile_event_regear_from_closeout_entry
  after insert
  on public.event_participation_closeout_entries
  for each row
  execute function public.reconcile_event_regear_from_closeout_entry();

revoke all on function public.reconcile_event_regear_from_closeout_entry()
  from public, anon, authenticated, service_role;

comment on function public.reconcile_event_regear_from_closeout_entry() is
  'Trigger-only closeout projection. Included members become approvable; excluded members have provisional pending claims rejected atomically.';
