-- 194: Make manual shop stock edits auditable and replayable.
--
-- Chest logs are append-only input, but admins can also manually override stock.
-- Without a durable adjustment ledger, an item can disappear from inventory while
-- still existing in shop_chest_logs, and a rebuild cannot explain or preserve
-- that override. This migration records manual stock edits and replays them
-- after chest logs during inventory rebuild.

create table if not exists public.shop_inventory_adjustments (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  inventory_id uuid,
  unique_name text not null,
  enchant integer not null,
  quality integer not null,
  name_ko text not null,
  category text,
  tier integer,
  before_stock integer not null,
  after_stock integer not null,
  delta integer generated always as (after_stock - before_stock) stored,
  reason text not null default 'manual_stock_edit',
  admin_discord_id text not null,
  created_at timestamptz not null default now(),
  constraint shop_inventory_adjustments_enchant_check check (enchant between 0 and 4),
  constraint shop_inventory_adjustments_quality_check check (quality between 1 and 5),
  constraint shop_inventory_adjustments_stock_check check (
    before_stock >= 0 and after_stock >= 0
  ),
  constraint shop_inventory_adjustments_reason_check check (
    reason in ('manual_stock_edit')
  )
);

create index if not exists shop_inventory_adjustments_guild_created_idx
  on public.shop_inventory_adjustments (guild_id, created_at desc, id);

create index if not exists shop_inventory_adjustments_guild_sku_idx
  on public.shop_inventory_adjustments (
    guild_id, unique_name, enchant, quality, created_at desc
  );

alter table public.shop_inventory_adjustments enable row level security;
revoke all on public.shop_inventory_adjustments from public;
revoke all on public.shop_inventory_adjustments from anon, authenticated;
grant select, insert, delete on public.shop_inventory_adjustments to service_role;

comment on table public.shop_inventory_adjustments is
  'Tenant-scoped ledger of admin manual shop stock overrides. Replayed after chest logs during rebuild so manual zero/override decisions remain explainable and durable.';

create or replace function public.set_shop_inventory_stock(
  p_guild_id uuid,
  p_inventory_id uuid,
  p_admin_id text,
  p_stock integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  if p_guild_id is null then
    raise exception 'GUILD_REQUIRED' using errcode = '22023';
  end if;

  if p_inventory_id is null then
    raise exception 'INVENTORY_REQUIRED' using errcode = '22023';
  end if;

  if p_admin_id is null or btrim(p_admin_id) = '' then
    raise exception 'ADMIN_REQUIRED' using errcode = '22023';
  end if;

  if p_stock is null or p_stock < 0 then
    raise exception 'INVALID_STOCK' using errcode = '22023';
  end if;

  select id, unique_name, enchant, quality, stock, name_ko, category, tier
    into v_row
    from public.shop_inventory
   where guild_id = p_guild_id
     and id = p_inventory_id
   for update;

  if not found then
    raise exception 'INVENTORY_NOT_FOUND';
  end if;

  if v_row.stock <> p_stock then
    insert into public.shop_inventory_adjustments (
      guild_id,
      inventory_id,
      unique_name,
      enchant,
      quality,
      name_ko,
      category,
      tier,
      before_stock,
      after_stock,
      admin_discord_id
    ) values (
      p_guild_id,
      v_row.id,
      v_row.unique_name,
      v_row.enchant,
      v_row.quality,
      v_row.name_ko,
      v_row.category,
      v_row.tier,
      v_row.stock,
      p_stock,
      p_admin_id
    );

    update public.shop_inventory
       set stock = p_stock,
           updated_at = now()
     where guild_id = p_guild_id
       and id = p_inventory_id;
  end if;

  return jsonb_build_object(
    'inventory_id', v_row.id,
    'unique_name', v_row.unique_name,
    'enchant', v_row.enchant,
    'quality', v_row.quality,
    'name_ko', v_row.name_ko,
    'before_stock', v_row.stock,
    'after_stock', p_stock
  );
end;
$$;

comment on function public.set_shop_inventory_stock(uuid, uuid, text, integer) is
  'Atomically records a tenant-scoped manual stock adjustment, then sets shop_inventory.stock. Stock 0 may delete the inventory row via the existing empty-row trigger.';

revoke all on function public.set_shop_inventory_stock(uuid, uuid, text, integer) from public;
revoke all on function public.set_shop_inventory_stock(uuid, uuid, text, integer) from anon, authenticated;
grant execute on function public.set_shop_inventory_stock(uuid, uuid, text, integer) to service_role;

create or replace function public.reset_shop_inventory_all(
  p_guild_id uuid,
  p_admin_id text,
  p_cancel_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inventory_rows_deleted int := 0;
  v_logs_deleted int := 0;
  v_adjustments_deleted int := 0;
  v_orders_cancelled int := 0;
  v_baselines_superseded int := 0;
  v_cancel_note text := nullif(btrim(coalesce(p_cancel_note, '')), '');
begin
  if p_guild_id is null then
    raise exception 'GUILD_REQUIRED' using errcode = '22023';
  end if;

  if p_admin_id is null or btrim(p_admin_id) = '' then
    raise exception 'ADMIN_REQUIRED' using errcode = '22023';
  end if;

  update public.shop_baselines
     set status = 'superseded'
   where guild_id = p_guild_id
     and status = 'confirmed';
  get diagnostics v_baselines_superseded = row_count;

  delete from public.shop_inventory
   where guild_id = p_guild_id;
  get diagnostics v_inventory_rows_deleted = row_count;

  delete from public.shop_chest_logs
   where guild_id = p_guild_id;
  get diagnostics v_logs_deleted = row_count;

  delete from public.shop_inventory_adjustments
   where guild_id = p_guild_id;
  get diagnostics v_adjustments_deleted = row_count;

  update public.shop_orders
     set status = 'cancelled',
         resolved_at = now(),
         resolved_by = p_admin_id,
         admin_note = case
           when v_cancel_note is null then admin_note
           when admin_note is null or btrim(admin_note) = '' then v_cancel_note
           else admin_note || E'\n' || v_cancel_note
         end
   where guild_id = p_guild_id
     and status = 'pending';
  get diagnostics v_orders_cancelled = row_count;

  return jsonb_build_object(
    'inventory_rows_deleted', v_inventory_rows_deleted,
    'logs_deleted', v_logs_deleted,
    'adjustments_deleted', v_adjustments_deleted,
    'orders_cancelled', v_orders_cancelled,
    'baselines_superseded', v_baselines_superseded
  );
end;
$$;

comment on function public.reset_shop_inventory_all(uuid, text, text) is
  'Supersedes the active shop baseline, deletes all shop_inventory rows, shop_chest_logs, and manual stock adjustments for one guild, and cancels only pending shop_orders in the same transaction. Approved/rejected/cancelled order history, blacklist, and name overrides are preserved.';

revoke all on function public.reset_shop_inventory_all(uuid, text, text) from public;
revoke all on function public.reset_shop_inventory_all(uuid, text, text) from anon, authenticated;
grant execute on function public.reset_shop_inventory_all(uuid, text, text) to service_role;

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
  v_adjustment record;
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
           coalesce(l.applied_quantity, l.quantity)::int as delta,
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
       and coalesce(l.applied_quantity, l.quantity) <> 0
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

  for v_adjustment in
    select a.unique_name,
           a.enchant,
           a.quality,
           a.after_stock,
           a.name_ko,
           coalesce(m.category, a.category) as category,
           coalesce(m.tier, a.tier) as tier,
           m.manual_price,
           m.auto_price_silver,
           m.price_source,
           m.price_warning_level,
           m.price_updated_at
      from public.shop_inventory_adjustments a
      left join pg_temp.shop_inventory_metadata m
        on m.unique_name = a.unique_name
       and m.enchant = a.enchant
       and m.quality = a.quality
     where a.guild_id = p_guild_id
       and (
         (v_baseline_id is not null and a.created_at > v_replay_start)
         or (v_baseline_id is null and (v_replay_start is null or a.created_at >= v_replay_start))
       )
     order by a.created_at asc, a.id asc
  loop
    if v_adjustment.after_stock > 0 then
      insert into public.shop_inventory (
        guild_id, unique_name, enchant, quality, stock, name_ko, category, tier,
        manual_price, auto_price_silver, price_source,
        price_warning_level, price_updated_at
      ) values (
        p_guild_id,
        v_adjustment.unique_name,
        v_adjustment.enchant,
        v_adjustment.quality,
        v_adjustment.after_stock,
        v_adjustment.name_ko,
        v_adjustment.category,
        v_adjustment.tier,
        v_adjustment.manual_price,
        v_adjustment.auto_price_silver,
        v_adjustment.price_source,
        v_adjustment.price_warning_level,
        v_adjustment.price_updated_at
      )
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
    else
      update public.shop_inventory
         set stock = 0,
             updated_at = now()
       where guild_id = p_guild_id
         and unique_name = v_adjustment.unique_name
         and enchant = v_adjustment.enchant
         and quality = v_adjustment.quality;
    end if;
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

comment on function public.rebuild_shop_inventory_from_chest_logs(uuid, timestamptz) is
  '길드 상자 로그를 운영 시작시간부터 다시 적용해 재고를 재계산한다. 주문 배송 매칭은 applied_quantity 기준으로 재생하고, 이후 수동 재고 보정을 시간순으로 재적용한다.';

revoke all on function public.rebuild_shop_inventory_from_chest_logs(uuid, timestamptz) from public;
revoke all on function public.rebuild_shop_inventory_from_chest_logs(uuid, timestamptz) from anon, authenticated;
grant execute on function public.rebuild_shop_inventory_from_chest_logs(uuid, timestamptz) to service_role;
