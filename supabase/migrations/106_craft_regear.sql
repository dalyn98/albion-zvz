-- Crafting-based regear: members can choose to receive a crafted item instead
-- of silver. Crafters with is_crafter=true pick up tasks from queue, deposit
-- finished items in numbered chests on the guild island, and get reimbursed
-- for material cost (+ optional premium) via point_ledger.
--
-- Rotating box model (v1): box numbers are entered by the crafter at delivery
-- time (they pick a physically empty in-game box and type its number). DB
-- partial unique index guarantees no two delivered tasks reuse a number.
--
-- Per-tenant config flows through app_settings (matches existing pattern):
--   - craft_regear_enabled       boolean string, default 'false'
--   - craft_box_range_min        integer string, default '1'
--   - craft_box_range_max        integer string, default '30'
--   - craft_box_expiry_days      integer string, default '7'

-- ────────────────────────────────────────────────────────────
-- 1) Crafter flag + compensation defaults on guild_avatars
-- ────────────────────────────────────────────────────────────
alter table public.guild_avatars
  add column if not exists is_crafter boolean not null default false;

alter table public.guild_avatars
  add column if not exists craft_compensation_mode text not null default 'volunteer';

alter table public.guild_avatars
  drop constraint if exists guild_avatars_craft_comp_mode_chk;

alter table public.guild_avatars
  add constraint guild_avatars_craft_comp_mode_chk
    check (craft_compensation_mode in ('volunteer', 'paid'));

alter table public.guild_avatars
  add column if not exists craft_premium_pct integer not null default 0;

alter table public.guild_avatars
  drop constraint if exists guild_avatars_craft_premium_pct_chk;

alter table public.guild_avatars
  add constraint guild_avatars_craft_premium_pct_chk
    check (craft_premium_pct >= 0 and craft_premium_pct <= 200);

-- ────────────────────────────────────────────────────────────
-- 2) regear_requests.fulfillment_mode
-- ────────────────────────────────────────────────────────────
alter table public.regear_requests
  add column if not exists fulfillment_mode text not null default 'silver';

alter table public.regear_requests
  drop constraint if exists regear_requests_fulfillment_mode_chk;

alter table public.regear_requests
  add constraint regear_requests_fulfillment_mode_chk
    check (fulfillment_mode in ('silver', 'crafted'));

-- ────────────────────────────────────────────────────────────
-- 3) craft_tasks: one row per crafted regear claim
-- ────────────────────────────────────────────────────────────
create table if not exists public.craft_tasks (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  regear_request_id uuid not null references public.regear_requests(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'claimed', 'delivered', 'collected', 'expired', 'cancelled')),
  crafter_discord_id text,
  crafter_username text,
  box_number integer,
  craft_city text,
  craft_focus_used boolean not null default false,
  material_silver_cost integer,
  premium_silver integer not null default 0,
  reimbursement_silver integer,
  compensation_mode text check (compensation_mode in ('volunteer', 'paid')),
  claimed_at timestamptz,
  delivered_at timestamptz,
  collected_at timestamptz,
  expired_at timestamptz,
  cancelled_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- Composite FK to (guild_id, discord_id) — matches migration 084 PK shape.
-- ON DELETE SET NULL so crafter leaving doesn't drop history.
alter table public.craft_tasks
  drop constraint if exists craft_tasks_crafter_fk;

alter table public.craft_tasks
  add constraint craft_tasks_crafter_fk
    foreign key (guild_id, crafter_discord_id)
    references public.guild_avatars (guild_id, discord_id)
    on delete set null;

-- Box uniqueness: only delivered tasks lock a box number. claimed/queued tasks
-- have no box yet; collected/expired/cancelled tasks have released their box.
create unique index if not exists craft_tasks_box_unique_delivered
  on public.craft_tasks (guild_id, box_number)
  where status = 'delivered' and box_number is not null;

create index if not exists idx_craft_tasks_guild_status
  on public.craft_tasks (guild_id, status);

create index if not exists idx_craft_tasks_crafter_active
  on public.craft_tasks (crafter_discord_id)
  where status in ('claimed', 'delivered');

create index if not exists idx_craft_tasks_request
  on public.craft_tasks (regear_request_id);

-- One active craft task per regear request (no double-queueing).
create unique index if not exists craft_tasks_one_active_per_request
  on public.craft_tasks (regear_request_id)
  where status in ('queued', 'claimed', 'delivered');

-- ────────────────────────────────────────────────────────────
-- 3.5) Extend point_ledger reason CHECK to include craft_reimbursement.
-- ────────────────────────────────────────────────────────────
-- deliver_craft_task inserts a 'craft_reimbursement' row when the crafter
-- is on 'paid' compensation. Without this, the insert would fail the
-- existing reason_check constraint set in migration 100.
alter table public.point_ledger drop constraint if exists point_ledger_reason_check;
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
    'craft_reimbursement'
  ));

-- ────────────────────────────────────────────────────────────
-- 4) Update approve_regear_request to branch on fulfillment_mode.
-- ────────────────────────────────────────────────────────────
-- silver  -> existing behavior (credit point_ledger immediately)
-- crafted -> create craft_tasks row in 'queued' status; ledger credit happens
--           later, separately, when crafter delivers (and only if reimbursement)
create or replace function public.approve_regear_request(
  p_id uuid,
  p_admin_id text,
  p_admin_username text,
  p_guild_id uuid,
  p_payout_silver integer default null
) returns void language plpgsql security definer as $$
declare
  v_discord text;
  v_claimed integer;
  v_credit  integer;
  v_mode    text;
  v_existing_task uuid;
begin
  select discord_id, claimed_silver, fulfillment_mode
    into v_discord, v_claimed, v_mode
    from regear_requests
   where id = p_id
     and guild_id = p_guild_id
     and status = 'pending'
   for update;

  if v_discord is null then
    raise exception 'REGEAR_NOT_PENDING';
  end if;

  v_credit := coalesce(p_payout_silver, v_claimed);
  if v_credit < 0 then v_credit := 0; end if;
  if v_credit > v_claimed then v_credit := v_claimed; end if;

  update regear_requests
     set status = 'approved',
         resolved_at = now(),
         payout_silver = v_credit,
         handled_by = p_admin_id,
         handled_by_username = p_admin_username
   where id = p_id
     and guild_id = p_guild_id;

  if v_mode = 'crafted' then
    -- enqueue craft task (idempotent on retry — one_active_per_request enforces)
    select id into v_existing_task
      from craft_tasks
     where regear_request_id = p_id
       and status in ('queued', 'claimed', 'delivered');

    if v_existing_task is null then
      insert into craft_tasks (guild_id, regear_request_id, status)
           values (p_guild_id, p_id, 'queued');
    end if;
  else
    -- silver mode: credit member's point ledger
    insert into point_ledger (guild_id, discord_id, delta, reason, ref_id)
         values (p_guild_id, v_discord, v_credit, 'regear_approved', p_id);
  end if;
end;
$$;

-- ────────────────────────────────────────────────────────────
-- 5) RPC: claim_craft_task — crafter picks up queued task
-- ────────────────────────────────────────────────────────────
create or replace function public.claim_craft_task(
  p_task_id uuid,
  p_guild_id uuid,
  p_crafter_discord_id text,
  p_crafter_username text,
  p_compensation_mode text,
  p_premium_pct integer
) returns void language plpgsql security definer as $$
begin
  if p_compensation_mode not in ('volunteer', 'paid') then
    raise exception 'INVALID_COMPENSATION_MODE';
  end if;
  if p_premium_pct < 0 or p_premium_pct > 200 then
    raise exception 'INVALID_PREMIUM_PCT';
  end if;

  update craft_tasks
     set status = 'claimed',
         crafter_discord_id = p_crafter_discord_id,
         crafter_username = p_crafter_username,
         compensation_mode = p_compensation_mode,
         premium_silver = p_premium_pct, -- temp store pct here; recomputed at delivery
         claimed_at = now()
   where id = p_task_id
     and guild_id = p_guild_id
     and status = 'queued';

  if not found then
    raise exception 'CRAFT_TASK_NOT_QUEUED';
  end if;
end;
$$;

-- ────────────────────────────────────────────────────────────
-- 6) RPC: release_craft_task — crafter cancels their pickup
-- ────────────────────────────────────────────────────────────
create or replace function public.release_craft_task(
  p_task_id uuid,
  p_guild_id uuid,
  p_crafter_discord_id text
) returns void language plpgsql security definer as $$
begin
  update craft_tasks
     set status = 'queued',
         crafter_discord_id = null,
         crafter_username = null,
         compensation_mode = null,
         premium_silver = 0,
         claimed_at = null
   where id = p_task_id
     and guild_id = p_guild_id
     and status = 'claimed'
     and crafter_discord_id = p_crafter_discord_id;

  if not found then
    raise exception 'CRAFT_TASK_NOT_CLAIMED_BY_YOU';
  end if;
end;
$$;

-- ────────────────────────────────────────────────────────────
-- 7) RPC: deliver_craft_task — crafter marks delivered with box number
-- ────────────────────────────────────────────────────────────
-- Reimbursement = material_silver_cost + premium_silver, credited to
-- crafter's point_ledger when compensation_mode='paid'. volunteer skips
-- the ledger insert entirely (still records the cost for audit).
create or replace function public.deliver_craft_task(
  p_task_id uuid,
  p_guild_id uuid,
  p_crafter_discord_id text,
  p_box_number integer,
  p_craft_city text,
  p_craft_focus_used boolean,
  p_material_silver_cost integer,
  p_expiry_days integer
) returns void language plpgsql security definer as $$
declare
  v_compensation text;
  v_premium_pct integer;
  v_premium_silver integer;
  v_reimbursement integer;
  v_box_min integer;
  v_box_max integer;
begin
  -- Read box range from app_settings (default 1..30)
  select coalesce((select value::integer from public.app_settings
                    where key = 'craft_box_range_min' and guild_id = p_guild_id), 1),
         coalesce((select value::integer from public.app_settings
                    where key = 'craft_box_range_max' and guild_id = p_guild_id), 30)
    into v_box_min, v_box_max;

  if p_box_number < v_box_min or p_box_number > v_box_max then
    raise exception 'BOX_OUT_OF_RANGE';
  end if;
  if p_material_silver_cost < 0 then
    raise exception 'MATERIAL_COST_NEGATIVE';
  end if;
  if p_expiry_days < 1 or p_expiry_days > 30 then
    raise exception 'EXPIRY_OUT_OF_RANGE';
  end if;

  -- Read claim-time settings; compensation_mode is set there.
  -- premium_silver column is reused as premium_pct between claim and deliver.
  select compensation_mode, premium_silver
    into v_compensation, v_premium_pct
    from craft_tasks
   where id = p_task_id
     and guild_id = p_guild_id
     and status = 'claimed'
     and crafter_discord_id = p_crafter_discord_id
   for update;

  if v_compensation is null then
    raise exception 'CRAFT_TASK_NOT_CLAIMED_BY_YOU';
  end if;

  if v_compensation = 'volunteer' then
    v_premium_silver := 0;
    v_reimbursement := 0;
  else
    v_premium_silver := floor(p_material_silver_cost * v_premium_pct / 100.0)::integer;
    v_reimbursement := p_material_silver_cost + v_premium_silver;
  end if;

  update craft_tasks
     set status = 'delivered',
         box_number = p_box_number,
         craft_city = p_craft_city,
         craft_focus_used = p_craft_focus_used,
         material_silver_cost = p_material_silver_cost,
         premium_silver = v_premium_silver,
         reimbursement_silver = v_reimbursement,
         delivered_at = now(),
         expires_at = now() + make_interval(days => p_expiry_days)
   where id = p_task_id
     and guild_id = p_guild_id
     and status = 'claimed';

  if not found then
    raise exception 'CRAFT_TASK_DELIVER_FAILED';
  end if;

  if v_compensation = 'paid' and v_reimbursement > 0 then
    insert into point_ledger (guild_id, discord_id, delta, reason, ref_id)
         values (p_guild_id, p_crafter_discord_id, v_reimbursement,
                 'craft_reimbursement', p_task_id);
  end if;
end;
$$;

-- ────────────────────────────────────────────────────────────
-- 8) RPC: collect_craft_task — member picks up the item from the box
-- ────────────────────────────────────────────────────────────
create or replace function public.collect_craft_task(
  p_task_id uuid,
  p_guild_id uuid,
  p_member_discord_id text
) returns void language plpgsql security definer as $$
declare
  v_request_member text;
begin
  select rr.discord_id
    into v_request_member
    from craft_tasks ct
    join regear_requests rr on rr.id = ct.regear_request_id
   where ct.id = p_task_id
     and ct.guild_id = p_guild_id
     and ct.status = 'delivered'
   for update;

  if v_request_member is null then
    raise exception 'CRAFT_TASK_NOT_DELIVERED';
  end if;
  if v_request_member <> p_member_discord_id then
    raise exception 'CRAFT_TASK_NOT_YOURS';
  end if;

  update craft_tasks
     set status = 'collected',
         collected_at = now()
   where id = p_task_id
     and guild_id = p_guild_id;
end;
$$;

-- ────────────────────────────────────────────────────────────
-- 9) RPC: expire_craft_tasks — sweep delivered tasks past their expiry
-- ────────────────────────────────────────────────────────────
-- Idempotent — safe to call from cron repeatedly. Returns number of rows
-- expired so the cron can log it.
create or replace function public.expire_craft_tasks()
returns integer language plpgsql security definer as $$
declare
  v_count integer;
begin
  update craft_tasks
     set status = 'expired',
         expired_at = now()
   where status = 'delivered'
     and expires_at is not null
     and expires_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ────────────────────────────────────────────────────────────
-- 10) RPC: cancel_craft_task — admin cancels (e.g. switches to silver later)
-- ────────────────────────────────────────────────────────────
create or replace function public.cancel_craft_task(
  p_task_id uuid,
  p_guild_id uuid
) returns void language plpgsql security definer as $$
begin
  update craft_tasks
     set status = 'cancelled',
         cancelled_at = now()
   where id = p_task_id
     and guild_id = p_guild_id
     and status in ('queued', 'claimed', 'delivered');

  if not found then
    raise exception 'CRAFT_TASK_NOT_CANCELLABLE';
  end if;
end;
$$;

-- ────────────────────────────────────────────────────────────
-- 10.5) RPC: convert_craft_task_to_silver — admin downgrade in one tx
-- ────────────────────────────────────────────────────────────
-- Used when a crafted request turns out un-craftable (artifact, etc.).
-- Atomic: cancels the craft task, flips regear_requests.fulfillment_mode,
-- and inserts the point_ledger credit so the member doesn't lose silver
-- if the admin client retries midway.
--
-- Returns the ledger amount credited so the action can DM the member.
create or replace function public.convert_craft_task_to_silver(
  p_task_id uuid,
  p_guild_id uuid
) returns integer language plpgsql security definer as $$
declare
  v_request_id uuid;
  v_status text;
  v_member_discord text;
  v_credit integer;
begin
  -- Lock the task + the request together.
  select ct.regear_request_id, ct.status, rr.discord_id,
         coalesce(rr.payout_silver, rr.claimed_silver, 0)
    into v_request_id, v_status, v_member_discord, v_credit
    from craft_tasks ct
    join regear_requests rr on rr.id = ct.regear_request_id
   where ct.id = p_task_id
     and ct.guild_id = p_guild_id
   for update;

  if v_request_id is null then
    raise exception 'CRAFT_TASK_NOT_FOUND';
  end if;
  if v_status not in ('queued', 'claimed') then
    raise exception 'CRAFT_TASK_NOT_CANCELLABLE';
  end if;

  update craft_tasks
     set status = 'cancelled',
         cancelled_at = now()
   where id = p_task_id
     and guild_id = p_guild_id;

  update regear_requests
     set fulfillment_mode = 'silver'
   where id = v_request_id
     and guild_id = p_guild_id;

  if v_credit > 0 and v_member_discord is not null then
    insert into point_ledger (guild_id, discord_id, delta, reason, ref_id)
         values (p_guild_id, v_member_discord, v_credit,
                 'regear_approved', v_request_id);
  end if;

  return coalesce(v_credit, 0);
end;
$$;

-- ────────────────────────────────────────────────────────────
-- 11) RLS — service-role only; app uses admin client for writes,
--     reads via admin client too (consistent with existing tables).
-- ────────────────────────────────────────────────────────────
alter table public.craft_tasks enable row level security;

drop policy if exists craft_tasks_service_only on public.craft_tasks;
create policy craft_tasks_service_only on public.craft_tasks
  for all to public using (false) with check (false);
