-- 140_craft_orders.sql
-- ============================================================
-- Guild orders (관리자가 임의 아이템을 발주 → 길드원이 수주/제작/납품)
-- ============================================================
-- - 길드 인벤토리 보충 흐름. 데스로그(regear)와 무관한 임의 아이템 발주.
-- - 관리자가 (item, quantity, unit_price_silver, notes) 로 발주.
-- - 길드원이 일부/전체 수량을 수주(claim) → 직접 제작 → 박스에 넣고 납품.
-- - 관리자 승인 시 길드 재고(guild_inventory_gear) 입고 + 수주자에게 포인트
--   지급(quantity × unit_price_silver). 거절 시 슬롯 다시 풀로 복귀.
-- - 박스 번호는 craft_tasks 의 기존 box-unique 인덱스를 그대로 공유한다
--   (regear 와 발주는 한 길드 안에서 박스 네임스페이스를 공유).

set local statement_timeout = '30s';
set local lock_timeout = '5s';

-- ────────────────────────────────────────────────────────────
-- 1) craft_orders 테이블
-- ────────────────────────────────────────────────────────────
create table if not exists public.craft_orders (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  item_id text not null,
  -- 표시용 캐시. 카탈로그가 바뀌어도 게시물은 사라지지 않게 하려고 스냅샷.
  item_name text,
  quantity integer not null check (quantity >= 1),
  unit_price_silver bigint not null check (unit_price_silver >= 0),
  notes text,
  status text not null default 'open'
    check (status in ('open', 'closed', 'cancelled')),
  posted_by_discord_id text not null,
  posted_by_username text,
  cancelled_by_discord_id text,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create index if not exists idx_craft_orders_guild_status
  on public.craft_orders (guild_id, status);

create index if not exists idx_craft_orders_guild_created
  on public.craft_orders (guild_id, created_at desc);

-- ────────────────────────────────────────────────────────────
-- 2) craft_tasks 확장
-- ────────────────────────────────────────────────────────────
-- regear 과 guild_order 가 같은 테이블을 공유한다. task_kind 로 분기.
-- regear_request_id 는 더 이상 NOT NULL 이 아니다 (guild_order 일 때 null).

alter table public.craft_tasks
  alter column regear_request_id drop not null;

alter table public.craft_tasks
  add column if not exists task_kind text not null default 'regear'
    check (task_kind in ('regear', 'guild_order'));

alter table public.craft_tasks
  add column if not exists craft_order_id uuid
    references public.craft_orders(id) on delete cascade;

-- 한 craft_task 가 몇 개를 만들고 있는지 (guild_order 전용; regear 는 항상 1).
alter table public.craft_tasks
  add column if not exists order_quantity integer
    check (order_quantity is null or order_quantity >= 1);

-- task_kind ↔ FK 일관성: regear 면 regear_request_id NOT NULL, guild_order 면
-- craft_order_id NOT NULL.
alter table public.craft_tasks
  drop constraint if exists craft_tasks_kind_fk_chk;

alter table public.craft_tasks
  add constraint craft_tasks_kind_fk_chk check (
    (task_kind = 'regear'
       and regear_request_id is not null
       and craft_order_id is null
       and order_quantity is null)
    or
    (task_kind = 'guild_order'
       and craft_order_id is not null
       and regear_request_id is null
       and order_quantity is not null)
  );

-- 기존 unique-per-request 인덱스: regear 전용으로 좁힘.
drop index if exists public.craft_tasks_one_active_per_request;
create unique index craft_tasks_one_active_per_request
  on public.craft_tasks (regear_request_id)
  where regear_request_id is not null
    and status in ('queued', 'claimed', 'delivered');

-- guild_order 활성 task 인덱스 (집계용).
create index if not exists idx_craft_tasks_order_active
  on public.craft_tasks (craft_order_id)
  where craft_order_id is not null
    and status in ('claimed', 'delivered', 'approved');

-- 상태에 'approved'(관리자 승인 완료=재고 입고+포인트 지급), 'rejected' 추가.
alter table public.craft_tasks
  drop constraint if exists craft_tasks_status_check;

alter table public.craft_tasks
  add constraint craft_tasks_status_check
  check (status in (
    'queued', 'claimed', 'delivered', 'collected',
    'expired', 'cancelled', 'approved', 'rejected'
  ));

-- ────────────────────────────────────────────────────────────
-- 3) point_ledger reason 확장
-- ────────────────────────────────────────────────────────────
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
    'craft_reimbursement',
    'craft_order_payout'
  ));

-- ────────────────────────────────────────────────────────────
-- 4) RPC: post_craft_order — 관리자가 발주 등록
-- ────────────────────────────────────────────────────────────
create or replace function public.post_craft_order(
  p_guild_id uuid,
  p_actor_discord_id text,
  p_actor_username text,
  p_item_id text,
  p_item_name text,
  p_quantity integer,
  p_unit_price_silver bigint,
  p_notes text
) returns uuid language plpgsql security definer as $$
declare
  v_id uuid;
begin
  if p_item_id is null or length(trim(p_item_id)) = 0 then
    raise exception 'ITEM_ID_EMPTY';
  end if;
  if p_quantity is null or p_quantity < 1 then
    raise exception 'QUANTITY_INVALID';
  end if;
  if p_unit_price_silver is null or p_unit_price_silver < 0 then
    raise exception 'UNIT_PRICE_INVALID';
  end if;

  insert into craft_orders (
    guild_id, item_id, item_name, quantity, unit_price_silver, notes,
    posted_by_discord_id, posted_by_username
  ) values (
    p_guild_id, p_item_id, nullif(trim(coalesce(p_item_name, '')), ''),
    p_quantity, p_unit_price_silver, nullif(trim(coalesce(p_notes, '')), ''),
    p_actor_discord_id, p_actor_username
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- ────────────────────────────────────────────────────────────
-- 5) RPC: claim_craft_order — 길드원이 일부 수량 수주
-- ────────────────────────────────────────────────────────────
-- 활성(claimed/delivered/approved) task 들의 order_quantity 합 + p_quantity
-- ≤ order.quantity 를 보장한다. 'claimed' 상태로 craft_tasks 행 생성.
create or replace function public.claim_craft_order(
  p_order_id uuid,
  p_guild_id uuid,
  p_crafter_discord_id text,
  p_crafter_username text,
  p_quantity integer
) returns uuid language plpgsql security definer as $$
declare
  v_order record;
  v_active_qty integer;
  v_task_id uuid;
begin
  if p_quantity is null or p_quantity < 1 then
    raise exception 'QUANTITY_INVALID';
  end if;

  select id, guild_id, quantity, status
    into v_order
    from craft_orders
   where id = p_order_id
     and guild_id = p_guild_id
   for update;

  if v_order.id is null then
    raise exception 'CRAFT_ORDER_NOT_FOUND';
  end if;
  if v_order.status <> 'open' then
    raise exception 'CRAFT_ORDER_NOT_OPEN';
  end if;

  select coalesce(sum(order_quantity), 0)
    into v_active_qty
    from craft_tasks
   where craft_order_id = p_order_id
     and status in ('claimed', 'delivered', 'approved');

  if v_active_qty + p_quantity > v_order.quantity then
    raise exception 'CRAFT_ORDER_OVERSUBSCRIBED';
  end if;

  insert into craft_tasks (
    guild_id, task_kind, craft_order_id, order_quantity,
    status, crafter_discord_id, crafter_username, claimed_at
  ) values (
    p_guild_id, 'guild_order', p_order_id, p_quantity,
    'claimed', p_crafter_discord_id, p_crafter_username, now()
  )
  returning id into v_task_id;

  return v_task_id;
end;
$$;

-- ────────────────────────────────────────────────────────────
-- 6) RPC: deliver_craft_order_task — 박스 번호 지정 후 납품
-- ────────────────────────────────────────────────────────────
create or replace function public.deliver_craft_order_task(
  p_task_id uuid,
  p_guild_id uuid,
  p_crafter_discord_id text,
  p_box_number integer,
  p_craft_city text,
  p_craft_focus_used boolean,
  p_expiry_days integer
) returns void language plpgsql security definer as $$
declare
  v_box_min integer;
  v_box_max integer;
begin
  select coalesce((select value::integer from public.app_settings
                    where key = 'craft_box_range_min' and guild_id = p_guild_id), 1),
         coalesce((select value::integer from public.app_settings
                    where key = 'craft_box_range_max' and guild_id = p_guild_id), 30)
    into v_box_min, v_box_max;

  if p_box_number < v_box_min or p_box_number > v_box_max then
    raise exception 'BOX_OUT_OF_RANGE';
  end if;
  if p_expiry_days < 1 or p_expiry_days > 30 then
    raise exception 'EXPIRY_OUT_OF_RANGE';
  end if;

  update craft_tasks
     set status = 'delivered',
         box_number = p_box_number,
         craft_city = p_craft_city,
         craft_focus_used = p_craft_focus_used,
         delivered_at = now(),
         expires_at = now() + make_interval(days => p_expiry_days)
   where id = p_task_id
     and guild_id = p_guild_id
     and crafter_discord_id = p_crafter_discord_id
     and task_kind = 'guild_order'
     and status = 'claimed';

  if not found then
    raise exception 'CRAFT_TASK_DELIVER_FAILED';
  end if;
end;
$$;

-- ────────────────────────────────────────────────────────────
-- 7) RPC: approve_craft_order_task — 관리자 승인 (재고 입고 + 포인트 지급)
-- ────────────────────────────────────────────────────────────
-- delivered 상태의 task 를 approved 로 옮기고, 길드 재고에 order_quantity 만큼
-- 입고하며, 수주자에게 (order_quantity * unit_price_silver) 포인트를 지급한다.
-- 모든 활성 task 합이 order.quantity 와 같아지면 order 도 closed 로 마킹.
create or replace function public.approve_craft_order_task(
  p_task_id uuid,
  p_guild_id uuid,
  p_admin_discord_id text
) returns void language plpgsql security definer as $$
declare
  v_task record;
  v_order record;
  v_payout bigint;
  v_approved_total integer;
begin
  select id, craft_order_id, crafter_discord_id, order_quantity, status, task_kind
    into v_task
    from craft_tasks
   where id = p_task_id
     and guild_id = p_guild_id
   for update;

  if v_task.id is null then
    raise exception 'CRAFT_TASK_NOT_FOUND';
  end if;
  if v_task.task_kind <> 'guild_order' then
    raise exception 'CRAFT_TASK_NOT_GUILD_ORDER';
  end if;
  if v_task.status <> 'delivered' then
    raise exception 'CRAFT_TASK_NOT_DELIVERED';
  end if;

  select id, item_id, quantity, unit_price_silver, status
    into v_order
    from craft_orders
   where id = v_task.craft_order_id
     and guild_id = p_guild_id
   for update;

  if v_order.id is null then
    raise exception 'CRAFT_ORDER_NOT_FOUND';
  end if;

  v_payout := v_task.order_quantity::bigint * v_order.unit_price_silver;

  update craft_tasks
     set status = 'approved',
         reimbursement_silver = v_payout,
         collected_at = now()
   where id = p_task_id;

  perform public.adjust_inventory_gear(
    p_guild_id, v_order.item_id, v_task.order_quantity, p_admin_discord_id
  );

  if v_payout > 0 then
    insert into point_ledger (guild_id, discord_id, delta, reason, ref_id)
         values (p_guild_id, v_task.crafter_discord_id, v_payout::integer,
                 'craft_order_payout', p_task_id);
  end if;

  -- 모든 approved task 의 합이 order.quantity 와 같으면 close.
  select coalesce(sum(order_quantity), 0)
    into v_approved_total
    from craft_tasks
   where craft_order_id = v_order.id
     and status = 'approved';

  if v_approved_total >= v_order.quantity and v_order.status = 'open' then
    update craft_orders
       set status = 'closed',
           closed_at = now()
     where id = v_order.id;
  end if;
end;
$$;

-- ────────────────────────────────────────────────────────────
-- 8) RPC: reject_craft_order_task — 관리자 거절 (슬롯 풀에 반환)
-- ────────────────────────────────────────────────────────────
create or replace function public.reject_craft_order_task(
  p_task_id uuid,
  p_guild_id uuid,
  p_admin_discord_id text,
  p_reason text
) returns void language plpgsql security definer as $$
declare
  v_status text;
  v_kind text;
begin
  select status, task_kind
    into v_status, v_kind
    from craft_tasks
   where id = p_task_id
     and guild_id = p_guild_id
   for update;

  if v_status is null then
    raise exception 'CRAFT_TASK_NOT_FOUND';
  end if;
  if v_kind <> 'guild_order' then
    raise exception 'CRAFT_TASK_NOT_GUILD_ORDER';
  end if;
  if v_status <> 'delivered' then
    raise exception 'CRAFT_TASK_NOT_DELIVERED';
  end if;

  update craft_tasks
     set status = 'rejected',
         cancelled_at = now()
   where id = p_task_id;
end;
$$;

-- ────────────────────────────────────────────────────────────
-- 9) RPC: cancel_craft_order — 관리자가 발주 자체를 취소
-- ────────────────────────────────────────────────────────────
-- 활성(claimed/delivered) task 도 모두 cancelled 로 돌린다.
-- 이미 approved 된 task 는 영향 없음 (재고/포인트 그대로 유지).
create or replace function public.cancel_craft_order(
  p_order_id uuid,
  p_guild_id uuid,
  p_admin_discord_id text
) returns void language plpgsql security definer as $$
declare
  v_status text;
begin
  select status
    into v_status
    from craft_orders
   where id = p_order_id
     and guild_id = p_guild_id
   for update;

  if v_status is null then
    raise exception 'CRAFT_ORDER_NOT_FOUND';
  end if;
  if v_status not in ('open') then
    raise exception 'CRAFT_ORDER_NOT_OPEN';
  end if;

  update craft_tasks
     set status = 'cancelled',
         cancelled_at = now()
   where craft_order_id = p_order_id
     and guild_id = p_guild_id
     and status in ('claimed', 'delivered');

  update craft_orders
     set status = 'cancelled',
         cancelled_by_discord_id = p_admin_discord_id,
         cancelled_at = now()
   where id = p_order_id;
end;
$$;

-- ────────────────────────────────────────────────────────────
-- 10) RPC: release_craft_order_task — 길드원이 수주 취소 (claimed 만)
-- ────────────────────────────────────────────────────────────
-- 'claimed' 상태에서만 가능. 박스를 잡지 않은 단계.
create or replace function public.release_craft_order_task(
  p_task_id uuid,
  p_guild_id uuid,
  p_crafter_discord_id text
) returns void language plpgsql security definer as $$
begin
  update craft_tasks
     set status = 'cancelled',
         cancelled_at = now()
   where id = p_task_id
     and guild_id = p_guild_id
     and crafter_discord_id = p_crafter_discord_id
     and task_kind = 'guild_order'
     and status = 'claimed';

  if not found then
    raise exception 'CRAFT_TASK_RELEASE_FAILED';
  end if;
end;
$$;

-- ────────────────────────────────────────────────────────────
-- 11) RLS — service-role only (admin/server actions 가 매개)
-- ────────────────────────────────────────────────────────────
alter table public.craft_orders enable row level security;
drop policy if exists craft_orders_service_only on public.craft_orders;
create policy craft_orders_service_only on public.craft_orders
  for all to public using (false) with check (false);
