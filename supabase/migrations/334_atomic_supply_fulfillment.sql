-- 334: Atomic supply fulfillment for crafted regear.
--
-- Expand-only goals:
-- - keep every legacy craft/regear row readable
-- - freeze material reimbursement and craft fee independently at claim time
-- - make box delivery, finished-stock projection, outside-stock evidence,
--   settlement entitlement, audit, and outbox one transaction
-- - never release a box merely because its pickup follow-up date passed
-- - let only collection, explicit unclaimed return, or box move change custody

alter table public.guild_avatars
  add column if not exists craft_material_source text not null default 'guild_stock';

alter table public.guild_avatars
  drop constraint if exists guild_avatars_craft_material_source_chk;
alter table public.guild_avatars
  add constraint guild_avatars_craft_material_source_chk
  check (craft_material_source in ('guild_stock', 'crafter_purchase'));

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.craft_tasks'::regclass
       and conname = 'craft_tasks_guild_id_id_key'
  ) then
    alter table public.craft_tasks
      add constraint craft_tasks_guild_id_id_key unique (guild_id, id);
  end if;
end
$$;

create table if not exists public.supply_fulfillments (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  source_kind text not null
    check (source_kind in ('regear_request', 'guild_order')),
  source_id uuid not null,
  craft_task_id uuid references public.craft_tasks(id) on delete restrict,
  requester_member_id uuid,
  crafter_member_id uuid,
  mode text not null
    check (mode in ('silver', 'stock', 'craft')),
  status text not null
    check (status in (
      'awaiting_decision', 'queued', 'in_progress', 'ready_for_pickup',
      'receipt_overdue', 'completed', 'returned_unclaimed', 'cancelled',
      'legacy_expired'
    )),
  material_source text not null default 'not_applicable'
    check (material_source in (
      'guild_stock', 'crafter_purchase', 'not_applicable', 'legacy_unknown'
    )),
  craft_fee_mode text not null default 'not_applicable'
    check (craft_fee_mode in ('none', 'configured', 'not_applicable', 'legacy_unknown')),
  quoted_material_value_silver integer not null default 0
    check (quoted_material_value_silver >= 0),
  material_reimbursement_silver integer not null default 0
    check (material_reimbursement_silver >= 0),
  craft_fee_silver integer not null default 0
    check (craft_fee_silver >= 0),
  settlement_total_silver integer not null default 0
    check (settlement_total_silver >= 0),
  settlement_terms_accepted_at timestamptz,
  snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(snapshot) = 'object'),
  receipt_due_at timestamptz,
  receipt_overdue_at timestamptz,
  completed_at timestamptz,
  returned_unclaimed_at timestamptz,
  cancelled_at timestamptz,
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supply_fulfillments_guild_id_id_key unique (guild_id, id),
  constraint supply_fulfillments_craft_task_key unique (guild_id, craft_task_id),
  constraint supply_fulfillments_craft_task_fkey
    foreign key (guild_id, craft_task_id)
    references public.craft_tasks(guild_id, id)
    on delete restrict,
  constraint supply_fulfillments_source_key
    unique (guild_id, source_kind, source_id, craft_task_id),
  constraint supply_fulfillments_settlement_total_chk check (
    settlement_total_silver = material_reimbursement_silver + craft_fee_silver
  ),
  constraint supply_fulfillments_requester_member_fkey
    foreign key (guild_id, requester_member_id)
    references public.guild_member_records(guild_id, id)
    on delete restrict,
  constraint supply_fulfillments_crafter_member_fkey
    foreign key (guild_id, crafter_member_id)
    references public.guild_member_records(guild_id, id)
    on delete restrict
);

create index if not exists supply_fulfillments_active_idx
  on public.supply_fulfillments (guild_id, status, updated_at desc)
  where status in ('queued', 'in_progress', 'ready_for_pickup', 'receipt_overdue');

create index if not exists supply_fulfillments_requester_idx
  on public.supply_fulfillments (guild_id, requester_member_id, updated_at desc)
  where requester_member_id is not null;

create index if not exists supply_fulfillments_crafter_idx
  on public.supply_fulfillments (guild_id, crafter_member_id, updated_at desc)
  where crafter_member_id is not null;

create table if not exists public.supply_fulfillment_events (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  fulfillment_id uuid not null,
  event_type text not null check (char_length(btrim(event_type)) between 1 and 64),
  from_status text,
  to_status text,
  actor_member_id uuid,
  actor_discord_id text,
  correlation_id text not null check (char_length(btrim(correlation_id)) between 1 and 128),
  idempotency_key uuid not null,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now(),
  constraint supply_fulfillment_events_fulfillment_fkey
    foreign key (guild_id, fulfillment_id)
    references public.supply_fulfillments(guild_id, id)
    on delete cascade,
  constraint supply_fulfillment_events_actor_fkey
    foreign key (guild_id, actor_member_id)
    references public.guild_member_records(guild_id, id)
    on delete restrict,
  constraint supply_fulfillment_events_idempotency_key
    unique (guild_id, fulfillment_id, event_type, idempotency_key)
);

create index if not exists supply_fulfillment_events_recent_idx
  on public.supply_fulfillment_events (guild_id, fulfillment_id, created_at desc);

create table if not exists public.guild_inventory_movements (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  item_id text not null check (char_length(btrim(item_id)) between 1 and 256),
  delta integer not null check (delta <> 0),
  quantity_after integer not null check (quantity_after >= 0),
  reason text not null check (reason in (
    'baseline', 'manual_adjustment', 'manual_reconciliation',
    'stock_fulfillment', 'craft_delivery', 'unclaimed_return',
    'reversal', 'legacy_projection_adjustment'
  )),
  reference_kind text not null check (char_length(btrim(reference_kind)) between 1 and 64),
  reference_id uuid not null,
  line_key text not null check (char_length(btrim(line_key)) between 1 and 128),
  actor_member_id uuid,
  actor_discord_id text,
  correlation_id text not null check (char_length(btrim(correlation_id)) between 1 and 128),
  created_at timestamptz not null default now(),
  constraint guild_inventory_movements_actor_fkey
    foreign key (guild_id, actor_member_id)
    references public.guild_member_records(guild_id, id)
    on delete restrict,
  constraint guild_inventory_movements_idempotency_key
    unique (guild_id, reference_kind, reference_id, reason, line_key)
);

create index if not exists guild_inventory_movements_item_idx
  on public.guild_inventory_movements (guild_id, item_id, created_at desc);

create table if not exists public.supply_outside_stock_fulfillments (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  fulfillment_id uuid not null,
  task_id uuid not null references public.craft_tasks(id) on delete restrict,
  item_id text not null check (char_length(btrim(item_id)) between 1 and 256),
  line_key text not null check (char_length(btrim(line_key)) between 1 and 128),
  quantity integer not null check (quantity > 0),
  material_source text not null check (material_source in ('guild_stock', 'crafter_purchase')),
  actor_member_id uuid,
  actor_discord_id text,
  correlation_id text not null check (char_length(btrim(correlation_id)) between 1 and 128),
  created_at timestamptz not null default now(),
  constraint supply_outside_stock_fulfillments_fulfillment_fkey
    foreign key (guild_id, fulfillment_id)
    references public.supply_fulfillments(guild_id, id)
    on delete cascade,
  constraint supply_outside_stock_fulfillments_task_fkey
    foreign key (guild_id, task_id)
    references public.craft_tasks(guild_id, id)
    on delete restrict,
  constraint supply_outside_stock_fulfillments_actor_fkey
    foreign key (guild_id, actor_member_id)
    references public.guild_member_records(guild_id, id)
    on delete restrict,
  constraint supply_outside_stock_fulfillments_line_key
    unique (guild_id, fulfillment_id, line_key)
);

create index if not exists supply_outside_stock_item_idx
  on public.supply_outside_stock_fulfillments (guild_id, item_id, created_at desc);

create table if not exists public.supply_settlement_batches (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  crafter_member_id uuid not null,
  total_silver bigint not null check (total_silver > 0),
  paid_by_member_id uuid,
  paid_by_discord_id text not null,
  paid_at timestamptz not null default now(),
  note text check (note is null or char_length(note) <= 500),
  idempotency_key uuid not null,
  correlation_id text not null check (char_length(btrim(correlation_id)) between 1 and 128),
  created_at timestamptz not null default now(),
  constraint supply_settlement_batches_crafter_fkey
    foreign key (guild_id, crafter_member_id)
    references public.guild_member_records(guild_id, id)
    on delete restrict,
  constraint supply_settlement_batches_actor_fkey
    foreign key (guild_id, paid_by_member_id)
    references public.guild_member_records(guild_id, id)
    on delete restrict,
  constraint supply_settlement_batches_idempotency_key
    unique (guild_id, idempotency_key),
  constraint supply_settlement_batches_guild_id_id_key unique (guild_id, id)
);

create table if not exists public.supply_settlement_items (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  fulfillment_id uuid not null,
  crafter_member_id uuid not null,
  amount_silver integer not null check (amount_silver > 0),
  status text not null default 'payable' check (status in ('payable', 'paid', 'void')),
  payment_batch_id uuid,
  payable_at timestamptz not null default now(),
  paid_at timestamptz,
  voided_at timestamptz,
  void_reason text check (void_reason is null or char_length(void_reason) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supply_settlement_items_fulfillment_key unique (guild_id, fulfillment_id),
  constraint supply_settlement_items_fulfillment_fkey
    foreign key (guild_id, fulfillment_id)
    references public.supply_fulfillments(guild_id, id)
    on delete restrict,
  constraint supply_settlement_items_crafter_fkey
    foreign key (guild_id, crafter_member_id)
    references public.guild_member_records(guild_id, id)
    on delete restrict,
  constraint supply_settlement_items_batch_fkey
    foreign key (guild_id, payment_batch_id)
    references public.supply_settlement_batches(guild_id, id)
    on delete restrict,
  constraint supply_settlement_items_lifecycle_chk check (
    (status = 'payable' and payment_batch_id is null and paid_at is null and voided_at is null)
    or (status = 'paid' and payment_batch_id is not null and paid_at is not null and voided_at is null)
    or (status = 'void' and payment_batch_id is null and paid_at is null and voided_at is not null)
  )
);

create index if not exists supply_settlement_items_payable_idx
  on public.supply_settlement_items (guild_id, crafter_member_id, payable_at)
  where status = 'payable';

create table if not exists public.domain_outbox (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  topic text not null check (char_length(btrim(topic)) between 1 and 96),
  aggregate_kind text not null check (char_length(btrim(aggregate_kind)) between 1 and 64),
  aggregate_id uuid not null,
  recipient_kind text not null default 'member'
    check (recipient_kind in ('member', 'admin', 'guild', 'digest')),
  recipient_member_id uuid,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  correlation_id text not null check (char_length(btrim(correlation_id)) between 1 and 128),
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint domain_outbox_recipient_fkey
    foreign key (guild_id, recipient_member_id)
    references public.guild_member_records(guild_id, id)
    on delete restrict,
  constraint domain_outbox_dedupe_key
    unique (guild_id, topic, aggregate_kind, aggregate_id, recipient_kind, correlation_id)
);

create index if not exists domain_outbox_pending_idx
  on public.domain_outbox (available_at, created_at)
  where status in ('pending', 'failed');

-- Establish the existing finished-goods projection as a baseline. This does
-- not change inventory and deliberately does not infer historical movements.
insert into public.guild_inventory_movements (
  guild_id,
  item_id,
  delta,
  quantity_after,
  reason,
  reference_kind,
  reference_id,
  line_key,
  actor_discord_id,
  correlation_id
)
select
  inventory.guild_id,
  inventory.item_id,
  inventory.quantity,
  inventory.quantity,
  'baseline',
  'inventory_baseline',
  inventory.id,
  inventory.item_id,
  inventory.updated_by_discord_id,
  'migration-334'
from public.guild_inventory_gear inventory
where inventory.quantity > 0
on conflict (guild_id, reference_kind, reference_id, reason, line_key) do nothing;

-- Preserve existing craft history without inventing exact provenance.
insert into public.supply_fulfillments (
  guild_id,
  source_kind,
  source_id,
  craft_task_id,
  requester_member_id,
  crafter_member_id,
  mode,
  status,
  material_source,
  craft_fee_mode,
  quoted_material_value_silver,
  material_reimbursement_silver,
  craft_fee_silver,
  settlement_total_silver,
  settlement_terms_accepted_at,
  snapshot,
  receipt_due_at,
  receipt_overdue_at,
  completed_at,
  cancelled_at,
  created_at,
  updated_at
)
select
  task.guild_id,
  'regear_request',
  task.regear_request_id,
  task.id,
  request.guild_member_id,
  public.resolve_guild_member_id(
    task.guild_id,
    public.guild_member_access_identity_type(task.crafter_discord_id),
    task.crafter_discord_id
  ),
  'craft',
  case task.status
    when 'queued' then 'queued'
    when 'claimed' then 'in_progress'
    when 'delivered' then 'ready_for_pickup'
    when 'collected' then 'completed'
    when 'expired' then 'legacy_expired'
    else 'cancelled'
  end,
  'legacy_unknown',
  case when coalesce(task.premium_silver, 0) > 0 then 'configured' else 'legacy_unknown' end,
  greatest(coalesce(task.material_silver_cost, 0), 0),
  legacy_amount.material_silver,
  legacy_amount.total_silver - legacy_amount.material_silver,
  legacy_amount.total_silver,
  task.claimed_at,
  jsonb_build_object(
    'legacyBackfill', true,
    'legacyStatus', task.status,
    'legacyCompensationMode', task.compensation_mode,
    'legacyMaterialSilverCost', task.material_silver_cost,
    'legacyPremiumSilver', task.premium_silver,
    'legacyReimbursementSilver', task.reimbursement_silver,
    'build', request.build_snapshot,
    'includedSlots', request.craft_included_slots
  ),
  task.expires_at,
  task.expired_at,
  task.collected_at,
  task.cancelled_at,
  task.created_at,
  greatest(
    task.created_at,
    coalesce(task.claimed_at, task.created_at),
    coalesce(task.delivered_at, task.created_at),
    coalesce(task.collected_at, task.created_at),
    coalesce(task.expired_at, task.created_at),
    coalesce(task.cancelled_at, task.created_at)
  )
from public.craft_tasks task
join public.regear_requests request
  on request.guild_id = task.guild_id
 and request.id = task.regear_request_id
cross join lateral (
  select
    greatest(coalesce(task.reimbursement_silver, 0), 0)::integer as total_silver,
    case
      when task.compensation_mode = 'paid' then least(
        greatest(coalesce(task.material_silver_cost, 0), 0),
        greatest(coalesce(task.reimbursement_silver, 0), 0)
      )
      else 0
    end::integer as material_silver
) legacy_amount
where task.task_kind = 'regear'
on conflict (guild_id, craft_task_id) do nothing;

insert into public.supply_settlement_items (
  guild_id,
  fulfillment_id,
  crafter_member_id,
  amount_silver,
  status,
  payment_batch_id,
  payable_at,
  paid_at,
  voided_at,
  void_reason,
  created_at,
  updated_at
)
select
  fulfillment.guild_id,
  fulfillment.id,
  fulfillment.crafter_member_id,
  fulfillment.settlement_total_silver,
  case task.reimbursement_status
    when 'approved' then 'paid'
    when 'rejected' then 'void'
    else 'payable'
  end,
  null,
  coalesce(task.delivered_at, task.created_at),
  case when task.reimbursement_status = 'approved' then task.reimbursement_approved_at end,
  case when task.reimbursement_status = 'rejected' then task.reimbursement_rejected_at end,
  case when task.reimbursement_status = 'rejected' then task.reimbursement_reject_reason end,
  coalesce(task.delivered_at, task.created_at),
  greatest(
    coalesce(task.delivered_at, task.created_at),
    coalesce(task.reimbursement_approved_at, task.created_at),
    coalesce(task.reimbursement_rejected_at, task.created_at)
  )
from public.supply_fulfillments fulfillment
join public.craft_tasks task
  on task.guild_id = fulfillment.guild_id
 and task.id = fulfillment.craft_task_id
where fulfillment.crafter_member_id is not null
  and fulfillment.settlement_total_silver > 0
  and task.reimbursement_status in ('pending', 'approved', 'rejected')
  and task.reimbursement_status <> 'approved'
on conflict (guild_id, fulfillment_id) do nothing;

-- Approved legacy reimbursements were already paid through point_ledger. Keep
-- them out of the new batch-payment surface; their fulfillment snapshot still
-- preserves the original amount and resolution.

alter table public.supply_fulfillments enable row level security;
alter table public.supply_fulfillment_events enable row level security;
alter table public.guild_inventory_movements enable row level security;
alter table public.supply_outside_stock_fulfillments enable row level security;
alter table public.supply_settlement_batches enable row level security;
alter table public.supply_settlement_items enable row level security;
alter table public.domain_outbox enable row level security;

revoke all on public.supply_fulfillments,
  public.supply_fulfillment_events,
  public.guild_inventory_movements,
  public.supply_outside_stock_fulfillments,
  public.supply_settlement_batches,
  public.supply_settlement_items,
  public.domain_outbox
  from public, anon, authenticated;

grant select, insert, update on public.supply_fulfillments to service_role;
grant select, insert on public.supply_fulfillment_events to service_role;
grant select, insert on public.guild_inventory_movements to service_role;
grant select, insert on public.supply_outside_stock_fulfillments to service_role;
grant select, insert on public.supply_settlement_batches to service_role;
grant select, insert, update on public.supply_settlement_items to service_role;
grant select, insert, update on public.domain_outbox to service_role;

comment on table public.supply_fulfillments is
  'Stable fulfillment state separate from regear approval; box delivery remains pickup-pending until explicit receipt or return.';
comment on table public.guild_inventory_movements is
  'Append-only finished-goods movement ledger paired transactionally with the current inventory projection.';
comment on table public.supply_settlement_items is
  'Crafter silver entitlements fixed at claim and made payable when delivery reaches the pickup box.';
comment on table public.domain_outbox is
  'Commit-after notification intents deduplicated by tenant, aggregate, topic, recipient kind, and correlation.';

create or replace function public.sync_supply_fulfillment_from_craft_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.regear_requests%rowtype;
  v_status text;
begin
  if new.task_kind <> 'regear' then
    return new;
  end if;

  select request.*
    into v_request
    from public.regear_requests request
   where request.guild_id = new.guild_id
     and request.id = new.regear_request_id;

  if not found then
    raise exception 'SUPPLY_REGEAR_REQUEST_NOT_FOUND';
  end if;

  v_status := case new.status
    when 'queued' then 'queued'
    when 'claimed' then 'in_progress'
    when 'delivered' then 'ready_for_pickup'
    when 'collected' then 'completed'
    when 'expired' then 'legacy_expired'
    else 'cancelled'
  end;

  insert into public.supply_fulfillments (
    guild_id,
    source_kind,
    source_id,
    craft_task_id,
    requester_member_id,
    crafter_member_id,
    mode,
    status,
    material_source,
    craft_fee_mode,
    snapshot,
    receipt_due_at,
    receipt_overdue_at,
    completed_at,
    cancelled_at,
    created_at,
    updated_at
  ) values (
    new.guild_id,
    'regear_request',
    new.regear_request_id,
    new.id,
    v_request.guild_member_id,
    public.resolve_guild_member_id(
      new.guild_id,
      public.guild_member_access_identity_type(new.crafter_discord_id),
      new.crafter_discord_id
    ),
    'craft',
    v_status,
    'legacy_unknown',
    'legacy_unknown',
    jsonb_build_object(
      'build', v_request.build_snapshot,
      'includedSlots', v_request.craft_included_slots,
      'gearBreakdown', v_request.gear_breakdown
    ),
    new.expires_at,
    new.expired_at,
    new.collected_at,
    new.cancelled_at,
    new.created_at,
    now()
  )
  on conflict (guild_id, craft_task_id) do update
    set requester_member_id = coalesce(
          public.supply_fulfillments.requester_member_id,
          excluded.requester_member_id
        ),
        crafter_member_id = case
          when new.status = 'queued' then null
          else coalesce(excluded.crafter_member_id, public.supply_fulfillments.crafter_member_id)
        end,
        status = case
          when public.supply_fulfillments.status in ('returned_unclaimed', 'completed', 'legacy_expired')
            then public.supply_fulfillments.status
          when new.status = 'claimed'
            and public.supply_fulfillments.status in ('queued', 'in_progress') then 'in_progress'
          when new.status = 'delivered'
            and public.supply_fulfillments.status in ('queued', 'in_progress', 'ready_for_pickup')
            then 'ready_for_pickup'
          when new.status = 'collected' then 'completed'
          when new.status = 'expired' then 'legacy_expired'
          when new.status = 'cancelled' then 'cancelled'
          when new.status = 'queued' then 'queued'
          else public.supply_fulfillments.status
        end,
        receipt_due_at = coalesce(new.expires_at, public.supply_fulfillments.receipt_due_at),
        receipt_overdue_at = coalesce(new.expired_at, public.supply_fulfillments.receipt_overdue_at),
        completed_at = coalesce(new.collected_at, public.supply_fulfillments.completed_at),
        cancelled_at = coalesce(new.cancelled_at, public.supply_fulfillments.cancelled_at),
        updated_at = now();

  return new;
end;
$$;

revoke all on function public.sync_supply_fulfillment_from_craft_task()
  from public, anon, authenticated, service_role;

drop trigger if exists sync_supply_fulfillment_from_craft_task
  on public.craft_tasks;
create trigger sync_supply_fulfillment_from_craft_task
after insert or update of status, crafter_discord_id, expires_at
on public.craft_tasks
for each row execute function public.sync_supply_fulfillment_from_craft_task();

create or replace function public.record_finished_inventory_projection_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delta integer;
  v_quantity_after integer;
  v_row_id uuid;
  v_guild_id uuid;
  v_item_id text;
  v_actor_discord_id text;
  v_actor_member_id uuid;
  v_reference_id uuid := gen_random_uuid();
begin
  if current_setting('app.supply_inventory_suppress_trigger', true) = 'true' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'INSERT' then
    v_delta := new.quantity;
    v_quantity_after := new.quantity;
    v_row_id := new.id;
    v_guild_id := new.guild_id;
    v_item_id := new.item_id;
    v_actor_discord_id := new.updated_by_discord_id;
  elsif tg_op = 'UPDATE' then
    v_delta := new.quantity - old.quantity;
    v_quantity_after := new.quantity;
    v_row_id := new.id;
    v_guild_id := new.guild_id;
    v_item_id := new.item_id;
    v_actor_discord_id := new.updated_by_discord_id;
  else
    v_delta := -old.quantity;
    v_quantity_after := 0;
    v_row_id := old.id;
    v_guild_id := old.guild_id;
    v_item_id := old.item_id;
    v_actor_discord_id := old.updated_by_discord_id;
  end if;

  if v_delta = 0 then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  v_actor_member_id := public.resolve_guild_member_id(
    v_guild_id,
    public.guild_member_access_identity_type(v_actor_discord_id),
    v_actor_discord_id
  );

  insert into public.guild_inventory_movements (
    guild_id,
    item_id,
    delta,
    quantity_after,
    reason,
    reference_kind,
    reference_id,
    line_key,
    actor_member_id,
    actor_discord_id,
    correlation_id
  ) values (
    v_guild_id,
    v_item_id,
    v_delta,
    v_quantity_after,
    'legacy_projection_adjustment',
    'inventory_projection',
    v_reference_id,
    v_row_id::text || ':' || v_reference_id::text,
    v_actor_member_id,
    v_actor_discord_id,
    'inventory:' || v_reference_id::text
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.record_finished_inventory_projection_movement()
  from public, anon, authenticated, service_role;

drop trigger if exists record_finished_inventory_projection_movement
  on public.guild_inventory_gear;
create trigger record_finished_inventory_projection_movement
after insert or update of quantity or delete
on public.guild_inventory_gear
for each row execute function public.record_finished_inventory_projection_movement();

create or replace function public.claim_supply_craft_task(
  p_task_id uuid,
  p_guild_id uuid,
  p_crafter_discord_id text,
  p_crafter_username text,
  p_material_source text,
  p_craft_fee_mode text,
  p_craft_fee_pct integer,
  p_idempotency_key uuid,
  p_correlation_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.craft_tasks%rowtype;
  v_request public.regear_requests%rowtype;
  v_fulfillment public.supply_fulfillments%rowtype;
  v_crafter_member_id uuid;
  v_quoted_material numeric := 0;
  v_material_reimbursement integer := 0;
  v_craft_fee integer := 0;
  v_total integer := 0;
  v_item jsonb;
  v_price numeric;
  v_count numeric;
begin
  if p_task_id is null
     or p_guild_id is null
     or p_idempotency_key is null
     or nullif(btrim(p_correlation_id), '') is null
     or char_length(p_correlation_id) > 128
     or nullif(btrim(p_crafter_discord_id), '') is null
     or char_length(p_crafter_discord_id) > 128
     or nullif(btrim(p_crafter_username), '') is null
     or char_length(p_crafter_username) > 128
     or p_material_source not in ('guild_stock', 'crafter_purchase')
     or p_craft_fee_mode not in ('none', 'configured')
     or p_craft_fee_pct is null
     or p_craft_fee_pct < 0
     or p_craft_fee_pct > 200 then
    raise exception 'SUPPLY_CLAIM_INVALID';
  end if;

  if p_craft_fee_mode = 'none' and p_craft_fee_pct <> 0 then
    raise exception 'SUPPLY_CLAIM_FEE_INVALID';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_guild_id::text || ':supply-claim:' || p_task_id::text, 0)
  );

  select task.*
    into v_task
    from public.craft_tasks task
   where task.guild_id = p_guild_id
     and task.id = p_task_id
     and task.task_kind = 'regear'
   for update;

  if not found then
    raise exception 'CRAFT_TASK_NOT_QUEUED';
  end if;

  select request.*
    into v_request
    from public.regear_requests request
   where request.guild_id = p_guild_id
     and request.id = v_task.regear_request_id;

  if not found then
    raise exception 'SUPPLY_REGEAR_REQUEST_NOT_FOUND';
  end if;

  v_crafter_member_id := public.resolve_guild_member_id(
    p_guild_id,
    public.guild_member_access_identity_type(p_crafter_discord_id),
    p_crafter_discord_id
  );
  if v_crafter_member_id is null then
    raise exception 'SUPPLY_CRAFTER_MEMBER_NOT_FOUND';
  end if;

  select fulfillment.*
    into v_fulfillment
    from public.supply_fulfillments fulfillment
   where fulfillment.guild_id = p_guild_id
     and fulfillment.craft_task_id = p_task_id
   for update;

  if not found then
    raise exception 'SUPPLY_FULFILLMENT_NOT_FOUND';
  end if;

  if v_task.status = 'claimed'
     and v_task.crafter_discord_id = p_crafter_discord_id
     and v_fulfillment.status = 'in_progress'
     and v_fulfillment.crafter_member_id = v_crafter_member_id
     and v_fulfillment.material_source = p_material_source
     and v_fulfillment.craft_fee_mode = p_craft_fee_mode
     and coalesce((v_fulfillment.snapshot ->> 'craftFeePct')::integer, 0) = p_craft_fee_pct then
    return jsonb_build_object(
      'taskId', p_task_id,
      'fulfillmentId', v_fulfillment.id,
      'status', v_fulfillment.status,
      'quotedMaterialValueSilver', v_fulfillment.quoted_material_value_silver,
      'materialReimbursementSilver', v_fulfillment.material_reimbursement_silver,
      'craftFeeSilver', v_fulfillment.craft_fee_silver,
      'settlementTotalSilver', v_fulfillment.settlement_total_silver,
      'replayed', true
    );
  end if;

  if v_task.status <> 'queued' or v_fulfillment.status <> 'queued' then
    raise exception 'CRAFT_TASK_NOT_QUEUED';
  end if;

  for v_item in
    select item
      from jsonb_array_elements(
        case
          when jsonb_typeof(v_request.gear_breakdown -> 'items') = 'array'
            then v_request.gear_breakdown -> 'items'
          else '[]'::jsonb
        end
      ) item
     where jsonb_typeof(v_request.craft_included_slots) = 'array'
       and v_request.craft_included_slots ? (item ->> 'slot')
  loop
    v_price := case
      when jsonb_typeof(v_item -> 'price') = 'number'
        then greatest((v_item ->> 'price')::numeric, 0)
      else 0
    end;
    v_count := case
      when jsonb_typeof(v_item -> 'count') = 'number'
        then greatest((v_item ->> 'count')::numeric, 1)
      else 1
    end;
    v_quoted_material := v_quoted_material + (v_price * v_count);
  end loop;

  if v_quoted_material > 2147483647 then
    raise exception 'SUPPLY_CLAIM_QUOTE_TOO_LARGE';
  end if;

  v_quoted_material := floor(v_quoted_material);
  if p_material_source = 'crafter_purchase' then
    v_material_reimbursement := v_quoted_material::integer;
  end if;
  if p_craft_fee_mode = 'configured' then
    v_craft_fee := floor(v_quoted_material * p_craft_fee_pct / 100.0)::integer;
  end if;
  if v_material_reimbursement::bigint + v_craft_fee::bigint > 2147483647 then
    raise exception 'SUPPLY_CLAIM_SETTLEMENT_TOO_LARGE';
  end if;
  v_total := v_material_reimbursement + v_craft_fee;

  update public.craft_tasks
     set status = 'claimed',
         crafter_discord_id = p_crafter_discord_id,
         crafter_username = p_crafter_username,
         compensation_mode = case when v_total > 0 then 'paid' else 'volunteer' end,
         premium_silver = p_craft_fee_pct,
         claimed_at = now()
   where guild_id = p_guild_id
     and id = p_task_id
     and status = 'queued';

  if not found then
    raise exception 'CRAFT_TASK_NOT_QUEUED';
  end if;

  update public.supply_fulfillments
     set status = 'in_progress',
         crafter_member_id = v_crafter_member_id,
         material_source = p_material_source,
         craft_fee_mode = p_craft_fee_mode,
         quoted_material_value_silver = v_quoted_material::integer,
         material_reimbursement_silver = v_material_reimbursement,
         craft_fee_silver = v_craft_fee,
         settlement_total_silver = v_total,
         settlement_terms_accepted_at = now(),
         snapshot = jsonb_build_object(
           'build', v_request.build_snapshot,
           'includedSlots', v_request.craft_included_slots,
           'gearBreakdown', v_request.gear_breakdown,
           'materialSource', p_material_source,
           'craftFeeMode', p_craft_fee_mode,
           'craftFeePct', p_craft_fee_pct,
           'quotedMaterialValueSilver', v_quoted_material::integer,
           'materialReimbursementSilver', v_material_reimbursement,
           'craftFeeSilver', v_craft_fee,
           'settlementTotalSilver', v_total
         ),
         version = version + 1,
         updated_at = now()
   where guild_id = p_guild_id
     and id = v_fulfillment.id
     and status in ('queued', 'in_progress');

  insert into public.supply_fulfillment_events (
    guild_id, fulfillment_id, event_type, from_status, to_status,
    actor_member_id, actor_discord_id, correlation_id, idempotency_key, details
  ) values (
    p_guild_id, v_fulfillment.id, 'craft_claimed', 'queued', 'in_progress',
    v_crafter_member_id, p_crafter_discord_id, p_correlation_id, p_idempotency_key,
    jsonb_build_object(
      'materialSource', p_material_source,
      'craftFeeMode', p_craft_fee_mode,
      'craftFeePct', p_craft_fee_pct,
      'settlementTotalSilver', v_total
    )
  ) on conflict do nothing;

  return jsonb_build_object(
    'taskId', p_task_id,
    'fulfillmentId', v_fulfillment.id,
    'status', 'in_progress',
    'quotedMaterialValueSilver', v_quoted_material::integer,
    'materialReimbursementSilver', v_material_reimbursement,
    'craftFeeSilver', v_craft_fee,
    'settlementTotalSilver', v_total,
    'replayed', false
  );
end;
$$;

create or replace function public.release_supply_craft_task(
  p_task_id uuid,
  p_guild_id uuid,
  p_crafter_discord_id text,
  p_idempotency_key uuid,
  p_correlation_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.craft_tasks%rowtype;
  v_fulfillment public.supply_fulfillments%rowtype;
  v_actor_member_id uuid;
begin
  if p_task_id is null or p_guild_id is null or p_idempotency_key is null
     or nullif(btrim(p_crafter_discord_id), '') is null
     or char_length(p_crafter_discord_id) > 128
     or nullif(btrim(p_correlation_id), '') is null
     or char_length(p_correlation_id) > 128 then
    raise exception 'SUPPLY_RELEASE_INVALID';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_guild_id::text || ':supply-release:' || p_task_id::text, 0)
  );

  select task.*
    into v_task
    from public.craft_tasks task
   where task.guild_id = p_guild_id
     and task.id = p_task_id
     and task.task_kind = 'regear'
   for update;

  if not found then
    raise exception 'CRAFT_TASK_NOT_CLAIMED_BY_YOU';
  end if;

  select fulfillment.*
    into v_fulfillment
    from public.supply_fulfillments fulfillment
   where fulfillment.guild_id = p_guild_id
     and fulfillment.craft_task_id = p_task_id
     and fulfillment.source_kind = 'regear_request'
   for update;

  if not found then
    raise exception 'CRAFT_TASK_NOT_CLAIMED_BY_YOU';
  end if;

  if v_task.status = 'queued'
     and v_fulfillment.status = 'queued'
     and exists (
       select 1
         from public.supply_fulfillment_events event
        where event.guild_id = p_guild_id
          and event.fulfillment_id = v_fulfillment.id
          and event.event_type = 'craft_released'
          and event.idempotency_key = p_idempotency_key
          and event.actor_discord_id = p_crafter_discord_id
     ) then
    return jsonb_build_object(
      'taskId', p_task_id,
      'fulfillmentId', v_fulfillment.id,
      'status', 'queued',
      'replayed', true
    );
  end if;

  if v_task.status <> 'claimed'
     or v_task.crafter_discord_id is distinct from p_crafter_discord_id
     or v_fulfillment.status <> 'in_progress' then
    raise exception 'CRAFT_TASK_NOT_CLAIMED_BY_YOU';
  end if;

  v_actor_member_id := public.resolve_guild_member_id(
    p_guild_id,
    public.guild_member_access_identity_type(p_crafter_discord_id),
    p_crafter_discord_id
  );

  update public.craft_tasks
     set status = 'queued',
         crafter_discord_id = null,
         crafter_username = null,
         compensation_mode = null,
         premium_silver = 0,
         claimed_at = null
   where guild_id = p_guild_id
     and id = p_task_id
     and status = 'claimed'
     and crafter_discord_id = p_crafter_discord_id;

  update public.supply_fulfillments
     set status = 'queued',
         crafter_member_id = null,
         material_source = 'not_applicable',
         craft_fee_mode = 'not_applicable',
         quoted_material_value_silver = 0,
         material_reimbursement_silver = 0,
         craft_fee_silver = 0,
         settlement_total_silver = 0,
         settlement_terms_accepted_at = null,
         version = version + 1,
         updated_at = now()
   where guild_id = p_guild_id
     and id = v_fulfillment.id;

  insert into public.supply_fulfillment_events (
    guild_id, fulfillment_id, event_type, from_status, to_status,
    actor_member_id, actor_discord_id, correlation_id, idempotency_key, details
  ) values (
    p_guild_id, v_fulfillment.id, 'craft_released', 'in_progress', 'queued',
    v_actor_member_id, p_crafter_discord_id, p_correlation_id, p_idempotency_key,
    '{}'::jsonb
  ) on conflict do nothing;

  return jsonb_build_object(
    'taskId', p_task_id,
    'fulfillmentId', v_fulfillment.id,
    'status', 'queued',
    'replayed', false
  );
end;
$$;

create or replace function public.execute_supply_craft_delivery(
  p_guild_id uuid,
  p_idempotency_key uuid,
  p_correlation_id text,
  p_actor_discord_id text,
  p_actor_username text,
  p_source text,
  p_request_payload jsonb,
  p_execution_payload jsonb default '{}'::jsonb,
  p_confirmation_token uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.application_command_runs%rowtype;
  v_confirmation public.application_command_confirmations%rowtype;
  v_task public.craft_tasks%rowtype;
  v_request public.regear_requests%rowtype;
  v_fulfillment public.supply_fulfillments%rowtype;
  v_actor_member_id uuid;
  v_task_id uuid;
  v_box_number integer;
  v_followup_days integer;
  v_box_min integer;
  v_box_max integer;
  v_due_at timestamptz;
  v_slot text;
  v_item_id text;
  v_base_item_id text;
  v_base_suffix text;
  v_stock integer;
  v_used integer;
  v_outside integer;
  v_warned_item_ids jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  if p_guild_id is null
     or p_idempotency_key is null
     or p_source not in ('web', 'discord')
     or (p_source = 'discord' and p_confirmation_token is null)
     or (p_source = 'web' and p_confirmation_token is not null)
     or nullif(btrim(p_correlation_id), '') is null
     or char_length(p_correlation_id) > 128
     or nullif(btrim(p_actor_discord_id), '') is null
     or char_length(p_actor_discord_id) > 128
     or nullif(btrim(p_actor_username), '') is null
     or char_length(p_actor_username) > 128
     or p_request_payload is null
     or jsonb_typeof(p_request_payload) <> 'object'
     or octet_length(p_request_payload::text) > 131072
     or p_execution_payload is null
     or jsonb_typeof(p_execution_payload) <> 'object' then
    raise exception 'application_command_invalid';
  end if;

  begin
    v_task_id := nullif(p_request_payload ->> 'taskId', '')::uuid;
    v_box_number := nullif(p_request_payload ->> 'boxNumber', '')::integer;
    v_followup_days := nullif(p_execution_payload ->> 'followupDays', '')::integer;
  exception when others then
    raise exception 'application_command_craft_invalid';
  end;

  if v_task_id is null
     or v_box_number is null
     or v_box_number < 1
     or v_box_number > 999
     or v_followup_days is null
     or v_followup_days < 1
     or v_followup_days > 30 then
    raise exception 'application_command_craft_invalid';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_guild_id::text || ':application-command:' || p_idempotency_key::text,
      0
    )
  );

  if p_confirmation_token is not null then
    select confirmation.*
      into v_confirmation
      from public.application_command_confirmations confirmation
     where confirmation.token = p_confirmation_token
     for update;

    if v_confirmation.token is null
       or v_confirmation.guild_id is distinct from p_guild_id
       or v_confirmation.command_name is distinct from 'craft.deliver'
       or v_confirmation.idempotency_key is distinct from p_idempotency_key
       or v_confirmation.actor_discord_id is distinct from p_actor_discord_id
       or v_confirmation.request_payload is distinct from p_request_payload then
      raise exception 'application_command_confirmation_invalid';
    end if;
    if v_confirmation.cancelled_at is not null then
      raise exception 'application_command_confirmation_cancelled';
    end if;
    if v_confirmation.confirmed_at is null
       and v_confirmation.expires_at <= now() then
      raise exception 'application_command_confirmation_expired';
    end if;

    update public.application_command_confirmations
       set confirmed_at = coalesce(confirmed_at, now())
     where token = p_confirmation_token;
  end if;

  select run.*
    into v_existing
    from public.application_command_runs run
   where run.guild_id = p_guild_id
     and run.idempotency_key = p_idempotency_key;

  if v_existing.id is not null then
    if v_existing.command_name is distinct from 'craft.deliver'
       or v_existing.actor_discord_id is distinct from p_actor_discord_id
       or v_existing.source is distinct from p_source
       or v_existing.request_payload is distinct from p_request_payload then
      raise exception 'application_command_idempotency_conflict';
    end if;
    return v_existing.result || jsonb_build_object('replayed', true);
  end if;

  select task.*
    into v_task
    from public.craft_tasks task
   where task.guild_id = p_guild_id
     and task.id = v_task_id
     and task.task_kind = 'regear'
     and task.status = 'claimed'
     and task.crafter_discord_id = p_actor_discord_id
   for update;

  if not found then
    raise exception 'CRAFT_TASK_NOT_CLAIMED_BY_YOU';
  end if;

  select request.*
    into v_request
    from public.regear_requests request
   where request.guild_id = p_guild_id
     and request.id = v_task.regear_request_id;
  if not found then
    raise exception 'SUPPLY_REGEAR_REQUEST_NOT_FOUND';
  end if;

  select fulfillment.*
    into v_fulfillment
    from public.supply_fulfillments fulfillment
   where fulfillment.guild_id = p_guild_id
     and fulfillment.craft_task_id = v_task_id
   for update;

  if not found
     or v_fulfillment.status <> 'in_progress'
     or v_fulfillment.settlement_terms_accepted_at is null
     or v_fulfillment.crafter_member_id is null
     or v_fulfillment.material_source not in ('guild_stock', 'crafter_purchase')
     or v_fulfillment.craft_fee_mode not in ('none', 'configured') then
    raise exception 'SUPPLY_SETTLEMENT_TERMS_NOT_ACCEPTED';
  end if;

  v_actor_member_id := public.resolve_guild_member_id(
    p_guild_id,
    public.guild_member_access_identity_type(p_actor_discord_id),
    p_actor_discord_id
  );
  if v_actor_member_id is null
     or v_actor_member_id is distinct from v_fulfillment.crafter_member_id then
    raise exception 'SUPPLY_CRAFTER_MEMBER_MISMATCH';
  end if;

  select
    coalesce((select value::integer from public.app_settings
      where key = 'craft_box_range_min' and guild_id = p_guild_id), 1),
    coalesce((select value::integer from public.app_settings
      where key = 'craft_box_range_max' and guild_id = p_guild_id), 30)
  into v_box_min, v_box_max;

  if v_box_number < v_box_min or v_box_number > v_box_max then
    raise exception 'BOX_OUT_OF_RANGE';
  end if;

  v_due_at := now() + make_interval(days => v_followup_days);

  update public.craft_tasks
     set status = 'delivered',
         box_number = v_box_number,
         craft_city = '',
         craft_focus_used = false,
         material_silver_cost = v_fulfillment.material_reimbursement_silver,
         premium_silver = v_fulfillment.craft_fee_silver,
         reimbursement_silver = v_fulfillment.settlement_total_silver,
         reimbursement_status = 'not_required',
         reimbursement_approved_at = null,
         reimbursement_approved_by = null,
         reimbursement_approved_by_username = null,
         reimbursement_rejected_at = null,
         reimbursement_rejected_by = null,
         reimbursement_rejected_by_username = null,
         reimbursement_reject_reason = null,
         delivered_at = now(),
         expires_at = v_due_at,
         expired_at = null
   where guild_id = p_guild_id
     and id = v_task_id
     and status = 'claimed'
     and crafter_discord_id = p_actor_discord_id;

  if not found then
    raise exception 'CRAFT_TASK_DELIVER_FAILED';
  end if;

  perform set_config('app.supply_inventory_suppress_trigger', 'true', true);

  if v_request.build_snapshot is not null
     and jsonb_typeof(v_request.build_snapshot) = 'object' then
    for v_slot in
      select allowed.value
        from unnest(
          array['weapon', 'head', 'armor', 'shoes', 'offhand', 'cape']::text[]
        ) allowed(value)
       where jsonb_typeof(v_request.craft_included_slots) = 'array'
         and v_request.craft_included_slots ? allowed.value
    loop
      v_item_id := nullif(btrim(v_request.build_snapshot -> v_slot ->> 'id'), '');
      if v_item_id is null then
        continue;
      end if;

      if not (
        (v_item_id ~ '^T[0-9]+_(2H|MAIN)_' and v_item_id !~ '^T[0-9]+_2H_TOOL_')
        or v_item_id ~ '^T[0-9]+_(HEAD|ARMOR|SHOES)_(PLATE|LEATHER|CLOTH)(_|$)'
        or v_item_id ~ '^T[0-9]+_OFF_'
        or v_item_id ~ '^T[0-9]+_(CAPEITEM|CAPE)(_|$)'
        or v_item_id ~ '^T[0-9]+_BAG(_|$)'
      ) then
        continue;
      end if;

      select inventory.quantity
        into v_stock
        from public.guild_inventory_gear inventory
       where inventory.guild_id = p_guild_id
         and inventory.item_id = v_item_id
       for update;

      v_stock := coalesce(v_stock, 0);
      v_used := least(v_stock, 1);
      v_outside := 1 - v_used;

      if v_used > 0 then
        update public.guild_inventory_gear
           set quantity = quantity - v_used,
               updated_at = now(),
               updated_by_discord_id = p_actor_discord_id
         where guild_id = p_guild_id
           and item_id = v_item_id;

        insert into public.guild_inventory_movements (
          guild_id, item_id, delta, quantity_after, reason,
          reference_kind, reference_id, line_key,
          actor_member_id, actor_discord_id, correlation_id
        ) values (
          p_guild_id, v_item_id, -v_used, v_stock - v_used, 'craft_delivery',
          'supply_fulfillment', v_fulfillment.id, v_slot,
          v_actor_member_id, p_actor_discord_id, p_correlation_id
        );
      end if;

      if v_outside > 0 then
        insert into public.supply_outside_stock_fulfillments (
          guild_id, fulfillment_id, task_id, item_id, line_key, quantity,
          material_source, actor_member_id, actor_discord_id, correlation_id
        ) values (
          p_guild_id, v_fulfillment.id, v_task_id, v_item_id, v_slot, v_outside,
          v_fulfillment.material_source, v_actor_member_id,
          p_actor_discord_id, p_correlation_id
        );
        if not (v_warned_item_ids @> jsonb_build_array(v_item_id)) then
          v_warned_item_ids := v_warned_item_ids || jsonb_build_array(v_item_id);
        end if;
      end if;

      v_base_item_id := split_part(v_item_id, '@', 1);
      if v_base_item_id !~ '^T[0-9]+_(CAPEITEM|CAPE|BAG)(_|$)' then
        v_base_suffix := nullif(regexp_replace(v_base_item_id, '^T[0-9]+_', ''), '');
        if v_base_suffix is not null then
          insert into public.guild_tracked_inventory_items (
            guild_id, base_suffix, sort_order
          ) values (
            p_guild_id, v_base_suffix, 0
          ) on conflict (guild_id, base_suffix) do nothing;
        end if;
      end if;
    end loop;
  end if;

  if jsonb_array_length(v_warned_item_ids) > 0 then
    update public.craft_tasks
       set inventory_warned = true
     where guild_id = p_guild_id
       and id = v_task_id;
  end if;

  update public.supply_fulfillments
     set status = 'ready_for_pickup',
         receipt_due_at = v_due_at,
         receipt_overdue_at = null,
         version = version + 1,
         updated_at = now()
   where guild_id = p_guild_id
     and id = v_fulfillment.id
     and status in ('in_progress', 'ready_for_pickup');

  if v_fulfillment.settlement_total_silver > 0 then
    insert into public.supply_settlement_items (
      guild_id, fulfillment_id, crafter_member_id, amount_silver,
      status, payable_at
    ) values (
      p_guild_id, v_fulfillment.id, v_fulfillment.crafter_member_id,
      v_fulfillment.settlement_total_silver, 'payable', now()
    ) on conflict (guild_id, fulfillment_id) do nothing;
  end if;

  insert into public.supply_fulfillment_events (
    guild_id, fulfillment_id, event_type, from_status, to_status,
    actor_member_id, actor_discord_id, correlation_id, idempotency_key, details
  ) values (
    p_guild_id, v_fulfillment.id, 'craft_delivered', 'in_progress', 'ready_for_pickup',
    v_actor_member_id, p_actor_discord_id, p_correlation_id, p_idempotency_key,
    jsonb_build_object(
      'boxNumber', v_box_number,
      'receiptDueAt', v_due_at,
      'settlementTotalSilver', v_fulfillment.settlement_total_silver,
      'outsideStockItems', v_warned_item_ids
    )
  );

  insert into public.admin_audit_log (
    guild_id, admin_discord_id, action, target_id, target_kind, details
  ) values (
    p_guild_id, p_actor_discord_id, 'craft.task.deliver',
    v_task_id::text, 'craft_task',
    jsonb_build_object(
      'fulfillmentId', v_fulfillment.id,
      'boxNumber', v_box_number,
      'source', p_source,
      'correlationId', p_correlation_id,
      'idempotencyKey', p_idempotency_key,
      'settlementTotalSilver', v_fulfillment.settlement_total_silver
    )
  );

  insert into public.domain_outbox (
    guild_id, topic, aggregate_kind, aggregate_id,
    recipient_kind, recipient_member_id, payload, correlation_id
  ) values (
    p_guild_id, 'craft.ready_for_pickup', 'supply_fulfillment', v_fulfillment.id,
    'member', v_fulfillment.requester_member_id,
    jsonb_build_object(
      'taskId', v_task_id,
      'boxNumber', v_box_number,
      'eventTitle', v_request.event_title_snapshot,
      'crafterUsername', p_actor_username
    ),
    p_correlation_id
  ) on conflict do nothing;

  v_result := jsonb_build_object(
    'taskId', v_task_id,
    'fulfillmentId', v_fulfillment.id,
    'status', 'ready_for_pickup',
    'boxNumber', v_box_number,
    'followupDays', v_followup_days,
    'receiptDueAt', v_due_at,
    'materialReimbursementSilver', v_fulfillment.material_reimbursement_silver,
    'craftFeeSilver', v_fulfillment.craft_fee_silver,
    'settlementTotalSilver', v_fulfillment.settlement_total_silver,
    'reimbursementMode', case
      when v_fulfillment.settlement_total_silver > 0 then 'paid'
      else 'volunteer'
    end,
    'reimbursementStatus', 'not_required',
    'inventoryWarned', jsonb_array_length(v_warned_item_ids) > 0,
    'warnedItemIds', v_warned_item_ids,
    'requesterDiscordId', v_request.discord_id,
    'requesterUsername', v_request.username,
    'eventTitle', v_request.event_title_snapshot
  );

  insert into public.application_command_runs (
    guild_id, command_name, idempotency_key, correlation_id,
    actor_discord_id, actor_username, source, request_payload, result
  ) values (
    p_guild_id, 'craft.deliver', p_idempotency_key, p_correlation_id,
    p_actor_discord_id, p_actor_username, p_source, p_request_payload, v_result
  );

  return v_result || jsonb_build_object('replayed', false);
end;
$$;

create or replace function public.collect_supply_fulfillment(
  p_task_id uuid,
  p_guild_id uuid,
  p_member_discord_id text,
  p_idempotency_key uuid,
  p_correlation_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.craft_tasks%rowtype;
  v_fulfillment public.supply_fulfillments%rowtype;
  v_requester_discord_id text;
  v_actor_member_id uuid;
  v_from_status text;
begin
  if p_task_id is null or p_guild_id is null or p_idempotency_key is null
     or nullif(btrim(p_member_discord_id), '') is null
     or char_length(p_member_discord_id) > 128
     or nullif(btrim(p_correlation_id), '') is null
     or char_length(p_correlation_id) > 128 then
    raise exception 'SUPPLY_COLLECT_INVALID';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_guild_id::text || ':supply-collect:' || p_task_id::text, 0)
  );

  select task.*
    into v_task
    from public.craft_tasks task
   where task.guild_id = p_guild_id
     and task.id = p_task_id
     and task.task_kind = 'regear'
   for update;

  if not found then
    raise exception 'CRAFT_TASK_NOT_DELIVERED';
  end if;

  select fulfillment.*
    into v_fulfillment
    from public.supply_fulfillments fulfillment
   where fulfillment.guild_id = p_guild_id
     and fulfillment.craft_task_id = p_task_id
     and fulfillment.source_kind = 'regear_request'
   for update;

  if not found then
    raise exception 'CRAFT_TASK_NOT_DELIVERED';
  end if;

  select request.discord_id
    into v_requester_discord_id
    from public.regear_requests request
   where request.guild_id = p_guild_id
     and request.id = v_task.regear_request_id;

  v_actor_member_id := public.resolve_guild_member_id(
    p_guild_id,
    public.guild_member_access_identity_type(p_member_discord_id),
    p_member_discord_id
  );
  if (v_fulfillment.requester_member_id is not null
      and v_fulfillment.requester_member_id is distinct from v_actor_member_id)
     or (v_fulfillment.requester_member_id is null
      and v_requester_discord_id is distinct from p_member_discord_id) then
    raise exception 'CRAFT_TASK_NOT_YOURS';
  end if;

  if v_fulfillment.status = 'completed' then
    return jsonb_build_object(
      'taskId', p_task_id,
      'fulfillmentId', v_fulfillment.id,
      'status', 'completed',
      'replayed', true
    );
  end if;

  if v_fulfillment.status not in ('ready_for_pickup', 'receipt_overdue') then
    raise exception 'CRAFT_TASK_NOT_DELIVERED';
  end if;
  v_from_status := v_fulfillment.status;

  update public.craft_tasks
     set status = 'collected',
         collected_at = now()
   where guild_id = p_guild_id
     and id = p_task_id
     and status = 'delivered';
  if not found then
    raise exception 'CRAFT_TASK_NOT_DELIVERED';
  end if;

  update public.supply_fulfillments
     set status = 'completed',
         completed_at = now(),
         version = version + 1,
         updated_at = now()
   where guild_id = p_guild_id
     and id = v_fulfillment.id;

  insert into public.supply_fulfillment_events (
    guild_id, fulfillment_id, event_type, from_status, to_status,
    actor_member_id, actor_discord_id, correlation_id, idempotency_key, details
  ) values (
    p_guild_id, v_fulfillment.id, 'pickup_collected', v_from_status, 'completed',
    v_actor_member_id, p_member_discord_id, p_correlation_id, p_idempotency_key,
    '{}'::jsonb
  ) on conflict do nothing;

  insert into public.domain_outbox (
    guild_id, topic, aggregate_kind, aggregate_id,
    recipient_kind, recipient_member_id, payload, correlation_id
  ) values (
    p_guild_id, 'craft.pickup_collected', 'supply_fulfillment', v_fulfillment.id,
    'admin', null, jsonb_build_object('taskId', p_task_id), p_correlation_id
  ) on conflict do nothing;

  return jsonb_build_object(
    'taskId', p_task_id,
    'fulfillmentId', v_fulfillment.id,
    'status', 'completed',
    'replayed', false
  );
end;
$$;

create or replace function public.move_supply_craft_box(
  p_task_id uuid,
  p_guild_id uuid,
  p_box_number integer,
  p_actor_discord_id text,
  p_idempotency_key uuid,
  p_correlation_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.craft_tasks%rowtype;
  v_fulfillment public.supply_fulfillments%rowtype;
  v_old_box integer;
  v_actor_member_id uuid;
  v_box_min integer;
  v_box_max integer;
begin
  if p_task_id is null or p_guild_id is null or p_idempotency_key is null
     or p_box_number is null or p_box_number < 1 or p_box_number > 999
     or nullif(btrim(p_actor_discord_id), '') is null
     or char_length(p_actor_discord_id) > 128
     or nullif(btrim(p_correlation_id), '') is null
     or char_length(p_correlation_id) > 128 then
    raise exception 'SUPPLY_BOX_MOVE_INVALID';
  end if;

  select
    coalesce((select value::integer from public.app_settings
      where key = 'craft_box_range_min' and guild_id = p_guild_id), 1),
    coalesce((select value::integer from public.app_settings
      where key = 'craft_box_range_max' and guild_id = p_guild_id), 30)
  into v_box_min, v_box_max;
  if p_box_number < v_box_min or p_box_number > v_box_max then
    raise exception 'BOX_OUT_OF_RANGE';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_guild_id::text || ':supply-box:' || p_task_id::text, 0)
  );

  select task.*
    into v_task
    from public.craft_tasks task
   where task.guild_id = p_guild_id
     and task.id = p_task_id
     and task.task_kind = 'regear'
   for update;

  if not found or v_task.status <> 'delivered' then
    raise exception 'CRAFT_TASK_NOT_DELIVERED';
  end if;

  select fulfillment.*
    into v_fulfillment
    from public.supply_fulfillments fulfillment
   where fulfillment.guild_id = p_guild_id
     and fulfillment.craft_task_id = p_task_id
     and fulfillment.source_kind = 'regear_request'
   for update;

  if not found or v_fulfillment.status not in ('ready_for_pickup', 'receipt_overdue') then
    raise exception 'CRAFT_TASK_NOT_DELIVERED';
  end if;

  v_old_box := v_task.box_number;

  if v_old_box = p_box_number then
    return jsonb_build_object(
      'taskId', p_task_id,
      'fulfillmentId', v_fulfillment.id,
      'status', v_fulfillment.status,
      'boxNumber', p_box_number,
      'replayed', true
    );
  end if;

  v_actor_member_id := public.resolve_guild_member_id(
    p_guild_id,
    public.guild_member_access_identity_type(p_actor_discord_id),
    p_actor_discord_id
  );

  update public.craft_tasks
     set box_number = p_box_number
   where guild_id = p_guild_id
     and id = p_task_id
     and status = 'delivered';

  update public.supply_fulfillments
     set version = version + 1,
         updated_at = now()
   where guild_id = p_guild_id
     and id = v_fulfillment.id;

  insert into public.supply_fulfillment_events (
    guild_id, fulfillment_id, event_type, from_status, to_status,
    actor_member_id, actor_discord_id, correlation_id, idempotency_key, details
  ) values (
    p_guild_id, v_fulfillment.id, 'box_moved', v_fulfillment.status, v_fulfillment.status,
    v_actor_member_id, p_actor_discord_id, p_correlation_id, p_idempotency_key,
    jsonb_build_object('oldBoxNumber', v_old_box, 'newBoxNumber', p_box_number)
  );

  insert into public.admin_audit_log (
    guild_id, admin_discord_id, action, target_id, target_kind, details
  ) values (
    p_guild_id, p_actor_discord_id, 'craft.box.move',
    p_task_id::text, 'craft_task',
    jsonb_build_object(
      'oldBoxNumber', v_old_box,
      'newBoxNumber', p_box_number,
      'correlationId', p_correlation_id,
      'idempotencyKey', p_idempotency_key
    )
  );

  insert into public.domain_outbox (
    guild_id, topic, aggregate_kind, aggregate_id,
    recipient_kind, recipient_member_id, payload, correlation_id
  ) values (
    p_guild_id, 'craft.box_moved', 'supply_fulfillment', v_fulfillment.id,
    'member', v_fulfillment.requester_member_id,
    jsonb_build_object(
      'taskId', p_task_id,
      'oldBoxNumber', v_old_box,
      'newBoxNumber', p_box_number
    ),
    p_correlation_id
  ) on conflict do nothing;

  return jsonb_build_object(
    'taskId', p_task_id,
    'fulfillmentId', v_fulfillment.id,
    'status', v_fulfillment.status,
    'boxNumber', p_box_number,
    'replayed', false
  );
end;
$$;

create or replace function public.return_unclaimed_supply_craft(
  p_task_id uuid,
  p_guild_id uuid,
  p_actor_discord_id text,
  p_idempotency_key uuid,
  p_correlation_id text,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.craft_tasks%rowtype;
  v_fulfillment public.supply_fulfillments%rowtype;
  v_request public.regear_requests%rowtype;
  v_actor_member_id uuid;
  v_from_status text;
  v_slot text;
  v_item_id text;
  v_quantity_after integer;
begin
  if p_task_id is null or p_guild_id is null or p_idempotency_key is null
     or nullif(btrim(p_actor_discord_id), '') is null
     or char_length(p_actor_discord_id) > 128
     or nullif(btrim(p_correlation_id), '') is null
     or char_length(p_correlation_id) > 128
     or char_length(coalesce(p_reason, '')) > 500 then
    raise exception 'SUPPLY_UNCLAIMED_RETURN_INVALID';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_guild_id::text || ':supply-return:' || p_task_id::text, 0)
  );

  select task.*
    into v_task
    from public.craft_tasks task
   where task.guild_id = p_guild_id
     and task.id = p_task_id
     and task.task_kind = 'regear'
   for update;

  if not found then
    raise exception 'CRAFT_TASK_NOT_DELIVERED';
  end if;

  select fulfillment.*
    into v_fulfillment
    from public.supply_fulfillments fulfillment
   where fulfillment.guild_id = p_guild_id
     and fulfillment.craft_task_id = p_task_id
     and fulfillment.source_kind = 'regear_request'
   for update;

  if not found then
    raise exception 'CRAFT_TASK_NOT_DELIVERED';
  end if;
  if v_fulfillment.status = 'returned_unclaimed' then
    return jsonb_build_object(
      'taskId', p_task_id,
      'fulfillmentId', v_fulfillment.id,
      'status', 'returned_unclaimed',
      'settlementPreserved', true,
      'replayed', true
    );
  end if;
  if v_fulfillment.status not in ('ready_for_pickup', 'receipt_overdue')
     or v_task.status <> 'delivered' then
    raise exception 'CRAFT_TASK_NOT_DELIVERED';
  end if;

  select request.*
    into v_request
    from public.regear_requests request
   where request.guild_id = p_guild_id
     and request.id = v_task.regear_request_id;
  v_from_status := v_fulfillment.status;
  v_actor_member_id := public.resolve_guild_member_id(
    p_guild_id,
    public.guild_member_access_identity_type(p_actor_discord_id),
    p_actor_discord_id
  );

  perform set_config('app.supply_inventory_suppress_trigger', 'true', true);

  if v_request.build_snapshot is not null
     and jsonb_typeof(v_request.build_snapshot) = 'object' then
    for v_slot in
      select allowed.value
        from unnest(
          array['weapon', 'head', 'armor', 'shoes', 'offhand', 'cape']::text[]
        ) allowed(value)
       where jsonb_typeof(v_request.craft_included_slots) = 'array'
         and v_request.craft_included_slots ? allowed.value
    loop
      v_item_id := nullif(btrim(v_request.build_snapshot -> v_slot ->> 'id'), '');
      if v_item_id is null then
        continue;
      end if;

      insert into public.guild_inventory_gear (
        guild_id, item_id, quantity, updated_by_discord_id
      ) values (
        p_guild_id, v_item_id, 1, p_actor_discord_id
      )
      on conflict (guild_id, item_id) do update
        set quantity = public.guild_inventory_gear.quantity + 1,
            updated_at = now(),
            updated_by_discord_id = p_actor_discord_id
      returning quantity into v_quantity_after;

      insert into public.guild_inventory_movements (
        guild_id, item_id, delta, quantity_after, reason,
        reference_kind, reference_id, line_key,
        actor_member_id, actor_discord_id, correlation_id
      ) values (
        p_guild_id, v_item_id, 1, v_quantity_after, 'unclaimed_return',
        'supply_fulfillment', v_fulfillment.id, v_slot,
        v_actor_member_id, p_actor_discord_id, p_correlation_id
      );
    end loop;
  end if;

  update public.craft_tasks
     set status = 'cancelled',
         cancelled_at = now()
   where guild_id = p_guild_id
     and id = p_task_id
     and status = 'delivered';

  update public.supply_fulfillments
     set status = 'returned_unclaimed',
         returned_unclaimed_at = now(),
         cancelled_at = null,
         version = version + 1,
         updated_at = now()
   where guild_id = p_guild_id
     and id = v_fulfillment.id;

  insert into public.supply_fulfillment_events (
    guild_id, fulfillment_id, event_type, from_status, to_status,
    actor_member_id, actor_discord_id, correlation_id, idempotency_key, details
  ) values (
    p_guild_id, v_fulfillment.id, 'unclaimed_returned', v_from_status, 'returned_unclaimed',
    v_actor_member_id, p_actor_discord_id, p_correlation_id, p_idempotency_key,
    jsonb_build_object('reason', nullif(btrim(coalesce(p_reason, '')), ''))
  );

  insert into public.admin_audit_log (
    guild_id, admin_discord_id, action, target_id, target_kind, details
  ) values (
    p_guild_id, p_actor_discord_id, 'craft.unclaimed.return',
    p_task_id::text, 'craft_task',
    jsonb_build_object(
      'fulfillmentId', v_fulfillment.id,
      'reason', nullif(btrim(coalesce(p_reason, '')), ''),
      'correlationId', p_correlation_id,
      'idempotencyKey', p_idempotency_key
    )
  );

  insert into public.domain_outbox (
    guild_id, topic, aggregate_kind, aggregate_id,
    recipient_kind, recipient_member_id, payload, correlation_id
  ) values (
    p_guild_id, 'craft.unclaimed_returned', 'supply_fulfillment', v_fulfillment.id,
    'member', v_fulfillment.requester_member_id,
    jsonb_build_object('taskId', p_task_id), p_correlation_id
  ) on conflict do nothing;

  return jsonb_build_object(
    'taskId', p_task_id,
    'fulfillmentId', v_fulfillment.id,
    'status', 'returned_unclaimed',
    'settlementPreserved', true,
    'replayed', false
  );
end;
$$;

-- The historical function name remains for the existing cron route, but its
-- contract is now "mark follow-up overdue". It never changes craft_tasks,
-- never frees a box, and never creates a terminal state.
create or replace function public.expire_craft_tasks()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_count integer := 0;
  v_idempotency_key uuid;
  v_correlation_id text;
begin
  for v_row in
    select fulfillment.id, fulfillment.guild_id, fulfillment.requester_member_id
      from public.supply_fulfillments fulfillment
      join public.craft_tasks task
        on task.guild_id = fulfillment.guild_id
       and task.id = fulfillment.craft_task_id
     where fulfillment.status = 'ready_for_pickup'
       and fulfillment.receipt_due_at is not null
       and fulfillment.receipt_due_at <= now()
       and task.task_kind = 'regear'
       and task.status = 'delivered'
       and public.is_regear_support_enabled(fulfillment.guild_id)
     for update of fulfillment skip locked
  loop
    v_idempotency_key := gen_random_uuid();
    v_correlation_id := 'craft-followup:' || v_row.id::text;

    update public.supply_fulfillments
       set status = 'receipt_overdue',
           receipt_overdue_at = now(),
           version = version + 1,
           updated_at = now()
     where guild_id = v_row.guild_id
       and id = v_row.id
       and status = 'ready_for_pickup';

    if not found then
      continue;
    end if;

    insert into public.supply_fulfillment_events (
      guild_id, fulfillment_id, event_type, from_status, to_status,
      actor_member_id, actor_discord_id, correlation_id, idempotency_key, details
    ) values (
      v_row.guild_id, v_row.id, 'pickup_followup_overdue',
      'ready_for_pickup', 'receipt_overdue', null, null,
      v_correlation_id, v_idempotency_key, '{}'::jsonb
    );

    insert into public.domain_outbox (
      guild_id, topic, aggregate_kind, aggregate_id,
      recipient_kind, recipient_member_id, payload, correlation_id
    ) values (
      v_row.guild_id, 'craft.pickup_overdue', 'supply_fulfillment', v_row.id,
      'member', v_row.requester_member_id, '{}'::jsonb, v_correlation_id
    ) on conflict do nothing;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.pay_supply_settlement_batch(
  p_guild_id uuid,
  p_crafter_member_id uuid,
  p_actor_discord_id text,
  p_actor_username text,
  p_idempotency_key uuid,
  p_correlation_id text,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.supply_settlement_batches%rowtype;
  v_batch_id uuid := gen_random_uuid();
  v_actor_member_id uuid;
  v_total bigint;
  v_count integer;
  v_item record;
begin
  if p_guild_id is null or p_crafter_member_id is null or p_idempotency_key is null
     or nullif(btrim(p_actor_discord_id), '') is null
     or char_length(p_actor_discord_id) > 128
     or nullif(btrim(p_actor_username), '') is null
     or char_length(p_actor_username) > 128
     or nullif(btrim(p_correlation_id), '') is null
     or char_length(p_correlation_id) > 128
     or char_length(coalesce(p_note, '')) > 500 then
    raise exception 'SUPPLY_SETTLEMENT_BATCH_INVALID';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_guild_id::text || ':supply-settlement:' || p_idempotency_key::text,
      0
    )
  );

  select batch.*
    into v_existing
    from public.supply_settlement_batches batch
   where batch.guild_id = p_guild_id
     and batch.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.crafter_member_id is distinct from p_crafter_member_id
       or v_existing.paid_by_discord_id is distinct from p_actor_discord_id
       or v_existing.correlation_id is distinct from p_correlation_id
       or v_existing.note is distinct from nullif(btrim(coalesce(p_note, '')), '') then
      raise exception 'SUPPLY_SETTLEMENT_IDEMPOTENCY_CONFLICT';
    end if;
    select count(*)
      into v_count
      from public.supply_settlement_items item
     where item.guild_id = p_guild_id
       and item.payment_batch_id = v_existing.id;
    return jsonb_build_object(
      'batchId', v_existing.id,
      'crafterMemberId', v_existing.crafter_member_id,
      'totalSilver', v_existing.total_silver,
      'itemCount', v_count,
      'paidAt', v_existing.paid_at,
      'replayed', true
    );
  end if;

  perform 1
    from public.guild_member_records member
   where member.guild_id = p_guild_id
     and member.id = p_crafter_member_id;
  if not found then
    raise exception 'SUPPLY_CRAFTER_MEMBER_NOT_FOUND';
  end if;

  v_actor_member_id := public.resolve_guild_member_id(
    p_guild_id,
    public.guild_member_access_identity_type(p_actor_discord_id),
    p_actor_discord_id
  );

  perform 1
    from public.supply_settlement_items item
   where item.guild_id = p_guild_id
     and item.crafter_member_id = p_crafter_member_id
     and item.status = 'payable'
   for update;

  select coalesce(sum(item.amount_silver), 0), count(*)
    into v_total, v_count
    from public.supply_settlement_items item
   where item.guild_id = p_guild_id
     and item.crafter_member_id = p_crafter_member_id
     and item.status = 'payable';

  if v_count = 0 or v_total <= 0 then
    raise exception 'SUPPLY_SETTLEMENT_NOT_PAYABLE';
  end if;

  insert into public.supply_settlement_batches (
    id, guild_id, crafter_member_id, total_silver,
    paid_by_member_id, paid_by_discord_id, note,
    idempotency_key, correlation_id
  ) values (
    v_batch_id, p_guild_id, p_crafter_member_id, v_total,
    v_actor_member_id, p_actor_discord_id,
    nullif(btrim(coalesce(p_note, '')), ''),
    p_idempotency_key, p_correlation_id
  );

  update public.supply_settlement_items
     set status = 'paid',
         payment_batch_id = v_batch_id,
         paid_at = now(),
         updated_at = now()
   where guild_id = p_guild_id
     and crafter_member_id = p_crafter_member_id
     and status = 'payable';

  for v_item in
    select item.fulfillment_id, item.amount_silver
      from public.supply_settlement_items item
     where item.guild_id = p_guild_id
       and item.payment_batch_id = v_batch_id
  loop
    insert into public.supply_fulfillment_events (
      guild_id, fulfillment_id, event_type, from_status, to_status,
      actor_member_id, actor_discord_id, correlation_id, idempotency_key, details
    )
    select
      p_guild_id, fulfillment.id, 'settlement_paid',
      fulfillment.status, fulfillment.status,
      v_actor_member_id, p_actor_discord_id, p_correlation_id,
      p_idempotency_key,
      jsonb_build_object(
        'batchId', v_batch_id,
        'amountSilver', v_item.amount_silver
      )
    from public.supply_fulfillments fulfillment
    where fulfillment.guild_id = p_guild_id
      and fulfillment.id = v_item.fulfillment_id;
  end loop;

  insert into public.admin_audit_log (
    guild_id, admin_discord_id, action, target_id, target_kind, details
  ) values (
    p_guild_id, p_actor_discord_id, 'craft.settlement.pay',
    v_batch_id::text, 'supply_settlement_batch',
    jsonb_build_object(
      'crafterMemberId', p_crafter_member_id,
      'paidByUsername', p_actor_username,
      'totalSilver', v_total,
      'itemCount', v_count,
      'correlationId', p_correlation_id,
      'idempotencyKey', p_idempotency_key
    )
  );

  insert into public.domain_outbox (
    guild_id, topic, aggregate_kind, aggregate_id,
    recipient_kind, recipient_member_id, payload, correlation_id
  ) values (
    p_guild_id, 'craft.settlement_paid', 'supply_settlement_batch', v_batch_id,
    'member', p_crafter_member_id,
    jsonb_build_object('totalSilver', v_total, 'itemCount', v_count),
    p_correlation_id
  );

  return jsonb_build_object(
    'batchId', v_batch_id,
    'crafterMemberId', p_crafter_member_id,
    'totalSilver', v_total,
    'itemCount', v_count,
    'paidAt', now(),
    'replayed', false
  );
end;
$$;

-- Retire the pre-334 delivery mutation. The generic migration-311 command
-- still references this signature, so stale callers fail atomically instead
-- of bypassing frozen terms, settlement entitlement, audit, and outbox.
create or replace function public.deliver_craft_task(
  p_task_id uuid,
  p_guild_id uuid,
  p_crafter_discord_id text,
  p_box_number integer,
  p_craft_city text,
  p_craft_focus_used boolean,
  p_material_silver_cost integer,
  p_expiry_days integer
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'USE_EXECUTE_SUPPLY_CRAFT_DELIVERY';
end;
$$;

revoke all on function public.deliver_craft_task(
  uuid, uuid, text, integer, text, boolean, integer, integer
) from public, anon, authenticated;
grant execute on function public.deliver_craft_task(
  uuid, uuid, text, integer, text, boolean, integer, integer
) to service_role;

revoke all on function public.claim_supply_craft_task(
  uuid, uuid, text, text, text, text, integer, uuid, text
) from public, anon, authenticated;
revoke all on function public.release_supply_craft_task(
  uuid, uuid, text, uuid, text
) from public, anon, authenticated;
revoke all on function public.execute_supply_craft_delivery(
  uuid, uuid, text, text, text, text, jsonb, jsonb, uuid
) from public, anon, authenticated;
revoke all on function public.collect_supply_fulfillment(
  uuid, uuid, text, uuid, text
) from public, anon, authenticated;
revoke all on function public.move_supply_craft_box(
  uuid, uuid, integer, text, uuid, text
) from public, anon, authenticated;
revoke all on function public.return_unclaimed_supply_craft(
  uuid, uuid, text, uuid, text, text
) from public, anon, authenticated;
revoke all on function public.expire_craft_tasks()
  from public, anon, authenticated;
revoke all on function public.pay_supply_settlement_batch(
  uuid, uuid, text, text, uuid, text, text
) from public, anon, authenticated;

grant execute on function public.claim_supply_craft_task(
  uuid, uuid, text, text, text, text, integer, uuid, text
) to service_role;
grant execute on function public.release_supply_craft_task(
  uuid, uuid, text, uuid, text
) to service_role;
grant execute on function public.execute_supply_craft_delivery(
  uuid, uuid, text, text, text, text, jsonb, jsonb, uuid
) to service_role;
grant execute on function public.collect_supply_fulfillment(
  uuid, uuid, text, uuid, text
) to service_role;
grant execute on function public.move_supply_craft_box(
  uuid, uuid, integer, text, uuid, text
) to service_role;
grant execute on function public.return_unclaimed_supply_craft(
  uuid, uuid, text, uuid, text, text
) to service_role;
grant execute on function public.expire_craft_tasks()
  to service_role;
grant execute on function public.pay_supply_settlement_batch(
  uuid, uuid, text, text, uuid, text, text
) to service_role;

comment on function public.claim_supply_craft_task(
  uuid, uuid, text, text, text, text, integer, uuid, text
) is
  'Claims a crafted-regear task and freezes independent material-source and craft-fee settlement terms from the approved price snapshot.';
comment on function public.execute_supply_craft_delivery(
  uuid, uuid, text, text, text, text, jsonb, jsonb, uuid
) is
  'Atomically places crafted regear in a pickup box, moves finished stock, records outside-stock supply, creates settlement entitlement, audit, outbox, and idempotent receipt.';
comment on function public.deliver_craft_task(
  uuid, uuid, text, integer, text, boolean, integer, integer
) is
  'Retired compatibility signature. Use execute_supply_craft_delivery so fulfillment, inventory, settlement, audit, outbox, and receipt remain atomic.';
comment on function public.expire_craft_tasks() is
  'Marks pickup follow-up overdue without changing craft task custody or releasing its box.';
