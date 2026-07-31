-- 335: Product-intent finance workflows.
--
-- 1. Point -> silver exchange requests reserve points at submission. Operators
--    only confirm the in-game payout; reject/cancel releases the reservation.
--    The hold lives on exchange_requests instead of point_escrows because the
--    guild recovery contract intentionally treats every point_escrow as a
--    member-trade obligation.
-- 2. Imported guild treasury deposits are raw evidence of depositor, amount,
--    and time only. A trusted member allocates purpose; exact-name allocation
--    to point top-up credits automatically, leaving only exceptions for admins.
-- 3. Rare special rewards use a dedicated batch root, one amount for every
--    recipient, an idempotency key, and a strong server-side confirmation.
--
-- Existing ownership/read paths remain Discord-based in this release.

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- Exchange point holds
-- ---------------------------------------------------------------------------

alter table public.exchange_requests
  add column if not exists held_points integer not null default 0,
  add column if not exists hold_status text not null default 'legacy_unheld',
  add column if not exists held_at timestamptz,
  add column if not exists hold_resolved_at timestamptz;

alter table public.exchange_requests
  drop constraint if exists exchange_requests_held_points_check;
alter table public.exchange_requests
  add constraint exchange_requests_held_points_check
    check (held_points >= 0 and held_points <= silver);

alter table public.exchange_requests
  drop constraint if exists exchange_requests_hold_status_check;
alter table public.exchange_requests
  add constraint exchange_requests_hold_status_check
    check (hold_status in ('legacy_unheld', 'held', 'consumed', 'released'));

alter table public.exchange_requests
  drop constraint if exists exchange_requests_status_check;
alter table public.exchange_requests
  add constraint exchange_requests_status_check
    check (status in ('pending', 'approved', 'rejected', 'cancelled'));

create index if not exists exchange_requests_active_holds_idx
  on public.exchange_requests (guild_id, discord_id, created_at desc)
  where status = 'pending' and hold_status = 'held' and held_points > 0;

comment on column public.exchange_requests.held_points is
  'Points reserved while a point-to-silver request awaits the in-game payout.';
comment on column public.exchange_requests.hold_status is
  'legacy_unheld is pre-335 compatibility; new requests are held, then consumed or released.';

-- Backfill only when the full amount is currently spendable. Ambiguous or
-- underfunded legacy pending requests stay legacy_unheld for explicit handling;
-- no partial reservation is created.
do $$
declare
  v_request record;
  v_spendable bigint;
begin
  for v_request in
    select request.id, request.guild_id, request.discord_id, request.silver
      from public.exchange_requests as request
     where request.status = 'pending'
       and request.hold_status = 'legacy_unheld'
       and request.held_points = 0
     order by request.guild_id, request.discord_id, request.created_at, request.id
     for update
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(v_request.guild_id::text || ':' || v_request.discord_id, 0)
    );

    select coalesce(sum(ledger.delta), 0)::bigint
      - coalesce((
          select sum(escrow.amount)::bigint
            from public.point_escrows as escrow
           where escrow.guild_id = v_request.guild_id
             and escrow.discord_id = v_request.discord_id
             and escrow.status = 'held'
        ), 0)
      - coalesce((
          select sum(other.held_points)::bigint
            from public.exchange_requests as other
           where other.guild_id = v_request.guild_id
             and other.discord_id = v_request.discord_id
             and other.status = 'pending'
             and other.hold_status = 'held'
             and other.id <> v_request.id
        ), 0)
      into v_spendable
      from public.point_ledger as ledger
     where ledger.guild_id = v_request.guild_id
       and ledger.discord_id = v_request.discord_id;

    if greatest(0, coalesce(v_spendable, 0)) >= v_request.silver then
      update public.exchange_requests
         set held_points = silver,
             hold_status = 'held',
             held_at = coalesce(held_at, now())
       where id = v_request.id
         and guild_id = v_request.guild_id;
    end if;
  end loop;
end;
$$;

create or replace function public.member_spendable_point_balance(
  p_guild_id uuid,
  p_discord_id text
) returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    0,
    least(
      2147483647::bigint,
      coalesce((
        select sum(ledger.delta)::bigint
          from public.point_ledger as ledger
         where ledger.guild_id = p_guild_id
           and ledger.discord_id = p_discord_id
      ), 0)
      - coalesce((
        select sum(escrow.amount)::bigint
          from public.point_escrows as escrow
         where escrow.guild_id = p_guild_id
           and escrow.discord_id = p_discord_id
           and escrow.status = 'held'
      ), 0)
      - coalesce((
        select sum(request.held_points)::bigint
          from public.exchange_requests as request
         where request.guild_id = p_guild_id
           and request.discord_id = p_discord_id
           and request.status = 'pending'
           and request.hold_status = 'held'
      ), 0)
    )
  )::integer;
$$;

revoke all on function public.member_spendable_point_balance(uuid, text) from public;
revoke all on function public.member_spendable_point_balance(uuid, text) from anon, authenticated;
grant execute on function public.member_spendable_point_balance(uuid, text) to service_role;

create or replace function public.submit_exchange_request(
  p_guild_id uuid,
  p_discord_id text,
  p_username text,
  p_silver integer
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_spendable integer;
begin
  if p_guild_id is null
     or nullif(btrim(coalesce(p_discord_id, '')), '') is null
     or nullif(btrim(coalesce(p_username, '')), '') is null then
    raise exception 'EXCHANGE_ACTOR_REQUIRED' using errcode = '22023';
  end if;
  if p_silver is null or p_silver <= 0 then
    raise exception 'INVALID_AMOUNT' using errcode = '22023';
  end if;
  if char_length(p_username) > 100 then
    raise exception 'EXCHANGE_USERNAME_TOO_LONG' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_guild_id::text || ':' || p_discord_id, 0)
  );

  if not exists (
    select 1
      from public.guild_avatars as avatar
     where avatar.guild_id = p_guild_id
       and avatar.discord_id = p_discord_id
       and avatar.withdrawn_at is null
  ) then
    raise exception 'MEMBER_NOT_FOUND';
  end if;

  if exists (
    select 1
      from public.exchange_requests as request
     where request.guild_id = p_guild_id
       and request.discord_id = p_discord_id
       and request.status = 'pending'
  ) then
    raise exception 'PENDING_EXCHANGE_EXISTS';
  end if;

  v_spendable := public.member_spendable_point_balance(p_guild_id, p_discord_id);
  if v_spendable < p_silver then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  insert into public.exchange_requests (
    guild_id,
    discord_id,
    username,
    silver,
    held_points,
    hold_status,
    held_at
  ) values (
    p_guild_id,
    p_discord_id,
    btrim(p_username),
    p_silver,
    p_silver,
    'held',
    now()
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.update_exchange_request_hold(
  p_id uuid,
  p_guild_id uuid,
  p_discord_id text,
  p_silver integer
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.exchange_requests%rowtype;
  v_available bigint;
begin
  if p_silver is null or p_silver <= 0 then
    raise exception 'INVALID_AMOUNT' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_guild_id::text || ':' || p_discord_id, 0)
  );

  select *
    into v_request
    from public.exchange_requests as request
   where request.id = p_id
     and request.guild_id = p_guild_id
     and request.discord_id = p_discord_id
     and request.status = 'pending'
   for update;

  if not found then
    raise exception 'EXCHANGE_NOT_PENDING';
  end if;

  v_available := public.member_spendable_point_balance(p_guild_id, p_discord_id)
    + case when v_request.hold_status = 'held' then v_request.held_points else 0 end;
  if v_available < p_silver then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  update public.exchange_requests
     set silver = p_silver,
         held_points = p_silver,
         hold_status = 'held',
         held_at = coalesce(held_at, now()),
         hold_resolved_at = null
   where id = p_id
     and guild_id = p_guild_id;
end;
$$;

create or replace function public.cancel_exchange_request(
  p_id uuid,
  p_guild_id uuid,
  p_discord_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(
    hashtextextended(p_guild_id::text || ':' || p_discord_id, 0)
  );

  update public.exchange_requests
     set status = 'cancelled',
         resolved_at = now(),
         held_points = 0,
         hold_status = 'released',
         hold_resolved_at = now()
   where id = p_id
     and guild_id = p_guild_id
     and discord_id = p_discord_id
     and status = 'pending';

  if not found then
    raise exception 'EXCHANGE_NOT_PENDING';
  end if;
end;
$$;

create or replace function public.approve_exchange_request(
  p_id uuid,
  p_admin_id text,
  p_admin_username text,
  p_guild_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.exchange_requests%rowtype;
  v_discord_id text;
  v_balance bigint;
  v_spendable integer;
begin
  select request.discord_id
    into v_discord_id
    from public.exchange_requests as request
   where request.id = p_id
     and request.guild_id = p_guild_id
     and request.status = 'pending';

  if not found then
    raise exception 'EXCHANGE_NOT_PENDING';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_guild_id::text || ':' || v_discord_id, 0)
  );

  select *
    into v_request
    from public.exchange_requests as request
   where request.id = p_id
     and request.guild_id = p_guild_id
     and request.status = 'pending'
   for update;

  if not found then
    raise exception 'EXCHANGE_NOT_PENDING';
  end if;

  select coalesce(sum(ledger.delta), 0)::bigint
    into v_balance
    from public.point_ledger as ledger
   where ledger.guild_id = p_guild_id
     and ledger.discord_id = v_request.discord_id;

  if v_request.hold_status = 'held'
     and v_request.held_points = v_request.silver then
    if v_balance < v_request.silver then
      raise exception 'INSUFFICIENT_BALANCE';
    end if;
  else
    -- Compatibility for pre-335 pending requests that could not be safely
    -- backfilled. New requests never enter this branch.
    v_spendable := public.member_spendable_point_balance(
      p_guild_id,
      v_request.discord_id
    );
    if v_spendable < v_request.silver then
      raise exception 'INSUFFICIENT_BALANCE';
    end if;
  end if;

  update public.exchange_requests
     set status = 'approved',
         resolved_at = now(),
         handled_by = p_admin_id,
         handled_by_username = p_admin_username,
         held_points = 0,
         hold_status = 'consumed',
         hold_resolved_at = now()
   where id = p_id
     and guild_id = p_guild_id;

  insert into public.point_ledger (
    guild_id,
    discord_id,
    delta,
    reason,
    ref_id,
    handled_by,
    handled_by_username
  ) values (
    p_guild_id,
    v_request.discord_id,
    -v_request.silver,
    'exchange_paid',
    p_id,
    p_admin_id,
    p_admin_username
  );
end;
$$;

create or replace function public.reject_exchange_request(
  p_id uuid,
  p_notes text,
  p_admin_id text,
  p_admin_username text,
  p_guild_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_discord_id text;
begin
  select request.discord_id
    into v_discord_id
    from public.exchange_requests as request
   where request.id = p_id
     and request.guild_id = p_guild_id
     and request.status = 'pending';

  if not found then
    raise exception 'EXCHANGE_NOT_PENDING';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_guild_id::text || ':' || v_discord_id, 0)
  );

  update public.exchange_requests
     set status = 'rejected',
         resolved_at = now(),
         admin_notes = nullif(btrim(coalesce(p_notes, '')), ''),
         handled_by = p_admin_id,
         handled_by_username = p_admin_username,
         held_points = 0,
         hold_status = 'released',
         hold_resolved_at = now()
   where id = p_id
     and guild_id = p_guild_id
     and status = 'pending';

  if not found then
    raise exception 'EXCHANGE_NOT_PENDING';
  end if;
end;
$$;

revoke all on function public.submit_exchange_request(uuid, text, text, integer) from public;
revoke all on function public.submit_exchange_request(uuid, text, text, integer) from anon, authenticated;
grant execute on function public.submit_exchange_request(uuid, text, text, integer) to service_role;

revoke all on function public.update_exchange_request_hold(uuid, uuid, text, integer) from public;
revoke all on function public.update_exchange_request_hold(uuid, uuid, text, integer) from anon, authenticated;
grant execute on function public.update_exchange_request_hold(uuid, uuid, text, integer) to service_role;

revoke all on function public.cancel_exchange_request(uuid, uuid, text) from public;
revoke all on function public.cancel_exchange_request(uuid, uuid, text) from anon, authenticated;
grant execute on function public.cancel_exchange_request(uuid, uuid, text) to service_role;

revoke all on function public.approve_exchange_request(uuid, text, text, uuid) from public;
revoke all on function public.approve_exchange_request(uuid, text, text, uuid) from anon, authenticated;
grant execute on function public.approve_exchange_request(uuid, text, text, uuid) to service_role;

revoke all on function public.reject_exchange_request(uuid, text, text, text, uuid) from public;
revoke all on function public.reject_exchange_request(uuid, text, text, text, uuid) from anon, authenticated;
grant execute on function public.reject_exchange_request(uuid, text, text, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Raw treasury deposits and member purpose allocation
-- ---------------------------------------------------------------------------

create table if not exists public.guild_treasury_deposits (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  deposited_at timestamptz not null,
  depositor_name text not null
    check (char_length(btrim(depositor_name)) between 2 and 64),
  amount_silver integer not null check (amount_silver > 0),
  source_fingerprint text not null
    check (source_fingerprint ~ '^[a-f0-9]{64}$'),
  status text not null default 'unallocated'
    check (status in ('unallocated', 'allocated', 'exception')),
  imported_by text not null,
  imported_at timestamptz not null default now(),
  allocated_at timestamptz,
  unique (guild_id, source_fingerprint),
  unique (guild_id, id)
);

create index if not exists guild_treasury_deposits_unallocated_idx
  on public.guild_treasury_deposits (guild_id, depositor_name, deposited_at desc)
  where status = 'unallocated';

create table if not exists public.treasury_deposit_allocations (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  deposit_id uuid not null,
  discord_id text not null,
  guild_member_id uuid,
  purpose text not null
    check (purpose in ('point_top_up', 'guild_donation', 'other')),
  purpose_note text,
  status text not null
    check (status in ('auto_credited', 'recorded', 'exception')),
  idempotency_key uuid not null,
  allocated_at timestamptz not null default now(),
  point_ledger_id uuid references public.point_ledger(id) on delete restrict,
  unique (guild_id, deposit_id),
  unique (guild_id, discord_id, idempotency_key),
  foreign key (guild_id, deposit_id)
    references public.guild_treasury_deposits(guild_id, id) on delete restrict,
  foreign key (guild_id, guild_member_id)
    references public.guild_member_records(guild_id, id) on delete set null
);

create index if not exists treasury_deposit_allocations_member_idx
  on public.treasury_deposit_allocations (guild_id, discord_id, allocated_at desc);

alter table public.guild_treasury_deposits enable row level security;
alter table public.treasury_deposit_allocations enable row level security;

revoke all on public.guild_treasury_deposits from public, anon, authenticated;
revoke all on public.treasury_deposit_allocations from public, anon, authenticated;
revoke all on public.guild_treasury_deposits from service_role;
revoke all on public.treasury_deposit_allocations from service_role;
grant select, insert, update on public.guild_treasury_deposits to service_role;
grant select, insert, update on public.treasury_deposit_allocations to service_role;

create or replace function public.allocate_treasury_deposit(
  p_guild_id uuid,
  p_deposit_id uuid,
  p_discord_id text,
  p_expected_depositor_name text,
  p_purpose text,
  p_purpose_note text,
  p_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deposit public.guild_treasury_deposits%rowtype;
  v_existing public.treasury_deposit_allocations%rowtype;
  v_allocation_id uuid;
  v_ledger_id uuid;
  v_member_id uuid;
  v_status text;
begin
  if p_idempotency_key is null
     or p_guild_id is null
     or p_deposit_id is null
     or nullif(btrim(coalesce(p_discord_id, '')), '') is null
     or nullif(btrim(coalesce(p_expected_depositor_name, '')), '') is null then
    raise exception 'TREASURY_ALLOCATION_INPUT_REQUIRED' using errcode = '22023';
  end if;
  if p_purpose not in ('point_top_up', 'guild_donation', 'other') then
    raise exception 'TREASURY_PURPOSE_INVALID' using errcode = '22023';
  end if;
  if char_length(coalesce(p_purpose_note, '')) > 300 then
    raise exception 'TREASURY_PURPOSE_NOTE_TOO_LONG' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_guild_id::text || ':treasury:' || p_idempotency_key::text, 0)
  );

  select *
    into v_existing
    from public.treasury_deposit_allocations as allocation
   where allocation.guild_id = p_guild_id
     and allocation.discord_id = p_discord_id
     and allocation.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.deposit_id <> p_deposit_id
       or v_existing.purpose <> p_purpose
       or coalesce(v_existing.purpose_note, '')
          <> btrim(coalesce(p_purpose_note, '')) then
      raise exception 'TREASURY_ALLOCATION_IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object(
      'allocationId', v_existing.id,
      'status', v_existing.status,
      'amountSilver', (
        select deposit.amount_silver
          from public.guild_treasury_deposits as deposit
         where deposit.guild_id = p_guild_id
           and deposit.id = v_existing.deposit_id
      )
    );
  end if;

  select *
    into v_deposit
    from public.guild_treasury_deposits as deposit
   where deposit.guild_id = p_guild_id
     and deposit.id = p_deposit_id
   for update;
  if not found then
    raise exception 'TREASURY_DEPOSIT_NOT_FOUND';
  end if;
  if v_deposit.status <> 'unallocated' then
    raise exception 'TREASURY_DEPOSIT_ALREADY_ALLOCATED';
  end if;
  if lower(btrim(v_deposit.depositor_name))
     <> lower(btrim(p_expected_depositor_name)) then
    raise exception 'TREASURY_DEPOSITOR_MISMATCH';
  end if;

  select identity.guild_member_id
    into v_member_id
    from public.guild_member_access_identities as identity
   where identity.guild_id = p_guild_id
     and identity.identity_type = 'discord'
     and identity.subject_id = p_discord_id
     and identity.revoked_at is null
   limit 1;

  v_allocation_id := gen_random_uuid();
  v_status := case when p_purpose = 'point_top_up' then 'auto_credited' else 'recorded' end;

  if p_purpose = 'point_top_up' then
    insert into public.point_ledger (
      guild_id,
      discord_id,
      delta,
      reason,
      ref_id,
      memo
    ) values (
      p_guild_id,
      p_discord_id,
      v_deposit.amount_silver,
      'donation_approved',
      v_allocation_id,
      nullif(btrim(coalesce(p_purpose_note, '')), '')
    )
    returning id into v_ledger_id;
  end if;

  insert into public.treasury_deposit_allocations (
    id,
    guild_id,
    deposit_id,
    discord_id,
    guild_member_id,
    purpose,
    purpose_note,
    status,
    idempotency_key,
    point_ledger_id
  ) values (
    v_allocation_id,
    p_guild_id,
    p_deposit_id,
    p_discord_id,
    v_member_id,
    p_purpose,
    nullif(btrim(coalesce(p_purpose_note, '')), ''),
    v_status,
    p_idempotency_key,
    v_ledger_id
  );

  update public.guild_treasury_deposits
     set status = 'allocated',
         allocated_at = now()
   where guild_id = p_guild_id
     and id = p_deposit_id;

  return jsonb_build_object(
    'allocationId', v_allocation_id,
    'status', v_status,
    'amountSilver', v_deposit.amount_silver
  );
end;
$$;

revoke all on function public.allocate_treasury_deposit(uuid, uuid, text, text, text, text, uuid) from public;
revoke all on function public.allocate_treasury_deposit(uuid, uuid, text, text, text, text, uuid) from anon, authenticated;
grant execute on function public.allocate_treasury_deposit(uuid, uuid, text, text, text, text, uuid) to service_role;

comment on table public.guild_treasury_deposits is
  'Raw guild treasury evidence. It proves depositor, amount, and time, but not purpose.';
comment on table public.treasury_deposit_allocations is
  'Member-authored purpose allocation. Exact trusted-name point top-ups credit automatically.';

-- ---------------------------------------------------------------------------
-- Rare special reward grants and dedicated capability bit 37
-- ---------------------------------------------------------------------------

alter table public.point_ledger
  drop constraint if exists point_ledger_reason_check;
alter table public.point_ledger
  add constraint point_ledger_reason_check
  check (reason in (
    'regear_approved',
    'exchange_paid',
    'admin_adjust',
    'transfer_in',
    'transfer_out',
    'donation_approved',
    'event_payout_approved',
    'craft_reimbursement',
    'craft_order_payout',
    'shop_purchase',
    'member_trade_purchase',
    'member_trade_sale',
    'special_reward'
  ));

create table if not exists public.special_reward_grants (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  amount_per_member integer not null check (amount_per_member > 0),
  recipient_count integer not null check (recipient_count > 0),
  total_points bigint not null check (total_points > 0),
  memo text not null check (char_length(btrim(memo)) between 1 and 300),
  idempotency_key uuid not null,
  granted_by text not null,
  granted_by_username text,
  granted_at timestamptz not null default now(),
  unique (guild_id, idempotency_key),
  unique (guild_id, id)
);

create table if not exists public.special_reward_grant_members (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  grant_id uuid not null,
  discord_id text not null,
  guild_member_id uuid,
  point_ledger_id uuid not null references public.point_ledger(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (guild_id, grant_id, discord_id),
  foreign key (guild_id, grant_id)
    references public.special_reward_grants(guild_id, id) on delete restrict,
  foreign key (guild_id, guild_member_id)
    references public.guild_member_records(guild_id, id) on delete set null
);

create index if not exists special_reward_grants_guild_idx
  on public.special_reward_grants (guild_id, granted_at desc);
create index if not exists special_reward_grant_members_member_idx
  on public.special_reward_grant_members (guild_id, discord_id, created_at desc);

alter table public.special_reward_grants enable row level security;
alter table public.special_reward_grant_members enable row level security;
revoke all on public.special_reward_grants from public, anon, authenticated;
revoke all on public.special_reward_grant_members from public, anon, authenticated;
revoke all on public.special_reward_grants from service_role;
revoke all on public.special_reward_grant_members from service_role;
grant select, insert on public.special_reward_grants to service_role;
grant select, insert on public.special_reward_grant_members to service_role;

create or replace function public.grant_special_reward(
  p_guild_id uuid,
  p_discord_ids text[],
  p_amount_per_member integer,
  p_memo text,
  p_actor_discord_id text,
  p_actor_username text,
  p_idempotency_key uuid,
  p_confirmation text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grant public.special_reward_grants%rowtype;
  v_recipient text;
  v_ledger_id uuid;
  v_member_id uuid;
  v_count integer;
  v_valid_count integer;
  v_total bigint;
begin
  if p_guild_id is null
     or p_idempotency_key is null
     or nullif(btrim(coalesce(p_actor_discord_id, '')), '') is null then
    raise exception 'SPECIAL_REWARD_ACTOR_REQUIRED' using errcode = '22023';
  end if;
  if p_confirmation <> 'SPECIAL REWARD' then
    raise exception 'SPECIAL_REWARD_CONFIRMATION_REQUIRED';
  end if;
  if p_amount_per_member is null or p_amount_per_member <= 0 then
    raise exception 'SPECIAL_REWARD_AMOUNT_INVALID' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_memo, '')), '') is null
     or char_length(btrim(p_memo)) > 300 then
    raise exception 'SPECIAL_REWARD_MEMO_INVALID' using errcode = '22023';
  end if;
  if p_discord_ids is null or cardinality(p_discord_ids) = 0
     or cardinality(p_discord_ids) > 500 then
    raise exception 'SPECIAL_REWARD_RECIPIENTS_INVALID' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(p_discord_ids) as recipient(id)
     where nullif(btrim(recipient.id), '') is null
  ) then
    raise exception 'SPECIAL_REWARD_RECIPIENTS_INVALID' using errcode = '22023';
  end if;

  select count(distinct recipient.id)::integer
    into v_count
    from unnest(p_discord_ids) as recipient(id);
  if v_count <> cardinality(p_discord_ids) then
    raise exception 'SPECIAL_REWARD_RECIPIENT_DUPLICATE';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_guild_id::text || ':special-reward:' || p_idempotency_key::text, 0)
  );

  select *
    into v_grant
    from public.special_reward_grants as reward
   where reward.guild_id = p_guild_id
     and reward.idempotency_key = p_idempotency_key;
  if found then
    if v_grant.amount_per_member <> p_amount_per_member
       or v_grant.memo <> btrim(p_memo)
       or v_grant.granted_by <> p_actor_discord_id
       or v_grant.recipient_count <> v_count
       or (
         select count(*)::integer
           from public.special_reward_grant_members as member
          where member.guild_id = p_guild_id
            and member.grant_id = v_grant.id
            and member.discord_id = any(p_discord_ids)
       ) <> v_count then
      raise exception 'SPECIAL_REWARD_IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object(
      'grantId', v_grant.id,
      'recipientCount', v_grant.recipient_count,
      'totalPoints', v_grant.total_points,
      'replayed', true
    );
  end if;

  select count(*)::integer
    into v_valid_count
    from public.guild_avatars as avatar
   where avatar.guild_id = p_guild_id
     and avatar.discord_id = any(p_discord_ids)
     and avatar.withdrawn_at is null;
  if v_valid_count <> v_count then
    raise exception 'SPECIAL_REWARD_MEMBER_NOT_FOUND';
  end if;

  v_total := p_amount_per_member::bigint * v_count::bigint;
  insert into public.special_reward_grants (
    guild_id,
    amount_per_member,
    recipient_count,
    total_points,
    memo,
    idempotency_key,
    granted_by,
    granted_by_username
  ) values (
    p_guild_id,
    p_amount_per_member,
    v_count,
    v_total,
    btrim(p_memo),
    p_idempotency_key,
    p_actor_discord_id,
    nullif(btrim(coalesce(p_actor_username, '')), '')
  )
  returning * into v_grant;

  foreach v_recipient in array p_discord_ids
  loop
    insert into public.point_ledger (
      guild_id,
      discord_id,
      delta,
      reason,
      ref_id,
      memo,
      handled_by,
      handled_by_username
    ) values (
      p_guild_id,
      v_recipient,
      p_amount_per_member,
      'special_reward',
      v_grant.id,
      btrim(p_memo),
      p_actor_discord_id,
      nullif(btrim(coalesce(p_actor_username, '')), '')
    )
    returning id into v_ledger_id;

    select identity.guild_member_id
      into v_member_id
      from public.guild_member_access_identities as identity
     where identity.guild_id = p_guild_id
       and identity.identity_type = 'discord'
       and identity.subject_id = v_recipient
       and identity.revoked_at is null
     limit 1;

    insert into public.special_reward_grant_members (
      guild_id,
      grant_id,
      discord_id,
      guild_member_id,
      point_ledger_id
    ) values (
      p_guild_id,
      v_grant.id,
      v_recipient,
      v_member_id,
      v_ledger_id
    );
  end loop;

  return jsonb_build_object(
    'grantId', v_grant.id,
    'recipientCount', v_count,
    'totalPoints', v_total,
    'replayed', false
  );
end;
$$;

revoke all on function public.grant_special_reward(uuid, text[], integer, text, text, text, uuid, text) from public;
revoke all on function public.grant_special_reward(uuid, text[], integer, text, text, text, uuid, text) from anon, authenticated;
grant execute on function public.grant_special_reward(uuid, text[], integer, text, text, text, uuid, text) to service_role;

alter table public.permission_role_grants
  drop constraint if exists permission_role_grants_capabilities_check;
alter table public.permission_role_grants
  add constraint permission_role_grants_capabilities_check
    check (capabilities between 1 and 274877906943);

alter table public.permission_user_overrides
  drop constraint if exists permission_user_overrides_capabilities_check;
alter table public.permission_user_overrides
  add constraint permission_user_overrides_capabilities_check
    check (
      capabilities_granted between 0 and 274877906943
      and capabilities_revoked between 0 and 274877906943
      and (capabilities_granted & capabilities_revoked) = 0
      and (
        revoked_at is not null
        or capabilities_granted <> 0
        or capabilities_revoked <> 0
      )
    );

do $$
declare
  v_function record;
  v_definition text;
  v_updated integer := 0;
begin
  for v_function in
    select procedure.oid
      from pg_proc procedure
      inner join pg_namespace namespace
        on namespace.oid = procedure.pronamespace
     where namespace.nspname = 'public'
       and procedure.proname in (
         'apply_permission_role_grant',
         'apply_permission_user_override'
       )
  loop
    v_definition := pg_get_functiondef(v_function.oid);
    if position('137438953471' in v_definition) = 0 then
      raise exception 'PERMISSION_CAPABILITY_LIMIT_NOT_FOUND:%', v_function.oid;
    end if;
    execute replace(v_definition, '137438953471', '274877906943');
    v_updated := v_updated + 1;
  end loop;
  if v_updated <> 2 then
    raise exception 'PERMISSION_VALIDATOR_COUNT_MISMATCH:%', v_updated;
  end if;
end;
$$;

notify pgrst, 'reload schema';
