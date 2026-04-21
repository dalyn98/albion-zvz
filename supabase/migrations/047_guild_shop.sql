-- Guild shop — chest-log-driven inventory + point-based purchases.
--
-- Data flow:
--   입고/출고 로그(관리자 페이스트) → shop_chest_logs 에 원본 보관 →
--   (unique_name, enchant, quality) 단위로 합산 → shop_inventory.stock.
--   stock <= 0 이면 /shop 에서 비표시.
--
-- 구매 플로우:
--   길드원 장바구니 → shop_orders(pending) 제출 → 관리자 승인 시
--   approve_shop_order() 가 point_ledger 차감 + 재고 차감을 원자적으로 처리.
--   거절 시에는 ledger/재고 변동 없음 (주문은 pending 에서 결제 hold 하지 않음).

-- 1) 재고 스냅샷.
create table public.shop_inventory (
  id                  uuid primary key default gen_random_uuid(),
  unique_name         text not null,
  enchant             int  not null check (enchant between 0 and 4),
  quality             int  not null check (quality between 1 and 5),
  stock               int  not null default 0,
  name_ko             text not null,
  category            text,
  tier                int,
  -- 가격: manual_price 가 있으면 그 값을 사용, 없으면 auto_price_silver 를
  -- 환율(app_settings.shop_silver_to_point_rate, 기본 1p=1s) 로 환산.
  manual_price        int,
  auto_price_silver   int,
  price_source        text,         -- 'manual' | 'aodp:{city}' | null
  price_updated_at    timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (unique_name, enchant, quality)
);

create index shop_inventory_in_stock on public.shop_inventory (updated_at desc) where stock > 0;
create index shop_inventory_category on public.shop_inventory (category);
create index shop_inventory_tier     on public.shop_inventory (tier);

-- 2) 원본 로그. 감사/롤백용.
create table public.shop_chest_logs (
  id             uuid primary key default gen_random_uuid(),
  logged_at      timestamptz not null,
  player         text not null,
  item_name_raw  text not null,
  enchant        int  not null,
  quality        int  not null,
  quantity       int  not null,        -- + = 입고, - = 출고
  unique_name    text,                 -- 임포트 시점에 resolve; 미해결이면 null
  imported_at    timestamptz not null default now(),
  imported_by    text
);

create index shop_chest_logs_logged     on public.shop_chest_logs (logged_at desc);
create index shop_chest_logs_unresolved on public.shop_chest_logs (imported_at desc)
  where unique_name is null;

-- 완전히 동일한 원본 행(동일 날짜/플레이어/아이템/인챈트/품질/수량)은 재임포트 시
-- 중복 적재되지 않는다 — 관리자가 같은 텍스트를 두 번 붙여도 안전하게.
create unique index shop_chest_logs_dedupe
  on public.shop_chest_logs (logged_at, player, item_name_raw, enchant, quality, quantity);

-- 3) 잡템 블랙리스트. item_name_raw 완전 일치 시 파싱은 하되 재고 반영 스킵.
create table public.shop_blacklist (
  item_name_raw  text primary key,
  added_at       timestamptz not null default now(),
  added_by       text
);

insert into public.shop_blacklist (item_name_raw, added_by) values
  ('페기물', 'system');

-- 4) 관리자가 수동으로 매핑하는 이름 오버라이드. ao-bin-dumps 번들 사전에
--    없거나 애매한 한글명을 직접 UniqueName 으로 고정.
create table public.shop_name_overrides (
  item_name_raw  text primary key,
  unique_name    text not null,
  added_at       timestamptz not null default now(),
  added_by       text
);

-- 5) 주문 + 주문 라인.
create table public.shop_orders (
  id            uuid primary key default gen_random_uuid(),
  discord_id    text not null,
  username      text not null,
  total_points  int  not null check (total_points > 0),
  status        text not null default 'pending'
                check (status in ('pending','approved','rejected','cancelled')),
  member_note   text,
  admin_note    text,
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz,
  resolved_by   text
);

create index shop_orders_status_created on public.shop_orders (status, created_at desc);
create index shop_orders_discord        on public.shop_orders (discord_id, created_at desc);

create table public.shop_order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.shop_orders(id) on delete cascade,
  unique_name      text not null,
  enchant          int  not null,
  quality          int  not null,
  name_ko          text not null,
  quantity         int  not null check (quantity > 0),
  unit_points      int  not null check (unit_points >= 0),
  subtotal_points  int  not null check (subtotal_points >= 0)
);

create index shop_order_items_order on public.shop_order_items (order_id);

-- 6) 포인트 원장 reason 확장. 기존 CHECK 은 migration 003/010 에서 설치.
alter table public.point_ledger
  drop constraint if exists point_ledger_reason_check;
alter table public.point_ledger
  add constraint point_ledger_reason_check
  check (reason in ('regear_approved','exchange_paid','admin_adjust','shop_purchase'));

-- 7) 승인/거절 RPC. approve_exchange_request 의 패턴을 따름 —
--    advisory lock 으로 같은 유저의 잔액 레이스를 직렬화.
create or replace function public.approve_shop_order(
  p_id uuid,
  p_admin_id text,
  p_admin_note text default null
) returns void language plpgsql security definer as $$
declare
  v_discord text;
  v_total   integer;
  v_balance integer;
  v_line    record;
begin
  select discord_id, total_points into v_discord, v_total
    from shop_orders
   where id = p_id and status = 'pending'
   for update;

  if v_discord is null then
    raise exception 'ORDER_NOT_PENDING';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_discord, 0));

  select coalesce(sum(delta), 0) into v_balance
    from point_ledger where discord_id = v_discord;

  if v_balance < v_total then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  -- 재고 차감. 부족하면 실패 — 관리자가 거절 후 재고 보충 시 재요청.
  for v_line in
    select unique_name, enchant, quality, quantity
      from shop_order_items where order_id = p_id
  loop
    update shop_inventory
       set stock = stock - v_line.quantity,
           updated_at = now()
     where unique_name = v_line.unique_name
       and enchant     = v_line.enchant
       and quality     = v_line.quality
       and stock      >= v_line.quantity;

    if not found then
      raise exception 'INSUFFICIENT_STOCK: % @% q%',
        v_line.unique_name, v_line.enchant, v_line.quality;
    end if;
  end loop;

  update shop_orders
     set status = 'approved',
         resolved_at = now(),
         resolved_by = p_admin_id,
         admin_note  = coalesce(p_admin_note, admin_note)
   where id = p_id;

  insert into point_ledger (discord_id, delta, reason, ref_id)
       values (v_discord, -v_total, 'shop_purchase', p_id);
end;
$$;

create or replace function public.reject_shop_order(
  p_id uuid,
  p_admin_id text,
  p_admin_note text default null
) returns void language plpgsql security definer as $$
begin
  update shop_orders
     set status = 'rejected',
         resolved_at = now(),
         resolved_by = p_admin_id,
         admin_note  = p_admin_note
   where id = p_id and status = 'pending';

  if not found then
    raise exception 'ORDER_NOT_PENDING';
  end if;
end;
$$;

-- 8) RLS — 관리자 전용. 서버 액션은 SERVICE_ROLE 키로 접근.
alter table public.shop_inventory      enable row level security;
alter table public.shop_chest_logs     enable row level security;
alter table public.shop_blacklist      enable row level security;
alter table public.shop_name_overrides enable row level security;
alter table public.shop_orders         enable row level security;
alter table public.shop_order_items    enable row level security;

-- 9) 상점 관련 설정 시드. 환율/공지 배너 기본값.
insert into public.app_settings (key, value) values
  ('shop_silver_to_point_rate', '1'),
  ('shop_delivery_notice',      '관리자 승인 후 인게임에서 전달됩니다. 수령 방법은 관리자에게 문의해주세요.')
on conflict (key) do nothing;
