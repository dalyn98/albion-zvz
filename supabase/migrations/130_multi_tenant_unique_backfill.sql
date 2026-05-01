-- 130: 멀티테넌트 unique/PK 경계 backfill (mig 072 의 Phase 2 잔여물).
--
-- 배경: mig 072 가 21 테이블에 guild_id 컬럼을 추가하면서 "자연키 unique 는
-- Phase 2 에서 (guild_id, key) 복합으로 재구성한다" 라고 미뤘다. 그 후 일부만
-- 고쳐지고 5 곳이 누락됐다 — 멘헤라 단독 운영 동안엔 잠복했지만 self-serve
-- 두 번째 테넌트가 들어온 뒤로 다음 시나리오들이 실제로 활성:
--
--   1) shop_inventory.unique(unique_name, enchant, quality)
--      → apply_shop_stock_delta / apply_shop_baseline 의 ON CONFLICT 가
--        다른 테넌트의 stock 행을 덮어쓰거나 PK violation 으로 차단됨.
--   2) shop_blacklist.pkey(item_name_raw)
--      → 한 테넌트가 추가하면 다른 테넌트도 같은 아이템 추가 불가 (PK 충돌).
--   3) shop_name_overrides.pkey(item_name_raw)
--      → 위와 동일 — cross-tenant 매핑 충돌.
--   4) shop_chest_logs_dedupe(logged_at, player, item_name_raw, enchant,
--      quality, quantity) → 동일한 dedup key 를 가진 cross-tenant 임포트가
--      한쪽 데이터를 silently 누락시킴.
--   5) guild_avatars_albion_player_unique(albion_server, albion_player_id)
--      → 같은 알비온 캐릭터를 두 테넌트에 등록 불가 (멀티 길드 멤버 차단).
--
-- 함께 ON CONFLICT 절에 의존하는 두 RPC 도 (guild_id, ...) 로 갱신:
--   - apply_shop_stock_delta (mig 073)
--   - apply_shop_baseline    (mig 078, 두 군데)
--
-- 변환은 strictly more permissive — 기존 unique 가 (a, b, c) 에서 (guild_id,
-- a, b, c) 로 묶이는 것이라 row 충돌이 발생하지 않는다 (멘헤라 + 다른 테넌트
-- 가 각자 guild_id 로 분리돼 있음).
--
-- TS 측 쿼리는 모두 이미 .eq('guild_id', guildId) 로 스코프 — 본 마이그만
-- 적용해도 자동 정합. 새 호출 시그니처 도입 없음.

-- ────────────────────────────────────────────────────────────
-- 1) shop_inventory: 자연키 unique 재구성
-- ────────────────────────────────────────────────────────────
-- inline `unique (unique_name, enchant, quality)` 가 만든 자동 이름은
-- shop_inventory_unique_name_enchant_quality_key 일 가능성이 높지만, 이전
-- 마이그 흐름에 따라 다를 수 있어 동적으로 lookup.
-- 자동 생성 이름 명시. 만약 이전 마이그가 수동으로 다른 이름을 줬다면
-- 동적 lookup 으로 fallback (컬럼 정확 매칭 by name → text 캐스팅).
alter table public.shop_inventory
  drop constraint if exists shop_inventory_unique_name_enchant_quality_key;

do $$
declare
  cname text;
begin
  select c.conname
    into cname
    from pg_constraint c
   where c.conrelid = 'public.shop_inventory'::regclass
     and c.contype  = 'u'
     and (
       select array_agg(a.attname::text order by a.attname::text)
         from unnest(c.conkey) k(attnum)
         join pg_attribute a
           on a.attrelid = c.conrelid
          and a.attnum   = k.attnum
     ) = array['enchant', 'quality', 'unique_name']
   limit 1;
  if cname is not null then
    execute format('alter table public.shop_inventory drop constraint %I', cname);
  end if;
end $$;

create unique index if not exists shop_inventory_guild_unique
  on public.shop_inventory (guild_id, unique_name, enchant, quality);

-- ────────────────────────────────────────────────────────────
-- 2) shop_blacklist PK 재구성
-- ────────────────────────────────────────────────────────────
alter table public.shop_blacklist drop constraint if exists shop_blacklist_pkey;
alter table public.shop_blacklist add primary key (guild_id, item_name_raw);

-- ────────────────────────────────────────────────────────────
-- 3) shop_name_overrides PK 재구성
-- ────────────────────────────────────────────────────────────
alter table public.shop_name_overrides drop constraint if exists shop_name_overrides_pkey;
alter table public.shop_name_overrides add primary key (guild_id, item_name_raw);

-- ────────────────────────────────────────────────────────────
-- 4) shop_chest_logs_dedupe 재구성
-- ────────────────────────────────────────────────────────────
drop index if exists public.shop_chest_logs_dedupe;
create unique index shop_chest_logs_dedupe
  on public.shop_chest_logs (guild_id, logged_at, player, item_name_raw, enchant, quality, quantity);

-- ────────────────────────────────────────────────────────────
-- 5) guild_avatars_albion_player_unique 재구성
-- ────────────────────────────────────────────────────────────
drop index if exists public.guild_avatars_albion_player_unique;
create unique index guild_avatars_albion_player_unique
  on public.guild_avatars (guild_id, albion_server, albion_player_id)
  where albion_player_id is not null;

-- ────────────────────────────────────────────────────────────
-- 6) apply_shop_stock_delta — ON CONFLICT 에 guild_id 포함
-- ────────────────────────────────────────────────────────────
-- 시그니처 / 동작 그대로, ON CONFLICT 키만 (guild_id, unique_name, enchant,
-- quality) 로 변경. mig 073 에서 정의된 본문 그대로 유지.
create or replace function public.apply_shop_stock_delta(
  p_guild_id    uuid,
  p_unique_name text,
  p_enchant     int,
  p_quality     int,
  p_delta       int,
  p_name_ko     text,
  p_category    text,
  p_tier        int
) returns int language plpgsql as $$
declare
  v_stock int;
begin
  insert into shop_inventory (
    guild_id, unique_name, enchant, quality, stock, name_ko, category, tier
  ) values (
    p_guild_id, p_unique_name, p_enchant, p_quality, p_delta, p_name_ko, p_category, p_tier
  )
  on conflict (guild_id, unique_name, enchant, quality) do update
     set stock      = shop_inventory.stock + excluded.stock,
         name_ko    = coalesce(excluded.name_ko, shop_inventory.name_ko),
         category   = coalesce(excluded.category, shop_inventory.category),
         tier       = coalesce(excluded.tier, shop_inventory.tier),
         updated_at = now()
  returning stock into v_stock;
  return v_stock;
end;
$$;

-- ────────────────────────────────────────────────────────────
-- 7) apply_shop_baseline — 두 ON CONFLICT 에 guild_id 포함
-- ────────────────────────────────────────────────────────────
-- mig 078 의 본문을 그대로 가져오고 ON CONFLICT 키 두 군데만 (guild_id, ...)
-- 으로 변경. 다른 동작 (drift_report 산출, 베이스라인 supersede, 로그 리플레이)
-- 은 동일.
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
    on conflict (guild_id, unique_name, enchant, quality) do update
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
  on conflict (guild_id, unique_name, enchant, quality) do update
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

comment on function public.apply_shop_baseline is
  '베이스라인 확정 — confirmed 1개 유지 + 인벤토리 리셋/스냅샷/리플레이/drift 산출. ON CONFLICT 가 (guild_id, unique_name, enchant, quality) 로 스코프 (mig 130 에서 단일 자연키 unique 회귀 복원).';
