-- 상자 재고 베이스라인. 관리자가 인게임에서 "모든 아이템 출고 → 재입고" 를 수행해
-- 로그에 깨끗한 deposit 창을 만들고, 그 창을 붙여넣어 "이 시점의 재고 = 진실" 로
-- 고정한다.
--
-- 왜 필요한가:
--   shop_inventory.stock 은 그동안 모든 import 의 델타 합산이었다. 로그 보관 한계
--   이전의 거래가 있었거나 임포트가 누락된 케이스에선 진실과 어긋나고 복원이
--   불가능했다. 베이스라인은 그 시점을 명시적으로 "0점" 으로 잡는다.
--
-- 동작:
--   1. 관리자가 deposit 창 로그를 붙여넣고 preview → confirm
--   2. apply_shop_baseline RPC:
--      - 이전 confirmed 베이스라인은 superseded 로 마킹
--      - shop_inventory stock 전체를 0으로 리셋 (해당 guild 만)
--      - snapshot 아이템을 overwrite upsert
--      - baseline_at 이후 shop_chest_logs 엔트리의 델타를 재적용
--        (이미 import 된 로그가 reset 으로 날아가지 않도록)
--   3. 이후 importChestLog 는 평소대로 동작 — 새 로그만 dedupe 통과해 델타 누적.

create table public.shop_baselines (
  id              uuid primary key default gen_random_uuid(),
  guild_id        uuid not null references public.tenants(id) on delete cascade,
  baseline_at     timestamptz not null,          -- deposit 창의 끝 시각 (가장 늦은 입고)
  baseline_start  timestamptz not null,          -- deposit 창의 시작 시각 (가장 이른 입고)
  snapshot        jsonb not null,                -- [{uniqueName, enchant, quality, nameKo, category, tier, quantity}]
  total_items     int  not null,                 -- snapshot 의 quantity 합계
  total_events    int  not null,                 -- deposit 이벤트 건수
  depositor       text,                          -- 입고를 수행한 길드원 이름 (단일이길 기대)
  status          text not null default 'confirmed'
                  check (status in ('confirmed','superseded')),
  confirmed_at    timestamptz not null default now(),
  confirmed_by    text not null,                 -- 승인한 관리자 discord id
  notes           text
);

create index shop_baselines_guild
  on public.shop_baselines (guild_id, confirmed_at desc);

-- guild 별로 confirmed 는 최대 1개. rebaseline 시 이전 것은 superseded 로 바뀌어
-- 이 유니크가 비워진다.
create unique index shop_baselines_one_active
  on public.shop_baselines (guild_id)
  where status = 'confirmed';

alter table public.shop_baselines enable row level security;

-- ────────────────────────────────────────────────────────────
-- apply_shop_baseline — 스냅샷 확정 + 재고 재계산을 한 트랜잭션에서.
-- ────────────────────────────────────────────────────────────
create or replace function public.apply_shop_baseline(
  p_guild_id       uuid,
  p_baseline_at    timestamptz,
  p_baseline_start timestamptz,
  p_snapshot       jsonb,
  p_total_items    int,
  p_total_events   int,
  p_depositor      text,
  p_admin_id       text,
  p_notes          text default null
) returns uuid language plpgsql security definer as $$
declare
  v_id uuid;
  v_item jsonb;
begin
  -- 기존 confirmed 베이스라인 → superseded
  update public.shop_baselines
     set status = 'superseded'
   where guild_id = p_guild_id
     and status = 'confirmed';

  insert into public.shop_baselines (
    guild_id, baseline_at, baseline_start, snapshot,
    total_items, total_events, depositor, confirmed_by, notes
  ) values (
    p_guild_id, p_baseline_at, p_baseline_start, p_snapshot,
    p_total_items, p_total_events, p_depositor, p_admin_id, p_notes
  ) returning id into v_id;

  -- 이 guild 의 현재 재고 전부 0으로 리셋. 가격/이름 컬럼은 유지 (관리자가 매겨둔
  -- manual_price 가 날아가면 손실 큼).
  update public.shop_inventory
     set stock = 0,
         updated_at = now()
   where guild_id = p_guild_id;

  -- snapshot 적용. stock 은 덮어쓰기.
  for v_item in select * from jsonb_array_elements(p_snapshot)
  loop
    insert into public.shop_inventory (
      guild_id, unique_name, enchant, quality, stock, name_ko, category, tier
    ) values (
      p_guild_id,
      v_item->>'uniqueName',
      (v_item->>'enchant')::int,
      (v_item->>'quality')::int,
      (v_item->>'quantity')::int,
      v_item->>'nameKo',
      nullif(v_item->>'category', ''),
      nullif(v_item->>'tier', '')::int
    )
    on conflict (unique_name, enchant, quality) do update
       set stock      = excluded.stock,
           name_ko    = coalesce(excluded.name_ko, public.shop_inventory.name_ko),
           category   = coalesce(excluded.category, public.shop_inventory.category),
           tier       = coalesce(excluded.tier, public.shop_inventory.tier),
           updated_at = now();
  end loop;

  -- baseline_at 이후의 로그 델타 재적용. 이미 import 된 로그가 reset 으로 누락
  -- 되지 않도록. 블랙리스트/미해결은 제외.
  insert into public.shop_inventory (
    guild_id, unique_name, enchant, quality, stock, name_ko, category, tier
  )
  select
    p_guild_id,
    l.unique_name,
    l.enchant,
    l.quality,
    sum(l.quantity),
    min(l.item_name_raw),
    null::text,
    null::int
  from public.shop_chest_logs l
  where l.guild_id = p_guild_id
    and l.logged_at > p_baseline_at
    and l.unique_name is not null
    and not exists (
      select 1
        from public.shop_blacklist b
       where b.guild_id = p_guild_id
         and b.item_name_raw = l.item_name_raw
    )
  group by l.unique_name, l.enchant, l.quality
  on conflict (unique_name, enchant, quality) do update
     set stock      = public.shop_inventory.stock + excluded.stock,
         updated_at = now();

  return v_id;
end;
$$;
