-- 164: 상점 재고를 운영 시작시간 기준으로 재계산할 수 있게 하고,
-- 기존 베이스라인 RPC 가 stock=0 자동 삭제 트리거와 충돌해 가격 메타데이터를
-- 잃는 문제를 보완한다.

alter table public.shop_chest_logs
  add column if not exists import_sequence int;

create index if not exists shop_chest_logs_replay_order_idx
  on public.shop_chest_logs (
    guild_id,
    logged_at asc,
    imported_at asc,
    import_sequence asc
  );

create or replace function public.shop_inventory_delete_when_empty()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.stock <= 0
     and NEW.manual_price is null
     and NEW.auto_price_silver is null
     and NEW.price_source is null
     and NEW.price_warning_level is null
     and NEW.price_updated_at is null then
    delete from public.shop_inventory where id = NEW.id;
  end if;
  return null;
end;
$$;

create or replace function public.apply_shop_stock_delta(
  p_guild_id    uuid,
  p_unique_name text,
  p_enchant     int,
  p_quality     int,
  p_delta       int,
  p_name_ko     text,
  p_category    text,
  p_tier        int
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stock int;
begin
  update public.shop_inventory
     set stock      = greatest(stock + p_delta, 0),
         name_ko    = coalesce(p_name_ko, name_ko),
         category   = coalesce(p_category, category),
         tier       = coalesce(p_tier, tier),
         updated_at = now()
   where guild_id = p_guild_id
     and unique_name = p_unique_name
     and enchant = p_enchant
     and quality = p_quality
   returning stock into v_stock;

  if found then
    return greatest(coalesce(v_stock, 0), 0);
  end if;

  -- 출고 로그만 먼저 들어온 경우 음수 재고 행을 만들지 않는다.
  if p_delta <= 0 then
    return 0;
  end if;

  insert into public.shop_inventory (
    guild_id, unique_name, enchant, quality, stock, name_ko, category, tier
  ) values (
    p_guild_id, p_unique_name, p_enchant, p_quality, p_delta, p_name_ko, p_category, p_tier
  )
  on conflict (guild_id, unique_name, enchant, quality) do update
     set stock      = greatest(public.shop_inventory.stock + excluded.stock, 0),
         name_ko    = coalesce(excluded.name_ko, public.shop_inventory.name_ko),
         category   = coalesce(excluded.category, public.shop_inventory.category),
         tier       = coalesce(excluded.tier, public.shop_inventory.tier),
         updated_at = now()
  returning stock into v_stock;

  return greatest(coalesce(v_stock, 0), 0);
end;
$$;

create or replace function public.rebuild_shop_inventory_from_chest_logs(
  p_guild_id uuid,
  p_start_at timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before_snapshot jsonb;
  v_drift jsonb;
  v_delta record;
  v_baseline_id uuid;
  v_baseline_at timestamptz;
  v_baseline_snapshot jsonb;
  v_replay_start timestamptz;
begin
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

  drop table if exists pg_temp.shop_inventory_metadata;
  create temporary table shop_inventory_metadata on commit drop as
  select unique_name, enchant, quality, name_ko, category, tier,
         manual_price, auto_price_silver, price_source,
         price_warning_level, price_updated_at
    from public.shop_inventory
   where guild_id = p_guild_id;

  select id, baseline_at, snapshot
    into v_baseline_id, v_baseline_at, v_baseline_snapshot
    from public.shop_baselines
   where guild_id = p_guild_id
     and status = 'confirmed'
     and (p_start_at is null or baseline_at >= p_start_at)
   order by baseline_at desc, confirmed_at desc
   limit 1;

  update public.shop_inventory
     set stock = 0,
         updated_at = now()
   where guild_id = p_guild_id;

  if v_baseline_id is not null then
    insert into public.shop_inventory (
      guild_id, unique_name, enchant, quality, stock, name_ko, category, tier,
      manual_price, auto_price_silver, price_source,
      price_warning_level, price_updated_at
    )
    select p_guild_id,
           s."uniqueName",
           s.enchant,
           s.quality,
           s.quantity,
           coalesce(s."nameKo", m.name_ko, s."uniqueName"),
           coalesce(s.category, m.category),
           coalesce(s.tier, m.tier),
           m.manual_price,
           m.auto_price_silver,
           m.price_source,
           m.price_warning_level,
           m.price_updated_at
      from jsonb_to_recordset(v_baseline_snapshot) as s(
        "uniqueName" text,
        "nameKo" text,
        category text,
        tier int,
        enchant int,
        quality int,
        quantity int
      )
      left join pg_temp.shop_inventory_metadata m
        on m.unique_name = s."uniqueName"
       and m.enchant = s.enchant
       and m.quality = s.quality
     where s.quantity > 0
    on conflict (guild_id, unique_name, enchant, quality) do update
       set stock               = excluded.stock,
           name_ko             = coalesce(excluded.name_ko, public.shop_inventory.name_ko),
           category            = coalesce(excluded.category, public.shop_inventory.category),
           tier                = coalesce(excluded.tier, public.shop_inventory.tier),
           manual_price        = coalesce(public.shop_inventory.manual_price, excluded.manual_price),
           auto_price_silver   = coalesce(public.shop_inventory.auto_price_silver, excluded.auto_price_silver),
           price_source        = coalesce(public.shop_inventory.price_source, excluded.price_source),
           price_warning_level = coalesce(public.shop_inventory.price_warning_level, excluded.price_warning_level),
           price_updated_at    = coalesce(public.shop_inventory.price_updated_at, excluded.price_updated_at),
           updated_at          = now();
    v_replay_start := v_baseline_at;
  else
    v_replay_start := p_start_at;
  end if;

  for v_delta in
    select l.unique_name,
           l.enchant,
           l.quality,
           l.quantity::int as delta,
           coalesce(m.name_ko, l.item_name_raw) as name_ko,
           m.category,
           m.tier
      from public.shop_chest_logs l
      left join pg_temp.shop_inventory_metadata m
        on m.unique_name = l.unique_name
       and m.enchant = l.enchant
       and m.quality = l.quality
     where l.guild_id = p_guild_id
       and (
         (v_baseline_id is not null and l.logged_at > v_replay_start)
         or (v_baseline_id is null and (v_replay_start is null or l.logged_at >= v_replay_start))
       )
       and l.unique_name is not null
       and not exists (
         select 1
          from public.shop_blacklist b
         where b.guild_id = p_guild_id
           and b.item_name_raw = l.item_name_raw
       )
     order by l.logged_at asc,
              l.imported_at asc,
              l.import_sequence asc nulls last,
              l.player asc,
              l.item_name_raw asc,
              l.enchant asc,
              l.quality asc,
              l.quantity asc,
              l.id asc
  loop
    perform public.apply_shop_stock_delta(
      p_guild_id,
      v_delta.unique_name,
      v_delta.enchant,
      v_delta.quality,
      v_delta.delta,
      v_delta.name_ko,
      v_delta.category,
      v_delta.tier
    );
  end loop;

  update public.shop_inventory i
     set name_ko             = coalesce(i.name_ko, m.name_ko),
         category            = coalesce(i.category, m.category),
         tier                = coalesce(i.tier, m.tier),
         manual_price        = coalesce(i.manual_price, m.manual_price),
         auto_price_silver   = coalesce(i.auto_price_silver, m.auto_price_silver),
         price_source        = coalesce(i.price_source, m.price_source),
         price_warning_level = coalesce(i.price_warning_level, m.price_warning_level),
         price_updated_at    = coalesce(i.price_updated_at, m.price_updated_at)
    from pg_temp.shop_inventory_metadata m
   where i.guild_id = p_guild_id
     and i.unique_name = m.unique_name
     and i.enchant = m.enchant
     and i.quality = m.quality;

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
    select *, after_stock - before_stock as delta
      from joined
     where before_stock <> after_stock
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
      select jsonb_agg(jsonb_build_object(
               'unique_name',   unique_name,
               'name_ko',       name_ko,
               'enchant',       enchant,
               'quality',       quality,
               'before_stock',  before_stock,
               'after_stock',   after_stock,
               'delta',         delta
             ) order by abs(delta) desc, unique_name)
        from (select * from changed order by abs(delta) desc, unique_name limit 20) c
    ), '[]'::jsonb)
  ) into v_drift;

  return v_drift;
end;
$$;

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
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_before_snapshot jsonb;
  v_drift jsonb;
  v_delta record;
begin
  update public.shop_baselines
     set status = 'superseded'
   where guild_id = p_guild_id
     and status = 'confirmed';

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

  drop table if exists pg_temp.shop_inventory_metadata;
  create temporary table shop_inventory_metadata on commit drop as
  select unique_name, enchant, quality, name_ko, category, tier,
         manual_price, auto_price_silver, price_source,
         price_warning_level, price_updated_at
    from public.shop_inventory
   where guild_id = p_guild_id;

  insert into public.shop_baselines (
    guild_id, baseline_at, baseline_start, snapshot,
    total_items, total_events, depositor, confirmed_by, notes
  ) values (
    p_guild_id, p_baseline_at, p_baseline_start, p_snapshot,
    p_total_items, p_total_events, p_depositor, p_admin_id, p_notes
  ) returning id into v_id;

  update public.shop_inventory
     set stock = 0,
         updated_at = now()
   where guild_id = p_guild_id;

  insert into public.shop_inventory (
    guild_id, unique_name, enchant, quality, stock, name_ko, category, tier,
    manual_price, auto_price_silver, price_source,
    price_warning_level, price_updated_at
  )
  select p_guild_id,
         s."uniqueName",
         s.enchant,
         s.quality,
         s.quantity,
         coalesce(s."nameKo", m.name_ko, s."uniqueName"),
         coalesce(s.category, m.category),
         coalesce(s.tier, m.tier),
         m.manual_price,
         m.auto_price_silver,
         m.price_source,
         m.price_warning_level,
         m.price_updated_at
    from jsonb_to_recordset(p_snapshot) as s(
      "uniqueName" text,
      "nameKo" text,
      category text,
      tier int,
      enchant int,
      quality int,
      quantity int
    )
    left join pg_temp.shop_inventory_metadata m
      on m.unique_name = s."uniqueName"
     and m.enchant = s.enchant
     and m.quality = s.quality
   where s.quantity > 0
  on conflict (guild_id, unique_name, enchant, quality) do update
     set stock               = excluded.stock,
         name_ko             = coalesce(excluded.name_ko, public.shop_inventory.name_ko),
         category            = coalesce(excluded.category, public.shop_inventory.category),
         tier                = coalesce(excluded.tier, public.shop_inventory.tier),
         manual_price        = coalesce(public.shop_inventory.manual_price, excluded.manual_price),
         auto_price_silver   = coalesce(public.shop_inventory.auto_price_silver, excluded.auto_price_silver),
         price_source        = coalesce(public.shop_inventory.price_source, excluded.price_source),
         price_warning_level = coalesce(public.shop_inventory.price_warning_level, excluded.price_warning_level),
         price_updated_at    = coalesce(public.shop_inventory.price_updated_at, excluded.price_updated_at),
         updated_at          = now();

  for v_delta in
    select l.unique_name,
           l.enchant,
           l.quality,
           l.quantity::int as delta,
           coalesce(m.name_ko, l.item_name_raw) as name_ko,
           m.category,
           m.tier
      from public.shop_chest_logs l
      left join pg_temp.shop_inventory_metadata m
        on m.unique_name = l.unique_name
       and m.enchant = l.enchant
       and m.quality = l.quality
     where l.guild_id = p_guild_id
       and l.logged_at > p_baseline_at
       and l.unique_name is not null
       and not exists (
         select 1
           from public.shop_blacklist b
          where b.guild_id = p_guild_id
            and b.item_name_raw = l.item_name_raw
       )
     order by l.logged_at asc,
              l.imported_at asc,
              l.import_sequence asc nulls last,
              l.player asc,
              l.item_name_raw asc,
              l.enchant asc,
              l.quality asc,
              l.quantity asc,
              l.id asc
  loop
    perform public.apply_shop_stock_delta(
      p_guild_id,
      v_delta.unique_name,
      v_delta.enchant,
      v_delta.quality,
      v_delta.delta,
      v_delta.name_ko,
      v_delta.category,
      v_delta.tier
    );
  end loop;

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
    select *, after_stock - before_stock as delta
      from joined
     where before_stock <> after_stock
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
      select jsonb_agg(jsonb_build_object(
               'unique_name',   unique_name,
               'name_ko',       name_ko,
               'enchant',       enchant,
               'quality',       quality,
               'before_stock',  before_stock,
               'after_stock',   after_stock,
               'delta',         delta
             ) order by abs(delta) desc, unique_name)
        from (select * from changed order by abs(delta) desc, unique_name limit 20) c
    ), '[]'::jsonb)
  ) into v_drift;

  update public.shop_baselines
     set drift_report = v_drift
   where id = v_id;

  return v_id;
end;
$$;

comment on function public.rebuild_shop_inventory_from_chest_logs(uuid, timestamptz) is
  '길드 상점 재고를 원본 shop_chest_logs 로 재계산한다. 확인된 baseline 이 있으면 snapshot 을 먼저 복원한 뒤 이후 로그를 재생하고, baseline 이 없으면 p_start_at 이후 로그만 반영한다. 기존 가격 메타데이터는 동일 자연키에 한해 보존한다.';

revoke all on function public.apply_shop_stock_delta(uuid, text, int, int, int, text, text, int) from public;
revoke all on function public.apply_shop_stock_delta(uuid, text, int, int, int, text, text, int) from anon, authenticated;
grant execute on function public.apply_shop_stock_delta(uuid, text, int, int, int, text, text, int) to service_role;

revoke all on function public.rebuild_shop_inventory_from_chest_logs(uuid, timestamptz) from public;
revoke all on function public.rebuild_shop_inventory_from_chest_logs(uuid, timestamptz) from anon, authenticated;
grant execute on function public.rebuild_shop_inventory_from_chest_logs(uuid, timestamptz) to service_role;

revoke all on function public.apply_shop_baseline(uuid, timestamptz, timestamptz, jsonb, int, int, text, text, text) from public;
revoke all on function public.apply_shop_baseline(uuid, timestamptz, timestamptz, jsonb, int, int, text, text, text) from anon, authenticated;
grant execute on function public.apply_shop_baseline(uuid, timestamptz, timestamptz, jsonb, int, int, text, text, text) to service_role;
