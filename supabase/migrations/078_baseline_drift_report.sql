-- 베이스라인 drift 리포트. 베이스라인 확정 시 "리셋 전 재고" 와 "리셋+스냅샷+리플레이
-- 후 재고" 를 비교해 어떤 아이템이 얼마나 바뀌었는지 기록한다.
--
-- 왜 필요한가:
--   하드리셋 방식은 이전 stock 을 덮어써 버린다. 관리자가 "얼마나 틀어져 있었는지"
--   를 확인할 수 없었다. drift_report 는 해당 시점의 before/after 를 잡아 근거로
--   남긴다 — 누락 감지, 복원량 측정, 감사용.
--
-- 리포트 구조:
--   {
--     before_total: 리셋 전 총 재고 합계,
--     after_total:  확정 후 총 재고 합계,
--     changed_items: 변동이 있었던 (item, e, q) 건수,
--     restored:   before=0 → after>0 (새로 잡힌 재고),
--     cleared:    before>0 → after=0 (사라진 재고 — 미반영된 출고가 있었음),
--     increased:  양쪽 0 아니고 after > before,
--     decreased:  양쪽 0 아니고 after < before,
--     top_changes: 절대 delta 상위 50 — [{unique_name, name_ko, enchant, quality, before_stock, after_stock, delta}]
--   }

alter table public.shop_baselines
  add column if not exists drift_report jsonb;

-- ────────────────────────────────────────────────────────────
-- apply_shop_baseline 재정의 — 이전과 동일한 리셋/스냅샷/리플레이 흐름에
-- before/after 스냅샷 비교를 덧붙여 drift_report 를 채운다.
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
  v_before_snapshot jsonb;
  v_drift jsonb;
begin
  -- 이전 confirmed 베이스라인 → superseded
  update public.shop_baselines
     set status = 'superseded'
   where guild_id = p_guild_id
     and status = 'confirmed';

  -- drift 계산용 pre-reset 스냅샷. stock=0 은 노이즈라 제외.
  select coalesce(jsonb_agg(jsonb_build_object(
           'unique_name', unique_name,
           'enchant',     enchant,
           'quality',     quality,
           'name_ko',     name_ko,
           'stock',       stock
         )), '[]'::jsonb)
    into v_before_snapshot
    from public.shop_inventory
   where guild_id = p_guild_id
     and stock <> 0;

  insert into public.shop_baselines (
    guild_id, baseline_at, baseline_start, snapshot,
    total_items, total_events, depositor, confirmed_by, notes
  ) values (
    p_guild_id, p_baseline_at, p_baseline_start, p_snapshot,
    p_total_items, p_total_events, p_depositor, p_admin_id, p_notes
  ) returning id into v_id;

  -- 리셋 (stock=0, price/name 유지)
  update public.shop_inventory
     set stock = 0,
         updated_at = now()
   where guild_id = p_guild_id;

  -- 스냅샷 적용
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

  -- baseline_at 이후 로그 델타 리플레이
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

  -- drift 계산. before (JSONB) LEFT/RIGHT OUTER JOIN after (current table).
  with before_tbl as (
    select (b->>'unique_name')::text as unique_name,
           (b->>'enchant')::int      as enchant,
           (b->>'quality')::int      as quality,
           (b->>'name_ko')::text     as name_ko,
           (b->>'stock')::int        as stock
      from jsonb_array_elements(v_before_snapshot) b
  ),
  after_tbl as (
    select unique_name, enchant, quality, name_ko, stock
      from public.shop_inventory
     where guild_id = p_guild_id
       and stock <> 0
  ),
  joined as (
    select coalesce(a.unique_name, b.unique_name) as unique_name,
           coalesce(a.enchant,     b.enchant)     as enchant,
           coalesce(a.quality,     b.quality)     as quality,
           coalesce(a.name_ko,     b.name_ko)     as name_ko,
           coalesce(b.stock, 0)                   as before_stock,
           coalesce(a.stock, 0)                   as after_stock
      from after_tbl a
      full outer join before_tbl b
        on  a.unique_name = b.unique_name
        and a.enchant     = b.enchant
        and a.quality     = b.quality
  ),
  changed as (
    select * from joined where before_stock <> after_stock
  )
  select jsonb_build_object(
    'before_total',  coalesce((select sum(stock) from before_tbl), 0),
    'after_total',   coalesce((select sum(stock) from after_tbl), 0),
    'changed_items', (select count(*) from changed),
    'restored',      (select count(*) from changed where before_stock = 0 and after_stock > 0),
    'cleared',       (select count(*) from changed where before_stock > 0 and after_stock = 0),
    'increased',     (select count(*) from changed where before_stock > 0 and after_stock > before_stock),
    'decreased',     (select count(*) from changed where before_stock > 0 and after_stock > 0 and after_stock < before_stock),
    'top_changes',   coalesce((
      select jsonb_agg(row_to_json(t) order by abs(t.delta) desc)
        from (
          select unique_name, enchant, quality, name_ko,
                 before_stock, after_stock,
                 (after_stock - before_stock) as delta
            from changed
         order by abs(after_stock - before_stock) desc
            limit 50
        ) t
    ), '[]'::jsonb)
  ) into v_drift;

  update public.shop_baselines
     set drift_report = v_drift
   where id = v_id;

  return v_id;
end;
$$;
